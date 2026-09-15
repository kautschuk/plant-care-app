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
} from './types';
import { validateISODate } from './types';

const NOT_IMPLEMENTED =
  'Scheduling behavior is implemented in a later engine task';

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
  _input: ApplyScheduleActionInput,
): ScheduleCalculation {
  throw new Error(NOT_IMPLEMENTED);
}

export function recalculateForLocationChange(
  _input: LocationChangeInput,
): ScheduleCalculation {
  throw new Error(NOT_IMPLEMENTED);
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