import { describe, expect, it } from 'vitest';

import {
  PersistenceError,
  decodeCareScheduleState,
  encodeCareScheduleState,
  type CareEvent,
  type CareEventType,
  type HouseholdSettings,
  type PlantCareConfiguration,
  type PlantRecord,
} from '../../src/domain/persistence';
import type {
  CareScheduleState,
  ISODateString,
  ScheduleState,
} from '../../src/domain/scheduling/types';
import {
  initializeSchema,
  readSchemaVersion,
} from '../../src/adapters/sqlite/schema';
import { createPersistenceStore } from '../../src/adapters/sqlite/repositories';
import { createSqliteTestDriver } from './sqlite-test-driver';

describe('persistence domain contracts', () => {
  it('exports the initial record types and persistence error', () => {
    const eventTypes: readonly CareEventType[] = [
      'WATERING',
      'FERTILIZING',
      'REPOTTING',
      'PROPAGATION',
    ];
    const settings: HouseholdSettings = {
      knowledgeLevel: 'beginner',
      commitmentLevel: 'moderate',
      location: { city: 'London', country: 'United Kingdom' },
      climate: 'TEMPERATE',
      climateUsedFallback: false,
    };
    const plant: PlantRecord = {
      id: 'plant-1',
      displayName: 'Fern',
      genus: 'Nephrolepis',
      species: 'exaltata',
      taxonomicLevel: 'SPECIES',
      archived: false,
    };
    const care: PlantCareConfiguration = {
      plantId: plant.id,
      schedulingEnabled: true,
      fertilizerMode: 'NONE',
    };
    const event: CareEvent = {
      id: 'event-1',
      plantId: plant.id,
      type: 'WATERING',
      date: '2026-10-08' as CareEvent['date'],
    };

    expect(eventTypes).toEqual([
      'WATERING',
      'FERTILIZING',
      'REPOTTING',
      'PROPAGATION',
    ]);
    expect(settings.location.country).toBe('United Kingdom');
    expect(care.plantId).toBe(plant.id);
    expect(event.type).toBe('WATERING');
    expect(typeof PersistenceError).toBe('function');
  });
});

describe('schedule codec', () => {
  const yearRoundState: CareScheduleState = {
    lastCompletedDate: '2026-10-01' as ISODateString,
    nextDueDate: '2026-10-08' as ISODateString,
    learnedAdjustments: { model: 'YEAR_ROUND', days: 2 },
    adjustmentReason: 'Recent postponements',
  };
  const growingDormantState: CareScheduleState = {
    lastCompletedDate: '2026-10-01' as ISODateString,
    nextDueDate: '2026-10-10' as ISODateString,
    learnedAdjustments: {
      model: 'GROWING_DORMANT',
      growingDays: 2,
      dormantDays: -1,
    },
  };

  it.each([yearRoundState, growingDormantState])(
    'round-trips a valid care schedule state',
    (state) => {
      expect(decodeCareScheduleState(encodeCareScheduleState(state))).toEqual(
        state,
      );
    },
  );

  it.each([
    '{',
    JSON.stringify({ version: 2, state: yearRoundState }),
    JSON.stringify({ version: 1, state: { nextDueDate: '2026-10-08' } }),
    JSON.stringify({
      version: 1,
      state: {
        ...yearRoundState,
        lastCompletedDate: '2026-02-30',
      },
    }),
    JSON.stringify({
      version: 1,
      state: {
        ...yearRoundState,
        learnedAdjustments: { model: 'YEAR_ROUND', days: 1.5 },
      },
    }),
    JSON.stringify({
      version: 1,
      state: {
        ...yearRoundState,
        learnedAdjustments: {
          model: 'YEAR_ROUND',
          growingDays: 2,
          dormantDays: 0,
        },
      },
    }),
  ])('rejects malformed serialized care schedule state', (serialized) => {
    expect(() => decodeCareScheduleState(serialized)).toThrowError(
      PersistenceError,
    );
  });
});

