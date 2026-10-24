# Development Workflow

## Before changing behavior

1. Identify the approved product or subsystem specification that owns the behavior.
2. Check related implementation plans, open issues, and current code/tests. Treat plan checkboxes as historical tracking, not proof of completion.
3. Keep changes scoped to the issue and preserve domain boundaries.
4. Update tests and documentation with the implementation.

## Source-of-truth rules

- Product scope and acceptance criteria: [MVP specification](https://github.com/kautschuk/plant-care-app/blob/main/docs/superpowers/specs/2026-09-14-plant-care-mvp-design.md).
- Technical contracts: the relevant approved design under [docs/superpowers/specs/](https://github.com/kautschuk/plant-care-app/tree/main/docs/superpowers/specs).
- Implementation sequence: the relevant plan under [docs/superpowers/plans/](https://github.com/kautschuk/plant-care-app/tree/main/docs/superpowers/plans).
- Actionable work and decisions: GitHub issues and pull requests.

## Planning and review

- Issues should represent independently actionable work, with clear acceptance criteria and dependencies.
- Do not split a complete implementation plan into issues unless the tasks are independently actionable.
- Keep implementation plans as records of execution; only mark steps complete when verified against the code/tests.
- Update the relevant spec when a product or technical decision changes; do not leave the Wiki as the only record of a decision.
- Changes to deferred/on-ice capabilities require an explicit scope decision.

## Exact setup and commands

This page deliberately does not duplicate volatile package versions or test commands. Follow the repository's current AGENTS.md, package.json scripts, and CI workflows for exact setup, lint, typecheck, test, and build commands.
