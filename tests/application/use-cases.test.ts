import { describe, expect, it } from 'vitest';

import type { ISODateString } from '../../src/domain/scheduling/types';
import { createSqliteTestDriver } from '../persistence/sqlite-test-driver';
import { initializeSchema } from '../../src/adapters/sqlite/schema';
import { createPersistenceStore } from '../../src/adapters/sqlite/repositories';
import {
  createPlant,
  recordCareCompletion,
  saveHouseholdSettings,
} from '../../src/application';

describe('application use cases', () => {
  it('stores household settings and initializes a supported plant schedule', async () => {
    const database = await createSqliteTestDriver();
    await initializeSchema(database);
    const store = createPersistenceStore(database);

    const settings = await saveHouseholdSettings(
      {
        knowledgeLevel: 'beginner',
        commitmentLevel: 'moderate',
        city: 'London',
        country: 'United Kingdom',
      },
      store,
    );

    expect(settings.climate).toBe('TEMPERATE');
    expect(settings.location.country).toBe('United Kingdom');

    const created = await createPlant(
      {
        id: 'plant-setup',
        displayName: 'Monstera',
        genus: 'Monstera',
        species: 'Monstera deliciosa',
        fertilizerMode: 'LIQUID',
        schedulingEnabled: true,
        lastCompletedDate: '2026-10-01' as ISODateString,
        lastFertilizingDate: '2026-10-01' as ISODateString,
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    expect(created.plant.taxonomicLevel).toBe('SPECIES');
    expect(created.care.schedulingEnabled).toBe(true);
    expect(created.schedule?.careSchedules.WATERING).toBeDefined();
    expect(await store.schedules.get('plant-setup')).toEqual(created.schedule);
  });

  it('records a completed care action inside one transaction', async () => {
    const database = await createSqliteTestDriver();
    await initializeSchema(database);
    const store = createPersistenceStore(database);

    await saveHouseholdSettings(
      {
        knowledgeLevel: 'beginner',
        commitmentLevel: 'moderate',
        city: 'London',
        country: 'United Kingdom',
      },
      store,
    );

    await createPlant(
      {
        id: 'plant-complete',
        displayName: 'Monstera',
        genus: 'Monstera',
        species: 'Monstera deliciosa',
        fertilizerMode: 'LIQUID',
        schedulingEnabled: true,
        lastCompletedDate: '2026-10-01' as ISODateString,
        lastFertilizingDate: '2026-10-01' as ISODateString,
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    const result = await recordCareCompletion(
      {
        plantId: 'plant-complete',
        careType: 'WATERING',
        date: '2026-10-08' as ISODateString,
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.type).sort()).toEqual([
      'FERTILIZING',
      'WATERING',
    ]);
    expect(
      [...await store.careEvents.listForPlant('plant-complete')]
        .map((event) => event.type)
        .sort(),
    ).toEqual(['FERTILIZING', 'WATERING']);
  });
});
