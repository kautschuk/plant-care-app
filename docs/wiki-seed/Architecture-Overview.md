# Architecture Overview

## Boundary model

The app separates deterministic domain behavior from application orchestration, UI, and platform adapters.

- **Scheduling domain:** pure, deterministic calculations. It receives explicit dates, plant knowledge, climate context, and persisted schedule facts; it returns updated state and derived planner projections.
- **Knowledge domain:** offline static plant catalog and deterministic climate classification. Species-specific knowledge takes precedence; genus-level fallback remains explicitly identified; unsupported entries are not schedulable.
- **Persistence domain:** platform-independent record types, repository contracts, validation, and codecs.
- **SQLite adapter:** Expo SQLite schema/migrations and repository implementation live outside the domain.
- **Application/UI:** combines domain outputs into user workflows. It should not reimplement domain scheduling rules.
- **Notifications:** derived side effects; notification failure must not block local domain updates.

## Scheduling invariants

- Dates and IDs are passed explicitly; domain code does not read the system clock or generate IDs implicitly.
- The effective interval has a one-day minimum.
- Completing a task advances schedule state from the actual completion date.
- Postponement does not create a journal event.
- Standalone journal events do not change schedule state.
- Future journal/care dates are rejected; today and past dates are valid.
- Base intervals, active season, planner tasks, and notification projections are derived rather than persisted.

## Knowledge and climate invariants

- Household location is manually entered as city and country; no location permission or network lookup is required.
- Resolution is deterministic for normalized inputs.
- Unmapped/blank locations use the explicit TEMPERATE fallback and report that fallback was used.
- Exact species matches take precedence over genus fallback.
- Genus fallback must remain represented as genus-level guidance; unsupported results cannot produce a schedule.

## Persistence invariants

- Use normalized SQLite tables and typed repository contracts.
- Domain records and repository interfaces remain independent of Expo/SQLite.
- Related writes must be transactional, especially completing care when schedule state and journal history both change.
- Archiving preserves journal events and clears schedule rows; permanent deletion cascades.
- Corrupt stored data must not be silently replaced with defaults.

## Canonical designs

- [Scheduling engine implementation plan](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/plans/2026-09-14-plant-care-scheduling-engine.md)
- [Knowledge and climate design](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/specs/2026-09-16-knowledge-climate-design.md)
- [Local persistence design](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/specs/2026-10-08-local-persistence-design.md)
- [Daily planner behavior plan](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/plans/2026-10-08-planner-behavior.md)
- [Searchable taxonomy selector plan](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/plans/2026-10-09-searchable-plant-taxonomy-selectors.md)

These summaries are navigation aids. The approved design/specification is authoritative for each contract.
