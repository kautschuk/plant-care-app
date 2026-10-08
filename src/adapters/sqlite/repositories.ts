import { validateISODate } from '../../domain/scheduling/types';
import type {
  CareScheduleState,
  CareType,
  ScheduleState,
} from '../../domain/scheduling/types';
import { decodeCareScheduleState, encodeCareScheduleState } from '../../domain/persistence/schedule-codec';
import { PersistenceError } from '../../domain/persistence/errors';
import type {
  CareEventRepository,
  HouseholdSettingsRepository,
  PersistenceRepositories,
  PersistenceStore,
  PlantRepository,
  ScheduleRepository,
} from '../../domain/persistence/repositories';
import type {
  CareEvent,
  CareEventType,
  HouseholdSettings,
  PlantCareConfiguration,
  PlantRecord,
  PlantWithCareConfiguration,
} from '../../domain/persistence/types';
import type {
  SQLiteDriver,
  SQLiteExecutor,
} from './driver';

const CLIMATES = [
  'TROPICAL',
  'ARID',
  'MEDITERRANEAN',
  'TEMPERATE',
  'CONTINENTAL',
  'POLAR',
] as const;
const CARE_TYPES = ['WATERING', 'FERTILIZING'] as const;
const FERTILIZER_MODES = ['NONE', 'LIQUID', 'LONG_TERM'] as const;
const TAXONOMIC_LEVELS = ['SPECIES', 'GENUS'] as const;
const EVENT_TYPES = [
  'WATERING',
  'FERTILIZING',
  'REPOTTING',
  'PROPAGATION',
] as const;

type Climate = (typeof CLIMATES)[number];
type FertilizerMode = (typeof FERTILIZER_MODES)[number];
type TaxonomicLevel = (typeof TAXONOMIC_LEVELS)[number];
type Row = Record<string, unknown>;
type AtomicOperation = <T>(
  operation: (executor: SQLiteExecutor) => Promise<T>,
) => Promise<T>;

export function createPersistenceStore(database: SQLiteDriver): PersistenceStore {
  const enqueue = createSerialQueue();
  const repositories = createRepositories(database, (operation) =>
    database.transaction(operation),
  );
  const queuedRepositories: PersistenceRepositories = {
    householdSettings: {
      get: () => enqueue(() => repositories.householdSettings.get()),
      save: (settings) =>
        enqueue(() => repositories.householdSettings.save(settings)),
    },
    plants: {
      get: (id) => enqueue(() => repositories.plants.get(id)),
      list: (archived) => enqueue(() => repositories.plants.list(archived)),
      save: (plant, care) =>
        enqueue(() => repositories.plants.save(plant, care)),
      archive: (id) => enqueue(() => repositories.plants.archive(id)),
      restore: (id) => enqueue(() => repositories.plants.restore(id)),
      deletePermanently: (id) =>
        enqueue(() => repositories.plants.deletePermanently(id)),
    },
    schedules: {
      get: (plantId) => enqueue(() => repositories.schedules.get(plantId)),
      save: (plantId, state) =>
        enqueue(() => repositories.schedules.save(plantId, state)),
      delete: (plantId) =>
        enqueue(() => repositories.schedules.delete(plantId)),
    },
    careEvents: {
      listForPlant: (plantId) =>
        enqueue(() => repositories.careEvents.listForPlant(plantId)),
      save: (event) => enqueue(() => repositories.careEvents.save(event)),
      delete: (id) => enqueue(() => repositories.careEvents.delete(id)),
    },
  };

  return {
    ...queuedRepositories,
    async transaction<T>(operation: (scope: PersistenceRepositories) => Promise<T>) {
      return enqueue(async () => {
        try {
          return await database.transaction((transaction) =>
            operation(
              createRepositories(transaction, (nestedOperation) =>
                nestedOperation(transaction),
              ),
            ),
          );
        } catch (error) {
          throw databaseFailure('Persistence transaction failed', error);
        }
      });
    },
  };
}

