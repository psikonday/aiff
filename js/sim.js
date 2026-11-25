/*
 * Mini Smart Parking Guide — Monte Carlo simulation.
 * Samples a hidden "true" parking lot, generates noisy sensor readings from the
 * sensor model, lets a policy act, and scores the outcome with the same rewards
 * the MDP optimises. Used to compare the Value Iteration policy against baselines.
 */
(function (root) {
  'use strict';
  const AI = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.ParkingAI;

  const POLICIES = {
    mdp: { name: 'MDP + Value Iteration', short: 'MDP policy', description: 'Plans with Bayes beliefs, may buy one recheck per space.' },
    greedy: { name: 'Trust the first reading', short: 'Greedy', description: 'Drives to the first space below 50% occupancy. Never rechecks.' },
    naive: { name: 'Ignore sensors', short: 'Nearest first', description: 'Drives to the nearest space, then the next, until one is free.' },
  };

  /** Memoised planner: plan() only depends on beliefs, budgets and the candidate index. */
  function makePlanner(env) {
    const cache = new Map();
    return (beliefs, budgets, index) => {
      const k = beliefs.map(b => b.toFixed(6)).join() + '|' + budgets.join() + '|' + index;
      if (!cache.has(k)) cache.set(k, AI.plan(env.grid, beliefs, budgets, index, { spots: env.spots, start: env.start, config: env.config }));
      return cache.get(k);
    };
  }

  /**
   * Run one episode. env: { grid, start, spots, prior, config }.
   * Returns the hidden world, every event and the discounted return.
   */
  function runEpisode(env, policy, rng, planner) {
    const cfg = { ...AI.CONFIG, ...(env.config || {}) };
    const n = env.spots.length;
    const occupied = env.spots.map(() => rng() < env.prior);
    const read = i => rng() < (occupied[i] ? cfg.sensitivity : cfg.falsePositive);
    const signals = occupied.map((_, i) => read(i));
    const beliefs = signals.map(s => AI.occupancy(env.prior, s, cfg.sensitivity, cfg.falsePositive));
    const budgets = env.spots.map(() => 1);
    const events = signals.map((alert, i) => ({ type: 'sense', spot: i, alert, belief: beliefs[i] }));
    const out = { occupied, signals, events, ret: 0, success: false, parkedAt: -1, stepsDriven: 0, checks: 0, wrongTrips: 0, decisions: 0 };
    let discount = 1, index = 0;
    const pay = reward => { out.ret += discount * reward; };
    const tick = () => { discount *= cfg.discount; out.decisions++; };

    function drive(i, route) {
      const steps = route.length - 1;
      out.stepsDriven += steps;
      pay(-cfg.stepCost * steps);
      if (!occupied[i]) {
        pay(cfg.successReward);
        out.success = true;
        out.parkedAt = i;
        out.decisions++;
        events.push({ type: 'drive', spot: i, steps, route, outcome: 'parked' });
        return true;
      }
      pay(cfg.failureReward);
      tick();
      out.wrongTrips++;
      beliefs[i] = 1;
      events.push({ type: 'drive', spot: i, steps, route, outcome: 'occupied' });
      return false;
    }
    const skip = i => { pay(-cfg.skipCost); tick(); events.push({ type: 'skip', spot: i }); };

    if (policy === 'mdp') {
      planner = planner || makePlanner(env);
      for (let guard = 0; guard < 4 * n + 4; guard++) {
        const r = planner(beliefs.slice(), budgets.slice(), index);
        r.trace.filter(t => t.action === 'Skip').forEach(t => skip(t.spot));
        if (r.action === 'Exit') break;
        if (r.action === 'Check') {
          const alert = read(r.spot);
          pay(-cfg.checkCost);
          tick();
          out.checks++;
          beliefs[r.spot] = AI.occupancy(beliefs[r.spot], alert, cfg.sensitivity, cfg.falsePositive);
          budgets[r.spot] = 0;
          index = r.spot;
          events.push({ type: 'check', spot: r.spot, alert, belief: beliefs[r.spot] });
          continue;
        }
        if (drive(r.spot, r.route)) break;
        index = r.spot + 1;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const flagged = policy === 'naive' ? [] : env.spots.filter((s, j) => j !== i && beliefs[j] >= 0.5);
        const route = AI.bfs(env.grid, env.start, env.spots[i], flagged).path;
        const wanted = policy === 'naive' || beliefs[i] < 0.5;
        if (!route || !wanted) { skip(i); continue; }
        if (drive(i, route)) break;
      }
    }
    if (!out.success) events.push({ type: 'exit' });
    return out;
  }

  /** Run many episodes for each policy with the same seed and summarise. */
  function compare(env, episodes, seed, policies = Object.keys(POLICIES)) {
    const planner = makePlanner(env);
    const summary = {};
    for (const policy of policies) {
      const rng = AI.createRng(seed);
      const s = { policy, episodes, meanReturn: 0, successRate: 0, wrongTripRate: 0, meanSteps: 0, meanChecks: 0, returns: [] };
      for (let e = 0; e < episodes; e++) {
        const r = runEpisode(env, policy, rng, planner);
        s.meanReturn += r.ret;
        s.successRate += r.success ? 1 : 0;
        s.wrongTripRate += r.wrongTrips > 0 ? 1 : 0;
        s.meanSteps += r.stepsDriven;
        s.meanChecks += r.checks;
        s.returns.push(r.ret);
      }
      for (const k of ['meanReturn', 'successRate', 'wrongTripRate', 'meanSteps', 'meanChecks']) s[k] /= episodes;
      const variance = s.returns.reduce((a, x) => a + (x - s.meanReturn) ** 2, 0) / Math.max(1, episodes - 1);
      s.standardError = Math.sqrt(variance / episodes);
      summary[policy] = s;
    }
    return summary;
  }

  const api = { POLICIES, makePlanner, runEpisode, compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ParkingSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
