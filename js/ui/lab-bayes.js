/* Lab 02 — Bayes' rule as natural frequencies, plus repeated readings. Sensor settings are shared with the planner. */
(function () {
  'use strict';
  const { AI, $, state: S, pct } = PG;
  let view = 'alert', readings = [];

  function syncInputs() {
    $('bayes-prior').value = Math.round(S.prior * 100);
    $('bayes-sens').value = Math.round(S.config.sensitivity * 100);
    $('bayes-fp').value = Math.round(S.config.falsePositive * 100);
    $('bayes-prior-val').textContent = Math.round(S.prior * 100) + '%';
    $('bayes-sens-val').textContent = Math.round(S.config.sensitivity * 100) + '%';
    $('bayes-fp-val').textContent = Math.round(S.config.falsePositive * 100) + '%';
  }

  function renderFrequencies() {
    const prior = S.prior, sens = S.config.sensitivity, fp = S.config.falsePositive;
    // 200 squares give finer resolution than 100 while staying readable.
    const N = 200, occ = Math.round(prior * N);
    const occMatch = Math.round(occ * (view === 'alert' ? sens : 1 - sens));
    const freeMatch = Math.round((N - occ) * (view === 'alert' ? fp : 1 - fp));
    let html = '';
    for (let i = 0; i < N; i++) {
      const isOcc = i < occ;
      const match = isOcc ? i < occMatch : i - occ < freeMatch;
      html += `<i class="${isOcc ? 'occ' : ''}${match ? ' alarm' : ' dim'}"></i>`;
    }
    $('freq-grid').innerHTML = html;

    const alert = view === 'alert';
    const lo = alert ? sens : 1 - sens, lf = alert ? fp : 1 - fp;
    const evidence = lo * prior + lf * (1 - prior);
    const post = AI.occupancy(prior, alert, sens, fp);
    $('bayes-formula').innerHTML =
      `P(occ | ${alert ? 'alert' : 'no alert'}) = P(${alert ? 'alert' : 'quiet'} | occ)·P(occ) / P(${alert ? 'alert' : 'quiet'})<br>` +
      `= ${lo.toFixed(2)} × ${prior.toFixed(2)} / (${lo.toFixed(2)} × ${prior.toFixed(2)} + ${lf.toFixed(2)} × ${(1 - prior).toFixed(2)})<br>` +
      `= ${(lo * prior).toFixed(3)} / ${evidence.toFixed(3)} = <b>${pct(post)}</b>` +
      `<br><span class="muted">In squares: ${occMatch} of the ${occMatch + freeMatch} matching squares are taken.</span>`;
  }

  function renderSequence() {
    const sens = S.config.sensitivity, fp = S.config.falsePositive;
    const beliefs = [S.prior];
    readings.forEach(a => beliefs.push(AI.occupancy(beliefs[beliefs.length - 1], a, sens, fp)));
    const n = readings.length;
    $('seq-chips').innerHTML = readings.length ? readings.map((a, i) => `<span class="chip ${a ? 'exit' : 'drive'}">${i + 1}. ${a ? 'alert' : 'quiet'}</span>`).join('')
      : '<span class="muted" style="font-size:11px">No readings yet — the belief is just the prior.</span>';
    const last = beliefs[beliefs.length - 1];
    $('seq-post').textContent = pct(last);
    $('seq-n').textContent = n;
    $('seq-verdict').textContent = last >= 0.5 ? 'Avoid' : 'Drivable';
    const xmax = Math.max(5, n);
    PG.lineChart($('seq-chart'), {
      x: [0, xmax], y: [0, 1],
      xTicks: Array.from({ length: Math.min(xmax, 10) + 1 }, (_, i) => Math.round(i * xmax / Math.min(xmax, 10))),
      yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: v => Math.round(v * 100) + '%', xFmt: v => v,
      hline: { y: 0.5, label: 'driving limit' },
      series: [{ points: beliefs.map((b, i) => [i, b]), color: 'var(--check)', dots: true, dotColors: beliefs.map((b, i) => i === 0 ? 'var(--muted)' : readings[i - 1] ? 'var(--exit)' : 'var(--drive)') }],
    });
  }

  function render() { syncInputs(); renderFrequencies(); renderSequence(); }

  $('bayes-prior').addEventListener('input', e => PG.setPrior(Number(e.target.value) / 100, 'bayes'));
  $('bayes-sens').addEventListener('input', e => PG.setConfig({ sensitivity: Number(e.target.value) / 100 }, 'bayes'));
  $('bayes-fp').addEventListener('input', e => PG.setConfig({ falsePositive: Number(e.target.value) / 100 }, 'bayes'));
  PG.segmented($('bayes-view'), 'view', v => { view = v; renderFrequencies(); });
  const add = list => { readings = readings.concat(list).slice(-40); renderSequence(); };
  $('seq-alert').addEventListener('click', () => add([true]));
  $('seq-clear').addEventListener('click', () => add([false]));
  const sample = occupied => Array.from({ length: 10 }, () => Math.random() < (occupied ? S.config.sensitivity : S.config.falsePositive));
  $('seq-occ').addEventListener('click', () => add(sample(true)));
  $('seq-free').addEventListener('click', () => add(sample(false)));
  $('seq-reset').addEventListener('click', () => { readings = []; renderSequence(); });

  PG.on('change', () => { if (PG.activeLab === 'bayes') render(); });
  PG.on('lab', ({ name }) => { if (name === 'bayes') render(); });
  render();
})();
