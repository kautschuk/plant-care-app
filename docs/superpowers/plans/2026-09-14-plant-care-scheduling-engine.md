# Plant Care Scheduling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, deterministic scheduling engine that implements the approved Plant Care MVP scheduling contract before UI, persistence, or notifications.

**Architecture:** The engine is a TypeScript domain module with no React Native, Expo, storage, notification, or UI dependencies. Knowledge data and normalized climate are inputs; persisted schedule state contains only user-specific schedule facts and learned adjustments, while base intervals and active season are derived for each calculation. The engine returns updated schedule state plus a derived planner projection after explicit actions.

**Tech Stack:** TypeScript 6, Vitest for pure domain tests, Expo 57 application shell. Consult the exact Expo SDK 57 documentation before adding application-side integrations; the engine itself must remain platform-independent.

**Spec:** [docs/superpowers/specs/2026-09-14-plant-care-mvp-design.md](../specs/2026-09-14-plant-care-mvp-design.md)

## Global Constraints

- Core workflows work offline and do not require an account.
- Planner tasks are derived projections and have no independent persistence requirement.
- Notifications are derived projections and never block local domain updates.
- Knowledge-base intervals are immutable inputs; user feedback changes only plant-specific learned adjustments.
- The effective interval is `max(1 day, baseInterval + activeSeasonAdjustment)`.
- Learned adjustments have no upper bound, but earlier feedback cannot reduce the effective interval below one day.
- Postponement cannot exceed the effective interval before postponement.
- Completing a task means the care was performed and advances schedule state from the actual completion date.
- Postponement never creates a journal event.
- Standalone journal events never modify schedule state.
- Future dates are rejected; today and past dates are valid.
- Avoid one-letter variable names and unrelated refactors.

## Scope Boundary

This plan covers the scheduling engine only. Collection screens, onboarding, local persistence, journal UI, archive UI, climate lookup, notifications, and the rest of the MVP should be planned as follow-up slices after this engine has executable tests.

Before Task 2 implementation begins, resolve these two next-phase product decisions in the engine contract review:

1. **Schedule toggling (confirmed):** disabling scheduling preserves schedule state and re-enabling resumes it; restoration is the exception and requires fresh seed dates because restoration clears state.
2. **Fertilizer modes (confirmed):** use the finite domain `NONE | LIQUID | LONG_TERM`. Allow at most one active fertilizer mode per plant in the first implementation; liquid fertilizer is coupled to watering, while long-term fertilizer is independent. If product review chooses simultaneous modes later, extend the care configuration without changing the engine's watering semantics.

## File Map

- Create `src/domain/scheduling/types.ts`: branded date/interval primitives, seasonal model types, knowledge inputs, persisted schedule state, actions, and calculation results.
- Create `src/domain/scheduling/engine.ts`: pure initialization, projection, and action-transition functions.
- Create `src/domain/scheduling/knowledge.ts`: deterministic test knowledge fixtures and interval lookup interface; no city/country resolver belongs here.
- Create `tests/scheduling/engine.test.ts`: executable contract tests for initialization, projection, transitions, seasons, location changes, and fertilizer coupling.
- Modify `package.json`: add the smallest test command and Vitest development dependency required by the engine tests.
- Modify `tsconfig.json`: include the domain and test TypeScript paths without weakening existing compiler checks.

## Interfaces

The engine should expose these stable functions from `src/domain/scheduling/engine.ts`:

```ts
initializeSchedule(input: InitializeScheduleInput): ScheduleCalculation
projectSchedule(input: ProjectScheduleInput): PlannerProjection
applyScheduleAction(input: ApplyScheduleActionInput): ScheduleCalculation
recalculateForLocationChange(input: LocationChangeInput): ScheduleCalculation
```

The functions must be pure: no system clock, random values, filesystem calls, notification calls, or mutable module-level state. Every input includes an explicit ISO calendar date (`YYYY-MM-DD`) so tests are deterministic.

## Task 1: Establish the Pure Engine Contract

**Files:**
- Create: `src/domain/scheduling/types.ts`
- Create: `src/domain/scheduling/knowledge.ts`
- Create: `tests/scheduling/engine.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Produces the domain types and test runner needed by Tasks 2 and 3.
- `KnowledgeEntry` must include `seasonalModel: 'GROWING_DORMANT' | 'YEAR_ROUND'`, species/genus identity, climate-aware interval lookup, and fertilization applicability.
- `ScheduleState` must persist last completed dates per enabled care type, seasonal learned adjustments, and next due dates; `baseInterval` and active season are calculation outputs, not authoritative persisted fields.
- `FertilizerMode` must be `NONE | LIQUID | LONG_TERM` for this plan.

- [ ] **Step 1: Add the test command and test dependency**

Add a `test` script that runs Vitest once and add Vitest as a development dependency. Keep the existing Expo scripts unchanged.

- [ ] **Step 2: Write the first failing contract tests**

Start `tests/scheduling/engine.test.ts` with tests that import the future engine API and describe these required cases:

```ts
it('initializes next due from the user-provided last-care date', () => {
  const result = initializeSchedule({
    today: '2026-09-14',
    lastCompletedDate: '2026-09-10',
    knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
    climate: 'TEMPERATE',
  });

  expect(result.state.lastCompletedDate).toBe('2026-09-10');
  expect(result.projection.nextDueDate).toBe('2026-09-17');
});

