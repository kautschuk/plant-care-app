# Knowledge Base and Climate Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, offline climate resolver and plant-knowledge catalog that supplies validated species-first or genus-fallback inputs to the existing scheduling engine.

**Architecture:** Keep climate resolution and plant knowledge as pure domain modules with no Expo, React Native, storage, network, or notification dependencies. A static catalog is validated at construction time, exposed through a narrow barrel, and returns existing `KnowledgeEntry` values so the scheduling engine remains the single owner of schedule calculations.

**Tech Stack:** TypeScript 6, Vitest 5, existing Expo 57 project shell, existing scheduling domain types and engine.

**Spec:** [docs/superpowers/specs/2026-09-16-knowledge-climate-design.md](../specs/2026-09-16-knowledge-climate-design.md)

## Global Constraints

- Core workflows work offline and do not require an account.
- The app must not request device location permission.
- Climate resolution is deterministic for the same normalized city and country.
- Unmapped or blank locations resolve to `TEMPERATE` with `usedFallback: true`.
- Species lookup takes precedence over genus fallback.
- Genus-level guidance must remain represented as `taxonomicLevel: 'GENUS'`.
- Unsupported genera return a normal `UNSUPPORTED` result and cannot produce schedulable knowledge.
- Knowledge entries are immutable inputs; user-specific learned adjustments remain in scheduling state.
- The knowledge module has no Expo, React Native, storage, network, notification, journal, archive, or UI dependencies.
- Existing scheduling fixtures remain test-only and are not exported as production catalog data.
- Use explicit ISO dates and positive integer intervals; do not add implicit current-date or random behavior.
- Avoid one-letter variables and unrelated refactors.

---

## File Map

- Create `src/domain/knowledge/types.ts`: climate vocabulary, household location, climate result, plant query, and lookup result types.
- Create `src/domain/knowledge/climate.ts`: normalization helpers, static country/city mapping, and pure climate resolution.
- Create `src/domain/knowledge/catalog.ts`: validated readonly catalog records and conversion to existing `KnowledgeEntry` values.
- Create `src/domain/knowledge/index.ts`: the only public import surface for climate and catalog APIs.
- Create `src/domain/knowledge/catalog.test-support.ts`: test-only catalog record builders and inspection access; never export this file from the production barrel.
- Create `tests/knowledge/knowledge.test.ts`: deterministic climate, lookup, catalog validation, and scheduling integration tests.
- Modify no application files, package scripts, Expo configuration, persistence code, or scheduling engine files unless a focused type compatibility issue is proven by the integration test.

## Task 1: Define Knowledge and Climate Contracts

**Files:**
- Create: `src/domain/knowledge/types.ts`
- Create: `tests/knowledge/knowledge.test.ts`

**Interfaces:**
- Consumes: existing scheduling `KnowledgeEntry` and `Climate` types only as type references in later tasks.
- Produces: `ClimateClassification`, `HouseholdLocation`, `ClimateResolution`, `PlantKnowledgeQuery`, and `KnowledgeLookupResult`.

- [ ] **Step 1: Add the failing public-contract tests**

Create `tests/knowledge/knowledge.test.ts` with imports from the future public barrel and these assertions:

```ts
import { describe, expect, it } from 'vitest';
import {
  findPlantKnowledge,
  resolveClimate,
} from '../../src/domain/knowledge';

describe('knowledge and climate contracts', () => {
  it('resolves a known location result shape', () => {
    const result = resolveClimate({ city: 'London', country: 'United Kingdom' });

    expect(result).toEqual({
      climate: 'TEMPERATE',
      usedFallback: false,
    });
  });

  it('returns an explicit unsupported result for an unknown genus', () => {
    expect(findPlantKnowledge({ genus: 'NotAPlant' })).toEqual({
      status: 'UNSUPPORTED',
      requestedGenus: 'NotAPlant',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts
```

