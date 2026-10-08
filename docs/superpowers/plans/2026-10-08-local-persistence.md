# Local Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add offline persistence for household settings, plants, care schedules, and journal events through typed domain repositories backed by Expo SQLite.

**Architecture:** Keep persistence records and repository contracts platform-independent under `src/domain/persistence/`. Implement schema, migrations, serialization, and repository adapters under `src/adapters/sqlite/`. Use one transaction boundary for related writes; do not persist derived planner projections.

**Tech Stack:** TypeScript 6, Expo SDK 57 `expo-sqlite`, Vitest 5, and `sql.js` as a test-only real SQLite engine.

**Spec:** [docs/superpowers/specs/2026-10-08-local-persistence-design.md](../specs/2026-10-08-local-persistence-design.md)

## Global Constraints

- Keep the domain deterministic and independent of Expo, SQLite, filesystem calls, and UI.
- Pass dates and IDs explicitly; repository code must not read the clock or generate IDs.
- Do not persist planner projections, base intervals, active seasons, or notification projections.
- Preserve care events when archiving; clear schedule rows; permanent deletion cascades.
- Distinguish absent records from corrupt data; never silently replace invalid stored data with defaults.
- Install Expo packages with `npx expo install` for SDK 57 compatibility.
- Do not commit changes during this task.

---

## File Structure

- Create `src/domain/persistence/types.ts` for settings, plant, care configuration, and event records.
- Create `src/domain/persistence/repositories.ts` for repository ports and transactional scopes.
- Create `src/domain/persistence/errors.ts` for typed persistence errors.
- Create `src/domain/persistence/schedule-codec.ts` for versioned `CareScheduleState` serialization and runtime validation.
- Create `src/domain/persistence/index.ts` as the public domain barrel.
- Create `src/adapters/sqlite/driver.ts` for the small async SQLite driver contract shared by Expo and tests.
- Create `src/adapters/sqlite/schema.ts` for ordered, transactional `user_version` migrations.
- Create `src/adapters/sqlite/database.ts` for opening, connection setup, serialized transactions, and repository construction.
- Create `src/adapters/sqlite/repositories.ts` for SQLite-backed settings, plant, schedule, and event operations.
- Create `tests/persistence/sqlite-test-driver.ts` to adapt `sql.js` in-memory databases to the async driver contract.
- Create `tests/persistence/repositories.test.ts` for migrations, round trips, validation, transaction rollback, and archive/delete behavior.
- Modify `package.json` and the lockfile for SDK-compatible `expo-sqlite` and test-only SQLite dependencies.

## Task 1: Define Domain Records and Repository Ports

**Files:**
- Create: `src/domain/persistence/types.ts`
- Create: `src/domain/persistence/repositories.ts`
- Create: `src/domain/persistence/errors.ts`
- Create: `src/domain/persistence/index.ts`
- Test: `tests/persistence/repositories.test.ts`

**Interfaces:**

```ts
export type CareEventType = CareType | 'REPOTTING' | 'PROPAGATION';

export interface HouseholdSettings {
  readonly knowledgeLevel: string;
  readonly commitmentLevel: string;
  readonly location: HouseholdLocation;
  readonly climate: ClimateClassification;
  readonly climateUsedFallback: boolean;
}

export interface PlantRecord {
  readonly id: string;
  readonly displayName: string;
  readonly genus: string;
  readonly species?: string;
  readonly taxonomicLevel: TaxonomicLevel;
  readonly archived: boolean;
}

export interface PlantCareConfiguration {
  readonly plantId: string;
  readonly schedulingEnabled: boolean;
  readonly fertilizerMode: FertilizerMode;
}

export interface CareEvent {
  readonly id: string;
  readonly plantId: string;
  readonly type: CareEventType;
  readonly date: ISODateString;
}
```

Define repository methods as follows:

```ts
interface HouseholdSettingsRepository {
  get(): Promise<HouseholdSettings | null>;
  save(settings: HouseholdSettings): Promise<void>;
}

interface PlantRepository {
  get(id: string): Promise<{ plant: PlantRecord; care: PlantCareConfiguration } | null>;
  list(archived?: boolean): Promise<readonly { plant: PlantRecord; care: PlantCareConfiguration }[]>;
  save(plant: PlantRecord, care: PlantCareConfiguration): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deletePermanently(id: string): Promise<void>;
}

interface ScheduleRepository {
  get(plantId: string): Promise<ScheduleState | null>;
  save(plantId: string, state: ScheduleState): Promise<void>;
  delete(plantId: string): Promise<void>;
}

interface CareEventRepository {
  listForPlant(plantId: string): Promise<readonly CareEvent[]>;
  save(event: CareEvent): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

Group those ports in `PersistenceRepositories`; define `PersistenceStore` as that group plus `transaction<T>(operation: (repositories: PersistenceRepositories) => Promise<T>): Promise<T>`. The callback receives transaction-scoped ports. Use `PersistenceError` with stable codes for invalid data, not found, and database failures; missing reads return `null` and are not errors.

- [ ] **Step 1: Write a failing public-contract test**

Add a test importing the public persistence barrel and asserting the `CareEventType` values through a typed fixture that accepts `WATERING`, `FERTILIZING`, `REPOTTING`, and `PROPAGATION`. Add compile-time-shaped fixture values for household, plant, and care configuration records.

- [ ] **Step 2: Run the focused test to establish the missing module failure**

Run: `npm test -- --run tests/persistence/repositories.test.ts`

Expected: FAIL because the persistence module and test file do not exist yet.

- [ ] **Step 3: Add the domain records, ports, errors, and barrel exports**

Use readonly fields. Reuse `CareType`, `FertilizerMode`, `ISODateString`, `TaxonomicLevel`, `HouseholdLocation`, and `ClimateClassification`; do not create parallel scheduling or climate types. Keep preference values as non-empty strings until a preferences domain defines their allowed values.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/persistence/repositories.test.ts && npx tsc --noEmit`

