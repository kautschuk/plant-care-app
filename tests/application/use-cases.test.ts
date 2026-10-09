import { describe, expect, it } from 'vitest';

import type { ISODateString } from '../../src/domain/scheduling/types';
import { createSqliteTestDriver } from '../persistence/sqlite-test-driver';
import { initializeSchema } from '../../src/adapters/sqlite/schema';
import { createPersistenceStore } from '../../src/adapters/sqlite/repositories';
import { PersistenceError } from '../../src/domain/persistence';
import {
  applyPlantScheduleAction,
  archivePlant,
  createPlant,
  deletePlant,
  recordCareCompletion,
  restorePlant,
  saveHouseholdSettings,
  updatePlant,
} from '../../src/application';

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

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

  it('updates plant details and can toggle scheduling state', async () => {
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
        id: 'plant-update',
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

    const updated = await updatePlant(
      {
        id: 'plant-update',
        displayName: 'Monstera Deluxe',
        genus: 'Monstera',
        species: 'Monstera deliciosa',
        fertilizerMode: 'LONG_TERM',
        schedulingEnabled: true,
      },
      store,
    );

    expect(updated.plant.displayName).toBe('Monstera Deluxe');
    expect(updated.plant.species).toBe('Monstera deliciosa');
    expect(updated.care.fertilizerMode).toBe('LONG_TERM');
    expect((await store.schedules.get('plant-update'))?.careSchedules.WATERING).toBeDefined();

    const changedToGenusLevel = await updatePlant(
      {
        id: 'plant-update',
        genus: 'Sansevieria',
        species: null,
      },
      store,
    );

    expect(changedToGenusLevel.plant.genus).toBe('Sansevieria');
    expect(changedToGenusLevel.plant.taxonomicLevel).toBe('GENUS');
    expect(changedToGenusLevel.plant.species).toBeUndefined();

    const deactivated = await updatePlant(
      {
        id: 'plant-update',
        schedulingEnabled: false,
      },
      store,
    );

    expect(deactivated.care.schedulingEnabled).toBe(false);
    expect(await store.schedules.get('plant-update')).toBeNull();
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

  it('applies postponement and feedback actions through the app layer', async () => {
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
        id: 'plant-schedule-actions',
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

    const initialSchedule = (await store.schedules.get('plant-schedule-actions'))!;
    const postponed = await applyPlantScheduleAction(
      {
        plantId: 'plant-schedule-actions',
        action: { type: 'POSTPONE', days: 3, careType: 'WATERING' },
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    expect(postponed.events).toEqual([]);
    expect(postponed.schedule.careSchedules.WATERING?.nextDueDate).toBe(
      addDays(initialSchedule.careSchedules.WATERING!.nextDueDate, 3),
    );
    expect(postponed.schedule.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'GROWING_DORMANT',
      growingDays: 3,
      dormantDays: 0,
    });

    const laterFeedback = await applyPlantScheduleAction(
      {
        plantId: 'plant-schedule-actions',
        action: { type: 'FEEDBACK_LATER', careType: 'WATERING' },
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    expect(laterFeedback.schedule.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'GROWING_DORMANT',
      growingDays: 4,
      dormantDays: 0,
    });

    const earlierFeedback = await applyPlantScheduleAction(
      {
        plantId: 'plant-schedule-actions',
        action: { type: 'FEEDBACK_EARLIER', careType: 'WATERING' },
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    expect(earlierFeedback.schedule.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'GROWING_DORMANT',
      growingDays: 3,
      dormantDays: 0,
    });

    const scheduleBeforeRejectedPostponement = await store.schedules.get('plant-schedule-actions');
    const rejection = await applyPlantScheduleAction(
      {
        plantId: 'plant-schedule-actions',
        action: { type: 'POSTPONE', days: 999, careType: 'WATERING' },
        today: '2026-10-08' as ISODateString,
      },
      store,
    ).then(
      () => null,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(PersistenceError);
    expect(rejection).toMatchObject({ code: 'INVALID_DATA' });
    expect(await store.schedules.get('plant-schedule-actions'))
      .toEqual(scheduleBeforeRejectedPostponement);
  });

  it('archives, restores, and permanently deletes a plant through the app layer', async () => {
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
        id: 'plant-lifecycle',
        displayName: 'Fern',
        genus: 'Monstera',
        species: 'Monstera deliciosa',
        fertilizerMode: 'NONE',
        schedulingEnabled: true,
        lastCompletedDate: '2026-10-02' as ISODateString,
        lastFertilizingDate: '2026-10-02' as ISODateString,
        today: '2026-10-08' as ISODateString,
      },
      store,
    );

    await archivePlant('plant-lifecycle', store);
    expect((await store.plants.get('plant-lifecycle'))?.plant.archived).toBe(true);

    await restorePlant('plant-lifecycle', store);
    expect((await store.plants.get('plant-lifecycle'))?.plant.archived).toBe(false);

    await deletePlant('plant-lifecycle', store);
    expect(await store.plants.get('plant-lifecycle')).toBeNull();
  });
});