it('does not reduce the persisted adjustment below the one-day effective floor', () => {
  const state = scheduleState({ learnedAdjustmentDays: -6 });
  const result = applyScheduleAction({
    state,
    action: { type: 'FEEDBACK_EARLIER' },
    today: '2026-09-14',
    knowledge: wateringKnowledge({ baseIntervalDays: 7 }),
    climate: 'TEMPERATE',
  });

  expect(result.state.learnedAdjustmentDays).toBe(-6);
  expect(result.projection.effectiveIntervalDays).toBe(1);
});
```

Add fixture helpers in the same test file or a dedicated test helper only if the file becomes difficult to scan. Include cases for year-round and growing/dormant knowledge models.

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `npm test -- --run tests/scheduling/engine.test.ts`

Expected: FAIL because the scheduling types and engine exports do not exist yet.

- [ ] **Step 4: Define the types and deterministic knowledge fixture**

Define explicit union types for seasonal model, season, care type, fertilizer mode, and schedule actions. Represent dates as validated ISO-date strings at the boundary and intervals as positive integer day counts. Keep climate as a normalized opaque identifier consumed by knowledge lookup. Make `baseIntervalDays` a lookup result, not a persisted schedule-state field.

- [ ] **Step 5: Run the focused typecheck**

Run: `npx tsc --noEmit`

Expected: The new types and test imports compile, while engine implementation imports may remain intentionally unresolved until Task 2. If the project compiler includes tests and reports unresolved engine exports, add typed stubs only; do not implement behavior in this task.

## Task 2: Implement Initialization and Pure Projection

**Files:**
- Create: `src/domain/scheduling/engine.ts`
- Modify: `tests/scheduling/engine.test.ts`

**Interfaces:**
- Consumes the types and knowledge lookup from Task 1.
- Produces `initializeSchedule` and `projectSchedule`.
- `initializeSchedule` maps each user-provided last-care date to `lastCompletedDate`, initializes applicable learned adjustments to zero, and computes the first `nextDueDate`.
- `projectSchedule` derives active season, base interval, effective interval, due status, fertilizer coupling, and guidance level without mutating state.

- [ ] **Step 1: Add failing projection tests**

Cover these exact examples:

```ts
it('derives a seven-day schedule from September 10 to September 17', () => {
  // base 7, adjustment 0, last completed Sep 10
});

it('uses independent growing and dormant adjustments', () => {
  // growing adjustment +2 does not affect dormant adjustment 0
});

it('uses one year-round adjustment for year-round plants', () => {
  // no dormant state is created
});

it('marks dates before today overdue and today due today', () => {
  // overdue and due-today projections are distinct
});

