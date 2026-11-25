/*
 * Test specification shared by Node (tests/run.js) and the browser ("Run the tests" on the site).
 * Uses a tiny built-in assertion helper so it has no dependencies.
 */
(function (root) {
  'use strict';

  const assert = {
    ok(value, message) { if (!value) throw Error(message || 'Expected a truthy value.'); },
    equal(a, b, message) { if (a !== b) throw Error(message || `${a} !== ${b}`); },
    notEqual(a, b, message) { if (a === b) throw Error(message || `${a} === ${b}`); },
    sameCell(a, b) { return a[0] === b[0] && a[1] === b[1]; },
    throws(fn) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) throw Error('Expected an error.'); },
    near(a, b, eps = 1e-8) { if (!(Math.abs(a - b) < eps)) throw Error(`${a} != ${b}`); },
    fail(message) { throw Error(message); },
  };

  function defineTests(AI, Sim) {
    const tests = [];
    const stats = { safetyScenarios: 0, randomMaps: 0, shortestPathComparisons: 0, simulatedEpisodes: 0 };
    const test = (group, name, fn) => tests.push({ group, name, fn });
    const near = assert.near;

    /* ---------- Bayesian inference ---------- */
    test('Bayes', 'Bayes: alert posterior equals 0.75', () => near(AI.occupancy(0.4, true), 0.75));
    test('Bayes', 'Bayes: clear posterior equals 1/13', () => near(AI.occupancy(0.4, false), 1 / 13));
    test('Bayes', 'Bayes: repeated alerts yield 27/29', () => near(AI.occupancy(0.75, true), 27 / 29));
    test('Bayes', 'Bayes: contradictory second reading yields 3/11', () => near(AI.occupancy(0.75, false), 3 / 11));
    test('Bayes', 'Bayes: endpoints and invalid observations', () => {
      near(AI.occupancy(0, true), 0);
      near(AI.occupancy(1, false), 1);
      assert.throws(() => AI.occupancy(-0.1, true));
      assert.throws(() => AI.occupancy(0.4, true, 0, 0));
    });
    test('Bayes', 'Bayes: posterior is order-independent for two readings', () => {
      const ab = AI.occupancy(AI.occupancy(0.4, true), false), ba = AI.occupancy(AI.occupancy(0.4, false), true);
      near(ab, ba);
    });
    test('Bayes', 'Bayes: law of total probability holds for the predicted reading', () => {
      for (let p = 0; p <= 1; p += 0.05) {
        const pa = AI.alertProbability(p);
        const back = pa * AI.occupancy(p, true) + (1 - pa) * AI.occupancy(p, false);
        near(back, p);
      }
    });

    /* ---------- Search ---------- */
    test('Search', 'BFS: start equals target', () => assert.equal(AI.bfs(AI.DEFAULT_GRID, [0, 0], [0, 0]).path.length, 1));
    test('Search', 'BFS: avoids flagged A and reaches B in six moves', () => {
      const p = AI.bfs(AI.DEFAULT_GRID, [0, 0], [2, 4], [[0, 4]]).path;
      assert.equal(p.length - 1, 6);
      assert.ok(!p.some(x => x.join(',') === '0,4'));
    });
    test('Search', 'BFS: invalid or blocked target is unreachable', () => {
      assert.equal(AI.bfs(AI.DEFAULT_GRID, [0, 0], [5, 4]).path, null);
      assert.equal(AI.bfs(AI.DEFAULT_GRID, [0, 0], [0, 4], [[0, 4]]).path, null);
    });
    test('Search', 'BFS: enclosed start returns no path', () => {
      const g = AI.DEFAULT_GRID.map(r => r.slice());
      g[0][1] = g[1][0] = '#';
      assert.equal(AI.bfs(g, [0, 0], [2, 4]).path, null);
    });

    // Independent shortest-distance oracle: repeated relaxation, not a BFS queue.
    function distanceOracle(g, target, blocked) {
      const d = Array.from({ length: 5 }, () => Array(5).fill(Infinity));
      const isBlocked = (r, c) => blocked.some(p => p[0] === r && p[1] === c);
      d[0][0] = 0;
      for (let t = 0; t < 25; t++) for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] === '#' || isBlocked(r, c)) continue;
        for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && g[nr][nc] !== '#' && !isBlocked(nr, nc)) d[nr][nc] = Math.min(d[nr][nc], d[r][c] + 1);
        }
      }
      return d[target[0]][target[1]];
    }
    let seed = 12345;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    test('Search', 'BFS: matches independent shortest-distance oracle on 100 maps', () => {
      seed = 12345;
      for (let k = 0; k < 100; k++) {
        const g = AI.DEFAULT_GRID.map(row => row.map(v => v === '.' && random() < 0.25 ? '#' : v));
        const blocked = AI.SPOTS.filter(() => random() < 0.5);
        for (const t of AI.SPOTS) {
          const result = AI.bfs(g, [0, 0], t, blocked);
          const expected = blocked.some(x => x.join() === t.join()) ? Infinity : distanceOracle(g, t, blocked);
          assert.equal(result.path ? result.path.length - 1 : Infinity, expected);
          stats.shortestPathComparisons++;
        }
        stats.randomMaps++;
      }
    });
    test('Search', 'Search lab: BFS and A* traces are optimal, DFS is never shorter', () => {
      const rng = AI.createRng(99);
      for (let k = 0; k < 60; k++) {
        const g = AI.generateLot(8, 8, 4, 0.25, rng), spots = AI.orderSpots(g);
        for (const t of spots) {
          const best = AI.bfs(g, [0, 0], t).path.length;
          const b = AI.searchTrace(g, [0, 0], t, [], 'bfs'), a = AI.searchTrace(g, [0, 0], t, [], 'astar'), d = AI.searchTrace(g, [0, 0], t, [], 'dfs');
          assert.equal(b.path.length, best);
          assert.equal(a.path.length, best);
          assert.ok(d.path.length >= best);
          assert.ok(a.expanded <= b.expanded, 'A* with an admissible heuristic should not expand more than BFS here');
        }
      }
    });
    test('Search', 'Distance map agrees with BFS path lengths', () => {
      const dist = AI.distanceMap(AI.DEFAULT_GRID, [0, 0]);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const p = AI.bfs(AI.DEFAULT_GRID, [0, 0], [r, c]).path;
        assert.equal(dist[r][c], p ? p.length - 1 : Infinity);
      }
    });
    test('Search', 'Random lots always keep every space reachable', () => {
      const rng = AI.createRng(5);
      for (let k = 0; k < 50; k++) {
        const g = AI.generateLot(9, 9, 6, 0.3, rng), dist = AI.distanceMap(g, [0, 0]);
        AI.orderSpots(g).forEach(([r, c]) => assert.ok(Number.isFinite(dist[r][c])));
      }
    });

    /* ---------- MDP + Value Iteration ---------- */
    test('MDP', 'MDP: certain free space has analytical value 28', () => {
      const m = AI.solveMDP([0], [4]);
      assert.equal(m.decision(0, 0).action, 'Drive');
      near(m.decision(0, 0).value, 28);
    });
    test('MDP', 'MDP: certain occupied space recommends exit', () => {
      const m = AI.solveMDP([1], [4]);
      assert.equal(m.decision(0, 1).action, 'Exit');
      near(m.decision(0, 1).value, 0);
    });
    test('MDP', 'MDP: free unreachable space is not a driving action', () => assert.equal(AI.solveMDP([0], [Infinity]).decision(0, 0).action, 'Exit'));
    test('MDP', 'MDP: no recheck budget removes Check action', () => assert.ok(!('Check' in AI.solveMDP([0.75], [4]).decision(0, 0.75, 0).q)));
    test('MDP', 'MDP: all alerts make information worth buying', () => {
      const m = AI.plan(AI.DEFAULT_GRID, [0.75, 0.75, 0.75]);
      assert.equal(m.action, 'Check');
      assert.equal(m.spot, 0);
      assert.ok(m.model.converged);
    });
    test('MDP', 'MDP: full Bellman sweep is a fixed point', () => {
      const m = AI.solveMDP([0.75, 1 / 13, 1 / 13], [4, 6, 8]);
      for (let i = 0; i < 3; i++) for (let b = 0; b <= 100; b++) for (let k = 0; k <= 1; k++) {
        const d = m.decision(i, b / 100, k);
        near(d.value, Math.max(...Object.values(d.q)));
      }
      assert.ok(m.residual < 1e-9);
    });
    test('MDP', 'MDP: residual history is non-increasing and ends below tolerance', () => {
      const m = AI.solveMDP([0.75, 0.75, 0.75], [4, 6, 8]);
      assert.equal(m.history.length, m.iterations);
      for (let i = 1; i < m.history.length; i++) assert.ok(m.history[i] <= m.history[i - 1] + 1e-12);
      assert.ok(m.history[m.history.length - 1] <= 1e-9);
    });
    test('MDP', 'MDP: value is monotone — a more likely free space is never worth less', () => {
      const m = AI.solveMDP([0.4, 0.4, 0.4], [4, 6, 8]);
      for (let i = 0; i < 3; i++) for (let b = 1; b <= 100; b++) assert.ok(m.valueAt(i, b, 1) <= m.valueAt(i, b - 1, 1) + 1e-9);
    });
    test('MDP', 'MDP: a higher check cost never increases the number of rechecks', () => {
      const count = cost => { const m = AI.solveMDP([0.75, 0.75, 0.75], [4, 6, 8], { checkCost: cost }); let n = 0; for (let b = 0; b <= 100; b++) if (m.decision(0, b / 100, 1).action === 'Check') n++; return n; };
      assert.ok(count(5) <= count(1));
      assert.ok(count(1) <= count(0.1));
    });

    /* ---------- Integration and safety ---------- */
    test('Integration', 'Integration: all eight initial signal combinations', () => {
      for (let mask = 0; mask < 8; mask++) {
        const p = [0, 1, 2].map(i => AI.occupancy(0.4, !!(mask & (1 << i)))), r = AI.plan(AI.DEFAULT_GRID, p);
        if (mask === 7) assert.equal(r.action, 'Check');
        else {
          const i = p.findIndex(x => x < 0.5);
          assert.equal(r.spot, i);
          assert.equal(r.action, 'Drive');
          assert.equal(r.route.length - 1, [4, 6, 8][i]);
        }
      }
    });
    test('Integration', 'Safety: 152 prior/signal scenarios never cross a blocked cell', () => {
      stats.safetyScenarios = 0;
      for (let prior = 5; prior <= 95; prior += 5) for (let mask = 0; mask < 8; mask++) {
        const p = [0, 1, 2].map(i => AI.occupancy(prior / 100, !!(mask & (1 << i)))), r = AI.plan(AI.DEFAULT_GRID, p);
        assert.ok(r.model.converged);
        stats.safetyScenarios++;
        if (!r.route) continue;
        assert.ok(p[r.spot] < 0.5);
        for (let j = 0; j < r.route.length; j++) {
          const [row, col] = r.route[j];
          assert.notEqual(AI.DEFAULT_GRID[row][col], '#');
          for (let i = 0; i < 3; i++) if (p[i] >= 0.5) assert.ok(!assert.sameCell(r.route[j], AI.SPOTS[i]));
          if (j) assert.equal(Math.abs(row - r.route[j - 1][0]) + Math.abs(col - r.route[j - 1][1]), 1);
        }
      }
    });
    test('Integration', 'Recheck: a clear reading can enable a safe route', () => {
      const p = [0.75, 0.75, 0.75];
      p[0] = AI.occupancy(p[0], false);
      const r = AI.plan(AI.DEFAULT_GRID, p, [0, 1, 1], 0);
      assert.equal(r.action, 'Drive');
      assert.equal(r.spot, 0);
      assert.equal(r.route.length - 1, 4);
    });
    test('Integration', 'Recheck: repeated alerts never lead into likely occupied cells', () => {
      const p = [0.75, 0.75, 0.75], budget = [1, 1, 1];
      let start = 0;
      for (let step = 0; step < 4; step++) {
        const r = AI.plan(AI.DEFAULT_GRID, p, budget, start);
        assert.notEqual(r.action, 'Drive');
        if (r.action === 'Exit') return;
        assert.equal(r.action, 'Check');
        p[r.spot] = AI.occupancy(p[r.spot], true);
        budget[r.spot] = 0;
        start = r.spot;
      }
      assert.fail('Did not terminate');
    });
    test('Integration', 'Custom lots: planner routes never enter walls or likely occupied spaces', () => {
      const rng = AI.createRng(2024);
      for (let k = 0; k < 40; k++) {
        const g = AI.generateLot(7, 7, 4, 0.25, rng), spots = AI.orderSpots(g), start = AI.findStart(g);
        const p = spots.map(() => AI.occupancy(0.4, rng() < 0.5));
        const r = AI.plan(g, p, null, 0, { spots, start });
        assert.ok(r.model.converged);
        if (!r.route) continue;
        assert.ok(p[r.spot] < 0.5);
        r.route.forEach(cell => {
          assert.notEqual(g[cell[0]][cell[1]], '#');
          spots.forEach((s, i) => { if (p[i] >= 0.5) assert.ok(!assert.sameCell(cell, s)); });
        });
      }
    });

    /* ---------- Simulation (Monte Carlo evaluation) ---------- */
    if (Sim) {
      const env = prior => ({ grid: AI.DEFAULT_GRID, start: [0, 0], spots: AI.SPOTS, prior, config: {} });
      test('Simulation', 'Simulation: same seed gives identical episodes', () => {
        const a = Sim.runEpisode(env(0.5), 'mdp', AI.createRng(7)), b = Sim.runEpisode(env(0.5), 'mdp', AI.createRng(7));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
      });
      test('Simulation', 'Simulation: MDP policy never drives into a likely occupied space', () => {
        const rng = AI.createRng(11);
        for (let e = 0; e < 500; e++) {
          const r = Sim.runEpisode(env(0.6), 'mdp', rng);
          stats.simulatedEpisodes++;
          let beliefs = r.events.filter(x => x.type === 'sense').map(x => x.belief);
          r.events.forEach(x => {
            if (x.type === 'check') beliefs[x.spot] = x.belief;
            if (x.type === 'drive') { assert.ok(beliefs[x.spot] < 0.5); if (x.outcome === 'occupied') beliefs[x.spot] = 1; }
          });
        }
      });
      test('Simulation', 'Simulation: MDP policy earns the highest mean return (4 priors x 2000 episodes)', () => {
        for (const prior of [0.2, 0.4, 0.6, 0.8]) {
          const s = Sim.compare(env(prior), 2000, 42);
          stats.simulatedEpisodes += 6000;
          assert.ok(s.mdp.meanReturn >= s.greedy.meanReturn - 1e-9, `prior ${prior}: MDP ${s.mdp.meanReturn} < greedy ${s.greedy.meanReturn}`);
          assert.ok(s.mdp.meanReturn > s.naive.meanReturn, `prior ${prior}: MDP below naive`);
        }
      });
    }
    return { tests, stats };
  }

  /** Run all tests synchronously; returns a JSON-friendly summary. */
  function runAll(AI, Sim, now = () => Date.now()) {
    const { tests, stats } = defineTests(AI, Sim);
    const results = [];
    for (const t of tests) {
      const t0 = now();
      try { t.fn(); results.push({ group: t.group, name: t.name, status: 'PASS', ms: +(now() - t0).toFixed(1) }); }
      catch (e) { results.push({ group: t.group, name: t.name, status: 'FAIL', ms: +(now() - t0).toFixed(1), error: String(e && e.message || e) }); }
    }
    const passed = results.filter(r => r.status === 'PASS').length;
    return { checks: results.length, passed, failed: results.length - passed, ...stats, seed: 12345, results };
  }

  const api = { defineTests, runAll, assert };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParkingTests = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
