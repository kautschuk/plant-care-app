import type {
  ApplyScheduleActionInput,
  CareScheduleState,
  CareType,
  InitializeScheduleInput,
  ISODateString,
  LearnedAdjustments,
  LocationChangeInput,
  PlannerProjection,
  ProjectScheduleInput,
  ScheduleProjection,
  ScheduleState,
  ScheduleCalculation,
  SchedulingDomainError,
} from './types';
import { validateISODate } from './types';

export class SchedulingDomainException extends Error {
  readonly code: SchedulingDomainError['code'];

  constructor(error: SchedulingDomainError) {
    super(error.message);
    this.name = 'SchedulingDomainException';
    this.code = error.code;
  }
}

export function initializeSchedule(
  input: InitializeScheduleInput,
): ScheduleCalculation {
  const today = validateISODate(input.today);
  const lastCompletedDate = validateISODate(input.lastCompletedDate, today);
  const careType = input.careType ?? 'WATERING';
  const learnedAdjustments = initialAdjustments(input.knowledge.seasonalModel);
  const schedule: CareScheduleState = {
    lastCompletedDate,
    nextDueDate: lastCompletedDate,
    learnedAdjustments,
  };
  const state: ScheduleState = { careSchedules: { [careType]: schedule } };
  const projection = projectSchedule({
    today,
    state,
    knowledge: input.knowledge,
    climate: input.climate,
    careType,
  });

  return {
    state: {
      careSchedules: {
        [careType]: { ...schedule, nextDueDate: projection.nextDueDate },
      },
    },
    projection,
  };
}

export function projectSchedule(
  input: ProjectScheduleInput,
): PlannerProjection {
  const today = validateISODate(input.today);
  const careType = input.careType ?? 'WATERING';
  const schedule = input.state.careSchedules[careType];
  if (!schedule) {
    throw new Error(`No ${careType} schedule is enabled`);
  }

  const lastCompletedDate = validateISODate(schedule.lastCompletedDate, today);
  const activeSeason = input.knowledge.seasonFor(input.climate, today);
  const baseIntervalDays = input.knowledge.intervalFor(
    input.climate,
    activeSeason,
    careType,
  );
  const activeAdjustmentDays = adjustmentForSeason(
    schedule.learnedAdjustments,
    activeSeason,
  );
  const effectiveIntervalDays = Math.max(
    1,
    baseIntervalDays + activeAdjustmentDays,
  );
  const nextDueDate = addDays(lastCompletedDate, effectiveIntervalDays);
  const projection: ScheduleProjection = {
    activeSeason,
    baseIntervalDays,
    effectiveIntervalDays,
    nextDueDate,
    status: statusFor(nextDueDate, input.today),
  };

  return {
    ...projection,
    guidanceLevel: input.knowledge.taxonomicLevel,
    tasks: plannerTasks(input.knowledge.fertilizerModes, careType),
  };
}

export function applyScheduleAction(
  input: ApplyScheduleActionInput,
): ScheduleCalculation {
  if (input.state.archived) {
    throw new SchedulingDomainException({
      code: 'ARCHIVED_SCHEDULE',
      message: 'Archived schedules cannot accept actions',
    });
  }

  const careType = input.action.careType ?? 'WATERING';
  const schedule = input.state.careSchedules[careType];
  if (!schedule) {
    throw new Error(`No ${careType} schedule is enabled`);
  }

  const today = validateISODate(input.today);
  const currentProjection = projectSchedule({ ...input, careType });
  const currentAdjustment = adjustmentForSeason(
    schedule.learnedAdjustments,
    currentProjection.activeSeason,
  );

  if (input.action.type === 'POSTPONE') {
    if (
      !Number.isInteger(input.action.days) ||
      input.action.days <= 0 ||
      input.action.days > currentProjection.effectiveIntervalDays
    ) {
      return {
        state: input.state,
        projection: currentProjection,
        error: {
          code: 'INVALID_POSTPONEMENT',
          message: `Postponement must be a positive integer no greater than ${currentProjection.effectiveIntervalDays} days`,
        },
      };
    }

    const learnedAdjustments = updateAdjustment(
      schedule.learnedAdjustments,
      currentProjection.activeSeason,
      currentAdjustment + input.action.days,
    );
    const nextDueDate = addDays(schedule.nextDueDate, input.action.days);
    const state = replaceSchedule(input.state, careType, {
      ...schedule,
      nextDueDate,
      learnedAdjustments,
    });

    return calculationFor(state, input, careType);
  }

  if (
    input.action.type === 'FEEDBACK_EARLIER' ||
    input.action.type === 'FEEDBACK_LATER'
  ) {
    const requestedAdjustment =
      currentAdjustment + (input.action.type === 'FEEDBACK_LATER' ? 1 : -1);
    const minimumAdjustment = 1 - currentProjection.baseIntervalDays;
    const learnedAdjustments = updateAdjustment(
      schedule.learnedAdjustments,
      currentProjection.activeSeason,
      Math.max(minimumAdjustment, requestedAdjustment),
    );
    const state = replaceSchedule(input.state, careType, {
      ...schedule,
      learnedAdjustments,
    });

    return calculationFor(state, input, careType);
  }

  const completedDate = validateISODate(
    input.action.completedDate ?? today,
    today,
  );
  const state = replaceSchedule(input.state, careType, {
    ...schedule,
    lastCompletedDate: completedDate,
    nextDueDate: completedDate,
  });
  const calculation = calculationFor(state, input, careType);
  const events = [{ careType, date: completedDate }];
  const fertilizerMode = input.knowledge.fertilizerModes.find(
    (mode) => mode !== 'NONE',
  );

  return {
    ...calculation,
    events:
      careType === 'WATERING' && fertilizerMode === 'LIQUID'
        ? [...events, { careType: 'FERTILIZING' as const, date: completedDate }]
        : events,
  };
}

