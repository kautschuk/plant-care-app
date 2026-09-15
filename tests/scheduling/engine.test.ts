import { describe, expect, it } from 'vitest';

import {
  applyScheduleAction,
  initializeSchedule,
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

describe('scheduling engine contract', () => {
  it('initializes next due from the user-provided last-care date', () => {
    const result = initializeSchedule({
      today: '2026-09-14',
      lastCompletedDate: '2026-09-10',
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.lastCompletedDate).toBe('2026-09-10');
    expect(result.projection.nextDueDate).toBe('2026-09-17');
  });

  it('does not reduce the persisted adjustment below the one-day effective floor', () => {
    const state = scheduleState({ learnedAdjustmentDays: -6 });
    const result = applyScheduleAction({
      state,
      action: { type: 'FEEDBACK_EARLIER' },
      today: '2026-09-14',
      knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
      climate: 'TEMPERATE',
    });

    expect(result.state.learnedAdjustmentDays).toBe(-6);
    expect(result.projection.effectiveIntervalDays).toBe(1);
  });

  it('supports year-round knowledge without a dormant adjustment', () => {
    const knowledge = yearRoundKnowledge({ baseIntervalDays: 7 });

    expect(knowledge.seasonalModel).toBe('YEAR_ROUND');
    expect(knowledge.intervalFor('TEMPERATE', 'GROWING', 'WATERING')).toBe(7);
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
    lastCompletedDate: '2026-09-10',
    learnedAdjustmentDays: overrides.learnedAdjustmentDays,
    nextDueDate: '2026-09-17',
  };

  return {
    ...state,
    careSchedules: { WATERING: state },
  };
}