# Product Overview

## Goal

Plant Care helps users maintain plant records, see watering/fertilizing tasks due today or overdue, and record care independently of the planner. It is designed for beginners, hobbyists, and collectors.

## MVP capabilities

- Onboarding for plant-care knowledge and commitment level.
- Species-first plant search, with clearly identified genus-level fallback when species guidance is unavailable.
- Progressive plant setup with name, recognized genus/species, optional photo, and care schedule.
- Optional details such as pot size, soil, light, purchase date, and notes.
- User-defined groups or tags.
- Daily watering and fertilizing planner, with overdue tasks distinct from tasks due today.
- One-tap completion, postponement, optional care feedback, and configurable reminders.
- Independent journal entries for watering, fertilizing, repotting, and propagation.
- Editable/deletable journal entries and archived plant memorials that can be restored or permanently deleted.

## Product constraints

- Core workflows work offline and require no account.
- The app must not request device location permission; household city/country are entered manually.
- Scheduling is independent of journaling: completing planner work updates schedule state and records the relevant care event, but standalone journal edits do not silently change schedules.
- Unsupported genera must not receive invented or guessed care guidance.
- Planner tasks and notification projections are derived, not persisted as independent sources of truth.

## Deferred and on-ice scope

The approved MVP specification explicitly defers accounts, sync, multi-device workflows, backup/export, device location permission, unknown-genus reporting, and scheduled workflows beyond watering/fertilizing.

Climate-aware guidance and seasonal adaptive schedules are on ice: domain support may exist, but those features remain hidden from the MVP UI until an explicit product decision changes scope.

## Source of truth

This page summarizes but does not supersede the [approved MVP product specification](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/specs/2026-09-14-plant-care-mvp-design.md). Changes to scope or acceptance criteria must be made there through a pull request.
