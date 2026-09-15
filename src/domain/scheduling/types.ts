export type ISODateString = `${number}-${number}-${number}`;

export type IntervalDays = number & {
  readonly __intervalDays: unique symbol;
};

export type SeasonalModel = 'GROWING_DORMANT' | 'YEAR_ROUND';

export type Season = 'GROWING' | 'DORMANT';

export type CareType = 'WATERING' | 'FERTILIZING';

export type FertilizerMode = 'NONE' | 'LIQUID' | 'LONG_TERM';

export type TaxonomicLevel = 'SPECIES' | 'GENUS';

export type Climate = string;

export type ScheduleAction =
  | { type: 'COMPLETE'; completedDate?: ISODateString; careType?: CareType }
  | { type: 'POSTPONE'; days: number; careType?: CareType }
  | { type: 'FEEDBACK_EARLIER'; careType?: CareType }
  | { type: 'FEEDBACK_LATER'; careType?: CareType };

export interface SeasonalAdjustments {
  growing?: number;
  dormant?: number;
  yearRound?: number;
}

export interface CareScheduleState {
  lastCompletedDate: ISODateString;
  nextDueDate: ISODateString;
  learnedAdjustmentDays: number;
  seasonalAdjustments?: SeasonalAdjustments;
  adjustmentReason?: string;
}

export interface ScheduleState extends CareScheduleState {
  careSchedules: Partial<Record<CareType, CareScheduleState>>;
}

export interface KnowledgeEntry {
  species?: string;
  genus: string;
  taxonomicLevel: TaxonomicLevel;
  seasonalModel: SeasonalModel;
  fertilizationApplicable: boolean;
  fertilizerModes: readonly FertilizerMode[];
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
  projection: ScheduleProjection;
  events?: readonly CareEventDescriptor[];
}

export interface PlannerProjection extends ScheduleProjection {
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