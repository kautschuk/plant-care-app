import { describe, expect, it } from 'vitest';

import {
  applyScheduleAction,
  initializeSchedule,
  projectSchedule,
  recalculateForLocationChange,
} from '../../src/domain/scheduling/engine';
import {
  growingDormantKnowledge,
  wateringKnowledge,
  yearRoundKnowledge,
} from '../../src/domain/scheduling/knowledge';
import type {
  CareScheduleState,
  ScheduleState,
  ScheduleAction,
} from '../../src/domain/scheduling/types';
import { validateISODate } from '../../src/domain/scheduling/types';

describe('scheduling engine contract', () => {
  it('derives a seven-day schedule from September 10 to September 17', () => {
    const result = projectSchedule({
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.baseIntervalDays).toBe(7);
    expect(result.effectiveIntervalDays).toBe(7);
    expect(result.nextDueDate).toBe('2026-09-17');
  });

  it('uses independent growing and dormant adjustments', () => {
    const growingResult = projectSchedule({
      today: date('2026-09-14'),
      state: seasonalScheduleState({ growingDays: 2, dormantDays: 0 }),
      knowledge: growingDormantKnowledge({
        growingIntervalDays: 7,
        dormantIntervalDays: 12,
      }),
      climate: 'TEMPERATE',
    });
    const dormantResult = projectSchedule({
      today: date('2026-01-14'),
      state: seasonalScheduleState({
        growingDays: 2,
        dormantDays: 0,
        lastCompletedDate: '2026-01-01',
      }),
      knowledge: growingDormantKnowledge({
        growingIntervalDays: 7,
        dormantIntervalDays: 12,
      }),
      climate: 'TEMPERATE',
    });

    expect(growingResult.activeSeason).toBe('GROWING');
    expect(growingResult.effectiveIntervalDays).toBe(9);
    expect(dormantResult.activeSeason).toBe('DORMANT');
    expect(dormantResult.effectiveIntervalDays).toBe(12);
  });

  it('uses one year-round adjustment for year-round plants', () => {
    const state = scheduleState({
      learnedAdjustmentDays: 2,
      lastCompletedDate: '2026-01-01',
    });

    const result = projectSchedule({
      today: date('2026-01-14'),
      state,
      knowledge: yearRoundKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: 2,
    });
    expect(result.effectiveIntervalDays).toBe(9);
  });

  it('marks dates before today overdue and today due today', () => {
    const overdue = projectSchedule({
      today: date('2026-09-18'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });
    const dueToday = projectSchedule({
      today: date('2026-09-17'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(overdue.status).toBe('OVERDUE');
    expect(dueToday.status).toBe('DUE_TODAY');
  });

  it('combines liquid fertilizer with watering and keeps long-term fertilizer independent', () => {
    const liquid = projectSchedule({
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({
        baseIntervalDays: 7,
        fertilizerModes: ['LIQUID'],
      }),
      climate: 'TEMPERATE',
    });
    const longTerm = projectSchedule({
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({
        baseIntervalDays: 7,
        fertilizerModes: ['LONG_TERM'],
      }),
      climate: 'TEMPERATE',
    });

    expect(liquid.tasks).toEqual([
      {
        careType: 'WATERING',
        fertilizerMode: 'LIQUID',
        combinedWithWatering: true,
      },
    ]);
    expect(longTerm.tasks).toEqual([
      { careType: 'WATERING' },
      { careType: 'FERTILIZING', fertilizerMode: 'LONG_TERM' },
    ]);
  });

  it('initializes next due from the user-provided last-care date', () => {
    const result = initializeSchedule({
      today: date('2026-09-14'),
      lastCompletedDate: date('2026-09-10'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.careSchedules.WATERING?.lastCompletedDate).toBe(
      '2026-09-10',
    );
    expect(result.projection.nextDueDate).toBe('2026-09-17');
  });

  it('rejects future today and last-completed dates at initialization', () => {
    expect(() =>
      initializeSchedule({
        today: date('2026-09-15'),
        lastCompletedDate: date('2026-09-16'),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      }),
    ).toThrow('Date cannot be in the future');
  });

  it('rejects future today and last-completed dates at projection', () => {
    expect(() =>
      projectSchedule({
        today: date('2026-09-15'),
        state: scheduleState({
          learnedAdjustmentDays: 0,
          lastCompletedDate: '2026-09-16',
        }),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      }),
    ).toThrow('Date cannot be in the future');
  });

  it('projects the knowledge taxonomic level as guidance level', () => {
    const result = projectSchedule({
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: {
        ...wateringKnowledge({ baseIntervalDays: 7 }),
        taxonomicLevel: 'GENUS',
      },
      climate: 'TEMPERATE',
    });

    expect(result.guidanceLevel).toBe('GENUS');
  });

  it('uses the knowledge climate-aware season resolver', () => {
    const knowledge = growingDormantKnowledge({
      growingIntervalDays: 7,
      dormantIntervalDays: 12,
      seasonFor: (climate) =>
        climate === 'TROPICAL' ? 'GROWING' : 'DORMANT',
    });

    const result = projectSchedule({
      today: date('2026-01-14'),
      state: seasonalScheduleState({
        growingDays: 0,
        dormantDays: 0,
        lastCompletedDate: '2026-01-01',
      }),
      knowledge,
      climate: 'TROPICAL',
    });

    expect(result.activeSeason).toBe('GROWING');
    expect(result.effectiveIntervalDays).toBe(7);
  });

  it('does not reduce the persisted adjustment below the one-day effective floor', () => {
    const state = scheduleState({ learnedAdjustmentDays: -6 });
    const result = applyScheduleAction({
      state,
      action: { type: 'FEEDBACK_EARLIER' },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(
      result.state.careSchedules.WATERING?.learnedAdjustments,
    ).toEqual({ model: 'YEAR_ROUND', days: -6 });
    expect(result.projection.effectiveIntervalDays).toBe(1);
  });

  it('supports year-round knowledge without a dormant adjustment', () => {
    const knowledge = yearRoundKnowledge({ baseIntervalDays: 7 });

    expect(knowledge.seasonalModel).toBe('YEAR_ROUND');
    expect(knowledge.intervalFor('TEMPERATE', 'GROWING', 'WATERING')).toBe(7);
  });

  it('stores schedule facts only under enabled care types', () => {
    const state = scheduleState({ learnedAdjustmentDays: 0 });

    expect(Object.keys(state)).toEqual(['careSchedules']);
    expect(state.careSchedules.WATERING?.lastCompletedDate).toBe(
      '2026-09-10',
    );
  });

  it('looks up a climate-specific interval when one is available', () => {
    const knowledge = wateringKnowledge({
      baseIntervalDays: 7,
      climateIntervals: { TROPICAL: 3 },
    });

    expect(knowledge.intervalFor('TROPICAL', 'GROWING', 'WATERING')).toBe(3);
    expect(knowledge.intervalFor('TEMPERATE', 'GROWING', 'WATERING')).toBe(7);
  });

  it('declares fertilizer applicability from its supported modes', () => {
    const withoutFertilizer = wateringKnowledge({
      baseIntervalDays: 7,
      fertilizerModes: ['NONE'],
    });
    const withLiquidFertilizer = wateringKnowledge({
      baseIntervalDays: 7,
      fertilizerModes: ['LIQUID'],
    });

    expect(withoutFertilizer.fertilizationApplicable).toBe(false);
    expect(withoutFertilizer.fertilizerModes).toEqual(['NONE']);
    expect(withLiquidFertilizer.fertilizationApplicable).toBe(true);
    expect(withLiquidFertilizer.fertilizerModes).toEqual(['LIQUID']);
  });

  it('rejects invalid knowledge intervals at the fixture boundary', () => {
    expect(() => wateringKnowledge({ baseIntervalDays: 0 })).toThrow(
      'Interval days must be a positive integer',
    );
    expect(() =>
      growingDormantKnowledge({
        growingIntervalDays: 5,
        dormantIntervalDays: 1.5,
      }),
    ).toThrow('Interval days must be a positive integer');
  });

  it('rejects malformed and future dates at the date boundary', () => {
    expect(() => validateISODate('2026-02-30')).toThrow(
      'Date must be a valid ISO calendar date',
    );
    expect(() => validateISODate('2026-09-15', date('2026-09-14'))).toThrow(
      'Date cannot be in the future',
    );
  });

  it('supports separate growing and dormant knowledge intervals', () => {
    const knowledge = growingDormantKnowledge({
      growingIntervalDays: 5,
      dormantIntervalDays: 12,
    });

    expect(knowledge.seasonalModel).toBe('GROWING_DORMANT');
    expect(knowledge.intervalFor('TEMPERATE', 'GROWING', 'WATERING')).toBe(5);
    expect(knowledge.intervalFor('TEMPERATE', 'DORMANT', 'WATERING')).toBe(12);
  });

  it('completes from the actual completion date', () => {
    const result = applyScheduleAction({
      state: scheduleState({
        learnedAdjustmentDays: 0,
        lastCompletedDate: '2026-09-03',
        nextDueDate: '2026-09-10',
      }),
      action: { type: 'COMPLETE', completedDate: date('2026-09-14') },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.careSchedules.WATERING?.lastCompletedDate).toBe(
      '2026-09-14',
    );
    expect(result.projection.nextDueDate).toBe('2026-09-21');
    expect(result.events).toEqual([
      { careType: 'WATERING', date: '2026-09-14' },
    ]);
  });

  it('adds one day for later feedback and subtracts one day until the one-day floor', () => {
    const knowledge = wateringKnowledge({ baseIntervalDays: 7 });
    const later = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'FEEDBACK_LATER' },
      today: date('2026-09-14'),
      knowledge,
      climate: 'TEMPERATE',
    });
    const earlier = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'FEEDBACK_EARLIER' },
      today: date('2026-09-14'),
      knowledge,
      climate: 'TEMPERATE',
    });
    const atFloor = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: -6 }),
      action: { type: 'FEEDBACK_EARLIER' },
      today: date('2026-09-14'),
      knowledge,
      climate: 'TEMPERATE',
    });

    expect(later.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: 1,
    });
    expect(earlier.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: -1,
    });
    expect(atFloor.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: -6,
    });
  });

  it('caps postponement at the current effective interval', () => {
    const result = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'POSTPONE', days: 8 },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result).toMatchObject({ error: { code: 'INVALID_POSTPONEMENT' } });
  });

  it('applies postponement to both next due date and learned adjustment', () => {
    const result = applyScheduleAction({
      state: scheduleState({
        learnedAdjustmentDays: 2,
        lastCompletedDate: '2026-09-05',
        nextDueDate: '2026-09-14',
      }),
      action: { type: 'POSTPONE', days: 3 },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.careSchedules.WATERING?.nextDueDate).toBe(
      '2026-09-17',
    );
    expect(result.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: 5,
    });
    expect(result.events).toBeUndefined();
  });

  it('allows a maximum postponement to double the subsequent effective interval', () => {
    const result = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'POSTPONE', days: 7 },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: 7,
    });
    expect(result.projection.effectiveIntervalDays).toBe(14);
  });

  it('reanchors location changes from last completed date', () => {
    const result = recalculateForLocationChange({
      state: scheduleState({
        learnedAdjustmentDays: 0,
        lastCompletedDate: '2026-09-10',
        nextDueDate: '2026-09-20',
      }),
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({
        baseIntervalDays: 7,
        climateIntervals: { TROPICAL: 3 },
      }),
      climate: 'TEMPERATE',
      newClimate: 'TROPICAL',
      mode: 'PRESERVE_LEARNED_STATE',
    });

    expect(result.projection.nextDueDate).toBe('2026-09-13');
  });

  it('reset location change clears all seasonal adjustments', () => {
    const result = recalculateForLocationChange({
      state: seasonalScheduleState({
        growingDays: 2,
        dormantDays: 4,
        lastCompletedDate: '2026-09-10',
      }),
      today: date('2026-09-14'),
      knowledge: growingDormantKnowledge({
        growingIntervalDays: 7,
        dormantIntervalDays: 12,
      }),
      climate: 'TEMPERATE',
      newClimate: 'TROPICAL',
      mode: 'RESET_TO_DEFAULTS',
    });

    expect(result.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'GROWING_DORMANT',
      growingDays: 0,
      dormantDays: 0,
    });
  });

  it('preserve location change retains applicable learned adjustment', () => {
    const result = recalculateForLocationChange({
      state: seasonalScheduleState({
        growingDays: 2,
        dormantDays: 4,
        lastCompletedDate: '2026-09-10',
      }),
      today: date('2026-09-14'),
      knowledge: growingDormantKnowledge({
        growingIntervalDays: 7,
        dormantIntervalDays: 12,
      }),
      climate: 'TEMPERATE',
      newClimate: 'TROPICAL',
      mode: 'PRESERVE_LEARNED_STATE',
    });

    expect(result.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'GROWING_DORMANT',
      growingDays: 2,
      dormantDays: 4,
    });
    expect(result.projection.effectiveIntervalDays).toBe(9);
  });

  it('completes liquid fertilizer as separate care events with one planner task', () => {
    const result = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'COMPLETE', completedDate: date('2026-09-14') },
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({
        baseIntervalDays: 7,
        fertilizerModes: ['LIQUID'],
      }),
      climate: 'TEMPERATE',
    });

    expect(result.projection.tasks).toEqual([
      {
        careType: 'WATERING',
        fertilizerMode: 'LIQUID',
        combinedWithWatering: true,
      },
    ]);
    expect(result.events).toEqual([
      { careType: 'WATERING', date: '2026-09-14' },
      { careType: 'FERTILIZING', date: '2026-09-14' },
    ]);
  });

  it('rejects actions for archived schedules with a typed domain error', () => {
    expect(() =>
      applyScheduleAction({
        state: {
          ...scheduleState({ learnedAdjustmentDays: 0 }),
          archived: true,
        },
        action: { type: 'COMPLETE' },
        today: date('2026-09-14'),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      }),
    ).toThrowError(expect.objectContaining({ code: 'ARCHIVED_SCHEDULE' }));
  });

  it('never projects an effective interval below one day', () => {
    for (const learnedAdjustmentDays of [-20, -7, -6, -1, 0, 4]) {
      const result = projectSchedule({
        today: date('2026-09-14'),
        state: scheduleState({ learnedAdjustmentDays }),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      });

      expect(result.effectiveIntervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects every postponement above the current effective interval', () => {
    for (const learnedAdjustmentDays of [-6, 0, 3]) {
      const currentInterval = 7 + learnedAdjustmentDays;
      const result = applyScheduleAction({
        state: scheduleState({ learnedAdjustmentDays }),
        action: { type: 'POSTPONE', days: currentInterval + 1 },
        today: date('2026-09-14'),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      });

      expect(result.error?.code).toBe('INVALID_POSTPONEMENT');
      expect(result.events).toBeUndefined();
    }
  });

  it('anchors completion projections to the actual completion date', () => {
    for (const completedDate of ['2026-09-11', '2026-09-14']) {
      const result = applyScheduleAction({
        state: scheduleState({
          learnedAdjustmentDays: 0,
          lastCompletedDate: '2026-09-03',
          nextDueDate: '2026-09-10',
        }),
        action: { type: 'COMPLETE', completedDate: date(completedDate) },
        today: date('2026-09-14'),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      });

      expect(result.state.careSchedules.WATERING?.lastCompletedDate).toBe(
        completedDate,
      );
      expect(result.projection.nextDueDate).toBe(
        completedDate === '2026-09-11' ? '2026-09-18' : '2026-09-21',
      );
    }
  });

  it('never emits a care event for a valid postponement', () => {
    for (const days of [1, 3, 7]) {
      const result = applyScheduleAction({
        state: scheduleState({ learnedAdjustmentDays: 0 }),
        action: { type: 'POSTPONE', days },
        today: date('2026-09-14'),
        knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
        climate: 'TEMPERATE',
      });

      expect(result.events).toBeUndefined();
    }
  });

  it('ignores journal edits and deletions when projecting schedule state', () => {
    const stateWithJournal = {
      ...scheduleState({ learnedAdjustmentDays: 0 }),
      journalEntries: [
        { id: 'entry-1', action: 'EDIT', date: '2026-09-14' },
        { id: 'entry-2', action: 'DELETE', date: '2026-09-13' },
      ],
    } as ScheduleState & { journalEntries: readonly unknown[] };

    const baseline = projectSchedule({
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });
    const withJournal = projectSchedule({
      today: date('2026-09-14'),
      state: stateWithJournal,
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(withJournal).toEqual(baseline);
  });

  it('rejects every schedule action for archived state', () => {
    for (const action of [
      { type: 'COMPLETE' as const },
      { type: 'POSTPONE' as const, days: 1 },
      { type: 'FEEDBACK_EARLIER' as const },
      { type: 'FEEDBACK_LATER' as const },
    ]) {
      expect(() =>
        applyScheduleAction({
          state: {
            ...scheduleState({ learnedAdjustmentDays: 0 }),
            archived: true,
          },
          action,
          today: date('2026-09-14'),
          knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
          climate: 'TEMPERATE',
        }),
      ).toThrowError(expect.objectContaining({ code: 'ARCHIVED_SCHEDULE' }));
    }
  });

  it('produces the same projection for the same input snapshot', () => {
    const input = {
      today: date('2026-09-14'),
      state: scheduleState({ learnedAdjustmentDays: 2 }),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE' as const,
    };

    const projections = Array.from({ length: 5 }, () => projectSchedule(input));

    expect(projections).toEqual([
      projections[0],
      projections[0],
      projections[0],
      projections[0],
      projections[0],
    ]);
  });

  it('keeps year-round state adjustment shape free of dormant fields', () => {
    const result = applyScheduleAction({
      state: scheduleState({ learnedAdjustmentDays: 0 }),
      action: { type: 'FEEDBACK_LATER' },
      today: date('2026-09-14'),
      knowledge: yearRoundKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.careSchedules.WATERING?.learnedAdjustments).toEqual({
      model: 'YEAR_ROUND',
      days: 1,
    });
    expect(
      result.state.careSchedules.WATERING?.learnedAdjustments,
    ).not.toHaveProperty('dormantDays');
  });

  it('standalone journal facts are not schedule actions', () => {
    const state = scheduleState({ learnedAdjustmentDays: 0 });
    const scheduleBefore = {
      ...state.careSchedules.WATERING,
      learnedAdjustments: {
        ...state.careSchedules.WATERING?.learnedAdjustments,
      },
    };
    const result = applyScheduleAction({
      state,
      action: { type: 'JOURNAL_ENTRY' } as unknown as ScheduleAction,
      today: date('2026-09-14'),
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result).toMatchObject({
      error: { code: 'UNKNOWN_ACTION' },
    });
    expect(result.events).toBeUndefined();
    expect(result.state.careSchedules.WATERING).toEqual(scheduleBefore);
  });
});

function scheduleState(overrides: {
  learnedAdjustmentDays: number;
  lastCompletedDate?: string;
  nextDueDate?: string;
}): ScheduleState {
  const state: CareScheduleState = {
    lastCompletedDate: date(overrides.lastCompletedDate ?? '2026-09-10'),
    learnedAdjustments: {
      model: 'YEAR_ROUND',
      days: overrides.learnedAdjustmentDays,
    },
    nextDueDate: date(overrides.nextDueDate ?? '2026-09-17'),
  };

  return {
    careSchedules: { WATERING: state },
  };
}

function seasonalScheduleState(overrides: {
  growingDays: number;
  dormantDays: number;
  lastCompletedDate?: string;
}): ScheduleState {
  const state: CareScheduleState = {
    lastCompletedDate: date(overrides.lastCompletedDate ?? '2026-09-10'),
    learnedAdjustments: {
      model: 'GROWING_DORMANT',
      growingDays: overrides.growingDays,
      dormantDays: overrides.dormantDays,
    },
    nextDueDate: date('2026-09-17'),
  };

  return {
    careSchedules: { WATERING: state },
  };
}

function date(value: string) {
  return validateISODate(value);
}