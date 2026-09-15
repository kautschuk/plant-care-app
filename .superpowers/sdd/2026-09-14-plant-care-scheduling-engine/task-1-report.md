# Task 1 Implementation Report

## Changed files

- `package.json`: added the `test` script and Vitest development dependency while preserving all Expo scripts.
- `package-lock.json`: updated by `npm install --save-dev vitest`.
- `src/domain/scheduling/types.ts`: added explicit ISO-date and positive-interval types, seasonal models, care types, fertilizer modes, knowledge, persisted schedule state, actions, projections, events, and engine inputs/results.
- `src/domain/scheduling/knowledge.ts`: added deterministic year-round and growing/dormant knowledge fixtures with climate-aware interval lookup and explicit fertilization applicability.
- `src/domain/scheduling/engine.ts`: added typed, behavior-free stubs for initialization, projection, actions, and location recalculation.
- `tests/scheduling/engine.test.ts`: added the first contract tests, including initialization, one-day floor, year-round knowledge, and growing/dormant knowledge cases.

## Design decisions

- Dates are represented as explicit `ISODateString` values and intervals as branded `IntervalDays`; runtime validation and date arithmetic remain engine-task responsibilities.
- `ScheduleState` contains persisted care state and a required per-care-type `careSchedules` map. It does not contain authoritative `baseIntervalDays` or active season fields.
- `KnowledgeEntry` owns climate/season/care-type interval lookup, seasonal model identity, taxonomic identity, and fertilizer applicability.
- `FertilizerMode` is the finite union `NONE | LIQUID | LONG_TERM`.
- The engine exports the complete planned function surface but throws an intentional Task 1 placeholder error so no scheduling behavior is implemented early.
- The worktree's Expo 57 application files and existing Expo scripts were left unchanged. Expo v57 documentation was checked before editing.

## Test commands and outputs

- `npm test -- --run tests/scheduling/engine.test.ts` (red phase): failed because `src/domain/scheduling/engine.ts` did not exist; this confirmed the contract tests exercised the missing API.
- `npm test -- --run tests/scheduling/engine.test.ts` (after typed stubs): 4 tests collected, 2 passed, 2 failed. The two failures are the required behavior tests and both fail with `Scheduling behavior is implemented in a later engine task` from the intentional stubs. The two knowledge fixture contract tests pass.
- `git diff --check`: passed with no output.

## Typecheck output

- `npx tsc --noEmit`: passed with exit code 0 and no diagnostics.

## Self-review

- Confirmed no scheduling calculation, persistence, notification, React Native, or Expo dependency was added to the domain layer.
- Confirmed the test dependency is installed and the existing `start`, `android`, `ios`, and `web` scripts are preserved.
- Confirmed the state model keeps knowledge intervals and active season as derived outputs rather than persisted authoritative fields.
- Confirmed both seasonal models and explicit fertilizer applicability are represented in the fixture contract.
- Confirmed whitespace validation passes.

## Concerns

- The focused suite is intentionally not green because Task 1 must not implement initialization or action behavior; Task 2 must replace the typed stubs before the full engine suite can pass.
- `npm install` reported 10 moderate dependency audit findings in the existing dependency tree. No audit remediation was attempted because it is outside this task.

## Repair Report (2026-09-15)

### Files changed

- `src/domain/scheduling/types.ts`: removed duplicated top-level schedule inheritance, made per-care-type state authoritative, added discriminated learned adjustments, added immutable knowledge fields, and added validated ISO-date input with explicit future-date rejection.
- `src/domain/scheduling/knowledge.ts`: made fixture inputs readonly, added climate-specific interval lookup, preserved distinct growing/dormant intervals, forwarded fertilizer modes, and retained positive-integer interval validation.
- `tests/scheduling/engine.test.ts`: added focused assertions for state shape, climate lookup, fertilizer applicability/modes, invalid intervals, date validity/future rejection, and seasonal fixtures; updated date and state construction to use the validated contract.

### Tests and commands

- `npm test -- --run tests/scheduling/engine.test.ts`: 9 tests collected; 7 passed and 2 failed only because `initializeSchedule` and `applyScheduleAction` remain intentional Task 2 placeholders. All repair-specific contract assertions pass.
- `npx tsc --noEmit`: passed with no diagnostics.
- `git diff --check`: passed with no whitespace errors.

### Self-review

- No Task 2 scheduling behavior was added.
- `ScheduleState` no longer inherits duplicate authoritative fields; all persisted schedule facts live under `careSchedules`.
- Date values now require the branded validator at the boundary, and the validator explicitly rejects future dates relative to a validated `today` value.
- Year-round and growing/dormant knowledge models are represented without silently returning one interval for a declared seasonal model.
- The remaining focused-test failures are expected scope concerns from the original Task 1 contract and are not repair regressions.