function createRepositories(
  executor: SQLiteExecutor,
  atomic: AtomicOperation,
): PersistenceRepositories {
  const householdSettings: HouseholdSettingsRepository = {
    get: () => safe('Could not read household settings', async () => {
      const row = await executor.getFirst<Row>(
        `SELECT knowledge_level, commitment_level, city, country, climate,
                climate_used_fallback
         FROM household_settings WHERE id = 1`,
      );
      return row ? mapHouseholdSettings(row) : null;
    }),

    save: (settings) => safe('Could not save household settings', async () => {
      const valid = validateHouseholdSettings(settings);
      await executor.run(
        `INSERT INTO household_settings
          (id, knowledge_level, commitment_level, city, country, climate,
           climate_used_fallback)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           knowledge_level = excluded.knowledge_level,
           commitment_level = excluded.commitment_level,
           city = excluded.city,
           country = excluded.country,
           climate = excluded.climate,
           climate_used_fallback = excluded.climate_used_fallback`,
        [
          valid.knowledgeLevel,
          valid.commitmentLevel,
          valid.location.city,
          valid.location.country,
          valid.climate,
          valid.climateUsedFallback ? 1 : 0,
        ],
      );
    }),
  };

  const plants: PlantRepository = {
    get: (id) => safe('Could not read plant', async () => {
      const validId = validateIdentifier(id, 'Plant ID');
      const row = await executor.getFirst<Row>(
        `SELECT p.id, p.display_name, p.genus, p.species, p.taxonomic_level,
                p.archived, c.plant_id AS care_plant_id,
                c.scheduling_enabled, c.fertilizer_mode
         FROM plants p LEFT JOIN care_configurations c ON c.plant_id = p.id
         WHERE p.id = ?`,
        [validId],
      );
      return row ? mapPlantWithCare(row) : null;
    }),

    list: (archived = false) => safe('Could not list plants', async () => {
      const rows = await executor.getAll<Row>(
        `SELECT p.id, p.display_name, p.genus, p.species, p.taxonomic_level,
                p.archived, c.plant_id AS care_plant_id,
                c.scheduling_enabled, c.fertilizer_mode
         FROM plants p LEFT JOIN care_configurations c ON c.plant_id = p.id
         WHERE p.archived = ? ORDER BY p.display_name, p.id`,
        [archived ? 1 : 0],
      );
      return rows.map(mapPlantWithCare);
    }),

    save: (plant, care) => safe('Could not save plant', async () => {
      const validPlant = validatePlant(plant);
      const validCare = validateCareConfiguration(care);
      if (validPlant.id !== validCare.plantId) {
        throw invalidData('Plant and care configuration IDs must match');
      }
      if (validPlant.archived && validCare.schedulingEnabled) {
        throw invalidData('Archived plants cannot have scheduling enabled');
      }

      await atomic(async (transaction) => {
        const existing = await transaction.getFirst<Row>(
          'SELECT archived FROM plants WHERE id = ?',
          [validPlant.id],
        );
        if (existing && readBoolean(existing.archived, 'Plant archived flag')) {
          throw invalidData('Archived plants are read-only');
        }
        if (validPlant.archived) {
          throw invalidData('Use the archive operation to archive a plant');
        }

        await transaction.run(
          `INSERT INTO plants
            (id, display_name, genus, species, taxonomic_level, archived)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             display_name = excluded.display_name,
             genus = excluded.genus,
             species = excluded.species,
             taxonomic_level = excluded.taxonomic_level,
             archived = excluded.archived`,
          [
            validPlant.id,
            validPlant.displayName,
            validPlant.genus,
            validPlant.species ?? null,
            validPlant.taxonomicLevel,
            validPlant.archived ? 1 : 0,
          ],
        );
        await transaction.run(
          `INSERT INTO care_configurations
            (plant_id, scheduling_enabled, fertilizer_mode)
           VALUES (?, ?, ?)
           ON CONFLICT(plant_id) DO UPDATE SET
             scheduling_enabled = excluded.scheduling_enabled,
             fertilizer_mode = excluded.fertilizer_mode`,
          [
            validCare.plantId,
            validCare.schedulingEnabled ? 1 : 0,
            validCare.fertilizerMode,
          ],
        );
      });
    }),

    archive: (id) => safe('Could not archive plant', async () => {
      const validId = validateIdentifier(id, 'Plant ID');
      await atomic(async (transaction) => {
        await requirePlant(transaction, validId);
        await transaction.run('UPDATE plants SET archived = 1 WHERE id = ?', [
          validId,
        ]);
        await transaction.run(
          'UPDATE care_configurations SET scheduling_enabled = 0 WHERE plant_id = ?',
          [validId],
        );
        await transaction.run('DELETE FROM schedule_states WHERE plant_id = ?', [
          validId,
        ]);
      });
    }),

    restore: (id) => safe('Could not restore plant', async () => {
      const validId = validateIdentifier(id, 'Plant ID');
      await atomic(async (transaction) => {
        await requirePlant(transaction, validId);
        await transaction.run('UPDATE plants SET archived = 0 WHERE id = ?', [
          validId,
        ]);
        await transaction.run(
          'UPDATE care_configurations SET scheduling_enabled = 0 WHERE plant_id = ?',
          [validId],
        );
        await transaction.run('DELETE FROM schedule_states WHERE plant_id = ?', [
          validId,
        ]);
      });
    }),

    deletePermanently: (id) => safe('Could not permanently delete plant', async () => {
      const result = await executor.run('DELETE FROM plants WHERE id = ?', [
        validateIdentifier(id, 'Plant ID'),
      ]);
      if (result.changes === 0) throw notFound('Plant does not exist');
    }),
  };

  const schedules: ScheduleRepository = {
    get: (plantId) => safe('Could not read schedule state', async () => {
      const validId = validateIdentifier(plantId, 'Plant ID');
      const rows = await executor.getAll<Row>(
        `SELECT care_type, state_json FROM schedule_states
         WHERE plant_id = ? ORDER BY care_type`,
        [validId],
      );
      if (rows.length === 0) return null;

      const careSchedules: Partial<Record<CareType, CareScheduleState>> = {};
      for (const row of rows) {
        const careType = enumValue(row.care_type, CARE_TYPES, 'Schedule care type');
        if (careSchedules[careType]) {
          throw invalidData(`Duplicate ${careType} schedule row`);
        }
        if (typeof row.state_json !== 'string') {
          throw invalidData('Schedule state payload must be a string');
        }
        careSchedules[careType] = decodeCareScheduleState(row.state_json);
      }
      return { careSchedules };
    }),

    save: (plantId, state) => safe('Could not save schedule state', async () => {
      const validId = validateIdentifier(plantId, 'Plant ID');
      if (state.archived) {
        throw invalidData('Archived schedule state cannot be persisted');
      }
      await atomic(async (transaction) => {
        const plantRow = await transaction.getFirst<Row>(
          `SELECT p.archived, c.scheduling_enabled
           FROM plants p LEFT JOIN care_configurations c ON c.plant_id = p.id
           WHERE p.id = ?`,
          [validId],
        );
        if (!plantRow) throw notFound('Plant does not exist');
        if (readBoolean(plantRow.archived, 'Plant archived flag')) {
          throw invalidData('Archived plants cannot have schedule state');
        }
        if (!readBoolean(plantRow.scheduling_enabled, 'Scheduling enabled flag')) {
          throw invalidData('Scheduling must be enabled before saving schedule state');
        }

        await transaction.run('DELETE FROM schedule_states WHERE plant_id = ?', [
          validId,
        ]);
        for (const careType of CARE_TYPES) {
          const schedule = state.careSchedules[careType];
          if (!schedule) continue;
          await transaction.run(
            `INSERT INTO schedule_states (plant_id, care_type, state_json)
             VALUES (?, ?, ?)`,
            [validId, careType, encodeCareScheduleState(schedule)],
          );
        }
      });
    }),

    delete: (plantId) => safe('Could not delete schedule state', async () => {
      await executor.run('DELETE FROM schedule_states WHERE plant_id = ?', [
        validateIdentifier(plantId, 'Plant ID'),
      ]);
    }),
  };

  const careEvents: CareEventRepository = {
    listForPlant: (plantId) => safe('Could not list care events', async () => {
      const rows = await executor.getAll<Row>(
        `SELECT id, plant_id, event_type, event_date FROM care_events
         WHERE plant_id = ? ORDER BY event_date DESC, id ASC`,
        [validateIdentifier(plantId, 'Plant ID')],
      );
      return rows.map(mapCareEvent);
    }),

    save: (event) => safe('Could not save care event', async () => {
      const validEvent = validateCareEvent(event);
      const existing = await executor.getFirst<Row>(
        `SELECT p.archived FROM care_events e
         INNER JOIN plants p ON p.id = e.plant_id WHERE e.id = ?`,
        [validEvent.id],
      );
      if (existing && readBoolean(existing.archived, 'Plant archived flag')) {
        throw invalidData('Archived plant history is read-only');
      }
      await requireActivePlant(executor, validEvent.plantId);
      await executor.run(
        `INSERT INTO care_events (id, plant_id, event_type, event_date)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           plant_id = excluded.plant_id,
           event_type = excluded.event_type,
           event_date = excluded.event_date`,
        [validEvent.id, validEvent.plantId, validEvent.type, validEvent.date],
      );
    }),

    delete: (id) => safe('Could not delete care event', async () => {
      const validId = validateIdentifier(id, 'Care event ID');
      const row = await executor.getFirst<Row>(
        `SELECT e.id, p.archived FROM care_events e
         INNER JOIN plants p ON p.id = e.plant_id WHERE e.id = ?`,
        [validId],
      );
      if (!row) return false;
      if (readBoolean(row.archived, 'Plant archived flag')) {
        throw invalidData('Archived plant history is read-only');
      }
      await executor.run('DELETE FROM care_events WHERE id = ?', [validId]);
      return true;
    }),
  };

  return { householdSettings, plants, schedules, careEvents };
}

