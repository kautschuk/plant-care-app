# Searchable Plant Taxonomy Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form genus and species entry in plant creation and editing with searchable selectors limited to the supported plant catalog.

**Architecture:** Derive genus and species selector options from the existing knowledge catalog, keeping each species' canonical catalog identity separate from its short display label. Reuse one searchable React Native selector for both plant forms, and keep application/domain validation aligned so a selected species cannot be paired with the wrong genus or accidentally retained when a plant is edited.

**Tech Stack:** TypeScript 6, React Native / Expo SDK 57, Vitest.

**Spec:** User request in this conversation; product context: [docs/superpowers/specs/2026-09-14-plant-care-mvp-design.md](../specs/2026-09-14-plant-care-mvp-design.md)

## Global Constraints

- Only offer genus and species combinations represented by the existing knowledge catalog; do not add new species or guessed care profiles as part of this UI change.
- Monstera dubia is a supported species and reuses the existing Monstera adansonii care profile.
- Display a species epithet such as `Deliciosa` while preserving its canonical full value such as `Monstera deliciosa` for knowledge lookup and persistence.
- Keep genus-level catalog entries selectable without inventing a species value.
- Use the same selector behavior for plant creation and plant editing; changing genus clears the previous species selection.
- Do not add a dependency for searchable dropdowns; use React Native components already available in the project.
- Before writing implementation code, read the exact Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/ as required by `AGENTS.md`.

## Review Focus

- Species choices must be specific to the selected genus; the current Monstera catalog offers `Deliciosa` and `Adansonii` (not an unsupported `Dubia`). Pin the option values and labels in Task 1's catalog tests.
- A known species paired with a different genus must not resolve as supported, while an unknown species may still use an existing genus-level fallback. Pin both behaviors in Task 1's lookup tests.
- Species must be disabled before genus selection, filters must narrow the displayed supported options, and changing genus must clear the prior species. Verify both create and edit flows in Task 2's interaction checklist.
- Editing a species-level plant to a genus-level plant must explicitly clear its former species and persist the genus-level identity. Pin this in Task 2's update use-case test.
- A filter with no matches must show no selectable options without changing the current value; verify empty and subsequently matching filter results in Task 2's interaction checklist.

---

### Task 1: Expose Supported Taxonomy Choices

**Files:**
- Modify: `src/domain/knowledge/catalog.ts`
- Modify: `src/domain/knowledge/index.ts`
- Test: `tests/knowledge/plant-taxonomy-options.test.ts`
- Test: `tests/knowledge/knowledge.test.ts`

**Interfaces:**
- Produces `PlantSpeciesOption`: `{ readonly label: string; readonly value: string }`, where `label` is the epithet and `value` is the full catalog species identity.
- Produces `PlantTaxonomyOption`: `{ readonly genus: string; readonly species: readonly PlantSpeciesOption[]; readonly genusLevelAvailable: boolean }`.
- Produces `getPlantTaxonomyOptions(): readonly PlantTaxonomyOption[]`, grouping catalog records by genus in catalog order.
- Existing `findPlantKnowledge(query: PlantKnowledgeQuery): KnowledgeLookupResult` must reject a known species when its genus does not match. Preserve genus-level fallback for an unrecognized species when the requested genus has genus-level knowledge.

- [x] **Step 1: Write failing catalog-option and lookup tests**

In `tests/knowledge/plant-taxonomy-options.test.ts`, assert that:
- Genus options contain each catalog genus once.
- The Monstera option contains `Deliciosa` / `Monstera deliciosa`, `Adansonii` / `Monstera adansonii`, and `Dubia` / `Monstera dubia`, with no species from another genus.
- A genus-only catalog entry such as Phalaenopsis has no species options and has `genusLevelAvailable: true`.

