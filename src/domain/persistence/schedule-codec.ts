import { validateISODate } from '../scheduling/types';
import type {
  CareScheduleState,
  ISODateString,
  LearnedAdjustments,
} from '../scheduling/types';
import { PersistenceError } from './errors';

interface EncodedCareScheduleState {
  readonly version: 1;
  readonly state: CareScheduleState;
}

export function encodeCareScheduleState(
  state: CareScheduleState,
): string {
  const validState = validateScheduleState(state);
  const payload: EncodedCareScheduleState = { version: 1, state: validState };
  return JSON.stringify(payload);
}

export function decodeCareScheduleState(
  serialized: string,
): CareScheduleState {
  let payload: unknown;
  try {
    payload = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw invalidData('Schedule state is not valid JSON', error);
  }

  if (!isRecord(payload) || !hasOnlyKeys(payload, ['version', 'state'])) {
    throw invalidData('Schedule state envelope is malformed');
  }
  if (payload.version !== 1) {
    throw invalidData(`Unsupported schedule state version: ${String(payload.version)}`);
  }

  return validateScheduleState(payload.state);
}

function validateScheduleState(value: unknown): CareScheduleState {
  if (!isRecord(value)) {
    throw invalidData('Care schedule state must be an object');
  }

  const allowedKeys = [
    'lastCompletedDate',
    'nextDueDate',
    'learnedAdjustments',
    'adjustmentReason',
  ];
  if (!hasOnlyKeys(value, allowedKeys)) {
    throw invalidData('Care schedule state contains unknown fields');
  }

  const lastCompletedDate = parseDate(
    value.lastCompletedDate,
    'lastCompletedDate',
  );
  const nextDueDate = parseDate(value.nextDueDate, 'nextDueDate');
  const learnedAdjustments = validateLearnedAdjustments(
    value.learnedAdjustments,
  );

  if (
    value.adjustmentReason !== undefined &&
    typeof value.adjustmentReason !== 'string'
  ) {
    throw invalidData('Schedule adjustment reason must be a string');
  }

  return {
    lastCompletedDate,
    nextDueDate,
    learnedAdjustments,
    ...(value.adjustmentReason === undefined
      ? {}
      : { adjustmentReason: value.adjustmentReason }),
  };
}

function validateLearnedAdjustments(value: unknown): LearnedAdjustments {
  if (!isRecord(value)) {
    throw invalidData('Learned adjustments must be an object');
  }

  if (value.model === 'YEAR_ROUND') {
    if (
      !hasOnlyKeys(value, ['model', 'days']) ||
      !Number.isInteger(value.days)
    ) {
      throw invalidData('Year-round adjustments require an integer day value');
    }
    return { model: 'YEAR_ROUND', days: value.days as number };
  }

  if (value.model === 'GROWING_DORMANT') {
    if (
      !hasOnlyKeys(value, ['model', 'growingDays', 'dormantDays']) ||
      !Number.isInteger(value.growingDays) ||
      !Number.isInteger(value.dormantDays)
    ) {
      throw invalidData(
        'Growing/dormant adjustments require integer day values for both seasons',
      );
    }
    return {
      model: 'GROWING_DORMANT',
      growingDays: value.growingDays as number,
      dormantDays: value.dormantDays as number,
    };
  }

  throw invalidData('Unknown learned adjustment model');
}

function parseDate(value: unknown, field: string): ISODateString {
  if (typeof value !== 'string') {
    throw invalidData(`Schedule ${field} must be an ISO calendar date`);
  }

  try {
    return validateISODate(value);
  } catch (error) {
    throw invalidData(`Schedule ${field} must be an ISO calendar date`, error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function invalidData(message: string, originalCause?: unknown): PersistenceError {
  return new PersistenceError('INVALID_DATA', message, originalCause);
}