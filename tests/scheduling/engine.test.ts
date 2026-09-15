import { describe, expect, it } from 'vitest';

import {
  applyScheduleAction,
  initializeSchedule,
  projectSchedule,
} from '../../src/domain/scheduling/engine';
import {
  growingDormantKnowledge,
  wateringKnowledge,
  yearRoundKnowledge,
} from '../../src/domain/scheduling/knowledge';
import type {
  CareScheduleState,
  ScheduleState,
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
      state: seasonalScheduleState({ growingDays: 2, dormantDays: 0 }),
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
    const state = scheduleState({ learnedAdjustmentDays: 2 });

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
});

function scheduleState(overrides: { learnedAdjustmentDays: number }): ScheduleState {
  const state: CareScheduleState = {
    lastCompletedDate: date('2026-09-10'),
    learnedAdjustments: {
      model: 'YEAR_ROUND',
      days: overrides.learnedAdjustmentDays,
    },
    nextDueDate: date('2026-09-17'),
  };

  return {
    careSchedules: { WATERING: state },
  };
}

function seasonalScheduleState(overrides: {
  growingDays: number;
  dormantDays: number;
}): ScheduleState {
  const state: CareScheduleState = {
    lastCompletedDate: date('2026-09-10'),
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