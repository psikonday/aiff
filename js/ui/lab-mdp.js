/* Lab 03 — reward tuning, optimal policy map, value curves and convergence of Value Iteration. */
(function () {
  'use strict';
  const { AI, $, state: S, LABELS, pct } = PG;
  const COLORS = { Drive: 'var(--drive)', Check: 'var(--check)', Skip: 'var(--skip)', Exit: 'var(--exit)' };
  const PARAMS = [
    { k: 'discount', label: 'Discount γ', min: 0.5, max: 0.99, step: 0.01, fmt: v => v.toFixed(2) },
    { k: 'successReward', label: 'Reward: parked', min: 5, max: 60, step: 1, fmt: v => '+' + v },
    { k: 'failureReward', label: 'Penalty: space taken', min: -60, max: -1, step: 1, fmt: v => String(v) },
    { k: 'stepCost', label: 'Cost per driving step', min: 0, max: 3, step: 0.1, fmt: v => v.toFixed(1) },
    { k: 'checkCost', label: 'Cost of a recheck', min: 0, max: 10, step: 0.25, fmt: v => v.toFixed(2) },
    { k: 'skipCost', label: 'Cost of skipping', min: 0, max: 5, step: 0.25, fmt: v => v.toFixed(2) },
  ];
  let model = null, problem = null, sweep = null;

  $('mdp-controls').innerHTML = PARAMS.map(p => `<div class="field"><div class="field-row"><label for="mdp-${p.k}">${p.label}</label><output id="mdp-${p.k}-val"></output></div>
    <input type="range" id="mdp-${p.k}" min="${p.min}" max="${p.max}" step="${p.step}"></div>`).join('');
  PARAMS.forEach(p => $('mdp-' + p.k).addEventListener('input', e => { sweep = null; PG.setConfig({ [p.k]: Number(e.target.value) }, 'mdp'); }));
  $('mdp-reset').addEventListener('click', () => {
    sweep = null;
    const patch = {};
    PARAMS.forEach(p => { patch[p.k] = AI.CONFIG[p.k]; });
    PG.setConfig(patch, 'mdp');
    PG.toast('Rewards reset to the course defaults.');
  });

  function solve() {
    const plan = PG.plan();
    problem = { beliefs: S.beliefs.slice(), distances: plan.distances, n: S.spots.length };
    model = problem.n ? AI.solveMDP(problem.beliefs, problem.distances, S.config) : null;
  }

  function render() {
    PARAMS.forEach(p => {
      $('mdp-' + p.k).value = S.config[p.k];
      $('mdp-' + p.k + '-val').textContent = p.fmt(S.config[p.k]);
    });
    solve();
    if (!model) {
      ['mdp-policy', 'mdp-values', 'mdp-convergence'].forEach(id => { $(id).innerHTML = ''; });
      $('mdp-info').textContent = 'Add a parking space in the planner to build the MDP.';
      return;
    }
    $('mdp-info').textContent = `${model.stateCount} states · ${model.iterations} sweeps · ${model.converged ? 'converged' : 'not converged'}`;
    const slider = $('mdp-sweep');
    slider.max = model.iterations;
    if (sweep === null || sweep > model.iterations) sweep = model.iterations;
    slider.value = sweep;
    renderPolicy();
    renderValues();
    renderConvergence();
  }

  function renderPolicy() {
    const svg = $('mdp-policy'), n = problem.n, rowH = n > 4 ? 13 : 18, gap = 6;
    const W = 460, left = 96, top = 6, cw = (W - left - 10) / 101;
    const H = top + n * (2 * rowH + gap) + 26;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let out = '';
    for (let i = 0; i < n; i++) for (let k = 1; k >= 0; k--) {
      const y = top + i * (2 * rowH + gap) + (1 - k) * rowH;
      out += `<text x="${left - 8}" y="${y + rowH / 2 + 3}" text-anchor="end">${LABELS[i]} · ${k ? 'can check' : 'no check'}</text>`;
      let runStart = 0, runAction = null;
      for (let b = 0; b <= 101; b++) {
        const a = b <= 100 ? model.decision(i, b / 100, k).action : null;
        if (a !== runAction) {
          if (runAction) out += `<rect class="cellr" x="${left + runStart * cw}" y="${y}" width="${(b - runStart) * cw}" height="${rowH - 2}" fill="${COLORS[runAction]}"/>`;
          runStart = b;
          runAction = a;
        }
      }
      if (S.budgets[i] === k) out += `<circle class="marker" cx="${left + (Math.round(problem.beliefs[i] * 100) + 0.5) * cw}" cy="${y + rowH / 2 - 1}" r="5"/>`;
    }
    const axisY = H - 18;
    [0, 25, 50, 75, 100].forEach(v => { out += `<text x="${left + (v + 0.5) * cw}" y="${axisY + 12}" text-anchor="middle">${v}%</text>`; });
    out += `<line class="threshold" x1="${left + 50 * cw}" x2="${left + 50 * cw}" y1="${top}" y2="${axisY}"/>`;
    out += `<text x="${W - 10}" y="${axisY + 12}" text-anchor="end" style="opacity:0">occupancy</text>`;
    svg.innerHTML = out;
    svg.onmousemove = e => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const b = Math.floor((p.x - left) / cw), block = Math.floor((p.y - top) / (2 * rowH + gap));
      const within = (p.y - top) - block * (2 * rowH + gap);
      if (b < 0 || b > 100 || block < 0 || block >= n || within > 2 * rowH) return PG.tip.hide();
      const k = within < rowH ? 1 : 0, d = model.decision(block, b / 100, k);
      PG.tip.show(`<b>Space ${LABELS[block]} · belief ${b}% · ${k ? 'recheck left' : 'no recheck'}</b><br>` +
        Object.entries(d.q).map(([a, v]) => `${a === d.action ? '★ ' : ''}${a}: ${v.toFixed(2)}`).join('<br>'), e.clientX, e.clientY);
    };
    svg.onmouseleave = () => PG.tip.hide();
  }

  function renderValues() {
    const partial = sweep < model.iterations ? AI.solveMDP(problem.beliefs, problem.distances, { ...S.config, maxIterations: sweep }) : model;
    const series = [];
    let lo = 0, hi = 1;
    for (let i = 0; i < problem.n; i++) {
      const pts = [];
      for (let b = 0; b <= 100; b++) { const v = partial.valueAt(i, b, 1); pts.push([b / 100, v]); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      series.push({ points: pts, color: PG.SERIES[i % PG.SERIES.length], label: LABELS[i] });
    }
    const span = hi - lo, step = span > 40 ? 10 : 5;
    const yTicks = [];
    for (let v = Math.floor(lo / step) * step; v < hi + step - 1e-9; v += step) yTicks.push(v);
    PG.lineChart($('mdp-values'), { x: [0, 1], y: [yTicks[0], yTicks[yTicks.length - 1]], xTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: v => Math.round(v * 100) + '%', yTicks, series });
    $('mdp-sweep-val').textContent = `${sweep} of ${model.iterations}`;
    $('mdp-sweep-label').textContent = sweep < model.iterations ? `after sweep ${sweep}` : 'converged';
  }

  function renderConvergence() {
    const svg = $('mdp-convergence'), h = model.history;
    const W = 460, H = 170, m = { l: 44, r: 14, t: 12, b: 28 };
    const logs = h.map(d => Math.log10(Math.max(d, 1e-12)));
    const maxL = Math.ceil(Math.max(...logs, 0)), minL = -12;
    const sy = PG.scale(minL, maxL, H - m.b, m.t), bw = (W - m.l - m.r) / h.length;
    let out = '';
    for (let v = minL; v <= maxL; v += 3) out += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${m.l - 6}" y="${sy(v) + 3}" text-anchor="end">1e${v}</text>`;
    h.forEach((d, i) => {
      const y = sy(logs[i]), x = m.l + i * bw + bw * 0.18;
      out += `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${H - m.b - y}" rx="3" fill="${i + 1 === sweep ? 'var(--orange)' : 'var(--check)'}"/>`;
      out += `<text x="${x + bw * 0.32}" y="${H - m.b + 14}" text-anchor="middle">${i + 1}</text>`;
      if (d === 0) out += `<text x="${x + bw * 0.32}" y="${y - 4}" text-anchor="middle">exact</text>`;
    });
    out += `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${sy(-9)}" y2="${sy(-9)}"/><text x="${W - m.r}" y="${sy(-9) - 4}" text-anchor="end" style="fill:var(--exit)">tolerance 1e-9</text>`;
    out += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    svg.innerHTML = out;
  }

  $('mdp-sweep').addEventListener('input', e => { sweep = Number(e.target.value); renderValues(); renderConvergence(); });
  PG.on('change', () => { if (PG.activeLab === 'mdp') render(); });
  PG.on('lab', ({ name }) => { if (name === 'mdp') render(); });
})();