Expected: FAIL because the new knowledge barrel and functions do not exist.

- [ ] **Step 3: Define the domain unions and readonly result types**

Add these exact contracts to `src/domain/knowledge/types.ts`:

```ts
import type { KnowledgeEntry } from '../scheduling/types';

export type ClimateClassification =
  | 'TROPICAL'
  | 'ARID'
  | 'MEDITERRANEAN'
  | 'TEMPERATE'
  | 'CONTINENTAL'
  | 'POLAR';

export interface HouseholdLocation {
  readonly city: string;
  readonly country: string;
}

export interface ClimateResolution {
  readonly climate: ClimateClassification;
  readonly usedFallback: boolean;
}

export interface PlantKnowledgeQuery {
  readonly species?: string;
  readonly genus: string;
}

export type KnowledgeLookupResult =
  | { readonly status: 'FOUND'; readonly entry: KnowledgeEntry }
  | {
      readonly status: 'UNSUPPORTED';
      readonly requestedSpecies?: string;
      readonly requestedGenus?: string;
    };
```

- [ ] **Step 4: Add typed stubs and the narrow barrel**

Create `src/domain/knowledge/index.ts` exporting the types and temporary declarations for `resolveClimate` and `findPlantKnowledge`, then run the focused test to confirm the failure has moved from missing modules to missing behavior. Do not add implementation behavior in this step.

- [ ] **Step 5: Run the typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: the new contracts compile under the existing strict Expo TypeScript configuration.

## Task 2: Implement Deterministic Climate Resolution

**Files:**
- Create: `src/domain/knowledge/climate.ts`
- Modify: `src/domain/knowledge/index.ts`
- Modify: `tests/knowledge/knowledge.test.ts`

**Interfaces:**
- Consumes: `HouseholdLocation` and `ClimateResolution` from `knowledge/types.ts`.
- Produces: `resolveClimate(location: HouseholdLocation): ClimateResolution`.

- [ ] **Step 1: Add normalization and mapping tests**

Add these cases to the climate test section:

```ts
it('normalizes case and repeated whitespace before matching', () => {
  expect(resolveClimate({ city: '  LONDON  ', country: ' united   kingdom ' })).toEqual({
    climate: 'TEMPERATE',
    usedFallback: false,
  });
});

it('uses a city override before the country default', () => {
  expect(resolveClimate({ city: '  Cape Town ', country: 'South Africa' })).toEqual({
    climate: 'MEDITERRANEAN',
    usedFallback: false,
  });
});

it('uses a country mapping when no city override exists', () => {
  expect(resolveClimate({ city: 'Nairobi', country: 'Kenya' })).toEqual({
    climate: 'TROPICAL',
    usedFallback: false,
  });
});

it('uses the explicit temperate fallback for blank or unmapped locations', () => {
  expect(resolveClimate({ city: '', country: '' })).toEqual({
    climate: 'TEMPERATE',
    usedFallback: true,
  });
  expect(resolveClimate({ city: 'Atlantis', country: 'Unknown Country' })).toEqual({
    climate: 'TEMPERATE',
    usedFallback: true,
  });
});

it('does not infer a country from a city-only location', () => {
  expect(resolveClimate({ city: 'London', country: '' })).toEqual({
    climate: 'TEMPERATE',
    usedFallback: true,
  });
});

it('is deterministic for repeated identical inputs', () => {
  const location = { city: 'London', country: 'United Kingdom' };

  expect(resolveClimate(location)).toEqual(resolveClimate(location));
});
```

- [ ] **Step 2: Run the climate tests and verify failure**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts
```

Expected: FAIL because `resolveClimate` is still a stub or unimplemented.

- [ ] **Step 3: Implement normalization and static resolution**

In `climate.ts`, normalize input with `trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')`. Use a readonly country table containing at least these mappings:

```text
United Kingdom -> TEMPERATE
Kenya -> TROPICAL
Egypt -> ARID
Spain -> MEDITERRANEAN
Canada -> CONTINENTAL
Iceland -> POLAR
```

