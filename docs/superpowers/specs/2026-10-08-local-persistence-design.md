# Local Persistence and Repository Design

Date: 2026-10-08
Status: Approved

## Goal

Add local, offline persistence for household settings, plant records, schedule state, and journal events. Keep the domain deterministic and independent of Expo and SQLite. Provide typed repository ports with an Expo SQLite adapter and preserve atomicity when a completed care action updates both schedule state and journal history.

## Chosen Approach

Use normalized SQLite tables and typed repository contracts. This supports independent journal queries, plant archive behavior, and schema migrations without making persisted planner projections a source of truth.

Alternatives considered:

- JSON documents in SQLite reduce mapping code but make journal queries and partial record updates less direct.
- A whole-app snapshot is simpler initially but makes partial writes and concurrent changes fragile.

## Boundaries

- Domain records and repository interfaces live in a platform-independent persistence module under `src/domain/`.
- The Expo SDK 57 SQLite adapter lives outside the domain, under `src/adapters/sqlite/`.
- SQLite handles durable storage, constraints, and migrations. It does not calculate climate, scheduling, or planner projections.
- Existing scheduling and climate functions remain pure. Callers pass dates and IDs explicitly; repositories do not read the system clock or generate IDs.
- UI, reminders, sync, export, photos, tags, and optional plant-profile details are outside this slice.

## Persisted Records

### Household settings

A singleton record stores knowledge level, commitment level, manually entered city and country, and the resolved climate classification plus its fallback flag. The settings repository stores the supplied context; climate resolution remains in the knowledge domain. Updating location and its resolved context is one transaction.

### Plants and care configuration

The plant record stores a caller-supplied stable ID, display name, genus, optional species, taxonomic level, and archive status. A one-to-one care-configuration record stores whether scheduling is enabled and the selected fertilizer mode. Care schedules are represented separately, with one record for each enabled care type.

### Schedule state

Schedule records store plant ID, care type, last-completed date, next-due date, learned adjustments, and adjustment reason. The repository codec maps these records to the existing `ScheduleState` structure and validates decoded dates and adjustment shapes. The learned-adjustment payload carries a serialization version so future format changes can be migrated deliberately. Base intervals, active season, planner tasks, and notification projections are not stored.

### Journal events

Each care event has a caller-supplied ID, plant ID, event type (`WATERING`, `FERTILIZING`, `REPOTTING`, or `PROPAGATION`), and ISO calendar date. Events remain independently editable and deletable; editing or deleting an event does not silently change schedule state.

## Archive and Deletion Rules

- Archiving retains the plant and its journal events, disables scheduling, and removes schedule records so learned adjustments are cleared.
- Restoring leaves scheduling disabled. Re-enabling scheduling requires fresh schedule initialization from new last-care dates.
- Permanent plant deletion cascades to its configuration, schedules, and journal events.
- Archived plants cannot accept new events or schedule actions and are read-only until restored.

## Repository and Transaction Contract

Provide typed `HouseholdSettingsRepository`, `PlantRepository`, and `CareEventRepository` interfaces plus a transaction boundary that supplies transaction-scoped repositories. Reads represent absence explicitly; malformed persisted values raise a persistence error rather than being treated as defaults. An absent first-run settings record remains absent for the caller to initialize.

Repository writes that span related rows are atomic. In particular, the caller can apply the pure scheduling engine, then persist the resulting schedule state and all returned care-event descriptors in one transaction. A failed event insert rolls back the schedule update, and vice versa.

The Expo adapter uses SDK 57's `expo-sqlite` APIs. Native platforms use `withExclusiveTransactionAsync`. Since that API is unavailable on web, the adapter serializes all operations around the supported async transaction API so unrelated repository calls cannot interleave with a transaction. Foreign-key enforcement is enabled for each connection.

## Migrations and Failures

Use SQLite `PRAGMA user_version` for ordered schema migrations, starting at version 1. Apply each migration transactionally and fail database initialization if a migration fails. Keep schema migrations separate from the versioned schedule-state codec.

Distinguish a missing record from corrupt data and database failures. Preserve the original cause in persistence errors. Do not silently replace partial or invalid rows with defaults. Runtime date validation checks ISO calendar validity; future-date rules remain enforced by domain entry points that receive an explicit `today` value.

## Verification

Focused repository tests use real in-memory SQLite through a test-only driver and cover:

- Household, plant, care-configuration, schedule, and journal save/load round trips.
- Schedule-state serialization versions and rejection of malformed or partial records.
- Journal event query, edit, and delete behavior without schedule mutation.
- Archive/restore invariants, retained history, and permanent-delete cascades.
- Atomic schedule-plus-event writes and rollback on failure.
- Fresh schema initialization, migration version handling, and absent first-run settings.

Run the focused persistence suite, the full Vitest suite, and `npx tsc --noEmit` after implementation. Expo dependency installation must use the SDK 57-compatible version via `npx expo install expo-sqlite`.

## Out of Scope

No UI integration, notification registration, cloud account or synchronization, backup/export, automatic clock use, or optional profile fields are included. These can be added later without changing the pure scheduling engine.