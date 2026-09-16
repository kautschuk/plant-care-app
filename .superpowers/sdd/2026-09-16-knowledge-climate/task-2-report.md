# Task 2 Implementation Report

## Changed Files

- `src/domain/knowledge/climate.ts`: Added deterministic location normalization, readonly country mappings, the Cape Town/South Africa city override, explicit temperate fallback handling, and fresh resolution results.
- `src/domain/knowledge/index.ts`: Replaced only the `resolveClimate` declaration with the runtime climate export. Preserved the complete Task 1 readonly type surface and the `findPlantKnowledge` declaration.
- `tests/knowledge/knowledge.test.ts`: Added normalization, city override, country mapping, fallback, city-only, and determinism tests. Separated the existing lookup contract test so the climate-focused Vitest filter covers only Task 2 behavior.

## Decisions

- Normalization uses `trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')` exactly as required.
- Country and city override tables are readonly and keyed by normalized strings.
- Resolution requires a non-empty normalized country; blank and unmapped countries return `TEMPERATE` with `usedFallback: true`.
- Each call returns a new object rather than exposing module-level result data.
- No plant catalog or lookup implementation was added because that is Task 3 scope.

## Tests Run

- `npm test -- --run tests/knowledge/knowledge.test.ts` after implementation: 7 climate tests passed; the existing Task 1 lookup assertion remained the expected failure because `findPlantKnowledge` is reserved for Task 3.
- `npm test -- --run tests/knowledge/knowledge.test.ts -t climate`: passed, 1 test file and 7 tests passed, with the lookup test skipped by the filter.
- `npx tsc --noEmit`: passed with no diagnostics.
- `git diff --check`: passed with no whitespace errors.

## Self-Review Findings

- All Task 1 readonly contracts remain exported unchanged.
- The override is checked before the country default, and city-only input cannot infer a country.
- The implementation is pure, deterministic, offline, and limited to the requested domain files and tests.

## Commit

- Implementation commit: `89fc48ba7effeaa978c718baf64032a6582aed1d` (`feat(knowledge): implement deterministic climate resolution`)

## Concerns

- The complete knowledge test file is not green until Task 3 implements `findPlantKnowledge`; this is an intentional existing contract stub and outside Task 2 scope.

## Review Fix Report

### Changed Files

- `tests/knowledge/knowledge.test.ts`: Kept this focused acceptance file climate-only and added direct assertions for United Kingdom, Kenya, Egypt, Spain, Canada, and Iceland.
- `tests/knowledge/plant-knowledge.test.ts`: Moved the unchanged Task 1 `findPlantKnowledge` contract test into its own file so its expected red state remains isolated from Task 2 acceptance coverage.

### Tests and Output

- `npm test -- --run tests/knowledge/knowledge.test.ts`: passed, 1 file and 8 tests passed.
- `npx tsc --noEmit`: passed with no diagnostics.
- `git diff --check`: passed with no whitespace errors.
- Before the fix, the focused command reproduced the reported failure: 7 climate tests passed and the deferred `findPlantKnowledge` contract failed with `TypeError: findPlantKnowledge is not a function`.

### Commit

- Fix commit: `2b99d6e5f4c22dea83fdd42a79d5ccb6ade14cf5` (`test(knowledge): isolate climate acceptance tests`)

### Concerns

- The isolated Task 1 contract remains expected to fail until Task 3 implements `findPlantKnowledge`; it was not weakened or deleted.