it('combines liquid fertilizer with watering and keeps long-term fertilizer independent', () => {
  // LIQUID produces one combined task; LONG_TERM produces its own fertilizer task
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run tests/scheduling/engine.test.ts`

Expected: FAIL for unimplemented initialization and projection behavior.

- [ ] **Step 3: Implement minimal pure initialization and projection**

Compute:

```text
baseIntervalDays = knowledge.intervalFor(climate, activeSeason, careType)
effectiveIntervalDays = max(1, baseIntervalDays + activeAdjustmentDays)
nextDueDate = lastCompletedDate + effectiveIntervalDays
```

For a year-round model use one adjustment and no season transition. For growing/dormant use only the active season’s adjustment. Do not persist planner tasks.

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `npm test -- --run tests/scheduling/engine.test.ts && npx tsc --noEmit`

Expected: PASS for all Task 2 tests and no TypeScript errors.

## Task 3: Implement Action Transitions and Recalculation

**Files:**
- Modify: `src/domain/scheduling/engine.ts`
- Modify: `tests/scheduling/engine.test.ts`

**Interfaces:**
- Consumes `ScheduleState`, knowledge lookup, climate, explicit today date, and action union.
- Produces updated `ScheduleState`, derived projection, and domain events describing care records to be created by a later journal adapter.
- `applyScheduleAction` must support `COMPLETE`, `POSTPONE`, `FEEDBACK_EARLIER`, and `FEEDBACK_LATER`.
- `recalculateForLocationChange` must support `RESET_TO_DEFAULTS` and `PRESERVE_LEARNED_STATE`.

- [ ] **Step 1: Add failing transition tests**

Include these normative cases:

```ts
it('completes from the actual completion date', () => {
  // due Sep 10, completed Sep 14, base 7 -> next due Sep 21
});

it('adds one day for later feedback and subtracts one day until the one-day floor', () => {
  // +1 and -1 transitions; no further decrease at floor
});

it('caps postponement at the current effective interval', () => {
  // custom 8 on a 7-day effective interval is rejected or normalized to 7
});

it('applies postponement to both next due date and learned adjustment', () => {
  // base 7, learned +2, effective 9, due Sep 14, postpone 3 -> due Sep 17, adjustment +5
});

it('allows a maximum postponement to double the subsequent effective interval', () => {
  // base 7, adjustment 0, postpone 7 -> adjustment +7, next effective interval 14
});

it('reanchors location changes from last completed date', () => {
  // new climate changes base interval; postponed nextDueDate is not used as anchor
});

it('reset location change clears all seasonal adjustments', () => {
  // both growing and dormant adjustments become zero
});

it('preserve location change retains applicable learned adjustment', () => {
  // new climate base changes; active seasonal adjustment remains
});

it('standalone journal facts are not schedule actions', () => {
  // no engine action exists that changes schedule state from a journal event
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run tests/scheduling/engine.test.ts`

Expected: FAIL until all action transitions are implemented.

- [ ] **Step 3: Implement completion and feedback transitions**

For `COMPLETE`, set `lastCompletedDate` to the explicit completion date, preserve the active adjustment unless feedback is included, derive the next due date from that date, and return the care event descriptors. For liquid fertilizer, return separate watering and fertilizing event descriptors while retaining one combined planner task.

For earlier/later feedback, adjust only the active seasonal or year-round adjustment by one day. Clamp the adjustment so no further earlier feedback can reduce the effective interval below one day; at the floor, the adjustment remains unchanged.

- [ ] **Step 4: Implement postponement transition**

Validate the requested postponement as a positive integer no greater than the effective interval before postponement. On valid input, shift `nextDueDate` by the requested days and add the same days to the active adjustment. On invalid input, return a typed domain error without mutating state.

- [ ] **Step 5: Implement location recalculation**

Use `lastCompletedDate` as the only anchor. For reset, clear all seasonal/year-round learned adjustments. For preserve, retain them. In both cases derive the new climate interval and next due date from the selected adjustment.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- --run tests/scheduling/engine.test.ts && npx tsc --noEmit`

Expected: PASS with deterministic results and no TypeScript errors.

## Task 4: Add Engine-Level Invariant and Property Coverage

**Files:**
- Modify: `tests/scheduling/engine.test.ts`
- Modify: `package.json` only if a separate coverage script is needed

**Interfaces:**
- Consumes the public engine functions from Tasks 2 and 3.
- Produces regression coverage for invariants that UI and persistence layers must rely on.

- [ ] **Step 1: Add invariant tests**

Cover:

- No projection produces an effective interval below one day.
- No postponement above the effective interval is accepted.
- A completed task advances from actual completion date, not original due date.
- A postponed task produces no care event descriptor.
- Journal edits/deletions are absent from scheduling inputs and cannot change state.
- Archived state is rejected by schedule actions.
- The same input snapshot always produces the same projection.
- Year-round plants never gain dormant adjustment fields.

- [ ] **Step 2: Run the complete engine suite**

Run: `npm test -- --run tests/scheduling/engine.test.ts`

Expected: PASS.

- [ ] **Step 3: Run the project typecheck**

Run: `npx tsc --noEmit`

Expected: PASS with existing Expo application files unchanged.

## Task 5: Prepare the Engine Integration Boundary

**Files:**
- Modify: `App.tsx` only after the engine suite passes.
- Create: `src/domain/scheduling/index.ts`
- Modify: `tests/scheduling/engine.test.ts` only if export-surface tests are needed.

**Interfaces:**
- Produces a single public domain import surface for later persistence and UI work.
- Exports types and pure functions without exposing internal date arithmetic or fixture helpers.

- [ ] **Step 1: Add an export-surface test**

Import the public functions from `src/domain/scheduling/index.ts` and assert that initialization, projection, action application, and location recalculation are available.

- [ ] **Step 2: Implement the narrow public barrel**

Export only the stable scheduling types and functions. Keep knowledge fixtures and internal helpers private to the test or implementation modules.

- [ ] **Step 3: Run the engine suite and typecheck**

Run: `npm test -- --run tests/scheduling/engine.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Stop for review before UI integration**

Review the pure engine against the approved spec. Do not add persistence, notification registration, or screen-level scheduling calculations until this review passes.

## Verification Checklist

- `npm test -- --run tests/scheduling/engine.test.ts` passes.
- `npx tsc --noEmit` passes.
- `git diff --check` passes.
- No scheduling calculation exists in `App.tsx` or a React component.
- No notification or storage failure can affect pure engine results.
- The engine has no implicit current-date dependency.
- The engine does not persist planner tasks.
- The engine exposes liquid-fertilizer completion as separate care-event descriptors.

## Follow-Up Plans

After this plan is reviewed and the engine is complete, create separate focused plans for:

1. Local persistence and repository adapters.
2. Knowledge-base data and deterministic city/country climate resolution.
3. Journal and archive workflows.
4. Expo UI, onboarding, collection, planner, and journal screens.
5. Notification projection and registration.
