import { projectSchedule } from '../domain/scheduling';
import type {
  Climate,
  ISODateString,
  KnowledgeEntry,
  PlannerTask,
  ScheduleState,
} from '../domain/scheduling/types';

const POSTPONEMENT_QUICK_CHOICES = [1, 2, 3, 7] as const;

export interface PlannerPlantInput {
  readonly plantId: string;
  readonly plantName: string;
  readonly schedule: ScheduleState;
  readonly knowledge: KnowledgeEntry;
}

export interface PlannerProjectionInput {
  readonly today: ISODateString;
  readonly climate: Climate;
  readonly plants: readonly PlannerPlantInput[];
}

export interface PlannerItem extends PlannerTask {
  readonly plantId: string;
  readonly plantName: string;
  readonly dueDate: ISODateString;
  readonly status: 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE';
  readonly effectiveIntervalDays: number;
}

export function getPostponementQuickChoices(maxDays: number): readonly number[] {
  return POSTPONEMENT_QUICK_CHOICES.filter((days) => days <= maxDays);
}

export function isValidCustomPostponementDays(
  value: string,
  maxDays: number,
): boolean {
  if (!Number.isInteger(maxDays) || maxDays < 1 || !/^\d+$/.test(value)) {
    return false;
  }

  const days = Number(value);
  return Number.isSafeInteger(days) && days > 0 && days <= maxDays;
}

export function projectHouseholdPlannerItems(
  input: PlannerProjectionInput,
): PlannerItem[] {
  const items: PlannerItem[] = [];

  for (const plant of input.plants) {
    for (const careType of ['WATERING', 'FERTILIZING'] as const) {
      if (!plant.schedule.careSchedules[careType]) continue;

      const projection = projectSchedule({
        today: input.today,
        state: plant.schedule,
        knowledge: plant.knowledge,
        climate: input.climate,
        careType,
      });

      for (const task of projection.tasks) {
        if (task.careType !== careType) continue;

        items.push({
          ...task,
          plantId: plant.plantId,
          plantName: plant.plantName,
          dueDate: projection.nextDueDate,
          status: projection.status,
          effectiveIntervalDays: projection.effectiveIntervalDays,
        });
      }
    }
  }

  return items;
}