async function requirePlant(
  executor: SQLiteExecutor,
  plantId: string,
): Promise<void> {
  const row = await executor.getFirst<{ id: string }>(
    'SELECT id FROM plants WHERE id = ?',
    [plantId],
  );
  if (!row) throw notFound('Plant does not exist');
}

async function requireActivePlant(
  executor: SQLiteExecutor,
  plantId: string,
): Promise<void> {
  const row = await executor.getFirst<Row>(
    'SELECT archived FROM plants WHERE id = ?',
    [plantId],
  );
  if (!row) throw notFound('Plant does not exist');
  if (readBoolean(row.archived, 'Plant archived flag')) {
    throw invalidData('Archived plants cannot accept care events');
  }
}

function mapHouseholdSettings(row: Row): HouseholdSettings {
  return {
    knowledgeLevel: requiredString(row.knowledge_level, 'Knowledge level'),
    commitmentLevel: requiredString(row.commitment_level, 'Commitment level'),
    location: {
      city: stringValue(row.city, 'Household city'),
      country: stringValue(row.country, 'Household country'),
    },
    climate: enumValue(row.climate, CLIMATES, 'Climate'),
    climateUsedFallback: readBoolean(
      row.climate_used_fallback,
      'Climate fallback flag',
    ),
  };
}

