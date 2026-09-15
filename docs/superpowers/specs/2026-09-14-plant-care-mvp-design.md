# Plant Care MVP Product Specification

Date: 2026-09-14
Status: Approved for implementation planning

## Product Goal

Plant Care is a local-first personal plant-management tool for beginners, hobbyists, and collectors. Its primary daily experience is a focused view of plants needing attention, while its journal supports users who only want to record care.

The MVP works offline, requires no account, and keeps scheduling independent from journaling.

## MVP Scope

### Included

- Onboarding for care knowledge, commitment level, and one household location entered as city and country.
- Species-first plant search with genus-level fallback.
- Progressive plant setup with name, recognized genus/species, photo, and care schedule.
- Optional plant details: pot size, soil type, light level, purchase date, and notes.
- Custom plant groups or tags.
- A daily planner for watering and fertilizing.
- Overdue tasks shown separately from tasks due today.
- One-tap completion, postponement, and optional feedback.
- Optional watering observations: dry, slightly moist, or wet soil; healthy, wilted, or stressed plant condition.
- Configurable reminders, including an optional daily summary notification.
- Independent journaling for watering, fertilizing, repotting, and propagation.
- Editing and deletion of journal entries.
- Archived plant memorials with restoration and permanent deletion.
- Seasonal learned schedule adjustments per plant and care type.

### Deferred

- Accounts, sync, multi-device synchronization, backup, and export.
- Device location permission and multi-location households.
- Unknown-genus plants and missing-species reporting.
- Repotting, propagation, pruning, pest checks, and other scheduled workflows.
- Standalone notes, event notes, photos beyond the plant profile, and richer observations.
- Adjustment history, undo, recovery, advanced manual interval editing, and internal model history.

## Users and Preferences

Onboarding asks for:

- Plant-care knowledge level.
- Commitment level.
- Household city and country.

Knowledge and commitment preferences change guidance depth and setup complexity, not feature access. The user can change both preferences later.

The app derives a normalized internal climate classification from the manually entered household location. The mapping from city and country to that classification is implementation-specific, but must be deterministic for the same input. The knowledge base consumes the normalized classification rather than a provider-specific zone format. The app must not request device location permission.

## Plant Identification and Setup

The user searches by species first. If the species is unavailable, the app may offer genus-level guidance and must clearly identify that the guidance is genus-level. A plant without a recognized genus is unsupported by the initial knowledge base and cannot be scheduled in the MVP.

Initial plant data consists of:

- Display name.
- Recognized species or genus.
- Taxonomic level: `SPECIES` for a species match or `GENUS` for genus-level fallback guidance.
- Optional photo.
- Schedule configuration.

Optional profile details may be added later. Plants can belong to custom groups or tags.

When schedules are enabled for a new plant, the user must enter a last watering date and, when the selected knowledge-base entry includes fertilization, a last fertilizing date. Each date may be today or any date in the past. Future dates are rejected. If the user is unsure, they estimate a date; there is no unknown-date or confidence workflow in the MVP.

The initial schedule is calculated from the entered dates, knowledge-base defaults, and current climate and season.

## Daily Planner

The planner is a projection of plant configuration, knowledge defaults, schedule state, the current climate, season, and date. It shows only plants with work due today or overdue.

Tasks are grouped primarily by activity:

- Watering.
- Fertilizing.

Overdue tasks are displayed separately from tasks due today. Plants with no task due remain available in the collection but do not appear in the daily planner.

Tasks are date-based. Individual task times are not required. A reminder may have an optional preferred time, and the normal default use case is one optional daily summary notification.

Postponement offers 1, 2, 3, and 7 days, plus a custom number of days. The requested postponement cannot exceed the current effective interval for that care type. A custom value above that maximum is rejected or clamped by the interface.

### Fertilizer Rules

Liquid fertilizer is coupled to watering. When liquid fertilizer is due, it replaces the watering task rather than creating a second task. Completing that combined planner task records separate watering and fertilizing care events.

Long-term fertilizers such as sticks or granules are independent recurring tasks with renewal intervals.

