# Task 4 Report: Scheduling Engine Invariant Coverage

## Status

Complete. Changes were limited to focused tests in `tests/scheduling/engine.test.ts`. No production contract defect was exposed, so no engine code was changed.

## Coverage Added

Added table-driven and repeated-input coverage for all requested invariants:

- Effective intervals never project below one day, including adjustments below the floor.
- Postponements above the current effective interval are rejected.
- Completion advances from the actual completion date rather than the prior due date.
- Valid postponements produce no care event descriptor.
- Journal edit/delete-shaped data is ignored by scheduling projection and cannot change the result.
- All supported schedule actions are rejected for archived schedules with `ARCHIVED_SCHEDULE`.
- Repeated projections from the same input snapshot are deterministic.
- Year-round learned adjustment state contains no dormant adjustment fields.

Existing focused tests for the same public contracts remain intact, including standalone journal actions being rejected as `UNKNOWN_ACTION`.

## Validation

- `npm test -- --run tests/scheduling/engine.test.ts`: PASS, 1 file and 37 tests passed.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS before commit.

## Commit

- `2a9592cac7749b6425021aeab27f34ebc7e1011d` `test: add scheduling engine invariant coverage`

## Concerns

None.# Task 4 Report: Scheduling Engine Invariant Coverage

## Status

Complete. Changes were limited to focused tests in `tests/scheduling/engine.test.ts`. No production contract defect was exposed, so no engine code was changed.

## Coverage Added

Added table-driven and repeated-input coverage for all requested invariants:

- Effective intervals never project below one day, including adjustments below the floor.
- Postponements above the current effective interval are rejected.
- Completion advances from the actual completion date rather than the prior due date.
- Valid postponements produce no care event descriptor.
- Journal edit/delete-shaped data is ignored by scheduling projection and cannot change the result.
- All supported schedule actions are rejected for archived schedules with `ARCHIVED_SCHEDULE`.
- Repeated projections from the same input snapshot are deterministic.
- Year-round learned adjustment state contains no dormant adjustment fields.

Existing focused tests for the same public contracts remain intact, including standalone journal actions being rejected as `UNKNOWN_ACTION`.

## Validation

- `npm test -- --run tests/scheduling/engine.test.ts`: PASS, 1 file and 37 tests passed.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS before commit.

## Commit

- `2a9592cac7749b6425021aeab27f34ebc7e1011d` `test: add scheduling engine invariant coverage`

## Concerns

None. The report is intentionally stored at the requested path outside the isolated worktree; the committed code change remains limited to the test file.