function mapPlantWithCare(row: Row): PlantWithCareConfiguration {
  const id = requiredString(row.id, 'Plant ID');
  if (row.care_plant_id === null || row.care_plant_id === undefined) {
    throw invalidData(`Plant ${id} has no care configuration`);
  }
  const carePlantId = requiredString(row.care_plant_id, 'Care configuration plant ID');
  if (carePlantId !== id) {
    throw invalidData(`Plant ${id} has a mismatched care configuration`);
  }

  return {
    plant: {
      id,
      displayName: requiredString(row.display_name, 'Plant display name'),
      genus: requiredString(row.genus, 'Plant genus'),
      ...(row.species === null
        ? {}
        : { species: requiredString(row.species, 'Plant species') }),
      taxonomicLevel: enumValue(
        row.taxonomic_level,
        TAXONOMIC_LEVELS,
        'Plant taxonomic level',
      ),
      archived: readBoolean(row.archived, 'Plant archived flag'),
    },
    care: {
      plantId: carePlantId,
      schedulingEnabled: readBoolean(
        row.scheduling_enabled,
        'Scheduling enabled flag',
      ),
      fertilizerMode: enumValue(
        row.fertilizer_mode,
        FERTILIZER_MODES,
        'Fertilizer mode',
      ),
    },
  };
}