Use a city-and-country override table containing `Cape Town, South Africa -> MEDITERRANEAN`. Resolve only when the country is non-empty; otherwise return `{ climate: 'TEMPERATE', usedFallback: true }`. For non-empty unmapped countries, use the same fallback. Return fresh readonly result objects so callers cannot mutate module-level data.

- [ ] **Step 4: Run the focused climate tests**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts
```

Expected: all climate tests PASS.

## Task 3: Build and Validate the Static Knowledge Catalog

**Files:**
- Create: `src/domain/knowledge/catalog.ts`
- Create: `src/domain/knowledge/catalog.test-support.ts`
- Modify: `tests/knowledge/knowledge.test.ts`

**Interfaces:**
- Consumes: `ClimateClassification`, existing `KnowledgeEntry`, `IntervalDays`, `CareType`, `FertilizerMode`, `Season`, and `ISODateString` types.
- Produces: validated readonly catalog records and `findPlantKnowledge(query: PlantKnowledgeQuery): KnowledgeLookupResult`.

- [ ] **Step 1: Add lookup and catalog invariant tests**

Add tests using the concrete catalog entries `Monstera deliciosa`, `Monstera adansonii`, `Sansevieria` (genus-only), and `Phalaenopsis` (genus-only):

Import the validation probes from `../../src/domain/knowledge/catalog.test-support`. The test-support file must define these exact exports:

```ts
export interface CatalogRecordOverrides {
  readonly genus: string;
  readonly species?: string;
  readonly wateringIntervalDays?: number;
}

export function createCatalogRecordForTesting(
  overrides: CatalogRecordOverrides,
): CatalogRecord;

export function createKnowledgeCatalogForTesting(
  records: readonly CatalogRecord[],
): readonly KnowledgeEntry[];

export function allCatalogEntriesForTesting(): readonly KnowledgeEntry[];
```

`createCatalogRecordForTesting` must start from a valid year-round watering record and apply only the supplied overrides. `createKnowledgeCatalogForTesting` must call the same validator used by the production catalog, allowing the tests to prove duplicate identity and invalid interval rejection without exposing construction helpers through `index.ts`.

```ts
it('prefers exact species knowledge over the shared genus fallback', () => {
  const result = findPlantKnowledge({
    species: ' MONSTERA   DELICIOSA ',
    genus: 'Monstera',
  });

  expect(result.status).toBe('FOUND');
  if (result.status === 'FOUND') {
    expect(result.entry.taxonomicLevel).toBe('SPECIES');
    expect(result.entry.species).toBe('Monstera deliciosa');
  }
});

it('returns genus guidance when species knowledge is unavailable', () => {
  const result = findPlantKnowledge({
    species: 'Sansevieria trifasciata',
    genus: 'Sansevieria',
  });

  expect(result.status).toBe('FOUND');
  if (result.status === 'FOUND') {
    expect(result.entry.taxonomicLevel).toBe('GENUS');
    expect(result.entry.species).toBeUndefined();
  }
});

it('rejects malformed catalog intervals and duplicate normalized identities', () => {
  expect(() => createKnowledgeCatalogForTesting([
    createCatalogRecordForTesting({ genus: 'Monstera', species: 'M deliciosa' }),
    createCatalogRecordForTesting({ genus: ' monstera ', species: 'm deliciosa' }),
  ])).toThrow();
});

it('keeps fertilizer declarations internally consistent', () => {
  for (const entry of allCatalogEntriesForTesting()) {
    expect(entry.fertilizationApplicable).toBe(
      entry.fertilizerModes.some((mode) => mode !== 'NONE'),
    );
  }
});
```

Do not add any test-support export to the production barrel.

- [ ] **Step 2: Run the focused catalog tests and verify failure**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts
```

Expected: FAIL because the production catalog does not yet exist.

