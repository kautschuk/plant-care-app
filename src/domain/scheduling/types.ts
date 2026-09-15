export type ISODateString = string & {
  readonly __isoDate: unique symbol;
};

export type IntervalDays = number & {
  readonly __intervalDays: unique symbol;
};

export type SeasonalModel = 'GROWING_DORMANT' | 'YEAR_ROUND';

export type Season = 'GROWING' | 'DORMANT';

export type CareType = 'WATERING' | 'FERTILIZING';

export type FertilizerMode = 'NONE' | 'LIQUID' | 'LONG_TERM';

export type TaxonomicLevel = 'SPECIES' | 'GENUS';

export type Climate = string;

export function validateISODate(
  value: string,
  today?: ISODateString,
): ISODateString {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be a valid ISO calendar date');
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Date must be a valid ISO calendar date');
  }

  if (today && value > today) {
    throw new Error('Date cannot be in the future');
  }

  return value as ISODateString;
}

export type ScheduleAction =
  | { type: 'COMPLETE'; completedDate?: ISODateString; careType?: CareType }
  | { type: 'POSTPONE'; days: number; careType?: CareType }
  | { type: 'FEEDBACK_EARLIER'; careType?: CareType }
  | { type: 'FEEDBACK_LATER'; careType?: CareType };

export type SchedulingErrorCode =
  | 'ARCHIVED_SCHEDULE'
  | 'INVALID_POSTPONEMENT'
  | 'UNKNOWN_ACTION';

export interface SchedulingDomainError {
  readonly code: SchedulingErrorCode;
  readonly message: string;
}

export type LearnedAdjustments =
  | { readonly model: 'YEAR_ROUND'; readonly days: number }
  | {
      readonly model: 'GROWING_DORMANT';
      readonly growingDays: number;
      readonly dormantDays: number;
    };

export interface CareScheduleState {
  readonly lastCompletedDate: ISODateString;
  readonly nextDueDate: ISODateString;
  readonly learnedAdjustments: LearnedAdjustments;
  readonly adjustmentReason?: string;
}

export interface ScheduleState {
  readonly careSchedules: Partial<Record<CareType, CareScheduleState>>;
  readonly archived?: boolean;
}

export interface KnowledgeEntry {
  readonly species?: string;
  readonly genus: string;
  readonly taxonomicLevel: TaxonomicLevel;
  readonly seasonalModel: SeasonalModel;
  readonly fertilizationApplicable: boolean;
  readonly fertilizerModes: readonly FertilizerMode[];
  seasonFor(climate: Climate, today: ISODateString): Season;
  intervalFor(
    climate: Climate,
    season: Season,
    careType: CareType,
  ): IntervalDays;
}

export interface ScheduleProjection {
  activeSeason: Season;
  baseIntervalDays: IntervalDays;
  effectiveIntervalDays: number;
  nextDueDate: ISODateString;
  status: 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE';
}

export interface ScheduleCalculation {
  state: ScheduleState;
  projection: PlannerProjection;
  events?: readonly CareEventDescriptor[];
  error?: SchedulingDomainError;
}

export interface PlannerProjection extends ScheduleProjection {
  guidanceLevel: TaxonomicLevel;
  tasks: readonly PlannerTask[];
}

export interface PlannerTask {
  careType: CareType;
  fertilizerMode?: FertilizerMode;
  combinedWithWatering?: boolean;
}

export interface CareEventDescriptor {
  careType: CareType;
  date: ISODateString;
}

export interface InitializeScheduleInput {
  today: ISODateString;
  lastCompletedDate: ISODateString;
  knowledge: KnowledgeEntry;
  climate: Climate;
  careType?: CareType;
}

export interface ProjectScheduleInput {
  today: ISODateString;
  state: ScheduleState;
  knowledge: KnowledgeEntry;
  climate: Climate;
  careType?: CareType;
}

export interface ApplyScheduleActionInput extends ProjectScheduleInput {
  action: ScheduleAction;
}

export interface LocationChangeInput extends ProjectScheduleInput {
  newClimate: Climate;
  mode: 'RESET_TO_DEFAULTS' | 'PRESERVE_LEARNED_STATE';
}