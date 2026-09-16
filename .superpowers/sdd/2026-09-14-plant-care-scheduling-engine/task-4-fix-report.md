# Task 4 Invariant Coverage Repair Report

## Changes

- Valid postponement coverage now asserts no error, the advanced due date, and the updated learned adjustment before asserting that no care events are emitted.
- Journal independence now compares schedule state after the same feedback action, in addition to comparing projections.
- Deterministic projection coverage now creates an independent equivalent input snapshot for every invocation.
- No scheduling engine behavior was changed.

## Validation

- `npm test -- --run tests/scheduling/engine.test.ts`
  - `Test Files 1 passed (1)`
  - `Tests 37 passed (37)`
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `git diff --check`
  - Passed with no output.


## Concerns

None.

## Follow-up Repair

- The repeatability invariant now reuses one input object for every projection call and compares its post-call state with a pre-projection snapshot.
- Repeated projections remain compared for equality, so the test detects both input mutation and non-deterministic outputs.

## Follow-up Validation

- `npm test -- --run tests/scheduling/engine.test.ts`
  - `Test Files 1 passed (1)`
  - `Tests 37 passed (37)`

## Remaining Review Finding Repair

- Deep-froze the complete repeatability-test input, including nested knowledge data, so the baseline cannot be changed by nested input mutation.
- No scheduling engine behavior was changed.

## Remaining Review Finding Validation

- `npm test -- --run tests/scheduling/engine.test.ts`
  - `Test Files 1 passed (1)`
  - `Tests 37 passed (37)`
- `npx tsc --noEmit`
  - Passed with exit code 0 and no diagnostics.
- `git diff --check`
  - Passed with no output.