describe('SQLite migrations', () => {
  it('creates the current schema idempotently with constraints and cascades', async () => {
    const database = await createSqliteTestDriver();

    expect(await readSchemaVersion(database)).toBe(0);
    await initializeSchema(database);
    expect(await readSchemaVersion(database)).toBe(1);
    expect(await database.getFirst<{ foreign_keys: number }>(
      'PRAGMA foreign_keys',
    )).toEqual({ foreign_keys: 1 });

    await database.run(
      `INSERT INTO plants
        (id, display_name, genus, species, taxonomic_level, archived)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['plant-1', 'Fern', 'Nephrolepis', null, 'GENUS', 0],
    );
    await database.run(
      `INSERT INTO care_configurations
        (plant_id, scheduling_enabled, fertilizer_mode)
       VALUES (?, ?, ?)`,
      ['plant-1', 1, 'NONE'],
    );
    await expect(
      database.run(
        `INSERT INTO care_configurations
          (plant_id, scheduling_enabled, fertilizer_mode)
         VALUES (?, ?, ?)`,
        ['plant-1', 1, 'NONE'],
      ),
    ).rejects.toThrow();

    await database.run(
      `INSERT INTO care_events (id, plant_id, event_type, event_date)
       VALUES (?, ?, ?, ?)`,
      ['event-1', 'plant-1', 'WATERING', '2026-10-08'],
    );
    await database.run('DELETE FROM plants WHERE id = ?', ['plant-1']);
    expect(
      await database.getFirst('SELECT id FROM care_events WHERE id = ?', [
        'event-1',
      ]),
    ).toBeNull();

    await initializeSchema(database);
    expect(await readSchemaVersion(database)).toBe(1);
  });

  it('rejects a database schema newer than the app supports', async () => {
    const database = await createSqliteTestDriver();
    await database.exec('PRAGMA user_version = 2');

    await expect(initializeSchema(database)).rejects.toThrow(PersistenceError);
  });
});

describe('SQLite repositories', () => {
  it('round-trips settings, plant configuration, schedules, and care events', async () => {
    const { store } = await createTestStore();
    const settings: HouseholdSettings = {
      knowledgeLevel: 'beginner',
      commitmentLevel: 'moderate',
      location: { city: 'London', country: 'United Kingdom' },
      climate: 'TEMPERATE',
      climateUsedFallback: false,
    };
    const plant: PlantRecord = {
      id: 'plant-2',
      displayName: 'Boston fern',
      genus: 'Nephrolepis',
      species: 'exaltata',
      taxonomicLevel: 'SPECIES',
      archived: false,
    };
    const care: PlantCareConfiguration = {
      plantId: plant.id,
      schedulingEnabled: true,
      fertilizerMode: 'LONG_TERM',
    };
    const schedule: ScheduleState = {
      careSchedules: {
        WATERING: {
          lastCompletedDate: '2026-10-01' as ISODateString,
          nextDueDate: '2026-10-08' as ISODateString,
          learnedAdjustments: { model: 'YEAR_ROUND', days: 0 },
        },
        FERTILIZING: {
          lastCompletedDate: '2026-09-01' as ISODateString,
          nextDueDate: '2026-10-01' as ISODateString,
          learnedAdjustments: {
            model: 'GROWING_DORMANT',
            growingDays: 1,
            dormantDays: 0,
          },
          adjustmentReason: 'Adjusted after feedback',
        },
      },
    };
    const event: CareEvent = {
      id: 'event-2',
      plantId: plant.id,
      type: 'FERTILIZING',
      date: '2026-10-01' as ISODateString,
    };

    expect(await store.householdSettings.get()).toBeNull();
    await store.householdSettings.save(settings);
    await store.plants.save(plant, care);
    await store.schedules.save(plant.id, schedule);
    await store.careEvents.save(event);

    expect(await store.householdSettings.get()).toEqual(settings);
    expect(await store.plants.get(plant.id)).toEqual({ plant, care });
    expect(await store.plants.get('missing')).toBeNull();
    expect(await store.schedules.get(plant.id)).toEqual(schedule);
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([event]);

    await store.careEvents.save({ ...event, date: '2026-10-02' as ISODateString });
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([
      { ...event, date: '2026-10-02' },
    ]);
    expect(await store.schedules.get(plant.id)).toEqual(schedule);
    expect(await store.careEvents.delete(event.id)).toBe(true);
    expect(await store.careEvents.delete(event.id)).toBe(false);
    expect(await store.schedules.get(plant.id)).toEqual(schedule);
  });

  it('rejects malformed stored rows instead of replacing them with defaults', async () => {
    const { database, store } = await createTestStore();
    await database.exec('PRAGMA ignore_check_constraints = ON');
    await database.run(
      `INSERT INTO plants
        (id, display_name, genus, species, taxonomic_level, archived)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['broken', 'Broken', 'Genus', null, 'UNKNOWN', 0],
    );
    await database.run(
      `INSERT INTO care_configurations
        (plant_id, scheduling_enabled, fertilizer_mode)
       VALUES (?, ?, ?)`,
      ['broken', 1, 'NONE'],
    );

    await expect(store.plants.get('broken')).rejects.toMatchObject({
      code: 'INVALID_DATA',
    });
  });

  it('archives read-only plant history, restores without schedules, and cascades permanent deletion', async () => {
    const { store } = await createTestStore();
    const plant: PlantRecord = {
      id: 'plant-3',
      displayName: 'Fern',
      genus: 'Nephrolepis',
      taxonomicLevel: 'GENUS',
      archived: false,
    };
    const care: PlantCareConfiguration = {
      plantId: plant.id,
      schedulingEnabled: true,
      fertilizerMode: 'NONE',
    };
    const schedule: ScheduleState = {
      careSchedules: {
        WATERING: {
          lastCompletedDate: '2026-10-01' as ISODateString,
          nextDueDate: '2026-10-08' as ISODateString,
          learnedAdjustments: { model: 'YEAR_ROUND', days: 0 },
        },
      },
    };
    const event: CareEvent = {
      id: 'event-3',
      plantId: plant.id,
      type: 'WATERING',
      date: '2026-10-01' as ISODateString,
    };
    await store.plants.save(plant, care);
    await store.schedules.save(plant.id, schedule);
    await store.careEvents.save(event);

    await store.plants.archive(plant.id);
    expect(await store.plants.list(false)).toEqual([]);
    expect((await store.plants.list(true))[0]?.plant.archived).toBe(true);
    expect(await store.schedules.get(plant.id)).toBeNull();
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([event]);
    await expect(store.careEvents.save(event)).rejects.toMatchObject({
      code: 'INVALID_DATA',
    });
    await expect(store.careEvents.delete(event.id)).rejects.toMatchObject({
      code: 'INVALID_DATA',
    });

    const activePlant: PlantRecord = {
      id: 'plant-active',
      displayName: 'Active fern',
      genus: 'Nephrolepis',
      taxonomicLevel: 'GENUS',
      archived: false,
    };
    await store.plants.save(activePlant, {
      plantId: activePlant.id,
      schedulingEnabled: false,
      fertilizerMode: 'NONE',
    });
    await expect(
      store.careEvents.save({ ...event, plantId: activePlant.id }),
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
    await expect(
      store.plants.save({ ...plant, archived: true }, {
        plantId: plant.id,
        schedulingEnabled: false,
        fertilizerMode: 'NONE',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });

    await store.plants.restore(plant.id);
    expect((await store.plants.get(plant.id))?.care.schedulingEnabled).toBe(
      false,
    );
    expect(await store.schedules.get(plant.id)).toBeNull();
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([event]);

    await store.plants.deletePermanently(plant.id);
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([]);
  });
});

describe('SQLite transactions', () => {
  it('rolls back schedule changes when a care event cannot be saved', async () => {
    const { store } = await createTestStore();
    const plant: PlantRecord = {
      id: 'plant-tx',
      displayName: 'Fern',
      genus: 'Nephrolepis',
      taxonomicLevel: 'GENUS',
      archived: false,
    };
    await store.plants.save(plant, {
      plantId: plant.id,
      schedulingEnabled: true,
      fertilizerMode: 'NONE',
    });
    const original: ScheduleState = {
      careSchedules: {
        WATERING: {
          lastCompletedDate: '2026-10-01' as ISODateString,
          nextDueDate: '2026-10-08' as ISODateString,
          learnedAdjustments: { model: 'YEAR_ROUND', days: 0 },
        },
      },
    };
    const updated: ScheduleState = {
      careSchedules: {
        WATERING: {
          lastCompletedDate: '2026-10-08' as ISODateString,
          nextDueDate: '2026-10-15' as ISODateString,
          learnedAdjustments: { model: 'YEAR_ROUND', days: 0 },
        },
      },
    };
    await store.schedules.save(plant.id, original);

    await expect(
      store.transaction(async (repositories) => {
        await repositories.schedules.save(plant.id, updated);
        await repositories.careEvents.save({
          id: 'bad-event',
          plantId: plant.id,
          type: 'WATERING',
          date: '2026-02-30' as ISODateString,
        });
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });

    expect(await store.schedules.get(plant.id)).toEqual(original);
    expect(await store.careEvents.listForPlant(plant.id)).toEqual([]);
  });

  it('keeps outside repository calls queued until a transaction completes', async () => {
    const { store } = await createTestStore();
    const plant: PlantRecord = {
      id: 'plant-queue',
      displayName: 'Fern',
      genus: 'Nephrolepis',
      taxonomicLevel: 'GENUS',
      archived: false,
    };
    await store.plants.save(plant, {
      plantId: plant.id,
      schedulingEnabled: false,
      fertilizerMode: 'NONE',
    });

    let enterTransaction!: () => void;
    let releaseTransaction!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterTransaction = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const transaction = store.transaction(async (repositories) => {
      await repositories.plants.save(
        { ...plant, displayName: 'Updated fern' },
        {
          plantId: plant.id,
          schedulingEnabled: false,
          fertilizerMode: 'NONE',
        },
      );
      enterTransaction();
      await gate;
    });
    await entered;

    let readCompleted = false;
    const pendingRead = store.plants.get(plant.id).then((value) => {
      readCompleted = true;
      return value;
    });
    await Promise.resolve();
    expect(readCompleted).toBe(false);

    releaseTransaction();
    await transaction;
    expect((await pendingRead)?.plant.displayName).toBe('Updated fern');
  });
});

async function createTestStore() {
  const database = await createSqliteTestDriver();
  await initializeSchema(database);
  return { database, store: createPersistenceStore(database) };
}