Expected: PASS with no domain imports from Expo or SQLite.

## Task 2: Add a Versioned Schedule-State Codec

**Files:**
- Create: `src/domain/persistence/schedule-codec.ts`
- Modify: `src/domain/persistence/index.ts`
- Test: `tests/persistence/repositories.test.ts`

**Interfaces:**

```ts
export interface EncodedCareScheduleState {
  readonly version: 1;
  readonly state: CareScheduleState;
}

export function encodeCareScheduleState(state: CareScheduleState): string;
export function decodeCareScheduleState(serialized: string): CareScheduleState;
```

- [ ] **Step 1: Add failing codec tests**

Cover year-round and growing/dormant care schedule states, invalid JSON, unsupported codec version, missing required fields, invalid ISO dates, non-integer adjustments, and impossible learned-adjustment model shapes. Multiple care types are stored as separate rows and assembled by `ScheduleRepository`.

- [ ] **Step 2: Run the focused codec tests and confirm they fail**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'schedule codec'`

Expected: FAIL because the codec exports do not exist.

- [ ] **Step 3: Implement strict version-1 encode/decode functions**

Use `JSON.stringify` only for encoding. Decode from `unknown`, validate every required field and `LearnedAdjustments` variant, use `validateISODate` for both persisted dates, and throw `PersistenceError('INVALID_DATA', ...)` for malformed data. Do not coerce strings to numbers or fill omitted state with defaults.

- [ ] **Step 4: Run codec tests and the full typecheck**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'schedule codec' && npx tsc --noEmit`

Expected: PASS for valid per-care-type round trips and clear failures for all malformed inputs.

## Task 3: Build the SQLite Driver Boundary, Schema, and Migrations

**Files:**
- Modify: `package.json` and lockfile
- Create: `src/adapters/sqlite/driver.ts`
- Create: `src/adapters/sqlite/schema.ts`
- Create: `tests/persistence/sqlite-test-driver.ts`
- Test: `tests/persistence/repositories.test.ts`

**Interfaces:**

The internal driver exposes parameterized `run`, `getFirst`, and `getAll` operations plus `exec` and a transaction callback that accepts a transaction-scoped driver. Bindings are limited to `string | number | null | Uint8Array`; do not concatenate user values into SQL. Production opens `plant-care.db` through Expo SQLite. Tests adapt `sql.js` in-memory databases to this driver and invoke actual SQLite statements, constraints, and rollback behavior.

Schema version 1 creates:

- `household_settings`, constrained to singleton ID 1, with knowledge level, commitment level, city, country, climate, and fallback flag.
- `plants`, keyed by text ID, with display name, genus, nullable species, taxonomic level, and archived flag.
- `care_configurations`, one row per plant with scheduling-enabled and fertilizer-mode fields, cascading on plant deletion.
- `schedule_states`, keyed by plant ID and care type, with a versioned `CareScheduleState` JSON payload, cascading on plant deletion.
- `care_events`, keyed by event ID, with plant ID, type, and date, cascading on plant deletion; add an index on `(plant_id, date)`.

- [ ] **Step 1: Add failing migration tests using an in-memory SQLite database**

Assert fresh version is 0 before setup, version is 1 after setup, foreign keys are enabled, duplicate care rows fail, deleting a plant cascades, and rerunning setup is idempotent.

- [ ] **Step 2: Run migration tests and confirm the schema is absent**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'migration'`

Expected: FAIL because no driver, schema, or migration runner exists.

- [ ] **Step 3: Install compatible dependencies and implement schema migrations**

Run: `npx expo install expo-sqlite` and add `sql.js` plus its TypeScript declarations as development dependencies. Implement migrations in order using `PRAGMA user_version`; run each migration transactionally and reject a database version newer than the app supports. Enable foreign keys and WAL for the opened connection.

- [ ] **Step 4: Implement Expo and `sql.js` driver adapters**

Wrap Expo's parameterized async calls without exposing `SQLiteDatabase` outside the adapter. The test adapter wraps a real `sql.js` database and implements begin/commit/rollback. Keep production-only Expo imports out of test driver modules.

- [ ] **Step 5: Run focused migration tests and typecheck**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'migration' && npx tsc --noEmit`

