# Mini Smart Parking Guide — Technical Report

**Interactive planner, algorithm laboratories and Monte Carlo evaluation**  
**Team:** Dilnaz, Aruana, Madina and Alnur  
**Updated:** 25 November 2026

## Abstract

The current application combines BFS search, Bayesian inference and a finite belief-state MDP solved with Value Iteration. It adds a configurable lot planner, step-through algorithm laboratories, a Monte Carlo comparison of three policies and browser-based test results. The checked-in suite reports 32/32 passing checks, 152 safety scenarios, 300 shortest-path comparisons on 100 seeded maps and 24,500 simulated episodes. A separate four-prior Monte Carlo experiment contains 24,000 policy episodes.

## Search

BFS uses a FIFO queue and predecessor map; on a four-connected unit-cost grid it returns a minimum-move path. DFS uses a LIFO stack and is not guaranteed to return a shortest path. A* ranks nodes by g(n)+h(n); Manhattan distance is admissible and consistent for this grid. The Search lab exposes the frontier, expanded cells, path length and step trace for all three methods.

## Bayesian model

Default teaching assumptions: sensitivity P(alert | occupied)=0.90, false-positive rate P(alert | free)=0.20, and prior occupancy 0.40. After an alert, the posterior is 0.90×0.40/(0.90×0.40+0.20×0.60)=75%. After a clear reading it is 0.10×0.40/(0.10×0.40+0.80×0.60)=1/13≈7.7%. These parameters are not calibrated physical sensor measurements.

## Belief-state MDP

State s=(i,b,k): candidate index i; occupancy belief b rounded to 101 values from 0–100%; and recheck budget k in {0,1}. The default lot has 3×101×2=606 states. Actions are Drive, Check, Skip and Exit. Defaults: γ=0.95, parking reward +30, occupied-space penalty −20, driving step cost 0.5, recheck cost 1, skip cost 0.5, 1% belief bins and Bellman tolerance 1e−9. Drive is available only when estimated occupancy is below 50% and a route exists. This is a finite discretised model-based planner, not learned Q-learning or an exact continuous-belief POMDP solver.

## Monte Carlo experiment

Three policies are compared: MDP + Value Iteration (Bayesian beliefs and at most one recheck per candidate), Greedy (trust first reading; no recheck) and Nearest-first (ignore sensors). Experiment settings: default 5×5 lot, seed 42, 2,000 episodes per policy at each prior, priors 20%, 40%, 60%, 80%. Metric: mean discounted return.

| Prior | MDP | Greedy | Nearest-first |
|---:|---:|---:|---:|
| 20% | 25.312 ± 0.163 | 24.568 ± 0.190 | 21.415 ± 0.334 |
| 40% | 21.538 ± 0.291 | 20.784 ± 0.284 | 11.377 ± 0.578 |
| 60% | 14.798 ± 0.360 | 14.417 ± 0.369 | −5.240 ± 0.803 |
| 80% | 6.669 ± 0.261 | 4.972 ± 0.397 | −30.174 ± 0.874 |

The MDP policy has the highest sample mean discounted return in this seeded run at all four priors. No hypothesis test was run, so this is not a statistical-significance claim. At 80% occupancy the MDP exits more conservatively, reducing wrong trips but giving a lower parking success rate than Greedy in this sample. The four-prior comparison has 24,000 episodes; the test summary counts 24,500 because it includes an additional 500 MDP safety episodes.

## Verification and limitations

Test groups: Bayes 7, Search 8, MDP 9, Integration 5, Simulation 3. Total 32 passed, 0 failed. Additional generated-case checks: 152 prior/signal safety scenarios, 100 random maps, 300 shortest-path comparisons, 24,500 total simulated episodes. Synthetic occupancy and sensor readings are used; there is no live sensor feed, calibrated sensor data, field trial or real-world performance claim.
