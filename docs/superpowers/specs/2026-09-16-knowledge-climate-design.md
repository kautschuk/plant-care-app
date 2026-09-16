# Knowledge Base and Climate Resolution Design

**Date:** 2026-09-16  
**Status:** Approved for implementation planning

## Goal

Provide deterministic, offline domain inputs for plant scheduling: normalize a household city and country into a climate classification, resolve plant knowledge by species with genus fallback, and expose the existing scheduling-compatible knowledge contract without adding UI, persistence, network, or notification dependencies.

## Scope

This slice owns:

- Normalizing manually entered city and country values.
- Deterministically resolving a normalized location to a climate classification.
- Reporting when the explicit `TEMPERATE` fallback was used for an unmapped location.
- Looking up species-specific knowledge before genus-level knowledge.
- Returning an explicit unsupported result when no recognized genus is available.
- Supplying immutable knowledge entries compatible with the scheduling engine.
- Defining deterministic season and interval behavior for the initial catalog.

This slice does not own:

- React Native screens or onboarding forms.
- Device location permission or geocoding providers.
- Local persistence or repository adapters.
- Notifications.
- Journal records, archive state, or plant profiles.
- Unknown-genus scheduling.
- User-specific learned adjustments.

## Product Decisions

### Climate resolution

The app never requests device location permission. The user supplies city and country as text. Resolution is a pure function over those two strings and produces the same result for the same normalized input.

The initial climate vocabulary is:

```ts
type ClimateClassification =
  | 'TROPICAL'
  | 'ARID'
  | 'MEDITERRANEAN'
  | 'TEMPERATE'
  | 'CONTINENTAL'
  | 'POLAR';
```

The country mapping is a versioned static table in the domain module. City-specific overrides may be included for known boundary cases, but no external service is consulted. Unmapped or blank locations resolve to `TEMPERATE` and return `usedFallback: true`; this keeps scheduling available offline while allowing a later UI to explain the fallback. A mapped location returns `usedFallback: false`.

Input normalization trims leading and trailing whitespace, collapses internal whitespace, and compares case-insensitively. It must not silently invent a country from a city-only value.

### Plant knowledge lookup

The catalog uses species-first lookup:

1. An exact normalized species match returns `taxonomicLevel: 'SPECIES'`.
2. If no species match exists, an exact normalized genus match returns `taxonomicLevel: 'GENUS'`.
3. If neither exists, the result is `UNSUPPORTED` and cannot be scheduled.

Species and genus comparisons normalize case, whitespace, and common punctuation consistently. The catalog must not return species guidance for a genus-only request, and a genus fallback must remain visibly represented in the returned result.

Knowledge entries remain immutable inputs to the scheduling engine. They expose climate-aware intervals, seasonal model, season resolution, fertilizer applicability, and permitted fertilizer modes through the existing `KnowledgeEntry` contract.

## Public Interfaces

The implementation plan must produce a narrow barrel from a new knowledge module. The intended contracts are:

```ts
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

export function resolveClimate(
  location: HouseholdLocation,
): ClimateResolution;

export type KnowledgeLookupResult =
  | {
      readonly status: 'FOUND';
      readonly entry: KnowledgeEntry;
    }
  | {
      readonly status: 'UNSUPPORTED';
      readonly requestedSpecies?: string;
      readonly requestedGenus?: string;
    };

export interface PlantKnowledgeQuery {
  readonly species?: string;
  readonly genus: string;
}

export function findPlantKnowledge(
  query: PlantKnowledgeQuery,
): KnowledgeLookupResult;
```

The existing scheduling `Climate` type remains usable by accepting `ClimateClassification` as its concrete catalog value. Existing deterministic test fixtures remain test-only and are not part of the production catalog barrel.

## Catalog Content

The first catalog release contains a small, explicit set of common indoor plants sufficient to prove both lookup paths and climate-aware scheduling. It includes:

- At least two species entries sharing a genus, so species precedence can be tested.
- At least one genus-only entry, so genus fallback can be tested without pretending it is species-specific.
- At least one year-round entry and one growing/dormant entry.
- At least one entry with `LIQUID`, one with `LONG_TERM`, and one with `NONE` fertilizer mode.
- Positive integer watering intervals for every supported climate and applicable season.
- Positive integer fertilizer intervals wherever fertilization is applicable.

Catalog records are declared as readonly data and constructed through validation helpers that reject duplicate normalized keys, invalid intervals, contradictory fertilizer flags, and missing genus identity during module initialization or test setup.

## Seasonal Behavior

Year-round entries always resolve to the `YEAR_ROUND` model and return the same season-independent interval selection. Growing/dormant entries resolve season using a deterministic function of the climate classification and explicit ISO date. The season function is catalog-owned knowledge; the planner and climate resolver do not infer season from feedback.

The implementation must document the initial season table in code-level tests. It must cover at least one transition date for each seasonal model and prove that the same climate/date input always returns the same season.

## Errors and Unsupported Data

Invalid dates and interval values are rejected by the existing scheduling validation boundary. This slice rejects malformed knowledge records during construction rather than allowing invalid data into the engine.

An unsupported plant is a normal lookup result, not an exception. Callers must decide whether to offer genus search or block scheduling. This module must never fabricate genus or species identity from free-form text.

Climate fallback is not an error because the MVP must remain usable offline. Its `usedFallback` flag is part of the result so presentation and onboarding layers can communicate the reduced confidence later.

## Testing Contract

Focused Vitest coverage must prove:

- Location trimming, whitespace collapsing, and case-insensitive matching.
- Known country mappings and at least one city override.
- Deterministic `TEMPERATE` fallback for blank and unmapped locations.
- Fallback metadata is true only when the fallback is used.
- Exact species lookup wins over genus fallback.
- Genus fallback returns `taxonomicLevel: 'GENUS'`.
- Unsupported lookup returns no schedulable knowledge entry.
- Duplicate normalized catalog identities are rejected.
- Every catalog interval is a positive integer and every fertilizer declaration is internally consistent.
- Both seasonal models produce deterministic seasons and valid climate-aware intervals.
- Returned entries work with `initializeSchedule` and `projectSchedule` without adapters.
- Repeated identical inputs produce deeply equal results.

The test suite remains platform-independent and must run without network access.

## Integration Boundary

Later onboarding code will pass `HouseholdLocation` to `resolveClimate`, store the selected city/country and resolved climate through a persistence adapter, and pass the resolved climate plus a `KnowledgeEntry` to the scheduling engine. Later plant setup code will call `findPlantKnowledge` and preserve the returned taxonomic level in the plant configuration.

No application component should calculate climate, select species versus genus fallback, or encode knowledge intervals directly.

## Acceptance Criteria

- The same city/country input always resolves to the same climate and fallback metadata.
- The resolver works offline and has no Expo, React Native, storage, or network dependency.
- Species knowledge is selected before genus knowledge.
- Genus fallback is explicit and cannot be mistaken for species guidance.
- Unsupported genera do not produce a schedulable entry.
- Catalog entries satisfy the existing scheduling engine contract.
- All catalog and resolver behavior is covered by deterministic Vitest tests.
