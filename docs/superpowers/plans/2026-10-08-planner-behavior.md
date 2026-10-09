# Daily Planner Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily planner render the scheduling engine's care-task descriptors faithfully and offer the product-approved postponement choices within each task's current effective-interval limit.

**Architecture:** Keep scheduling calculations and task semantics in the pure scheduling domain. Add a small application-level planner projection that combines each enabled care schedule's projection with only the matching task descriptors, then have `App.tsx` render that view model and its effective-interval value. Keep the engine as the final authority for postponement validity; the UI filters quick choices and validates custom input before calling the existing application action.

**Tech Stack:** TypeScript 6, React Native / Expo SDK 57, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-14-plant-care-mvp-design.md](../specs/2026-09-14-plant-care-mvp-design.md)  
**Implementation context:** [docs/superpowers/handoffs/2026-10-08-next-session-handoff.md](../handoffs/2026-10-08-next-session-handoff.md)

## Global Constraints

- The daily planner shows only plants with work due today or overdue; plants with no task due remain in the collection.
- Postponement offers 1, 2, 3, and 7 days, plus a custom number of days.
- The requested postponement cannot exceed the current effective interval for that care type.
- Liquid fertilizer is coupled to watering: it replaces the watering task rather than creating a second task.
- Long-term fertilizer is an independent recurring task.
- Completing a combined liquid-fertilizer task records separate watering and fertilizing care events.
- Keep the scheduling engine deterministic and platform-agnostic; callers provide dates explicitly.
- Keep existing application-layer validation, persistence, and error reporting; do not add dependencies or unrelated UI changes.
- Before writing implementation code, read the exact Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/ as required by `AGENTS.md`.

## Review Focus

- A due liquid-fertilizer schedule must produce one combined watering task and no separate fertilizer task; pin this in Task 1's liquid-fertilizer projection test.
- A long-term fertilizer task must use its own care schedule's due date and status rather than the watering schedule's; pin this in Task 1's independent-schedule test.
- A projection can describe more than one care type; only the descriptor matching the schedule being projected may inherit that schedule's date and status; pin this in Task 1's cross-care descriptor test.
- Quick postponement choices must be exactly the standard values no greater than the current effective interval; pin caps below and at the standard values in Task 2's choice tests.
- Empty, non-integer, non-positive, and over-limit custom inputs must not invoke a schedule action, and an over-limit action rejected by the domain must leave persistence unchanged and report the error; pin input validity in Task 2's helper tests and domain rejection in its application test.

---

### Task 1: Project Planner Items from Scheduling Descriptors

**Files:**
- Create: `src/application/planner.ts`
- Modify: `src/application/index.ts`
- Modify: `App.tsx`
- Test: `tests/application/planner.test.ts`

**Interfaces:**
- Consumes: `projectSchedule(input: ProjectScheduleInput): PlannerProjection`, `ScheduleState`, and the existing `KnowledgeEntry` and `Climate` types.
- Produces:
  - `PlannerPlantInput`: `{ readonly plantId: string; readonly plantName: string; readonly schedule: ScheduleState; readonly knowledge: KnowledgeEntry }`.
  - `PlannerProjectionInput`: `{ readonly today: ISODateString; readonly climate: Climate; readonly plants: readonly PlannerPlantInput[] }`.
  - `PlannerItem extends PlannerTask`: `{ readonly plantId: string; readonly plantName: string; readonly dueDate: ISODateString; readonly status: 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE'; readonly effectiveIntervalDays: number }`.
  - `projectHouseholdPlannerItems(input: PlannerProjectionInput): PlannerItem[]`.
- Keep schedule lookup and plant filtering in the existing App effect; the new function is a synchronous projection over active plants' IDs, names, schedule states, and resolved knowledge entries.

- [x] **Step 1: Write failing projection tests**

In `tests/application/planner.test.ts`, add these tests with fixed `ISODateString` dates and small local `KnowledgeEntry` fixtures:

```ts
it('projects liquid fertilizer as one combined watering task', () => {
  const items = projectHouseholdPlannerItems(liquidPlantDueToday);

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    careType: 'WATERING',
    status: 'DUE_TODAY',
    fertilizerMode: 'LIQUID',
    combinedWithWatering: true,
  });
});

it('projects long-term fertilizer from its independent schedule', () => {
  const items = projectHouseholdPlannerItems(longTermPlantWithDifferentDueDates);

  expect(items).toEqual(expect.arrayContaining([
    expect.objectContaining({ careType: 'WATERING', dueDate: '2026-10-08' }),
    expect.objectContaining({ careType: 'FERTILIZING', dueDate: '2026-10-10' }),
  ]));
});

it('does not apply a cross-care descriptor to the wrong schedule projection', () => {
  const items = projectHouseholdPlannerItems(longTermPlantWithDifferentDueDates);

  expect(items.filter((item) => item.careType === 'FERTILIZING')).toHaveLength(1);
  expect(items.find((item) => item.careType === 'FERTILIZING')?.dueDate)
    .toBe('2026-10-10');
});
```

Set fixture dates so the assertions cover different schedule projections; retain `NOT_DUE` items in the projection because existing dashboard and collection summaries consume them.

- [x] **Step 2: Run the focused tests and verify the expected failure**

