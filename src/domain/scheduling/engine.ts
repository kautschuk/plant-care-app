import type {
  ApplyScheduleActionInput,
  InitializeScheduleInput,
  LocationChangeInput,
  PlannerProjection,
  ProjectScheduleInput,
  ScheduleCalculation,
} from './types';

const NOT_IMPLEMENTED =
  'Scheduling behavior is implemented in a later engine task';

export function initializeSchedule(
  _input: InitializeScheduleInput,
): ScheduleCalculation {
  throw new Error(NOT_IMPLEMENTED);
}

export function projectSchedule(
  _input: ProjectScheduleInput,
): PlannerProjection {
  throw new Error(NOT_IMPLEMENTED);
}

export function applyScheduleAction(
  _input: ApplyScheduleActionInput,
): ScheduleCalculation {
  throw new Error(NOT_IMPLEMENTED);
}

export function recalculateForLocationChange(
  _input: LocationChangeInput,
): ScheduleCalculation {
  throw new Error(NOT_IMPLEMENTED);
}