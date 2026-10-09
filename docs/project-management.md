# Plant Care App — Project Tracking

This document configures the intended GitHub workflow. It does not supersede product or technical source documents.

## Source of truth

1. Product scope: [Approved Plant Care MVP specification](superpowers/specs/2026-09-14-plant-care-mvp-design.md).
2. Technical behavior: the relevant approved design/specification under `docs/superpowers/specs/`.
3. Implementation sequence: the relevant plan under `docs/superpowers/plans/`; its task checkboxes are execution tracking, not a replacement for checking the current code and tests.
4. GitHub issues track actionable work and decisions. Do not duplicate a whole implementation plan as a set of issues unless the tasks are independently actionable.

Do not add accounts, sync, backup/export, location permission, scheduled non-watering/fertilizing workflows, or other deferred/on-ice features without an explicit product-scope decision.

## GitHub Project

**Suggested project name:** Plant Care App — MVP

**Board status field:**
- Backlog — valid work, not yet ready.
- Ready — source, acceptance criteria, and dependencies are clear.
- In Progress — actively being implemented.
- In Review — awaiting review, test evidence, or a decision.
- Done — acceptance criteria met and work merged/verified.

Keep this board focused on active delivery. Use repository issues as the durable record; link an issue to its source plan and mark plan checkboxes only when the corresponding work is verified.

## Labels

Create these repository labels. Keep labels categorical; use a separate priority field or prefix if the Project supports it.

| Label | Meaning |
| --- | --- |
| `type: feature` | User-visible capability within approved scope |
| `type: bug` | Incorrect behavior or regression |
| `type: task` | Implementation, test, or maintenance task |
| `type: research` | Unresolved question requiring evidence or a decision |
| `type: tech-debt` | Internal improvement with no immediate user-facing behavior |
| `area: scheduling` | Scheduling engine, intervals, seasonality, or planner projection |
| `area: persistence` | Domain persistence, SQLite, migrations, or repositories |
| `area: journal` | Care-event history and journal operations |
| `area: plant-catalog` | Species/genus knowledge data and lookup |
| `area: notifications` | Reminders and notification behavior |
| `priority: P0` | Blocks core use, data integrity, or release |
| `priority: P1` | Required for the next coherent MVP milestone |
| `priority: P2` | Useful, but can follow the core path |
| `priority: P3` | Low urgency; defer unless capacity permits |

Apply labels only when justified; do not assign priority based on issue order alone.

## Milestones

Create milestones only after reconciling existing open work and verified implementation state:

1. **MVP foundation** — approved core product behavior and app structure are coherent.
2. **Reliable local data** — local persistence, migrations, and journal/schedule consistency are verified.
3. **Daily care workflow** — plant setup, planner, completion/postponement, and journal paths work end-to-end.
4. **MVP hardening** — reminders, archive/restore, regressions, and release checks are verified.

These are outcome-oriented groupings, not a claim that the work is currently incomplete. Before assigning issues, inspect the current branch, tests, merged PRs, and checkboxes in the relevant plans. Do not create duplicate issues for already implemented tasks.

## Issue quality

Every implementation issue should contain:
- Desired outcome.
- Link to the authorizing specification/plan or confirmed bug evidence.
- Testable acceptance criteria.
- Relevant constraints and dependencies.
- A verification strategy.

Prefer small, independently reviewable issues. For work already represented as detailed checkbox steps in a superpowers plan, continue using that plan unless tracking across multiple PRs or contributors warrants separate issues.

## Pull requests

- Link the issue when one exists.
- State the behavior changed and the verification run.
- Keep implementation aligned with the approved spec and plan.
- Avoid changing unrelated behavior or silently expanding MVP scope.