export function recalculateForLocationChange(
  input: LocationChangeInput,
): ScheduleCalculation {
  if (input.state.archived) {
    throw new SchedulingDomainException({
      code: 'ARCHIVED_SCHEDULE',
      message: 'Archived schedules cannot be recalculated',
    });
  }

  const careType = input.careType ?? 'WATERING';
  const schedule = input.state.careSchedules[careType];
  if (!schedule) {
    throw new Error(`No ${careType} schedule is enabled`);
  }
  const learnedAdjustments =
    input.mode === 'RESET_TO_DEFAULTS'
      ? initialAdjustments(input.knowledge.seasonalModel)
      : schedule.learnedAdjustments;
  const state = replaceSchedule(input.state, careType, {
    ...schedule,
    learnedAdjustments,
    nextDueDate: schedule.lastCompletedDate,
  });

  return calculationFor(state, { ...input, climate: input.newClimate }, careType);
}

function calculationFor(
  state: ScheduleState,
  input: ProjectScheduleInput,
  careType: CareType,
): ScheduleCalculation {
  return {
    state,
    projection: projectSchedule({ ...input, state, careType }),
  };
}

function replaceSchedule(
  state: ScheduleState,
  careType: CareType,
  schedule: CareScheduleState,
): ScheduleState {
  return {
    ...state,
    careSchedules: { ...state.careSchedules, [careType]: schedule },
  };
}

function updateAdjustment(
  adjustments: LearnedAdjustments,
  season: 'GROWING' | 'DORMANT',
  days: number,
): LearnedAdjustments {
  if (adjustments.model === 'YEAR_ROUND') {
    return { model: 'YEAR_ROUND', days };
  }

  return season === 'GROWING'
    ? { ...adjustments, growingDays: days }
    : { ...adjustments, dormantDays: days };
}

function initialAdjustments(
  seasonalModel: 'GROWING_DORMANT' | 'YEAR_ROUND',
): LearnedAdjustments {
  return seasonalModel === 'YEAR_ROUND'
    ? { model: 'YEAR_ROUND', days: 0 }
    : { model: 'GROWING_DORMANT', growingDays: 0, dormantDays: 0 };
}

function adjustmentForSeason(
  adjustments: LearnedAdjustments,
  season: 'GROWING' | 'DORMANT',
): number {
  if (adjustments.model === 'YEAR_ROUND') {
    return adjustments.days;
  }

  return season === 'GROWING'
    ? adjustments.growingDays
    : adjustments.dormantDays;
}

function addDays(date: ISODateString, days: number): ISODateString {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return validateISODate(parsed.toISOString().slice(0, 10));
}

function statusFor(
  nextDueDate: ISODateString,
  today: ISODateString,
): 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE' {
  if (nextDueDate < today) {
    return 'OVERDUE';
  }

  return nextDueDate === today ? 'DUE_TODAY' : 'NOT_DUE';
}

function plannerTasks(
  fertilizerModes: readonly ('NONE' | 'LIQUID' | 'LONG_TERM')[],
  careType: CareType,
) {
  const fertilizerMode = fertilizerModes.find((mode) => mode !== 'NONE');

  if (careType === 'FERTILIZING') {
    return fertilizerMode
      ? [{ careType, fertilizerMode }]
      : [{ careType }];
  }

  if (fertilizerMode === 'LIQUID') {
    return [
      {
        careType: 'WATERING' as const,
        fertilizerMode,
        combinedWithWatering: true,
      },
    ];
  }

  if (fertilizerMode === 'LONG_TERM') {
    return [
      { careType: 'WATERING' as const },
      { careType: 'FERTILIZING' as const, fertilizerMode },
    ];
  }

  return [{ careType: 'WATERING' as const }];
}