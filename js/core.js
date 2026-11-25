/*
 * Mini Smart Parking Guide — core algorithms.
 * Pure, dependency-free functions shared by the website and the Node test suite.
 *
 *   1. Search   (week 2): BFS shortest path + DFS / A* traces for comparison
 *   2. Bayes    (week 6): sensor-reading posterior update
 *   3. MDP      (week 5): finite belief-state MDP solved with Value Iteration
 */
(function (root) {
  'use strict';

  const DEFAULT_GRID = [
    ['S', '.', '.', '.', 'P'],
    ['.', '#', '#', '.', '.'],
    ['.', '.', '.', '.', 'P'],
    ['.', '.', '#', '#', '.'],
    ['.', '.', '.', '.', 'P'],
  ];
  const SPOTS = [[0, 4], [2, 4], [4, 4]];
  const START = [0, 0];
  const CONFIG = {
    sensitivity: 0.9,      // P(alert | occupied)
    falsePositive: 0.2,    // P(alert | free)
    discount: 0.95,
    successReward: 30,
    failureReward: -20,
    stepCost: 0.5,
    checkCost: 1,
    skipCost: 0.5,
    bins: 100,             // beliefs are rounded to 1% for planning
    tolerance: 1e-9,
    maxIterations: 1000,
  };
  const ACTIONS = ['Drive', 'Check', 'Skip', 'Exit'];
  const DIRECTIONS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const key = ([r, c]) => r + ',' + c;

  /* ------------------------------------------------------------------ */
  /* Bayesian inference                                                  */
  /* ------------------------------------------------------------------ */

  /** Posterior P(occupied | reading) from a prior and a binary sensor reading. */
  function occupancy(prior, alert, sensitivity = CONFIG.sensitivity, falsePositive = CONFIG.falsePositive) {
    if (![prior, sensitivity, falsePositive].every(x => Number.isFinite(x) && x >= 0 && x <= 1)) {
      throw Error('Probabilities must be between 0 and 1.');
    }
    const likelihoodOccupied = alert ? sensitivity : 1 - sensitivity;
    const likelihoodFree = alert ? falsePositive : 1 - falsePositive;
    const evidence = likelihoodOccupied * prior + likelihoodFree * (1 - prior);
    if (evidence === 0) throw Error('This observation has zero probability under the model.');
    return likelihoodOccupied * prior / evidence;
  }

  /** Probability of observing an alert given the current belief. */
  function alertProbability(belief, sensitivity = CONFIG.sensitivity, falsePositive = CONFIG.falsePositive) {
    return sensitivity * belief + falsePositive * (1 - belief);
  }

  /* ------------------------------------------------------------------ */
  /* Grid helpers                                                        */
  /* ------------------------------------------------------------------ */

  function gridSize(grid) {
    const rows = grid.length, cols = (grid[0] && grid[0].length) || 0;
    if (!rows || grid.some(r => r.length !== cols)) throw Error('Map must be rectangular.');
    return { rows, cols };
  }

  function findCells(grid, symbol) {
    const out = [];
    grid.forEach((row, r) => row.forEach((v, c) => { if (v === symbol) out.push([r, c]); }));
    return out;
  }

  /** Entrance cell: the first 'S', falling back to the top-left corner. */
  function findStart(grid) {
    return findCells(grid, 'S')[0] || [0, 0];
  }

  /** Parking spaces in a fixed candidate order: nearest to the entrance first (Manhattan), then row-major. */
  function orderSpots(grid, start = findStart(grid)) {
    const manhattan = ([r, c]) => Math.abs(r - start[0]) + Math.abs(c - start[1]);
    return findCells(grid, 'P').sort((a, b) => manhattan(a) - manhattan(b) || a[0] - b[0] || a[1] - b[1]);
  }

  /* ------------------------------------------------------------------ */
  /* Search                                                              */
  /* ------------------------------------------------------------------ */

  /** Breadth-first search on a 4-connected grid. Returns the shortest path (or null). */
  function bfs(grid, start, target, blocked = []) {
    const { rows, cols } = gridSize(grid);
    const inside = ([r, c]) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols;
    const closed = new Set(blocked.map(key));
    if (!inside(start) || !inside(target) || closed.has(key(start)) || closed.has(key(target)) ||
        grid[start[0]][start[1]] === '#' || grid[target[0]][target[1]] === '#') return { path: null, visited: 0 };
    const queue = [start], parent = new Map([[key(start), null]]);
    let head = 0;
    while (head < queue.length) {
      const cell = queue[head++], [r, c] = cell;
      if (key(cell) === key(target)) {
        const path = [];
        let cur = cell;
        while (cur) { path.push(cur); cur = parent.get(key(cur)); }
        return { path: path.reverse(), visited: head };
      }
      for (const [dr, dc] of DIRECTIONS) {
        const next = [r + dr, c + dc], k = key(next);
        if (inside(next) && grid[next[0]][next[1]] !== '#' && !closed.has(k) && !parent.has(k)) {
          parent.set(k, cell);
          queue.push(next);
        }
      }
    }
    return { path: null, visited: head };
  }

  /** BFS distance from the start to every reachable cell (Infinity when unreachable). */
  function distanceMap(grid, start, blocked = []) {
    const { rows, cols } = gridSize(grid);
    const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
    const closed = new Set(blocked.map(key));
    if (grid[start[0]][start[1]] === '#') return dist;
    dist[start[0]][start[1]] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const [r, c] = queue[head];
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#' || closed.has(nr + ',' + nc)) continue;
        if (dist[nr][nc] !== Infinity) continue;
        dist[nr][nc] = dist[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
    return dist;
  }

  /**
   * Step-by-step search trace for visualisation and comparison.
   * algorithm: 'bfs' (FIFO queue), 'dfs' (LIFO stack) or 'astar' (priority g + Manhattan h).
   * Each frame records the expanded cell and a snapshot of the frontier.
   */
  function searchTrace(grid, start, target, blocked = [], algorithm = 'bfs') {
    const { rows, cols } = gridSize(grid);
    const closed = new Set(blocked.map(key));
    const passable = ([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== '#' && !closed.has(r + ',' + c);
    const h = ([r, c]) => Math.abs(r - target[0]) + Math.abs(c - target[1]);
    const frames = [], parent = new Map([[key(start), null]]), g = new Map([[key(start), 0]]), expanded = new Set();
    let frontier = [{ cell: start, f: h(start), order: 0 }], counter = 1;
    const result = { algorithm, frames, path: null, expanded: 0, maxFrontier: 1 };
    if (!passable(start) || !passable(target)) return result;

    while (frontier.length) {
      let item;
      if (algorithm === 'dfs') item = frontier.pop();
      else if (algorithm === 'astar') {
        let best = 0;
        for (let i = 1; i < frontier.length; i++) {
          const a = frontier[i], b = frontier[best];
          if (a.f < b.f || (a.f === b.f && a.order < b.order)) best = i;
        }
        item = frontier.splice(best, 1)[0];
      } else item = frontier.shift();

      const cell = item.cell, k = key(cell);
      if (expanded.has(k)) continue;
      expanded.add(k);
      const added = [];
      if (k !== key(target)) {
        for (const [dr, dc] of DIRECTIONS) {
          const next = [cell[0] + dr, cell[1] + dc], nk = key(next);
          if (!passable(next) || expanded.has(nk)) continue;
          const cost = g.get(k) + 1;
          if (algorithm === 'bfs' && parent.has(nk)) continue;
          if (algorithm === 'astar' && g.has(nk) && g.get(nk) <= cost) continue;
          parent.set(nk, cell);
          g.set(nk, cost);
          frontier.push({ cell: next, f: cost + h(next), order: counter++ });
          added.push(next);
        }
      }
      result.maxFrontier = Math.max(result.maxFrontier, frontier.length);
      // Snapshot of the frontier; for A* it is listed in priority order.
      const snapshot = algorithm === 'astar' ? frontier.slice().sort((a, b) => a.f - b.f || a.order - b.order) : frontier;
      frames.push({ cell, depth: g.get(k), added, frontier: snapshot.map(x => x.cell), priorities: snapshot.map(x => x.f) });
      if (k === key(target)) {
        const path = [];
        let cur = cell;
        while (cur) { path.push(cur); cur = parent.get(key(cur)); }
        result.path = path.reverse();
        break;
      }
    }
    result.expanded = frames.length;
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* MDP + Value Iteration                                               */
  /* ------------------------------------------------------------------ */

  /*
   * Finite belief-state MDP. State (i, b, k):
   *   i — current candidate space, b — rounded occupancy belief b/100, k — recheck budget (0 or 1).
   * Actions: Drive, Check (buy another sensor reading), Skip (move to the next candidate), Exit.
   * Bayes supplies the transition probabilities for a Check. Planning is approximate because
   * beliefs are discretised to (bins + 1) values.
   */
  function solveMDP(probabilities, distances, options = {}) {
    const cfg = { ...CONFIG, ...options }, n = probabilities.length, B = cfg.bins;
    if (n !== distances.length || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw Error('Invalid candidate inputs.');
    if (!(cfg.discount >= 0 && cfg.discount < 1) || !Number.isInteger(B) || B < 1) throw Error('Invalid MDP configuration.');
    const bin = p => Math.min(B, Math.max(0, Math.round(p * B)));
    const index = (i, b, k) => (i * (B + 1) + b) * 2 + k;
    const count = n * (B + 1) * 2;
    let values = new Float64Array(count), iterations = 0, delta = Infinity;
    const history = [];

    function actions(i, b, k, V) {
      const p = b / B;
      const next = i + 1 < n ? V[index(i + 1, bin(probabilities[i + 1]), 1)] : 0;
      const q = { Exit: 0, Skip: -cfg.skipCost + cfg.discount * next };
      // Conservative driving rule: never plan to drive into a likely occupied space.
      if (p < 0.5 && Number.isFinite(distances[i])) {
        q.Drive = -cfg.stepCost * distances[i] + (1 - p) * cfg.successReward + p * (cfg.failureReward + cfg.discount * next);
      }
      if (k > 0 && Number.isFinite(distances[i])) {
        const pa = cfg.sensitivity * p + cfg.falsePositive * (1 - p);
        let expectation = 0;
        if (pa > 0) expectation += pa * V[index(i, bin(occupancy(p, true, cfg.sensitivity, cfg.falsePositive)), k - 1)];
        if (pa < 1) expectation += (1 - pa) * V[index(i, bin(occupancy(p, false, cfg.sensitivity, cfg.falsePositive)), k - 1)];
        q.Check = -cfg.checkCost + cfg.discount * expectation;
      }
      return q;
    }

    // Bellman sweeps until the largest change is below the tolerance.
    while (iterations < cfg.maxIterations && delta > cfg.tolerance) {
      const nextValues = new Float64Array(count);
      delta = 0;
      for (let i = 0; i < n; i++) for (let b = 0; b <= B; b++) for (let k = 0; k <= 1; k++) {
        const id = index(i, b, k);
        nextValues[id] = Math.max(...Object.values(actions(i, b, k, values)));
        delta = Math.max(delta, Math.abs(nextValues[id] - values[id]));
      }
      values = nextValues;
      iterations++;
      history.push(delta);
    }

    function decision(i, p, k = 1) {
      const q = actions(i, bin(p), k, values);
      const action = Object.keys(q).reduce((best, a) => q[a] > q[best] + 1e-10 ? a : best, 'Exit');
      return { action, q, value: values[index(i, bin(p), k)], belief: bin(p) / B };
    }
    const valueAt = (i, b, k) => values[index(i, b, k)];
    return { decision, valueAt, iterations, residual: delta, history, converged: delta <= cfg.tolerance, stateCount: count, config: cfg };
  }

  /**
   * Full planner: BFS route to every candidate (avoiding other likely-occupied spaces),
   * then Value Iteration over the candidate sequence. Returns the first non-Skip decision.
   * options: { spots, start, config }
   */
  function plan(grid, probabilities, budgets, startIndex = 0, options = {}) {
    const spots = options.spots || SPOTS, start = options.start || START;
    budgets = budgets || spots.map(() => 1);
    const routes = spots.map((target, i) => bfs(grid, start, target, spots.filter((s, j) => j !== i && probabilities[j] >= 0.5)));
    const distances = routes.map(r => r.path ? r.path.length - 1 : Infinity);
    const model = solveMDP(probabilities, distances, options.config || {});
    const trace = [];
    for (let i = startIndex; i < spots.length; i++) {
      const d = model.decision(i, probabilities[i], budgets[i]);
      trace.push({ spot: i, ...d });
      if (d.action === 'Skip') continue;
      return { spot: i, ...d, route: d.action === 'Drive' ? routes[i].path : null, routes, distances, model, trace };
    }
    return { spot: -1, action: 'Exit', route: null, routes, distances, model, trace };
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  /** Small seeded PRNG (mulberry32) so experiments are reproducible. */
  function createRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Random parking lot: entrance at the top-left, spaces where every one is reachable. */
  function generateLot(rows, cols, spotCount, wallDensity, rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
      grid[0][0] = 'S';
      const free = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r + c > 2) free.push([r, c]);
      for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
      const spots = free.slice(0, spotCount);
      spots.forEach(([r, c]) => { grid[r][c] = 'P'; });
      free.slice(spotCount).forEach(([r, c]) => { if (rng() < wallDensity) grid[r][c] = '#'; });
      const dist = distanceMap(grid, [0, 0]);
      if (spots.every(([r, c]) => Number.isFinite(dist[r][c]))) return grid;
    }
    return DEFAULT_GRID.map(r => r.slice());
  }

  const api = {
    DEFAULT_GRID, SPOTS, START, CONFIG, ACTIONS,
    occupancy, alertProbability,
    gridSize, findCells, findStart, orderSpots,
    bfs, distanceMap, searchTrace,
    solveMDP, plan,
    createRng, generateLot,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParkingAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
