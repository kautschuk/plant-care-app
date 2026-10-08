import type {
  ClimateClassification,
  HouseholdLocation,
} from '../knowledge/types';
import type {
  CareType,
  FertilizerMode,
  ISODateString,
  ScheduleState,
  TaxonomicLevel,
} from '../scheduling/types';

export type CareEventType = CareType | 'REPOTTING' | 'PROPAGATION';

export interface HouseholdSettings {
  readonly knowledgeLevel: string;
  readonly commitmentLevel: string;
  readonly location: HouseholdLocation;
  readonly climate: ClimateClassification;
  readonly climateUsedFallback: boolean;
}

export interface PlantRecord {
  readonly id: string;
  readonly displayName: string;
  readonly genus: string;
  readonly species?: string;
  readonly taxonomicLevel: TaxonomicLevel;
  readonly archived: boolean;
}

export interface PlantCareConfiguration {
  readonly plantId: string;
  readonly schedulingEnabled: boolean;
  readonly fertilizerMode: FertilizerMode;
}

export interface PlantWithCareConfiguration {
  readonly plant: PlantRecord;
  readonly care: PlantCareConfiguration;
}

export interface CareEvent {
  readonly id: string;
  readonly plantId: string;
  readonly type: CareEventType;
  readonly date: ISODateString;
}

export interface PersistedPlantSchedule {
  readonly plantId: string;
  readonly state: ScheduleState;
}