Run: `npx vitest run tests/application/planner.test.ts`

Expected: FAIL because the planner projection module and function do not exist yet.

- [x] **Step 3: Implement the pure planner projection**

Create `src/application/planner.ts` with typed input and output interfaces. For each enabled care schedule, call `projectSchedule` with that care type, then emit only descriptors whose `task.careType` equals the projected care type. Copy that projection's due date, status, and effective interval onto each matching descriptor. Export the function and public view-model type from `src/application/index.ts`.

- [x] **Step 4: Wire `App.tsx` to the new planner projection**

Replace the effect's hand-built `PlannerItem` construction with a batch of active plant, schedule, and knowledge inputs passed to `projectHouseholdPlannerItems`. Keep the existing loading guard, inactive-effect guard, household grouping, and status filtering unchanged. Carry descriptor fields and `effectiveIntervalDays` through the rendered planner item.

- [x] **Step 5: Run projection and existing scheduling tests, then type-check**

Run: `npx vitest run tests/application/planner.test.ts tests/scheduling/engine.test.ts`

Expected: PASS, including the combined liquid task, independent long-term task, cross-care descriptor cases, and the existing separate-event behavior for completing liquid fertilizer.

Run: `npx tsc --noEmit`

Expected: PASS.

- [x] **Step 6: Commit the projection slice**

```bash
git add src/application/planner.ts src/application/index.ts App.tsx tests/application/planner.test.ts
git commit -m "feat: project planner tasks from schedule descriptors"
```

### Task 2: Add Interval-Bounded Postponement Choices

**Files:**
- Modify: `src/application/planner.ts`
- Modify: `src/application/index.ts`
- Modify: `App.tsx`
- Modify: `tests/application/planner.test.ts`
- Modify: `tests/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `PlannerItem.effectiveIntervalDays` from Task 1 and `applyPlantScheduleAction` from the existing application layer.
- Produces: `getPostponementQuickChoices(maxDays: number): readonly number[]` and `isValidCustomPostponementDays(value: string, maxDays: number): boolean`.
- Quick choices are the ordered subset of `[1, 2, 3, 7]` that do not exceed `maxDays`. A custom value is valid only when it contains a whole positive integer and is at most `maxDays`.

- [x] **Step 1: Write failing postponement-choice and custom-input tests**

Add tests in `tests/application/planner.test.ts`:

```ts
it('offers only standard postponements up to the current effective interval', () => {
  expect(getPostponementQuickChoices(2)).toEqual([1, 2]);
  expect(getPostponementQuickChoices(7)).toEqual([1, 2, 3, 7]);
  expect(getPostponementQuickChoices(9)).toEqual([1, 2, 3, 7]);
});

it('accepts only positive whole custom postponements within the limit', () => {
  expect(isValidCustomPostponementDays('3', 7)).toBe(true);
  for (const value of ['', '0', '-1', '1.5', '8', '3days']) {
    expect(isValidCustomPostponementDays(value, 7)).toBe(false);
  }
});
```

- [x] **Step 2: Run the focused tests and verify the expected failure**

Run: `npx vitest run tests/application/planner.test.ts`

Expected: FAIL because the postponement helpers do not exist yet.

- [x] **Step 3: Implement the postponement helpers**

In `src/application/planner.ts`, define the standard choices once and implement the two typed helpers. Parse custom input strictly as a whole-number string; do not round, clamp, or silently substitute an invalid value. Export both helpers from `src/application/index.ts`.

- [x] **Step 4: Add the dynamic postponement controls to the planner**

In `App.tsx`, render one quick-action button for each returned choice instead of the fixed “Postpone 3d” button. Add a per-task custom-days input and action using the task's current `effectiveIntervalDays` as the maximum. Show the maximum and a clear validation message, and disable the custom action unless `isValidCustomPostponementDays` returns true. Keep “Complete”, “Later”, and “Earlier” behavior unchanged. Route accepted values through the existing `handleScheduleAction` / `applyPlantScheduleAction` path, which remains authoritative if state changes after rendering. Share a synchronous in-flight guard between completion and schedule actions, disable planner action buttons while an action is pending, and release the guard after both success and failure so concurrent actions cannot race schedule writes or stale UI messages.

- [x] **Step 5: Test application rejection for an over-limit action**

Add a test in `tests/application/use-cases.test.ts` that attempts a postponement of 999 days through `applyPlantScheduleAction`. Assert that it rejects with `PersistenceError` code `INVALID_DATA` and that the persisted schedule is unchanged. The engine's focused test already covers its `INVALID_POSTPONEMENT` result for values above the current effective interval.

- [x] **Step 6: Run focused tests, type-check, and whitespace validation**

Run: `npx vitest run tests/application/planner.test.ts tests/application/use-cases.test.ts`

Expected: PASS, including choices below and at the limit, custom-input rejection, and unchanged state after an over-limit action.

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `git diff --check`

Expected: no output and exit code 0.

- [x] **Step 7: Commit the postponement controls**

```bash
git add src/application/planner.ts src/application/index.ts App.tsx tests/application/planner.test.ts tests/application/use-cases.test.ts
git commit -m "feat: bound planner postponements by effective interval"
```
