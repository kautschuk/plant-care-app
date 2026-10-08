import { PersistenceError } from '../domain/persistence/errors';
import type { PersistenceStore } from '../domain/persistence/repositories';
import type {
  CareEvent,
  HouseholdSettings,
  PlantCareConfiguration,
  PlantRecord,
} from '../domain/persistence/types';
import { findPlantKnowledge, resolveClimate } from '../domain/knowledge';
import { applyScheduleAction, initializeSchedule } from '../domain/scheduling';
import type {
  CareType,
  FertilizerMode,
  ISODateString,
  ScheduleState,
} from '../domain/scheduling/types';
import { validateISODate } from '../domain/scheduling/types';

export interface HouseholdSetupInput {
  readonly knowledgeLevel: string;
  readonly commitmentLevel: string;
  readonly city: string;
  readonly country: string;
}

export interface PlantSetupInput {
  readonly id: string;
  readonly displayName: string;
  readonly genus: string;
  readonly species?: string;
  readonly fertilizerMode?: FertilizerMode;
  readonly schedulingEnabled?: boolean;
  readonly lastCompletedDate?: ISODateString;
  readonly lastFertilizingDate?: ISODateString;
  readonly today?: ISODateString;
}

export interface PlantCareActionInput {
  readonly plantId: string;
  readonly careType?: CareType;
  readonly date?: ISODateString;
  readonly today?: ISODateString;
}

export interface HouseholdSettingsResult {
  readonly settings: HouseholdSettings;
}

export interface PlantCreationResult {
  readonly plant: PlantRecord;
  readonly care: PlantCareConfiguration;
  readonly schedule?: ScheduleState;
}

export interface CareCompletionResult {
  readonly schedule: ScheduleState;
  readonly events: readonly CareEvent[];
}

async function defaultStore(): Promise<PersistenceStore> {
  const module = await import('../adapters/sqlite/database');
  return module.openPersistenceStore();
}

export async function saveHouseholdSettings(
  input: HouseholdSetupInput,
  store?: PersistenceStore,
): Promise<HouseholdSettingsResult['settings']> {
  const resolvedStore = store ?? await defaultStore();
  const location = {
    city: input.city.trim(),
    country: input.country.trim(),
  };
  if (!location.city || !location.country) {
    throw new PersistenceError('INVALID_DATA', 'City and country are required');
  }

  const climateResolution = resolveClimate(location);
  const settings: HouseholdSettings = {
    knowledgeLevel: input.knowledgeLevel.trim(),
    commitmentLevel: input.commitmentLevel.trim(),
    location,
    climate: climateResolution.climate,
    climateUsedFallback: climateResolution.usedFallback,
  };

  await resolvedStore.householdSettings.save(settings);
  return settings;
}

export async function createPlant(
  input: PlantSetupInput,
  store?: PersistenceStore,
): Promise<PlantCreationResult> {
  const resolvedStore = store ?? await defaultStore();
  const displayName = input.displayName.trim();
  const genus = input.genus.trim();
  if (!displayName || !genus) {
    throw new PersistenceError('INVALID_DATA', 'Display name and genus are required');
  }

  const lookup = findPlantKnowledge({ genus, species: input.species });
  if (lookup.status !== 'FOUND') {
    throw new PersistenceError(
      'INVALID_DATA',
      `No plant knowledge is available for ${genus}${input.species ? ` ${input.species}` : ''}`,
    );
  }

  const plant: PlantRecord = {
    id: input.id,
    displayName,
    genus: lookup.entry.genus,
    species: lookup.entry.taxonomicLevel === 'SPECIES'
      ? (input.species ?? lookup.entry.species)
      : undefined,
    taxonomicLevel: lookup.entry.taxonomicLevel,
    archived: false,
  };

  const care: PlantCareConfiguration = {
    plantId: plant.id,
    schedulingEnabled: input.schedulingEnabled ?? false,
    fertilizerMode: input.fertilizerMode ?? 'NONE',
  };

  await resolvedStore.plants.save(plant, care);

  const settings = await resolvedStore.householdSettings.get();
  let schedule: ScheduleState | undefined;
  if (care.schedulingEnabled) {
    if (!settings) {
      throw new PersistenceError(
        'INVALID_DATA',
        'Household settings must be saved before a plant schedule can be initialized',
      );
    }

    const today = normalizeISODate(input.today ?? currentISODate()) ?? currentISODate();
    const lastCompletedDate = normalizeISODate(
      input.lastCompletedDate ?? today,
      today,
    ) ?? today;
    const initialized = initializeSchedule({
      today,
      lastCompletedDate,
      lastFertilizingDate: normalizeISODate(
        input.lastFertilizingDate,
        today,
      ),
      knowledge: lookup.entry,
      climate: settings.climate,
      careType: 'WATERING',
    });

    await resolvedStore.schedules.save(plant.id, initialized.state);
    schedule = initialized.state;
  }

  return { plant, care, schedule };
}

export async function recordCareCompletion(
  input: PlantCareActionInput,
  store?: PersistenceStore,
): Promise<CareCompletionResult> {
  const resolvedStore = store ?? await defaultStore();
  const plant = await resolvedStore.plants.get(input.plantId);
  if (!plant) {
    throw new PersistenceError('NOT_FOUND', `Plant ${input.plantId} was not found`);
  }

  const settings = await resolvedStore.householdSettings.get();
  if (!settings) {
    throw new PersistenceError('INVALID_DATA', 'Household settings are required');
  }

  const lookup = findPlantKnowledge({
    genus: plant.plant.genus,
    species: plant.plant.species,
  });
  if (lookup.status !== 'FOUND') {
    throw new PersistenceError(
      'INVALID_DATA',
      `No supported plant knowledge for ${plant.plant.genus}`,
    );
  }

  const today = normalizeISODate(input.today ?? currentISODate()) ?? currentISODate();
  const date = normalizeISODate(input.date ?? today, today) ?? today;
  const schedule = (await resolvedStore.schedules.get(input.plantId)) ?? {
    careSchedules: {},
  };

  const result = applyScheduleAction({
    today,
    state: schedule,
    knowledge: lookup.entry,
    climate: settings.climate,
    action: {
      type: 'COMPLETE',
      completedDate: date,
      careType: input.careType ?? 'WATERING',
    },
  });

  if (result.error) {
    throw new PersistenceError('INVALID_DATA', result.error.message);
  }

  const events = (result.events ?? []).map((event, index) => ({
    id: `${input.plantId}-${event.careType.toLowerCase()}-${event.date}-${index}`,
    plantId: input.plantId,
    type: event.careType,
    date: event.date,
  } satisfies CareEvent));

  await resolvedStore.transaction(async (repositories) => {
    await repositories.schedules.save(input.plantId, result.state);
    for (const event of events) {
      await repositories.careEvents.save(event);
    }
  });

  return { schedule: result.state, events };
}

function normalizeISODate(
  value: string | undefined,
  today?: ISODateString,
): ISODateString | undefined {
  if (value === undefined) {
    return undefined;
  }
  const next = validateISODate(value, today);
  return next as ISODateString;
}

function currentISODate(): ISODateString {
  return new Date().toISOString().slice(0, 10) as ISODateString;
}
