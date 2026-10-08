import { describe, expect, it } from 'vitest';

import { projectHouseholdPlannerItems } from '../../src/application';
import type {
  CareType,
  Climate,
  IntervalDays,
  ISODateString,
  KnowledgeEntry,
  ScheduleState,
} from '../../src/domain/scheduling/types';
import type { PlannerProjectionInput } from '../../src/application';

const date = (value: string) => value as ISODateString;

function knowledgeWithIntervals(
  intervals: Readonly<Record<CareType, number>>,
  fertilizerModes: KnowledgeEntry['fertilizerModes'] = [],
): KnowledgeEntry {
  return {
    genus: 'Monstera',
    taxonomicLevel: 'SPECIES',
    seasonalModel: 'YEAR_ROUND',
    fertilizationApplicable: true,
    fertilizerModes,
    seasonFor: (_climate: Climate, _today: ISODateString) => 'GROWING',
    intervalFor: (
      _climate: Climate,
      _season: 'GROWING' | 'DORMANT',
      careType: CareType,
    ) => intervals[careType] as IntervalDays,
  };
}

function scheduleState(
  wateringLastCompletedDate: string,
  fertilizingLastCompletedDate?: string,
): ScheduleState {
  return {
    careSchedules: {
      WATERING: {
        lastCompletedDate: date(wateringLastCompletedDate),
        nextDueDate: date(wateringLastCompletedDate),
        learnedAdjustments: { model: 'YEAR_ROUND', days: 0 },
      },
      ...(fertilizingLastCompletedDate
        ? {
            FERTILIZING: {
              lastCompletedDate: date(fertilizingLastCompletedDate),
              nextDueDate: date(fertilizingLastCompletedDate),
              learnedAdjustments: { model: 'YEAR_ROUND' as const, days: 0 },
            },
          }
        : {}),
    },
  };
}

const longTermPlantWithDifferentDueDates: PlannerProjectionInput = {
  today: date('2026-10-08'),
  climate: 'TEMPERATE',
  plants: [
    {
      plantId: 'plant-1',
      plantName: 'Monstera',
      schedule: scheduleState('2026-10-03', '2026-10-07'),
      knowledge: knowledgeWithIntervals(
        { WATERING: 5, FERTILIZING: 3 },
        ['LONG_TERM'],
      ),
    },
  ],
};

describe('projectHouseholdPlannerItems', () => {
  it('projects liquid fertilizer as one combined watering task', () => {
    const items = projectHouseholdPlannerItems({
      today: date('2026-10-08'),
      climate: 'TEMPERATE',
      plants: [
        {
          plantId: 'plant-liquid',
          plantName: 'Liquid plant',
          schedule: scheduleState('2026-10-03'),
          knowledge: knowledgeWithIntervals(
            { WATERING: 5, FERTILIZING: 14 },
            ['LIQUID'],
          ),
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      careType: 'WATERING',
      status: 'DUE_TODAY',
      fertilizerMode: 'LIQUID',
      combinedWithWatering: true,
    });
  });

  it('projects long-term fertilizer from its independent schedule', () => {
    const items = projectHouseholdPlannerItems(longTermPlantWithDifferentDueDates);

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ careType: 'WATERING', dueDate: '2026-10-08' }),
      expect.objectContaining({ careType: 'FERTILIZING', dueDate: '2026-10-10' }),
    ]));
  });

  it('does not apply a cross-care descriptor to the wrong schedule projection', () => {
    const items = projectHouseholdPlannerItems(longTermPlantWithDifferentDueDates);

    expect(items.filter((item) => item.careType === 'FERTILIZING')).toHaveLength(1);
    expect(items.find((item) => item.careType === 'FERTILIZING')?.dueDate)
      .toBe('2026-10-10');
  });

  it('retains not-due tasks with their effective interval', () => {
    const [item] = projectHouseholdPlannerItems({
      today: date('2026-10-08'),
      climate: 'TEMPERATE',
      plants: [
        {
          plantId: 'plant-not-due',
          plantName: 'Not due plant',
          schedule: scheduleState('2026-10-03'),
          knowledge: knowledgeWithIntervals({ WATERING: 7, FERTILIZING: 14 }),
        },
      ],
    });

    expect(item).toMatchObject({
      careType: 'WATERING',
      status: 'NOT_DUE',
      dueDate: '2026-10-10',
      effectiveIntervalDays: 7,
    });
  });
});