- [ ] **Step 3: Define validated readonly catalog records**

Create a private catalog-record shape that stores normalized identity, `species`, `genus`, `taxonomicLevel`, `seasonalModel`, climate-aware watering intervals, climate-aware fertilizing intervals when applicable, fertilizer modes, and a season resolver. Construct the four concrete entries named above with these requirements:

- `Monstera deliciosa`: species-level, growing/dormant, `LIQUID` fertilizer.
- `Monstera adansonii`: species-level, year-round, `NONE` fertilizer.
- `Sansevieria`: genus-level, year-round, `LONG_TERM` fertilizer.
- `Phalaenopsis`: genus-level, growing/dormant, `LIQUID` fertilizer.

Give every supported climate and applicable season a positive integer watering interval. Give fertilizing entries positive integer intervals for every supported climate and applicable season. The initial values may be conservative fixture-like domain defaults, but they must be explicit static data rather than computed from the current date or network data.

- [ ] **Step 4: Implement catalog validation helpers**

Validate at construction time that genus is non-empty, species exists only for species-level records, normalized species/genus identities are unique, all intervals are positive integers, fertilizer modes contain no duplicate non-`NONE` mode, and `fertilizationApplicable` agrees with the modes. Throw descriptive `Error` instances for malformed records. Keep the mutable construction helpers internal to `catalog.ts` and outside the public barrel; expose only readonly `KnowledgeEntry` values and the lookup function publicly.

Move the reusable record type and validation constructor into `catalog.ts`, then let `catalog.test-support.ts` import that non-barrel internal API. The production barrel must continue to hide both the record type and validator.

- [ ] **Step 5: Implement deterministic season and interval methods**

For year-round entries, return `GROWING` from `seasonFor` and use the same climate interval regardless of date. For growing/dormant entries, use a catalog-owned climate/date rule: `TROPICAL` and `ARID` are `GROWING` year-round; `MEDITERRANEAN`, `TEMPERATE`, and `CONTINENTAL` are `GROWING` from March through October and `DORMANT` otherwise; `POLAR` is `GROWING` from May through August and `DORMANT` otherwise. `intervalFor` must select the requested care type and active season, and throw if the entry has no interval for the requested care type.

- [ ] **Step 6: Implement species-first and genus-fallback lookup**

Normalize query strings using the same trimming, whitespace, case, and punctuation normalization for catalog identity. When `species` is present, check its normalized exact key first. If no species entry is found, check the normalized genus key. Return `UNSUPPORTED` with the original requested values when neither key exists. Never synthesize an entry from a partial species string.

- [ ] **Step 7: Run catalog tests and typecheck**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts && npx tsc --noEmit
```

Expected: catalog lookup and validation tests PASS with no TypeScript errors.

## Task 4: Expose the Narrow Public Barrel and Prove Engine Compatibility

**Files:**
- Modify: `src/domain/knowledge/index.ts`
- Modify: `tests/knowledge/knowledge.test.ts`

**Interfaces:**
- Consumes: `resolveClimate`, `findPlantKnowledge`, and the existing scheduling barrel.
- Produces: public exports for the two production functions and their stable types; no catalog construction helpers.

- [ ] **Step 1: Add scheduling integration tests**

Add tests that use a returned `KnowledgeEntry` directly with the existing engine:

```ts
import {
  initializeSchedule,
  projectSchedule,
} from '../../src/domain/scheduling';

it('returns a catalog entry usable by schedule initialization', () => {
  const result = findPlantKnowledge({
    species: 'Monstera deliciosa',
    genus: 'Monstera',
  });

  expect(result.status).toBe('FOUND');
  if (result.status !== 'FOUND') {
    throw new Error('Expected catalog knowledge');
  }

  const schedule = initializeSchedule({
    today: '2026-09-16',
    lastCompletedDate: '2026-09-10',
    knowledge: result.entry,
    climate: resolveClimate({ city: 'London', country: 'United Kingdom' }).climate,
  });

  expect(schedule.projection.baseIntervalDays).toBeGreaterThan(0);
  expect(schedule.projection.effectiveIntervalDays).toBeGreaterThanOrEqual(1);
});