function mapCareEvent(row: Row): CareEvent {
  const date = requiredString(row.event_date, 'Care event date');
  try {
    return {
      id: requiredString(row.id, 'Care event ID'),
      plantId: requiredString(row.plant_id, 'Care event plant ID'),
      type: enumValue(row.event_type, EVENT_TYPES, 'Care event type'),
      date: validateISODate(date),
    };
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw invalidData('Care event date is not a valid ISO calendar date', error);
  }
}

function validateHouseholdSettings(
  settings: HouseholdSettings,
): HouseholdSettings {
  return {
    knowledgeLevel: requiredString(settings.knowledgeLevel, 'Knowledge level'),
    commitmentLevel: requiredString(settings.commitmentLevel, 'Commitment level'),
    location: {
      city: stringValue(settings.location?.city, 'Household city'),
      country: stringValue(settings.location?.country, 'Household country'),
    },
    climate: enumValue(settings.climate, CLIMATES, 'Climate'),
    climateUsedFallback: booleanValue(
      settings.climateUsedFallback,
      'Climate fallback flag',
    ),
  };
}

function validatePlant(plant: PlantRecord): PlantRecord {
  return {
    id: validateIdentifier(plant.id, 'Plant ID'),
    displayName: requiredString(plant.displayName, 'Plant display name'),
    genus: requiredString(plant.genus, 'Plant genus'),
    ...(plant.species === undefined
      ? {}
      : { species: requiredString(plant.species, 'Plant species') }),
    taxonomicLevel: enumValue(
      plant.taxonomicLevel,
      TAXONOMIC_LEVELS,
      'Plant taxonomic level',
    ),
    archived: booleanValue(plant.archived, 'Plant archived flag'),
  };
}

function validateCareConfiguration(
  care: PlantCareConfiguration,
): PlantCareConfiguration {
  return {
    plantId: validateIdentifier(care.plantId, 'Care configuration plant ID'),
    schedulingEnabled: booleanValue(
      care.schedulingEnabled,
      'Scheduling enabled flag',
    ),
    fertilizerMode: enumValue(
      care.fertilizerMode,
      FERTILIZER_MODES,
      'Fertilizer mode',
    ),
  };
}

function validateCareEvent(event: CareEvent): CareEvent {
  let date: CareEvent['date'];
  try {
    date = validateISODate(event.date);
  } catch (error) {
    throw invalidData('Care event date is not a valid ISO calendar date', error);
  }
  return {
    id: validateIdentifier(event.id, 'Care event ID'),
    plantId: validateIdentifier(event.plantId, 'Care event plant ID'),
    type: enumValue(event.type, EVENT_TYPES, 'Care event type'),
    date,
  };
}

function validateIdentifier(value: unknown, label: string): string {
  return requiredString(value, label);
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!result.trim()) throw invalidData(`${label} must not be empty`);
  return result;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalidData(`${label} must be a string`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw invalidData(`${label} must be a boolean`);
  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw invalidData(`${label} must be stored as 0 or 1`);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalidData(`${label} has an unsupported value`);
  }
  return value as T;
}

function safe<T>(message: string, operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    throw databaseFailure(message, error);
  });
}

function invalidData(message: string, cause?: unknown): PersistenceError {
  return new PersistenceError('INVALID_DATA', message, cause);
}

function notFound(message: string): PersistenceError {
  return new PersistenceError('NOT_FOUND', message);
}

function databaseFailure(message: string, cause: unknown): PersistenceError {
  if (cause instanceof PersistenceError) return cause;
  return new PersistenceError('DATABASE_FAILURE', message, cause);
}

function createSerialQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  let pending: Promise<void> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation, operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}