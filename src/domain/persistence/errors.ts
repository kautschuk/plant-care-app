export type PersistenceErrorCode =
  | 'INVALID_DATA'
  | 'NOT_FOUND'
  | 'DATABASE_FAILURE';

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly originalCause?: unknown;

  constructor(
    code: PersistenceErrorCode,
    message: string,
    originalCause?: unknown,
  ) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.originalCause = originalCause;
  }
}