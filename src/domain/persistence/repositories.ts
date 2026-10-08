import type { ScheduleState } from '../scheduling/types';
import type {
  CareEvent,
  HouseholdSettings,
  PlantCareConfiguration,
  PlantRecord,
  PlantWithCareConfiguration,
} from './types';

export interface HouseholdSettingsRepository {
  get(): Promise<HouseholdSettings | null>;
  save(settings: HouseholdSettings): Promise<void>;
}

export interface PlantRepository {
  get(id: string): Promise<PlantWithCareConfiguration | null>;
  list(archived?: boolean): Promise<readonly PlantWithCareConfiguration[]>;
  save(plant: PlantRecord, care: PlantCareConfiguration): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deletePermanently(id: string): Promise<void>;
}

export interface ScheduleRepository {
  get(plantId: string): Promise<ScheduleState | null>;
  save(plantId: string, state: ScheduleState): Promise<void>;
  delete(plantId: string): Promise<void>;
}

export interface CareEventRepository {
  listForPlant(plantId: string): Promise<readonly CareEvent[]>;
  save(event: CareEvent): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export interface PersistenceRepositories {
  readonly householdSettings: HouseholdSettingsRepository;
  readonly plants: PlantRepository;
  readonly schedules: ScheduleRepository;
  readonly careEvents: CareEventRepository;
}

export interface PersistenceStore extends PersistenceRepositories {
  transaction<T>(
    operation: (repositories: PersistenceRepositories) => Promise<T>,
  ): Promise<T>;
}