Knowledge guidance may provide suitable fertilizer modes, default cadence, and seasonal limits.

## Adaptive Scheduling

Knowledge-base schedules provide the starting point. Each plant learns independently, even when plants share a species or genus.

Each knowledge-base entry defines its applicable seasonal model. A plant may use:

- A `growing/dormant` model with separate intervals and learned adjustments for the two seasons.
- A `year-round` model with one interval and one learned adjustment that remains active throughout the year.

The knowledge base determines which model applies to a species or genus and, for a growing/dormant model, determines the current season from the plant guidance and household climate. The planner does not infer seasons from user feedback. Plants with no meaningful dormancy use the year-round model.

The schedule state represents a deviation from the knowledge-base interval, not an independently authored interval. For each plant and care type, the MVP stores:

- `baseInterval`: the knowledge-base interval for the current climate and season.
- A plant-specific learned adjustment for each season, initially zero days.
- `effectiveInterval`: `max(1 day, baseInterval + activeSeasonAdjustment)`.
- `lastCompletedDate`.
- `nextDueDate`.
- A concise adjustment reason suitable for user-facing explanations.

The initial next due date is calculated as `lastCompletedDate + effectiveInterval`. The knowledge-base interval is never modified by user feedback. Learned adjustments have no upper bound, but the effective interval can never be shorter than one day.

Growing and dormant seasons maintain independent learned adjustments. When the season changes, the planner selects the new season's knowledge-base interval and learned adjustment; it does not carry the previous season's adjustment into the new season. Feedback changes only the adjustment for the active season. Returning to a previous season restores its prior adjustment.

Planner actions update schedule state but do not replace or rewrite journal history:

- Ordinary completion preserves `learnedAdjustment`.
- Feedback that care was needed later increases `learnedAdjustment` by one day.
- Feedback that care was needed earlier decreases `learnedAdjustment` by one day, subject to the one-day minimum effective interval.
- Postponing because conditions indicate the schedule was early shifts the next due date by the chosen number of days and increases the active seasonal or year-round `learnedAdjustment` by that same number of days. The chosen number may not exceed the effective interval before postponement. A maximum-length postponement has no special treatment: it shifts the occurrence by one full interval and produces a doubled effective interval for the subsequent recommendation.
- Resetting to knowledge-base defaults sets all applicable seasonal or year-round learned adjustments to zero.

After care is completed, the next due date is calculated from the completion date and the resulting effective interval. Postponing alone does not create a care event.

If soil is still wet, postponing the watering task affects future watering recommendations for that plant and care type. The app should explain adaptations with short reasons, such as a postponement-based adjustment, without exposing a detailed model history. Guidance and planner explanations must preserve the plant's taxonomic level and must not present genus-level guidance as species-specific.

When the household location changes, the app recalculates open and future tasks and asks the user to choose one of two options:

1. Reset to knowledge-base defaults using the new climate.
2. Continue with the current internal learned state.

Completed history remains unchanged in both cases.

Location changes recalculate each open or future task from the plant's last completed care date. The new climate supplies the new knowledge-base interval; a reset selects zero learned adjustment, while preserving learned state retains the applicable seasonal or year-round adjustment. A previously postponed due date is not preserved as an independent anchor, and a task may become due sooner or later after recalculation.

## Journaling

Journaling is independent from scheduling. A plant may remain in the collection with schedules disabled and still accept journal entries.

The MVP records these care event types:

- Watering.
- Fertilizing.
- Repotting.
- Propagation.

Care events default to today but may use any date in the past. Future event dates are rejected. Multiple events may occur on the same date; they are stored separately and grouped visually by date.

Journal entries can be edited and deleted. No internal version history or undo is required.

Completing a planner task means the corresponding care was performed. It records the applicable care event or events and advances schedule state from the actual completion date. Postponing a task alone does not create a care event.

## Archiving and Deletion

Removing a plant asks whether to delete it or archive it.

Archiving is intended for plants that died or left the collection. An archived plant:

- Preserves its memorial history.
- Is read-only.
- Accepts no new events.
- Does not appear in active care or the daily planner.
- Clears learned schedule adjustments.

