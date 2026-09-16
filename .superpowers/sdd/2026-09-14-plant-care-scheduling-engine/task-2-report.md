# Task 2 Implementation Report

## Changed files

- `src/domain/scheduling/engine.ts`
  - Implemented `initializeSchedule` for the default or requested care type.
  - Initialized year-round adjustments to `{ model: 'YEAR_ROUND', days: 0 }`.
  - Initialized growing/dormant adjustments independently to zero.
  - Computed and persisted the initial `nextDueDate`.
  - Implemented pure `projectSchedule` with active season, knowledge interval, active adjustment, one-day effective-interval floor, due status, and deterministic date arithmetic.
  - Added derived planner tasks for no fertilizer, liquid fertilizer coupled to watering, and long-term fertilizer as an independent task.
  - Left Task 3 action and location-transition functions as typed stubs.
- `tests/scheduling/engine.test.ts`
  - Added the five required failing projection tests before implementation.
  - Added deterministic growing/dormant dates and fertilizer task assertions.
- `.superpowers/sdd/2026-09-14-plant-care-scheduling-engine/task-2-report.md`
  - Added this implementation report.

## Decisions

- `YEAR_ROUND` uses the single year-round adjustment and reports `GROWING` as its stable projection season; no dormant adjustment is created.
- `GROWING_DORMANT` uses a deterministic calendar rule because the Task 1 contract has no separate season resolver: March through October is growing, and November through February is dormant.
- `projectSchedule` computes the due date from `lastCompletedDate` plus the effective interval and does not mutate the supplied state.
- Liquid fertilizer replaces the standalone watering planner task with one watering task marked `combinedWithWatering`.
- Long-term fertilizer produces an independent fertilizing planner task in addition to watering.
- Planner tasks remain derived output and are not persisted in `ScheduleState`.

## Commands and output

- `npm test -- --run tests/scheduling/engine.test.ts` before implementation: failed as expected; the five new projection tests reached the intentional `Scheduling behavior is implemented in a later engine task` stubs. Existing Task 1 knowledge tests passed.
- `npm test -- --run tests/scheduling/engine.test.ts` after implementation: 14 tests collected, 13 passed, 1 failed. The only failure is the pre-existing `applyScheduleAction` one-day-floor test, which is Task 3 transition behavior and still reaches its intentional stub.
- `npx tsc --noEmit`: passed with exit code 0 and no diagnostics.
- `git diff --check`: passed with no output.

## Self-review

- Confirmed all Task 2 projection tests pass.
- Confirmed initialization preserves the user-provided last-care date and persists the calculated first due date.
- Confirmed projection uses UTC date arithmetic and explicit input dates only; it does not read the system clock or platform APIs.
- Confirmed seasonal adjustments are selected independently and year-round state has no dormant fields.
- Confirmed liquid and long-term fertilizer behavior is represented only in derived planner tasks.
- Confirmed no Task 3 transition logic or broad refactor was added.

## Concerns

- The focused suite cannot be fully green until Task 3 implements `applyScheduleAction`; this is an intentional scope boundary and the failure is unchanged from the pre-existing Task 1 transition test.
- The Task 1 interfaces do not expose a knowledge-provided season resolver, so the implementation uses the documented deterministic calendar fallback described above. If product knowledge later supplies explicit season boundaries, `activeSeasonFor` should consume that input instead.
- `ScheduleProjection` has no `guidanceLevel` field despite the Task 2 prose mentioning guidance level, so no untyped field was added to the public projection contract.

## Task 2 Repair Report

### Changes

- Validated `today` and `lastCompletedDate` at both `initializeSchedule` and `projectSchedule` runtime boundaries, rejecting a last-completed date after today.
- Added typed `guidanceLevel` to `PlannerProjection`, sourced from knowledge `taxonomicLevel`.
- Added a knowledge-owned `seasonFor(climate, today)` resolver and used it for projection; year-round knowledge remains permanently growing.
- Added focused tests for runtime date rejection, guidance level, and climate-dependent season resolution. Updated existing January fixtures to satisfy the date contract.
- Added final newlines to all changed files.

### Commands and output

- `npm test -- --run tests/scheduling/engine.test.ts -t "rejects future|guidance level|knowledge climate-aware"`
  - `Test Files 1 passed (1)`
  - `Tests 4 passed | 14 skipped (18)`
- `npm test -- --run tests/scheduling/engine.test.ts`
  - `Test Files 1 failed (1)`
  - `Tests 1 failed | 17 passed (18)`
  - The only failure is the intentional Task 3 `applyScheduleAction` stub: `Scheduling behavior is implemented in a later engine task`.
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `git diff --check`
  - Passed with no output.
- Final-newline check for `src/domain/scheduling/engine.ts`, `src/domain/scheduling/knowledge.ts`, `src/domain/scheduling/types.ts`, and `tests/scheduling/engine.test.ts`
  - Passed with no output.

### Concerns

- The focused suite remains one test short of green because the existing Task 3 transition test intentionally targets an unimplemented function. No Task 3 transition behavior was added.