Expected: PASS on the in-memory SQLite engine and clean Expo adapter types.

## Task 4: Implement Repositories and Record Invariants

**Files:**
- Create: `src/adapters/sqlite/repositories.ts`
- Modify: `src/adapters/sqlite/database.ts`
- Test: `tests/persistence/repositories.test.ts`

- [ ] **Step 1: Add failing repository round-trip tests**

Cover settings save/load, plant plus configuration save/load, active and archived listing, schedule encode/save/load for multiple care types, event save/query/update/delete, missing-record `null`, and malformed row errors. Verify invalid future dates are not checked here; repository dates are validated for calendar validity only.

- [ ] **Step 2: Run repository tests to confirm the operations are missing**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'repository round trips'`

Expected: FAIL because SQLite repositories are not implemented.

- [ ] **Step 3: Implement parameterized CRUD and strict row mapping**

Map each SQL column explicitly. Use parameter binding for every value. Translate SQLite rows to domain records only after validating enum values, booleans, and ISO dates. Throw `PersistenceError('INVALID_DATA', ...)` for corrupt rows and `PersistenceError('NOT_FOUND', ...)` for invalid write targets.

- [ ] **Step 4: Implement archive, restore, and permanent deletion rules**

Archive transaction: require an existing plant, mark it archived, disable scheduling, and delete its schedule rows while retaining events. Restore transaction: clear archived flag and leave scheduling disabled with no schedule rows. Reject event creation, update, and deletion for archived plants; permanent plant deletion remains allowed and relies on enabled foreign-key cascades.

- [ ] **Step 5: Run focused repository tests and typecheck**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'repository|archive|restore|delete' && npx tsc --noEmit`

Expected: PASS for all repository mappings and archive invariants.

## Task 5: Add Serialized Transactions and Atomic Planner Completion Writes

**Files:**
- Modify: `src/adapters/sqlite/database.ts`
- Modify: `src/adapters/sqlite/repositories.ts`
- Test: `tests/persistence/repositories.test.ts`

- [ ] **Step 1: Add failing transaction rollback tests**

Start with an existing schedule, run a transaction that saves an updated schedule and then attempts to insert an invalid event, and assert the original schedule and event set are unchanged. Add a success test that saves the updated schedule with all event descriptors from a completed action.

- [ ] **Step 2: Run transaction tests and confirm atomic persistence is absent**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'transaction'`

Expected: FAIL because no transaction-scoped repository store exists.

- [ ] **Step 3: Implement the store transaction boundary**

Serialize all calls through one connection queue. For native Expo SQLite use `withExclusiveTransactionAsync` and ensure transaction-scoped operations use its `txn` argument. On web use `withTransactionAsync` under the same queue; do not permit direct concurrent repository calls to bypass the queue. Roll back and rethrow the original persistence failure. This task modifies the database module first created in Task 3; it does not create a second copy.

- [ ] **Step 4: Test atomic completion and concurrency isolation**

Assert successful writes update schedule and insert all generated events together; injected failure rolls back every row. Assert a second repository operation waits until a transaction completes. This layer persists caller-provided engine output and does not invoke the scheduler or create events itself.

- [ ] **Step 5: Run transaction tests and typecheck**

Run: `npm test -- --run tests/persistence/repositories.test.ts -t 'transaction' && npx tsc --noEmit`

Expected: PASS for rollback, successful atomic writes, and serialized operations.

## Task 6: Run Required Regression Gates and Review Scope

**Files:**
- Review: all files created in Tasks 1-5
- Test: `tests/persistence/repositories.test.ts`, existing test suite

- [ ] **Step 1: Run the focused persistence suite**

Run: `npm test -- --run tests/persistence/repositories.test.ts`

Expected: PASS for codecs, schema, migrations, repositories, archive behavior, and transactions.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test -- --run`

Expected: all existing scheduling and knowledge tests plus persistence tests pass.

- [ ] **Step 3: Run the whole-project typecheck**

Run: `npx tsc --noEmit`

Expected: zero TypeScript errors.

- [ ] **Step 4: Verify diff whitespace and changed-file scope**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only persistence code, package metadata, and the approved spec/plan are changed. Do not commit.

## Plan Self-Review

- Spec coverage: domain purity, normalized tables, settings/plant/config/schedule/event records, serialization version, archive/restore/delete, atomic schedule-plus-event writes, web/native transactions, `user_version` migrations, strict error behavior, and regression commands are assigned to Tasks 1-6.
- Placeholder scan: no TBD/TODO steps; tests and commands name the covered behavior.
- Type consistency: all repositories are exposed through `PersistenceRepositories`; `PersistenceStore.transaction` receives that same group; `ScheduleRepository` assembles one `ScheduleState` per plant from care-type rows, each decoded with the versioned `CareScheduleState` codec.