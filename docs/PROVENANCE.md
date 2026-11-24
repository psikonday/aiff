# Project provenance record

**Project:** Mini Smart Parking Guide  
**Repository:** https://github.com/psikonday/aiff  
**Live demo:** https://psikonday.github.io/aiff/  
**Record created:** 2026-11-24

## Project identity and scope

The repository README describes the project as an explainable browser simulation combining:

- Breadth-first search (BFS)
- Bayesian inference
- A finite belief-state Markov decision process (MDP) solved with Value Iteration

The README maps the implementation to the course topics of uninformed search, Bayesian inference, and MDP/Value Iteration.

## Team and disclosure

The README identifies Dilnaz, Aruana, Madina, and Alnur as the project team. See [AUTHORS.md](../AUTHORS.md) for the scope and limits of that attribution.

The repository README states that substantial ChatGPT assistance is documented in:

- `docs/ai-usage-declaration.pdf`
- `docs/team-contributions.pdf`

The README also clarifies that the assigned areas of responsibility describe final review and defense, not individual authorship percentages. This record preserves that distinction and does not invent a more detailed division of work.

## Repository structure recorded in the README

| Path | Purpose stated in README |
| --- | --- |
| `index.html` | Interface and styles |
| `js/core.js` | Pure AI algorithms shared with tests |
| `js/app.js` | Interaction, route preview, and scenario export |
| `tests/run.js` | Analytical, property, and integration tests |
| `docs/` | Report, presentation, video, and statements |

## Technical claims recorded in the README

The README reports 20 automated tests, including 152 prior/signal scenarios and 300 shortest-path comparisons on 100 seeded maps. It explicitly states that no field data or real-world performance claim is made.

The README documents teaching assumptions, including sensor sensitivity 0.90, false-positive rate 0.20, conditional independence for repeated readings given fixed occupancy, belief rounding to 1%, one recheck per candidate, and fixed candidate ordering. It also clarifies that the planner is model-based and is not learned Q-learning or an exact continuous-belief POMDP solver.

These are project statements reproduced from the README, not an independent audit or a claim that the system has been validated in a real parking environment.

## Baseline Git history observed before this record

The repository's default branch was `main`. The latest commit visible when this record was prepared was:

- `bcb34347d53ab806db7c4f75135e152748f79ca7` — “Clean up duplicate project files” (2026-11-23)

Other visible milestones in the recent history included:

- `b060630a247427ed65352374b6db058470bc8fbc` — “Add Mini Smart Parking Guide website” (2026-11-12)
- `8dcef5faa9f50f2c8bbdf9deb126161af1021b22` — “Update index.html” (2026-11-12)
- `c25cd380c3eef6f5402d91e3a876490ba29849da` — “Add parking logic, tests and project docs” (2026-11-23)
- `02c562d4586e3ede9fc40fff129f20cceaaa92d8` — “Add the demo video and finish the docs” (2026-11-23)
- `5e503e65e4087f6e116e657971b00631d0481c33` — “Update the presentation” (2026-11-23)

This is a snapshot of the history visible at the time, not a complete export of all Git objects. Commit history is useful corroborating evidence, but by itself it does not conclusively establish a person's legal authorship or prove that a particular person controlled an account.

## Recommended evidence to preserve

1. Keep the original Git history. Do not rewrite, fabricate, backdate, or squash away meaningful development history for the purpose of making authorship appear stronger.
2. Preserve a local clone and a dated archive of the submitted version, including the report, slides, demo video, AI declaration, and team contribution statement.
3. Record the exact commit SHA used for submission and retain the submission receipt or timestamp from the course platform.
4. Keep original drafts, design notes, test outputs, meeting records, and correspondence that genuinely show how the work developed.
5. Ask each team member to retain their own authentic contribution evidence and confirm any future detailed attribution before it is published.
6. Keep the AI usage declaration accurate and consistent with the actual assistance received.

A Git commit, public timestamp, or this document is supporting evidence, not a guarantee of legal priority or a substitute for original records and the team's own testimony.
