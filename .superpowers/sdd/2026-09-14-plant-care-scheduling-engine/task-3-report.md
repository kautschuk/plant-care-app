# Task 3 Repair Report

## Changes

- Added `UNKNOWN_ACTION` to the typed scheduling error codes.
- Added an explicit runtime allow-list in `applyScheduleAction`; only `COMPLETE`, `POSTPONE`, `FEEDBACK_EARLIER`, and `FEEDBACK_LATER` can transition schedule state.
- Unknown runtime action objects now return the original state and projection with an `UNKNOWN_ACTION` error and no care events.
- Replaced the tautological standalone-journal test with a runtime `JOURNAL_ENTRY` rejection, non-mutation, and no-event assertion.

## Commands and output

- `npm test -- --run tests/scheduling/engine.test.ts` before the repair
  - `Test Files 1 failed (1)`
  - `Tests 1 failed | 28 passed (29)`
  - `standalone journal facts are not schedule actions` failed because the invalid action was treated as completion; `lastCompletedDate` and `nextDueDate` changed to `2026-09-14`.
- `npm test -- --run tests/scheduling/engine.test.ts` after the repair
  - `Test Files 1 passed (1)`
  - `Tests 29 passed (29)`
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `git diff --check`
  - Passed with no output.

## Concerns

- The public TypeScript `ScheduleAction` union already excludes journal facts; this guard protects the runtime boundary when malformed or casted objects enter the engine.

## Follow-up Repair

- Replaced the standalone journal runtime test's tautological state comparison with an independent snapshot of the watering schedule, including learned adjustments.
- Kept the runtime `UNKNOWN_ACTION` guard unchanged and retained assertions for the typed error and absence of events.

### Verification

- `npm test -- --run tests/scheduling/engine.test.ts`
  - `Test Files 1 passed (1)`
  - `Tests 29 passed (29)`
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `git diff --check`
  - Passed with no output.
