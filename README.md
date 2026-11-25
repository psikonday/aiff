# Mini Smart Parking Guide

An interactive, explainable parking guide that combines **BFS search**, **Bayesian inference** and a **finite belief-state MDP solved with Value Iteration** — with a lab for each algorithm and a Monte Carlo evaluation of the resulting policy.

Live demo: https://psikonday.github.io/aiff/

Team: Alnur, Aruana, Madina and Dilnaz.

## Run

Open `index.html` in a browser, or run `python3 -m http.server 8000` and visit http://localhost:8000. No build step and no dependencies.

## Test

Run `npm test` (or `node tests/run.js`; Node.js 18+). Results are written to `docs/test-results.json`. The same test file also runs in the browser — open the **Results** section of the site.

## What the site does

| Section | What you can do |
| --- | --- |
| **Planner** | Draw your own lot (obstacles, up to 6 spaces, entrance) on a 5×5 to 11×11 grid, flip sensor readings, change the prior, and see the recommended action with its expected values. Animated drive preview, autopilot, distance heat map, undo, shareable links and JSON import/export. |
| **Search lab** | Step through BFS, DFS and A* on the same map; watch the queue / stack / priority queue and compare expanded cells and path lengths. |
| **Bayes lab** | Natural-frequency picture of Bayes' rule, live formula, and a chart of repeated readings. Sensor settings are shared with the planner. |
| **Value iteration lab** | Tune discount and rewards; see the optimal policy for every belief, the value function, a replay of each Bellman sweep and the convergence of the residual. |
| **Simulation lab** | Monte Carlo comparison of the MDP policy against "trust the first reading" and "ignore the sensors" drivers, a sweep over occupancy rates, and an animated single episode with the hidden truth revealed. |
| **Results** | Runs the full test suite in the browser. |
| **Defense mode** | A timer for the 4-part defense (problem, demo, three topics, Q&A) that jumps to the matching section. |

Light/dark theme, keyboard shortcuts (`?`), responsive layout, reduced-motion support.

## Structure

- `index.html` — page structure
- `css/style.css` — styles (light and dark themes)
- `js/core.js` — pure AI algorithms shared with the tests (BFS, search traces, Bayes, MDP + Value Iteration, lot generator)
- `js/sim.js` — Monte Carlo simulation of episodes and policy comparison
- `js/ui/` — interface modules: `shared.js`, `planner.js`, `lab-search.js`, `lab-bayes.js`, `lab-mdp.js`, `lab-sim.js`, `extras.js`
- `tests/spec.js` — test definitions (Node and browser); `tests/run.js` — Node runner
- `docs/` — report, presentation, video, test results and the two statements

## Course alignment

| Topic | Course week | Implementation |
| --- | --- | --- |
| Uninformed search | 2 | BFS with a queue and predecessor map; DFS and A* traces for comparison |
| MDP and Value Iteration | 5 | Belief-state MDP (606 states on the default lot), transition probabilities from Bayes, rewards, Bellman sweeps to a 1e-9 tolerance |
| Probability and Bayesian inference | 6 | Sensor likelihoods and repeated posterior updates |

## Results

32 automated checks pass (32/32), covering analytical Bayes results, 152 prior/signal safety scenarios, 300 shortest-path comparisons against an independent oracle on 100 seeded maps, Bellman fixed-point and monotonicity checks, random-lot safety checks and 24,500 simulated episodes in the test summary. The separate Monte Carlo policy comparison uses seed 42 and 2,000 episodes per policy at each of four occupancy priors (24,000 episodes total). The MDP policy has the highest sample mean discounted return at all four priors in this seeded run; no hypothesis test or statistical-significance claim is made. See `docs/test-results.json` and section 9 of the technical report. No field data or real-world performance claim is made.

## Model assumptions

Sensor sensitivity 0.90 and false-positive rate 0.20 are teaching assumptions. A repeated reading is conditionally independent given fixed occupancy. MDP beliefs are rounded to 1%; each candidate has one recheck. Spaces are considered in a fixed order (nearest to the entrance by Manhattan distance first) and distances are measured from the entrance. This is model-based planning, not learned Q-learning or an exact continuous-belief POMDP solver. Spaces with probability at or above 0.50 are not allowed as driving destinations or transit cells.

## Submission checklist

Everything the assignment asks for, in one place:

| Required deliverable | Where |
| --- | --- |
| Working application and live demo | https://psikonday.github.io/aiff/ (or open `index.html` locally) |
| GitHub repository | https://github.com/psikonday/aiff |
| Technical report | [docs/technical-report.pdf](docs/technical-report.pdf) |
| 5–7 slide presentation | [docs/presentation.pptx](docs/presentation.pptx) (7 slides) |
| 2–3 minute demo video | [docs/demo.mp4](docs/demo.mp4) (2:14, captioned screen recording) |
| AI Usage Declaration | [docs/ai-usage-declaration.pdf](docs/ai-usage-declaration.pdf) |
| Team Contribution Statement | [docs/team-contributions.pdf](docs/team-contributions.pdf) |
| Test results | [docs/test-results.json](docs/test-results.json) (32/32, regenerated by `npm test`) |

The two statements have signature lines; each member signs after reviewing them.
