/* Lab 04 — Monte Carlo comparison of the MDP policy against two baselines, plus a single animated episode. */
(function () {
  'use strict';
  const { AI, $, state: S, LABELS, key, pct } = PG;
  const Sim = window.ParkingSim;
  const view = new PG.GridView($('ep-map'));
  const car = new PG.Car($('ep-car'), view);
  const POL = ['mdp', 'greedy', 'naive'];
  let epPolicy = 'mdp', episodeCounter = 0, playing = false;

  const env = () => ({ grid: S.grid, start: S.start, spots: S.spots, prior: Number($('sim-prior').value) / 100, config: S.config });
  $('sim-prior').value = Math.round(S.prior * 100);
  const syncPrior = () => { $('sim-prior-val').textContent = $('sim-prior').value + '%'; };
  $('sim-prior').addEventListener('input', syncPrior);
  syncPrior();

  function busy(el, on) { el.classList.toggle('busy', on); }

  function runComparison() {
    if (!S.spots.length) return PG.toast('Add a parking space first.');
    const box = $('lab-sim').querySelector('.lab-col');
    busy(box, true);
    setTimeout(() => {
      const t0 = performance.now();
      const res = Sim.compare(env(), Number($('sim-episodes').value), Number($('sim-seed').value) >>> 0);
      const ms = performance.now() - t0;
      busy(box, false);
      const rows = (field, fmt, err) => POL.map(p => ({ label: Sim.POLICIES[p].short, value: res[p][field], err: err ? res[p].standardError * 1.96 : 0, cls: 'pol-' + p, p }));
      $('sim-bars').innerHTML =
        PG.hbars('Mean discounted return (higher is better)', rows('meanReturn', null, true), r => r.value.toFixed(2) + (r.err ? ' ±' + r.err.toFixed(2) : '')) +
        PG.hbars('Found a free space', rows('successRate'), r => pct(r.value, 1)) +
        PG.hbars('Drove to a taken space at least once', rows('wrongTripRate'), r => pct(r.value, 1)) +
        PG.hbars('Mean rechecks per episode', rows('meanChecks'), r => r.value.toFixed(2)) +
        `<p class="muted" style="font-size:11px;margin:0">${res.mdp.episodes} episodes per driver · same seed for all three · ±95% CI · ${ms.toFixed(0)} ms</p>`;
      $('sim-sweep-chart').hidden = true;
      $('sim-sweep-legend').hidden = true;
    }, 30);
  }

  function runSweep() {
    if (!S.spots.length) return PG.toast('Add a parking space first.');
    const priors = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
    const data = { mdp: [], greedy: [], naive: [] };
    const box = $('lab-sim').querySelector('.lab-col');
    busy(box, true);
    let i = 0;
    const step = () => {
      const res = Sim.compare({ ...env(), prior: priors[i] }, 400, Number($('sim-seed').value) >>> 0);
      POL.forEach(p => data[p].push([priors[i], res[p].meanReturn]));
      if (++i < priors.length) return setTimeout(step, 0);
      busy(box, false);
      const all = POL.flatMap(p => data[p].map(d => d[1]));
      const lo = Math.floor(Math.min(0, ...all) / 10) * 10, hi = Math.ceil(Math.max(...all) / 10) * 10;
      const yTicks = [];
      for (let v = lo; v <= hi; v += (hi - lo) > 60 ? 20 : 10) yTicks.push(v);
      $('sim-sweep-chart').hidden = false;
      $('sim-sweep-legend').hidden = false;
      PG.lineChart($('sim-sweep-chart'), {
        x: [0, 1], y: [lo, hi], xTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: v => Math.round(v * 100) + '%', yTicks,
        series: [
          { points: data.naive, color: 'var(--exit)', dots: true },
          { points: data.greedy, color: 'var(--skip)', dots: true },
          { points: data.mdp, color: 'var(--drive)', dots: true, width: 3.5 },
        ],
      });
      $('sim-bars').innerHTML = '<p class="muted" style="font-size:11px;margin:0">Mean discounted return against the true occupancy rate (400 episodes per point and driver). The MDP policy optimises exactly this reward (up to 1% belief rounding), so its line should sit on or above the others.</p>';
    };
    setTimeout(step, 30);
  }

  /* ---------- Single episode ---------- */
  function drawLot(beliefs, truth) {
    const { rows, cols } = AI.gridSize(S.grid);
    view.ensure(rows, cols);
    const spotIndex = new Map(S.spots.map((s, i) => [key(s), i]));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r + ',' + c, i = spotIndex.has(k) ? spotIndex.get(k) : -1, base = PG.baseCell(S.grid, r, c, i, beliefs);
      const el = view.cell(r, c);
      el.className = base.cls + (truth && i >= 0 ? (truth[i] ? ' truth-occ' : ' truth-free') : '');
      el.innerHTML = base.html;
    }
  }

  function describe(ev) {
    const L = LABELS[ev.spot];
    if (ev.type === 'sense') return [`Sensor ${L}: ${ev.alert ? 'alert' : 'quiet'}`, pct(ev.belief, 0)];
    if (ev.type === 'check') return [`Recheck ${L}: ${ev.alert ? 'alert' : 'quiet'}`, pct(ev.belief, 0)];
    if (ev.type === 'skip') return [`Skip ${L}`, ''];
    if (ev.type === 'drive') return [`Drive to ${L} — ${ev.outcome === 'parked' ? 'parked!' : 'taken, keep looking'}`, ev.steps + ' steps'];
    return ['Leave the lot', ''];
  }

  async function playEpisode() {
    if (playing) return;
    if (!S.spots.length) return PG.toast('Add a parking space first.');
    playing = true;
    $('ep-play').disabled = true;
    const rng = AI.createRng(((Number($('sim-seed').value) >>> 0) + 7919 * ++episodeCounter) >>> 0);
    const ep = Sim.runEpisode(env(), epPolicy, rng);
    const beliefs = S.spots.map(() => undefined);
    const list = $('ep-timeline');
    list.innerHTML = '';
    $('ep-return').textContent = '…';
    $('ep-outcome').textContent = '…';
    drawLot(beliefs, null);
    car.place(S.start, 0);
    for (const ev of ep.events) {
      const [text, val] = describe(ev);
      const li = document.createElement('li');
      li.innerHTML = `<span>${text}</span><b>${val}</b>`;
      list.appendChild(li);
      requestAnimationFrame(() => li.classList.add('in'));
      list.scrollTop = list.scrollHeight;
      if (ev.type === 'sense' || ev.type === 'check') { beliefs[ev.spot] = ev.belief; drawLot(beliefs, null); await PG.wait(ev.type === 'check' ? 700 : 350); }
      else if (ev.type === 'drive') {
        await car.drive(ev.route, 200);
        if (ev.outcome === 'occupied') { beliefs[ev.spot] = 1; drawLot(beliefs, null); await PG.wait(400); car.place(S.start); await PG.wait(300); }
      } else await PG.wait(400);
    }
    drawLot(beliefs.map((b, i) => b === undefined ? (ep.occupied[i] ? 1 : 0) : b), ep.occupied);
    $('ep-return').textContent = ep.ret.toFixed(2);
    $('ep-outcome').textContent = ep.success ? 'Parked at ' + LABELS[ep.parkedAt] : 'Left';
    playing = false;
    $('ep-play').disabled = false;
  }

  $('sim-run').addEventListener('click', runComparison);
  $('sim-sweep').addEventListener('click', runSweep);
  $('ep-play').addEventListener('click', playEpisode);
  PG.segmented($('ep-policy'), 'policy', p => { epPolicy = p; });
  const reset = () => { if (!playing) { car.hide(); drawLot(S.beliefs, null); $('ep-timeline').innerHTML = ''; $('ep-return').textContent = '—'; $('ep-outcome').textContent = '—'; } };
  PG.on('change', e => { if (e.source === 'prior' || e.source === 'scenario') { $('sim-prior').value = Math.round(S.prior * 100); syncPrior(); } if (PG.activeLab === 'sim') reset(); });
  let first = true;
  PG.on('lab', ({ name }) => { if (name === 'sim') { reset(); if (first) { first = false; runComparison(); } } });
})();
