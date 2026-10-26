# Documentation Index

## Canonical documents

These files are maintained in the repository and should be changed through normal pull requests alongside the implementation they govern.

| Topic | Canonical document | Purpose |
| --- | --- | --- |
| Product scope and MVP acceptance criteria | [Plant Care MVP specification](superpowers/specs/2026-09-14-plant-care-mvp-design.md) | Approved product scope, domain rules, failure behavior, and acceptance criteria |
| Plant knowledge and climate resolution | [Knowledge and climate design](superpowers/specs/2026-09-16-knowledge-climate-design.md) | Offline deterministic climate classification and species-first/genus-fallback lookup |
| Local persistence | [Local persistence design](superpowers/specs/2026-10-08-local-persistence-design.md) | SQLite persistence boundaries, repository contracts, and transactional invariants |
| Project workflow | [Project tracking](project-management.md) | Source-of-truth rules and GitHub issue/PR conventions |

## Implementation plans

Plans under [superpowers/plans/](superpowers/plans/) record the implementation sequence and decisions for individual work slices. They are not the product specification and their checkboxes are not proof that the current code meets acceptance criteria.

- [Scheduling engine](superpowers/plans/2026-09-14-plant-care-scheduling-engine.md)
- [Knowledge base and climate](superpowers/plans/2026-09-16-knowledge-climate.md)
- [Daily planner behavior](superpowers/plans/2026-10-08-planner-behavior.md)
- [Local persistence](superpowers/plans/2026-10-08-local-persistence.md)
- [Searchable plant taxonomy selectors](superpowers/plans/2026-10-09-searchable-plant-taxonomy-selectors.md)

## GitHub Wiki

The [GitHub Wiki](https://github.com/kautschuk/plant-care-app/wiki) is the human-readable documentation portal. Use it for orientation and workflow guidance:

- [Home](https://github.com/kautschuk/plant-care-app/wiki)
- [Product Overview](https://github.com/kautschuk/plant-care-app/wiki/Product-Overview)
- [Architecture Overview](https://github.com/kautschuk/plant-care-app/wiki/Architecture-Overview)
- [Development Workflow](https://github.com/kautschuk/plant-care-app/wiki/Development-Workflow)
- [Source Documents](https://github.com/kautschuk/plant-care-app/wiki/Source-Documents)

The repository remains authoritative for approved specifications and implementation plans. Update those files through pull requests alongside the implementation they govern; keep Wiki pages concise and link back to canonical repository documents rather than duplicating their full requirements.

## Maintenance rules

1. Keep one authoritative source for each requirement or technical contract.
2. Product scope belongs in the MVP specification; subsystem behavior belongs in the relevant approved design.
3. Implementation plans are execution history. Verify code, tests, and merged changes before treating a plan as complete.
4. Update documentation in the same change as the behavior it describes.
5. Deferred and on-ice capabilities require an explicit product-scope decision before implementation.
