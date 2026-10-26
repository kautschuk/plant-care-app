# Plant Care App

Plant Care is a local-first personal plant-management app for beginners, hobbyists, and collectors. Its core experience is a focused daily view of plants needing attention, with a separate journal for recording care.

## Start here

- [[Product Overview]] — MVP goals, included capabilities, and explicit boundaries
- [[Architecture Overview]] — domain boundaries and key technical contracts
- [[Development Workflow]] — how to work safely in the repository
- [[Source Documents]] — canonical specifications and implementation plans

## Project principles

- **Local-first and offline:** core workflows do not require an account or network access.
- **Deterministic domain logic:** scheduling and knowledge resolution are explicit-input functions, independent of UI and storage.
- **One source of truth:** approved specifications stay in the repository; the Wiki explains and navigates them rather than replacing them.
- **No silent scope expansion:** deferred or on-ice capabilities need an explicit product decision.

## Documentation ownership

The Wiki is the maintained, human-readable reference. Approved product and technical specifications remain canonical in the [repository](https://github.com/kautschuk/plant-care-app/tree/main/docs/superpowers/specs). Implementation plans remain in the repository as execution records. If a Wiki summary conflicts with a canonical specification, follow the specification and update the Wiki summary.