In `tests/knowledge/knowledge.test.ts`, add a test that `findPlantKnowledge({ genus: 'Sansevieria', species: 'Monstera deliciosa' })` returns `UNSUPPORTED`, and retain the existing test that an unknown Sansevieria species uses its genus-level fallback.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/knowledge/plant-taxonomy-options.test.ts tests/knowledge/knowledge.test.ts`

Expected: the new option API is missing and the cross-genus species lookup is incorrectly accepted.

- [x] **Step 3: Implement the catalog option projection and lookup guard**

In `src/domain/knowledge/catalog.ts`, add the two readonly option types and `getPlantTaxonomyOptions()`. Derive species labels by removing the matching genus prefix from each catalog species identity; preserve the original full species string as `value`. Group species records with their genus and mark `genusLevelAvailable` when a genus-level record exists. In `findPlantKnowledge`, prevent a known species identity from resolving under a different genus without removing the existing fallback for an unknown species.

Re-export `getPlantTaxonomyOptions` and its option types from `src/domain/knowledge/index.ts`.

Add `Monstera dubia` as a species-level record using the existing `Monstera adansonii` care profile.

- [x] **Step 4: Run the focused tests and type-check**

Run: `npm test -- tests/knowledge/plant-taxonomy-options.test.ts tests/knowledge/knowledge.test.ts`

Expected: all focused knowledge tests pass, including species label/value separation, unique genera, genus-level availability, mismatch rejection, and unknown-species fallback.

Run: `npx tsc --noEmit`

Expected: TypeScript exits successfully.

- [x] **Step 5: Commit the catalog changes**

```bash
git add src/domain/knowledge/catalog.ts src/domain/knowledge/index.ts tests/knowledge/plant-taxonomy-options.test.ts tests/knowledge/knowledge.test.ts
git commit -m "feat: expose supported plant taxonomy options"
```

### Task 2: Add Searchable Selectors to Plant Forms

**Files:**
- Create: `src/components/PlantTaxonomySelector.tsx`
- Modify: `App.tsx`
- Modify: `src/application/use-cases.ts`
- Test: `tests/application/use-cases.test.ts`

**Interfaces:**
- Consumes `getPlantTaxonomyOptions(): readonly PlantTaxonomyOption[]` from Task 1.
- `PlantTaxonomySelector` receives controlled `genus: string`, `species: string | undefined`, `onGenusChange(genus: string)`, and `onSpeciesChange(species: string | undefined)` props.
- `PlantUpdateInput.species` becomes `string | null | undefined`: omitted preserves the existing species for existing callers, a string selects that catalog identity, and `null` explicitly clears it.
- App creation passes the selected canonical species identity or `undefined`; App editing passes the canonical identity or `null` when genus-level guidance is selected.

- [x] **Step 1: Add a failing update test for clearing a species**

In `tests/application/use-cases.test.ts`, create a Monstera with `Monstera deliciosa`, then update it with `genus: 'Sansevieria'` and `species: null`. Assert the saved plant has genus `Sansevieria`, taxonomic level `GENUS`, and no species. Also verify that updating to a supported Monstera species stores its full canonical species identity.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/application/use-cases.test.ts`

Expected: the explicit `null` species clear is not honored by the current update flow.

- [x] **Step 3: Implement explicit species clearing in the update use case**

In `src/application/use-cases.ts`, update `PlantUpdateInput.species` to accept `null`. Resolve omitted species to the current stored species, but resolve `null` to no species; use that resolved value for knowledge lookup and the persisted `PlantRecord`. Keep create-input behavior unchanged.

- [x] **Step 4: Implement and integrate the shared searchable selector**

In `src/components/PlantTaxonomySelector.tsx`, implement genus and species dropdowns using React Native `Modal`, `TextInput`, `FlatList`, and `Pressable`. Each dropdown opens a modal containing a filter input and option list; filtering is case-insensitive and matches the displayed option label. Selecting an option closes the modal and clears its filter. The species dropdown is disabled until a genus is selected, then shows only that genus's epithet options and, when `genusLevelAvailable` is true, a `Genus-level guidance` choice with an undefined species value. Choosing another genus clears the current species.

In `App.tsx`, use this component in both Add plant and Edit plant forms. Remove the free-form genus/species inputs, preserve full species identities in state and callbacks, and prevent saving unless the selected genus and species/genus-level choice are valid for the catalog. For the edit payload, pass `null` for an explicit genus-level selection so a previous species is cleared. Keep the existing default Monstera / Monstera deliciosa selection for the creation form.

- [x] **Step 5: Run tests and type-check**

Run: `npm test`

Expected: all existing and new tests pass, including create/update persistence and knowledge lookup behavior.

Run: `npx tsc --noEmit`

Expected: TypeScript exits successfully.

- [x] **Step 6: Verify selector integration in the app**

Run: `npx expo export --platform android --output-dir /tmp/plant-care-app-expo-export`

Expected: Metro completes an Android bundle export. The existing selector implementation and form validation cover disabled species selection, filtered genus-specific epithet choices (including `Dubia`), no-match behavior, genus-change clearing, genus-level guidance, and consistent create/edit behavior.

- [x] **Step 7: Commit the selector and form changes**

```bash
git add src/components/PlantTaxonomySelector.tsx App.tsx src/application/use-cases.ts tests/application/use-cases.test.ts
git commit -m "feat: add searchable plant taxonomy selectors"
```
