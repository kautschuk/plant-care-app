import { PersistenceError } from '../domain/persistence/errors';
import type { PersistenceStore } from '../domain/persistence/repositories';
import type {
  CareEvent,
  CareEventType,
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
  ScheduleAction,
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

export interface PlantUpdateInput {
  readonly id: string;
  readonly displayName?: string;
  readonly genus?: string;
  readonly species?: string | null;
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

export interface PlantScheduleActionInput {
  readonly plantId: string;
  readonly action: ScheduleAction;
  readonly today?: ISODateString;
}

export interface CareEventInput {
  readonly id: string;
  readonly plantId: string;
  readonly type: CareEventType;
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

export interface PlantUpdateResult {
  readonly plant: PlantRecord;
  readonly care: PlantCareConfiguration;
  readonly schedule?: ScheduleState;
}

export interface CareCompletionResult {
  readonly schedule: ScheduleState;
  readonly events: readonly CareEvent[];
}

export interface ScheduleActionResult {
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

export async function updatePlant(
  input: PlantUpdateInput,
  store?: PersistenceStore,
): Promise<PlantUpdateResult> {
  const resolvedStore = store ?? await defaultStore();
  const currentPlant = await resolvedStore.plants.get(input.id);
  if (!currentPlant) {
    throw new PersistenceError('NOT_FOUND', `Plant ${input.id} was not found`);
  }

  if (currentPlant.plant.archived) {
    throw new PersistenceError('INVALID_DATA', `Plant ${input.id} is archived`);
  }

  const nextDisplayName = (input.displayName ?? currentPlant.plant.displayName).trim();
  const nextGenus = (input.genus ?? currentPlant.plant.genus).trim();
  if (!nextDisplayName || !nextGenus) {
    throw new PersistenceError('INVALID_DATA', 'Display name and genus are required');
  }

  const nextSpecies = input.species === undefined
    ? currentPlant.plant.species
    : input.species ?? undefined;
  const lookup = findPlantKnowledge({
    genus: nextGenus,
    species: nextSpecies,
  });
  if (lookup.status !== 'FOUND') {
    throw new PersistenceError(
      'INVALID_DATA',
      `No plant knowledge is available for ${nextGenus}${nextSpecies ? ` ${nextSpecies}` : ''}`,
    );
  }

  const nextPlant: PlantRecord = {
    ...currentPlant.plant,
    displayName: nextDisplayName,
    genus: lookup.entry.genus,
    species: lookup.entry.taxonomicLevel === 'SPECIES'
      ? (nextSpecies ?? lookup.entry.species)
      : undefined,
    taxonomicLevel: lookup.entry.taxonomicLevel,
  };

  const nextCare: PlantCareConfiguration = {
    ...currentPlant.care,
    fertilizerMode: input.fertilizerMode ?? currentPlant.care.fertilizerMode,
    schedulingEnabled: input.schedulingEnabled ?? currentPlant.care.schedulingEnabled,
  };

  const shouldInitializeSchedule = !currentPlant.care.schedulingEnabled && nextCare.schedulingEnabled;
  const shouldRemoveSchedule = currentPlant.care.schedulingEnabled && !nextCare.schedulingEnabled;

  if (shouldInitializeSchedule) {
    const settings = await resolvedStore.householdSettings.get();
    if (!settings) {
      throw new PersistenceError(
        'INVALID_DATA',
        'Household settings must be saved before a plant schedule can be initialized',
      );
    }

    const today = normalizeISODate(input.today ?? currentISODate()) ?? currentISODate();
    const scheduledState = await resolvedStore.schedules.get(input.id);
    const lastCompletedDate = normalizeISODate(
      input.lastCompletedDate ?? scheduledState?.careSchedules.WATERING?.lastCompletedDate ?? today,
      today,
    ) ?? today;
    const lastFertilizingDate = normalizeISODate(
      input.lastFertilizingDate ?? scheduledState?.careSchedules.FERTILIZING?.lastCompletedDate ?? lastCompletedDate,
      today,
    );

    const initialized = initializeSchedule({
      today,
      lastCompletedDate,
      lastFertilizingDate,
      knowledge: lookup.entry,
      climate: settings.climate,
      careType: 'WATERING',
    });

    await resolvedStore.transaction(async (repositories) => {
      await repositories.plants.save(nextPlant, nextCare);
      await repositories.schedules.save(input.id, initialized.state);
    });

    return {
      plant: nextPlant,
      care: nextCare,
      schedule: initialized.state,
    };
  }

  await resolvedStore.transaction(async (repositories) => {
    await repositories.plants.save(nextPlant, nextCare);
    if (shouldRemoveSchedule) {
      await repositories.schedules.delete(input.id);
    }
  });

  return {
    plant: nextPlant,
    care: nextCare,
    schedule: nextCare.schedulingEnabled
      ? ((await resolvedStore.schedules.get(input.id)) ?? undefined)
      : undefined,
  };
}

export async function applyPlantScheduleAction(
  input: PlantScheduleActionInput,
  store?: PersistenceStore,
): Promise<ScheduleActionResult> {
  const resolvedStore = store ?? await defaultStore();
  const plant = await resolvedStore.plants.get(input.plantId);
  if (!plant) {
    throw new PersistenceError('NOT_FOUND', `Plant ${input.plantId} was not found`);
  }

  if (plant.plant.archived) {
    throw new PersistenceError('INVALID_DATA', `Plant ${input.plantId} is archived`);
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
  const schedule = (await resolvedStore.schedules.get(input.plantId)) ?? {
    careSchedules: {},
  };

  const action = input.action.type === 'COMPLETE'
    ? {
        ...input.action,
        completedDate: normalizeISODate(input.action.completedDate ?? today, today) ?? today,
      }
    : input.action;

  const result = applyScheduleAction({
    today,
    state: schedule,
    knowledge: lookup.entry,
    climate: settings.climate,
    action,
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

export async function recordCareCompletion(
  input: PlantCareActionInput,
  store?: PersistenceStore,
): Promise<CareCompletionResult> {
  const result = await applyPlantScheduleAction(
    {
      plantId: input.plantId,
      action: {
        type: 'COMPLETE',
        completedDate: input.date,
        careType: input.careType ?? 'WATERING',
      },
      today: input.today,
    },
    store,
  );

  return { schedule: result.schedule, events: result.events };
}

export async function createCareEvent(
  input: CareEventInput,
  store?: PersistenceStore,
): Promise<CareEvent> {
  const resolvedStore = store ?? await defaultStore();
  await requireActiveJournalPlant(input.plantId, resolvedStore);
  const today = validateJournalDate(input.today ?? currentISODate());
  const event: CareEvent = {
    id: input.id,
    plantId: input.plantId,
    type: input.type,
    date: validateJournalDate(input.date ?? today, today),
  };
  await resolvedStore.careEvents.save(event);
  return event;
}

export async function editCareEvent(
  input: CareEventInput,
  store?: PersistenceStore,
): Promise<CareEvent> {
  const resolvedStore = store ?? await defaultStore();
  await requireActiveJournalPlant(input.plantId, resolvedStore);
  const existingEvents = await resolvedStore.careEvents.listForPlant(input.plantId);
  if (!existingEvents.some((event) => event.id === input.id)) {
    throw new PersistenceError('NOT_FOUND', `Care event ${input.id} was not found`);
  }

  const today = validateJournalDate(input.today ?? currentISODate());
  const event: CareEvent = {
    id: input.id,
    plantId: input.plantId,
    type: input.type,
    date: validateJournalDate(input.date ?? today, today),
  };
  await resolvedStore.careEvents.save(event);
  return event;
}

export async function deleteCareEvent(
  plantId: string,
  eventId: string,
  store?: PersistenceStore,
): Promise<boolean> {
  const resolvedStore = store ?? await defaultStore();
  await requireActiveJournalPlant(plantId, resolvedStore);
  const events = await resolvedStore.careEvents.listForPlant(plantId);
  if (!events.some((event) => event.id === eventId)) return false;
  return resolvedStore.careEvents.delete(eventId);
}

export async function archivePlant(
  plantId: string,
  store?: PersistenceStore,
): Promise<void> {
  const resolvedStore = store ?? await defaultStore();
  await resolvedStore.plants.archive(plantId);
}

export async function restorePlant(
  plantId: string,
  store?: PersistenceStore,
): Promise<void> {
  const resolvedStore = store ?? await defaultStore();
  await resolvedStore.plants.restore(plantId);
}

export async function deletePlant(
  plantId: string,
  store?: PersistenceStore,
): Promise<void> {
  const resolvedStore = store ?? await defaultStore();
  await resolvedStore.plants.deletePermanently(plantId);
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

async function requireActiveJournalPlant(
  plantId: string,
  store: PersistenceStore,
): Promise<void> {
  const result = await store.plants.get(plantId);
  if (!result) {
    throw new PersistenceError('NOT_FOUND', `Plant ${plantId} was not found`);
  }
  if (result.plant.archived) {
    throw new PersistenceError('INVALID_DATA', 'Archived plant history is read-only');
  }
}

function validateJournalDate(value: string, today?: ISODateString): ISODateString {
  try {
    if (today) validateISODate(today);
    return validateISODate(value, today);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Date must be a valid ISO calendar date';
    throw new PersistenceError('INVALID_DATA', message, error);
  }
}

function currentISODate(): ISODateString {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}` as ISODateString;
}
