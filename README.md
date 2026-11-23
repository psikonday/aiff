# Mini Smart Parking Guide

An explainable browser simulation combining **BFS**, **Bayesian inference** and a **finite belief-state MDP solved with Value Iteration**.

Live demo: https://psikonday.github.io/aiff/

Team: Dilnaz, Aruana, Madina and Alnur.

## Run

Open `index.html` in a browser, or run `python3 -m http.server 8000` and visit http://localhost:8000. No build or package installation is required.

## Test

Run `node tests/run.js` (Node.js required). Results are written to `docs/test-results.json`.

## Structure

- `index.html`: interface and styles
- `js/core.js`: pure AI algorithms shared with tests
- `js/app.js`: interaction, route preview and scenario export
- `tests/run.js`: analytical, property and integration tests
- `docs/`: report, slides, demo, declarations and defense guide

## Course alignment

| Topic | Course week | Implementation |
| --- | --- | --- |
| Uninformed search | 2 | BFS with a queue and predecessor map |
| Probability and Bayesian inference | 6 | Sensor likelihoods and repeated posterior update |
| MDP and Value Iteration | 5 | 606 planning states, transition probabilities, rewards and Bellman sweeps |

## Results

20 automated tests pass, including 152 prior/signal scenarios and 300 shortest-path comparisons on 100 seeded maps. See the generated JSON for the named tests. No field data or real-world performance claim is made.

## Model assumptions

Sensor sensitivity 0.90 and false-positive rate 0.20 are teaching assumptions. A repeated reading is conditionally independent given fixed occupancy. MDP beliefs are rounded to 1%; each candidate has one recheck. The policy uses a fixed candidate order and entrance-based distances. This is model-based planning, not learned Q-learning or an exact continuous-belief POMDP solver. Spaces with probability at or above 0.50 are not allowed as driving destinations or transit cells.

## Deliverables

- [Technical report](docs/technical-report.pdf)
- [Seven-slide presentation](docs/presentation.html)
- [Demo video](docs/demo.html): 2:30 captioned screenshot walkthrough, no audio
- [Editable presentation](https://chatgpt.com/space/page_394ea81321848191843807b2c2b988c5)
- [AI usage and team contribution statements](docs/declarations.pdf)
- [Defense guide](docs/defense-guide.pdf)

Substantial ChatGPT assistance is documented in the declarations. The assigned areas of responsibility describe final review and defense, not individual authorship percentages.