it('keeps seasonal projection deterministic for identical snapshots', () => {
  const result = findPlantKnowledge({ genus: 'Phalaenopsis' });

  expect(result.status).toBe('FOUND');
  if (result.status !== 'FOUND') {
    throw new Error('Expected catalog knowledge');
  }

  const input = {
    today: '2026-09-16' as const,
    state: {
      careSchedules: {
        WATERING: {
          lastCompletedDate: '2026-09-10' as const,
          nextDueDate: '2026-09-17' as const,
          learnedAdjustments: {
            model: 'GROWING_DORMANT' as const,
            growingDays: 0,
            dormantDays: 0,
          },
        },
      },
    },
    knowledge: result.entry,
    climate: 'TEMPERATE' as const,
  };

  expect(projectSchedule(input)).toEqual(projectSchedule(input));
});
```

- [ ] **Step 2: Export only stable production symbols**

Export `resolveClimate`, `findPlantKnowledge`, `ClimateClassification`, `HouseholdLocation`, `ClimateResolution`, `PlantKnowledgeQuery`, and `KnowledgeLookupResult` from `src/domain/knowledge/index.ts`. Do not export catalog records, validation constructors, normalization helpers, or test fixtures.

- [ ] **Step 3: Run the complete focused suite and typecheck**

Run:

```bash
npm test -- --run tests/knowledge/knowledge.test.ts && npx tsc --noEmit
```

Expected: all climate, catalog, lookup, and scheduling compatibility tests PASS.

## Task 5: Final Invariant and Repository Verification

**Files:**
- Modify: `tests/knowledge/knowledge.test.ts` only if a missing invariant is discovered.

**Interfaces:**
- Consumes: the public knowledge barrel and existing scheduling functions.
- Produces: executable evidence that the slice is deterministic, validated, offline, and isolated from the app shell.

- [ ] **Step 1: Add final catalog invariants**

Cover all supported climate values and both seasonal transition boundaries. Assert that every catalog entry returns a positive integer watering interval, every applicable fertilizer interval is positive, year-round entries do not change interval selection across dates, and growing/dormant entries can return both seasons according to their climate/date rule.

- [ ] **Step 2: Run the full project test suite**

Run:

```bash
npm test -- --run
```

Expected: the existing scheduling suite and the new knowledge suite PASS.

- [ ] **Step 3: Run the strict project typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Verify formatting and dependency boundaries**

Run:

```bash
git diff --check
rg "expo|react-native|fetch|AsyncStorage|Notifications" src/domain/knowledge tests/knowledge
```

Expected: `git diff --check` is clean, and the dependency search returns no production knowledge-module references to UI, storage, network, or notification APIs.

- [ ] **Step 5: Confirm the integration boundary**

Review the final diff and confirm that `App.tsx` has no climate or plant-knowledge logic, the scheduling engine still owns projections and learned adjustments, and the knowledge barrel exposes no mutable catalog internals. Stop before persistence, journaling, archive, notification, or UI integration.

## Self-Review Checklist

- Spec coverage: climate normalization, known mappings, city override, fallback metadata, species precedence, genus fallback, unsupported results, catalog validation, seasonal behavior, engine compatibility, and deterministic tests each have an explicit task.
- Placeholder scan: no step relies on `TODO`, `TBD`, “implement later,” or an undefined follow-up function.
- Type consistency: all public functions use the exact signatures from the approved design, and returned entries use the existing `KnowledgeEntry` contract.
- Scope check: no persistence, UI, notification, journal, archive, or network work is included.
- Risk check: the fallback behavior and catalog season table are explicit and testable rather than inferred by callers.