A restored plant is treated as newly added for scheduling: its history remains available, but schedules are disabled until explicitly re-enabled. Re-enabling scheduling requires fresh applicable last-care dates.

Permanent deletion is available from the archive after confirmation and removes the plant and its journal history.

## Domain Boundaries

The local domain should distinguish these records or responsibilities:

- Preferences and household location.
- Normalized household climate classification.
- Plant identity and profile.
- Care configuration.
- Knowledge-base defaults.
- Per-plant, per-care-type schedule state.
- Derived planner tasks.
- Care events.
- Archive state.

Care configuration represents user-owned intent. It includes whether scheduling is enabled, which care types are enabled, fertilizer mode, and reminder preferences.

Schedule state represents system-owned adaptive state. It includes the applicable knowledge-base interval, seasonal or year-round learned adjustment, active season when applicable, last completed care date, next due date, and concise adjustment reason.

Planner tasks are derived actionable items, not journal records. They have no independent persistence requirement and are regenerated from current plant configuration, knowledge defaults, schedule state, climate, season, and date. Notifications are also projections of current planner state and may be regenerated whenever reminder preferences, reminder time, location, schedule state, or task state changes. Care events are independently queryable by plant and date.

## Domain Rules and Invariants

- A plant has at most one active watering schedule.
- A plant has at most one active fertilizer schedule per fertilizer mode.
- Archived plants cannot have active schedules or receive new events.
- Completing a task means the corresponding care was performed, records care history, and advances schedule state.
- Postponement never creates a journal event.
- Standalone journal events never modify schedule state.
- Editing or deleting journal events never silently changes schedule state.
- Derived planner tasks and notifications are not independent sources of truth.
- Liquid-fertilizer completion records separate watering and fertilizing events.
- Re-enabling scheduling after restoration requires fresh applicable last-care dates.

## Offline and Failure Behavior

Core reads and writes work offline using local storage. Reminder registration failure must not block plant creation, task completion, postponement, or journal logging. Notification registration or regeneration failure must not block local domain updates.

Invalid future dates are rejected at entry with a clear correction path. Missing species data must not silently imply species-specific guidance.

Archived plants must be excluded from active planner queries and must reject new events. Destructive deletion requires confirmation.

For the same plant state, knowledge defaults, climate, season, and date, planner calculation should be deterministic.

## Acceptance Criteria

### Onboarding and profiles

- Preferences and household location can be entered and later changed.
- A species match uses species guidance; a fallback uses clearly labeled genus guidance.
- A scheduled plant cannot be created without a last watering date or, when fertilization applies, its last fertilizing date.
- Today and past dates are accepted; future dates are rejected.

### Planner and adaptation

- Due and overdue tasks appear in the correct sections.
- Plants without due work remain hidden from the planner but visible in the collection.
- Completion, postponement, and optional feedback update the correct plant schedule state.
- Liquid fertilizer replaces watering rather than adding a duplicate task.
- Long-term fertilizer produces an independent recurring task.
- Seasonal state and location reset/preserve choices produce deterministic results.

### Journal and archive

- Schedule-disabled plants can receive journal events.
- Multiple same-day events remain distinct and are grouped by date.
- Past events can be edited and deleted.
- Archived plants preserve read-only history and cannot receive new events.
- Restoring a plant leaves schedules disabled until re-enabled.
- Permanent deletion removes journal history only after confirmation.

### Local-first behavior

- Core plant, planner, and journal workflows function without network access.
- Reminder failures do not prevent core data changes.

## Out of Scope for This Specification

This document intentionally does not choose a UI visual language, navigation implementation, storage library, notification library, or exact adaptive-schedule formula. Those decisions belong in the implementation plan after this product specification is approved.

## Implementation Risk Boundary

The highest-risk MVP subsystem is the interaction between adaptive scheduling, knowledge-base climate mapping, and seasonal behavior. Implementation planning should isolate and test this subsystem before broad UI work. It remains in MVP scope; this section identifies sequencing risk rather than deferring functionality.
