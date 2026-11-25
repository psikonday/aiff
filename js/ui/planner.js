/* Interactive planner: map editor, sensors, decision card, car preview, autopilot, share/export. */
(function () {
  'use strict';
  const { AI, $, state: S, LABELS, key, pct } = PG;
  const view = new PG.GridView($('map'), { interactive: true });
  const car = new PG.Car($('car'), view);
  const log = [];
  const undoStack = [];
  let current = null, brush = 'wall', heat = false, painting = false, paintValue = null, lastPainted = null, busy = false;

  function note(text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    log.unshift(`${time}  ${text}`);
    $('event-log').textContent = log.slice(0, 30).join('\n');
  }
  PG.note = note;

  /* ---------------- Map editing ---------------- */
  function snapshot() {
    undoStack.push(JSON.stringify({ grid: S.grid, signals: S.signals, prior: S.prior }));
    if (undoStack.length > 60) undoStack.shift();
    $('undo').disabled = false;
  }
  function undo() {
    const last = undoStack.pop();
    if (!last) return;
    const snap = JSON.parse(last);
    S.grid = snap.grid; S.signals = snap.signals; S.prior = snap.prior;
    $('undo').disabled = !undoStack.length;
    PG.resetBeliefs();
    note('Undo.');
    PG.emit('change', { source: 'map' });
  }
  PG.undo = undo;

  function setBrush(name) {
    brush = name;
    PG.setSegmented($('brush'), 'brush', name);
  }
  PG.setBrush = setBrush;

  /** Apply the current brush to one cell. Returns true if the grid changed. */
  function paint(r, c) {
    const v = S.grid[r][c];
    if (brush === 'wall' || brush === 'road') {
      if (v === 'S' || v === 'P') return false;
      const target = brush === 'road' ? '.' : paintValue;
      if (v === target) return false;
      S.grid[r][c] = target;
      return true;
    }
    if (brush === 'spot') {
      if (v === 'S') return false;
      if (v === 'P') { S.grid[r][c] = '.'; return true; }
      if (AI.findCells(S.grid, 'P').length >= PG.MAX_SPOTS) { PG.toast(`Up to ${PG.MAX_SPOTS} spaces — remove one first.`); return false; }
      S.grid[r][c] = 'P';
      return true;
    }
    if (brush === 'start') {
      if (v === 'S') return false;
      AI.findCells(S.grid, 'S').forEach(([sr, sc]) => { S.grid[sr][sc] = '.'; });
      S.grid[r][c] = 'S';
      return true;
    }
    return false;
  }
  function cellFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('#map .cell');
    return cell ? [Number(cell.dataset.r), Number(cell.dataset.c)] : null;
  }
  function commit(r, c) {
    PG.resetBeliefs();
    note(`Map edited at row ${r + 1}, column ${c + 1} (${brush}).`);
    PG.emit('change', { source: 'map' });
  }
  $('map').addEventListener('pointerdown', e => {
    const rc = cellFromEvent(e);
    if (!rc || busy) return;
    e.preventDefault();
    const [r, c] = rc;
    paintValue = S.grid[r][c] === '#' ? '.' : '#';
    snapshot();
    painting = brush === 'wall' || brush === 'road';
    lastPainted = key(rc);
    if (paint(r, c)) commit(r, c); else undoStack.pop();
  });
  $('map').addEventListener('pointermove', e => {
    if (!painting) return;
    const rc = cellFromEvent(e);
    if (!rc || key(rc) === lastPainted) return;
    lastPainted = key(rc);
    if (paint(rc[0], rc[1])) commit(rc[0], rc[1]);
  });
  window.addEventListener('pointerup', () => { painting = false; });
  // Keyboard activation (Enter/Space on a focused cell) arrives as a click with detail 0.
  $('map').addEventListener('click', e => {
    if (e.detail !== 0 || busy) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    paintValue = S.grid[r][c] === '#' ? '.' : '#';
    snapshot();
    if (paint(r, c)) commit(r, c); else undoStack.pop();
  });
  PG.segmented($('brush'), 'brush', b => { brush = b; });

  /* ---------------- Rendering ---------------- */
  function render() {
    car.hide();
    current = PG.plan();
    PG.current = current;
    const { rows, cols } = AI.gridSize(S.grid);
    view.ensure(rows, cols);
    $('grid-size').value = String(rows);
    $('prior').value = Math.round(S.prior * 100);
    $('prior-value').textContent = Math.round(S.prior * 100) + '%';

    const routeSet = new Set((current.route || []).map(key));
    const spotIndex = new Map(S.spots.map((s, i) => [key(s), i]));
    const dist = heat ? AI.distanceMap(S.grid, S.start, S.spots.filter((s, i) => S.beliefs[i] >= 0.5)) : null;
    const maxDist = dist ? Math.max(1, ...dist.flat().filter(Number.isFinite)) : 1;
    const target = current.action === 'Drive' || current.action === 'Check' ? current.spot : -1;

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const el = view.cell(r, c), k = r + ',' + c, i = spotIndex.has(k) ? spotIndex.get(k) : -1;
      const base = PG.baseCell(S.grid, r, c, i, S.beliefs);
      let cls = base.cls, html = base.html;
      if (i >= 0 && i === target) cls += current.action === 'Drive' ? ' selected' : ' checking';
      if (i < 0 && routeSet.has(k) && S.grid[r][c] === '.') cls += ' route';
      if (heat && S.grid[r][c] === '.' && !routeSet.has(k)) {
        const d = dist[r][c];
        cls += ' heat';
        el.style.setProperty('--heat', Number.isFinite(d) ? (1 - d / (maxDist + 1)).toFixed(2) : 0);
        html = `<span class="dist">${Number.isFinite(d) ? d : '∞'}</span>`;
      }
      el.className = cls;
      el.innerHTML = html;
      el.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}: ${base.label}${routeSet.has(k) ? ', on route' : ''}`);
    }

    renderSensors(target);
    renderDecision();
    renderTable();
    $('animate').disabled = current.action !== 'Drive' || busy;
    $('autopilot').disabled = busy || !S.spots.length;
  }

  function renderSensors(target) {
    const list = $('sensors');
    list.innerHTML = '';
    if (!S.spots.length) { list.innerHTML = '<p class="muted" style="font-size:12px">No parking spaces yet — pick the “P Space” brush and click the map.</p>'; return; }
    S.spots.forEach((s, i) => {
      const alert = !!S.signals[key(s)], b = S.beliefs[i];
      const row = document.createElement('div');
      row.className = 'sensor-row' + (b >= 0.5 ? ' alerted' : '') + (i === target ? ' is-target' : '');
      row.innerHTML = `<div class="sensor-badge">${LABELS[i]}</div>
        <div class="sensor-meta"><strong style="font-size:12px">${pct(b)} occupied</strong>
        <div class="meter" title="50% line = driving limit"><span style="width:${(b * 100).toFixed(1)}%;background-position:${(100 - b * 100).toFixed(0)}% 0"></span></div>
        <small>${Number.isFinite(current.distances[i]) ? current.distances[i] + ' steps' : 'unreachable'} · ${S.budgets[i] ? 'recheck available' : 'recheck used'}</small></div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toggle' + (alert ? ' alert' : '');
      btn.textContent = alert ? 'Alert' : 'No alert';
      btn.setAttribute('aria-label', `Space ${LABELS[i]} sensor: ${alert ? 'alert' : 'no alert'}. Click to change.`);
      btn.onclick = () => {
        if (busy) return;
        S.signals[key(s)] = !alert;
        PG.resetBeliefs();
        note(`Sensor ${LABELS[i]} switched to ${!alert ? 'alert' : 'no alert'}.`);
        PG.emit('change', { source: 'signals' });
      };
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function renderDecision() {
    const drive = current.action === 'Drive', check = current.action === 'Check';
    const L = LABELS[current.spot];
    $('result').dataset.action = current.action;
    $('resultTitle').textContent = drive ? `Head to space ${L}` : check ? `Check space ${L} again` : 'No suitable space to drive to';
    $('resultSteps').textContent = drive ? (current.route.length - 1) + ' steps' : check ? '+1 reading' : '';
    const skipped = current.trace.filter(t => t.action === 'Skip').map(t => LABELS[t.spot]);
    const skipText = skipped.length ? ` Skipped ${skipped.join(', ')} first.` : '';
    $('resultText').textContent = drive
      ? `Estimated occupancy ${pct(S.beliefs[current.spot])}. The route avoids obstacles and any space at or above 50%.${skipText}`
      : check ? `Another reading is worth more than driving, skipping or leaving right now.${skipText} Choose a simulated reading below.`
      : S.spots.length ? 'The model recommends leaving this area under the current conditions. Change a reading or clear a roadblock to try again.'
      : 'Add at least one parking space to the map.';
    $('recheck-controls').hidden = !check;

    // Q-value bars for the deciding candidate
    const t = current.trace[current.trace.length - 1];
    const box = $('qbars');
    if (!t) { box.innerHTML = ''; return; }
    const entries = AI.ACTIONS.filter(a => a in t.q).map(a => [a, t.q[a]]);
    const min = Math.min(0, ...entries.map(e => e[1])), max = Math.max(0, ...entries.map(e => e[1])), span = max - min || 1;
    const zero = -min / span * 100;
    const colors = { Drive: 'var(--drive)', Check: 'var(--check)', Skip: 'var(--skip)', Exit: 'var(--exit)' };
    box.innerHTML = `<div class="label-sm">Expected value at space ${LABELS[t.spot]}</div>` + entries.map(([a, v]) => {
      const left = v >= 0 ? zero : zero + v / span * 100, width = Math.abs(v) / span * 100;
      return `<div class="qbar${a === t.action ? ' best' : ''}"><span>${a}</span><div class="track"><span style="left:${left}%;width:${Math.max(width, .6)}%;background:${colors[a]}"></span><i class="zero" style="left:${zero}%"></i></div><b>${v.toFixed(2)}</b></div>`;
    }).join('') + AI.ACTIONS.filter(a => !(a in t.q)).map(a => `<div class="qbar muted"><span>${a}</span><div class="track"></div><b>n/a</b></div>`).join('');
  }

  function renderTable() {
    $('decision-table').innerHTML = current.trace.map(t => `<tr><td>${LABELS[t.spot]}</td><td class="num">${pct(S.beliefs[t.spot])}</td>
      <td class="num">${Number.isFinite(current.distances[t.spot]) ? current.distances[t.spot] : '—'}</td>
      <td><span class="chip ${t.action.toLowerCase()}">${t.action}</span></td>
      <td class="mono">${Object.entries(t.q).map(([k, v]) => k + ': ' + v.toFixed(2)).join(' / ')}</td></tr>`).join('') ||
      '<tr><td colspan="5" class="muted">No candidate spaces.</td></tr>';
    const m = current.model;
    $('solver').textContent = `${m.stateCount} planning states · ${m.iterations} Bellman sweeps · residual ${m.residual.toExponential(1)} · ${m.converged ? 'converged' : 'iteration limit reached'}`;
    $('stat-states').textContent = m.stateCount;
  }

  /* ---------------- Readings, preview and autopilot ---------------- */
  function applyReading(alert) {
    if (!current || current.action !== 'Check') return;
    const i = current.spot;
    S.beliefs[i] = AI.occupancy(S.beliefs[i], alert, S.config.sensitivity, S.config.falsePositive);
    S.budgets[i] = 0;
    S.startIndex = i;
    note(`Recheck ${LABELS[i]}: ${alert ? 'alert' : 'no alert'} → posterior ${pct(S.beliefs[i])}.`);
    PG.emit('change', { source: 'recheck' });
  }
  document.querySelectorAll('[data-reading]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.reading;
    applyReading(v === 'random' ? Math.random() < AI.alertProbability(S.beliefs[current.spot], S.config.sensitivity, S.config.falsePositive) : v === 'alert');
  }));

  async function preview() {
    if (!current || current.action !== 'Drive' || busy) return;
    busy = true; render(); busy = true;
    $('animate').disabled = true;
    const ok = await car.drive(current.route, 300);
    busy = false;
    $('animate').disabled = false;
    $('autopilot').disabled = false;
    if (ok) { note(`Preview finished at space ${LABELS[current.spot]} — ${current.route.length - 1} steps. Not a real parking confirmation.`); PG.toast(`Arrived at space ${LABELS[current.spot]}`); }
  }
  PG.preview = preview;
  $('animate').addEventListener('click', preview);

  async function autopilot() {
    if (busy) return;
    PG.resetBeliefs();
    PG.emit('change', { source: 'autopilot' });
    note('Autopilot started: readings are sampled from the sensor model.');
    for (let guard = 0; guard < 20; guard++) {
      if (current.action === 'Check') {
        await PG.wait(900);
        const p = AI.alertProbability(S.beliefs[current.spot], S.config.sensitivity, S.config.falsePositive);
        applyReading(Math.random() < p);
        continue;
      }
      if (current.action === 'Drive') { await PG.wait(500); await preview(); return; }
      PG.toast('Autopilot: no good space — leaving the lot.');
      note('Autopilot ended with Exit.');
      return;
    }
  }
  $('autopilot').addEventListener('click', autopilot);

  /* ---------------- Scenarios ---------------- */
  function scenario(name) {
    if (busy) return;
    snapshot();
    S.signals = {};
    if (name === 'random') {
      const size = Number($('grid-size').value), rng = AI.createRng((Math.random() * 1e9) >>> 0);
      const spotCount = size <= 5 ? 3 : size <= 7 ? 4 : size <= 9 ? 5 : 6;
      S.grid = AI.generateLot(size, size, spotCount, 0.22, rng);
      AI.findCells(S.grid, 'P').forEach(s => { S.signals[key(s)] = rng() < 0.45; });
    } else {
      S.grid = AI.DEFAULT_GRID.map(r => r.slice());
      S.prior = 0.4;
      const bits = { clear: [0, 0, 0], uncertain: [1, 1, 1], far: [1, 1, 0], blocked: [1, 0, 0] }[name] || [1, 0, 0];
      AI.SPOTS.forEach((s, i) => { S.signals[key(s)] = !!bits[i]; });
      if (name === 'blocked') { S.grid[0][1] = '#'; S.grid[1][0] = '#'; }
    }
    PG.resetBeliefs();
    note(`Scenario: ${name}.`);
    PG.emit('change', { source: 'scenario' });
  }
  PG.scenario = scenario;
  document.querySelectorAll('[data-scenario]').forEach(b => b.addEventListener('click', () => scenario(b.dataset.scenario)));
  $('reset').addEventListener('click', () => { PG.resetBeliefs(); note('Readings reset.'); PG.emit('change', { source: 'reset' }); });
  $('undo').addEventListener('click', undo);
  $('undo').disabled = true;

  $('grid-size').addEventListener('change', e => {
    const size = Number(e.target.value);
    if (size === 5) return scenario('original');
    snapshot();
    const rng = AI.createRng((Math.random() * 1e9) >>> 0);
    S.grid = AI.generateLot(size, size, size <= 7 ? 4 : size <= 9 ? 5 : 6, 0.2, rng);
    S.signals = {};
    AI.findCells(S.grid, 'P').forEach(s => { S.signals[key(s)] = rng() < 0.4; });
    PG.resetBeliefs();
    note(`New ${size} × ${size} lot.`);
    PG.emit('change', { source: 'map' });
  });

  $('prior').addEventListener('input', e => PG.setPrior(Number(e.target.value) / 100, 'prior'));
  function toggleHeat() { heat = !heat; $('heat-toggle').setAttribute('aria-pressed', heat); render(); }
  PG.toggleHeat = toggleHeat;
  $('heat-toggle').addEventListener('click', toggleHeat);

  /* ---------------- Share, export, import ---------------- */
  function encodeState() {
    const bits = S.spots.map(s => (S.signals[key(s)] ? 1 : 0)).join('');
    return 'g=' + S.grid.map(r => r.join('')).join('-').replace(/#/g, 'x').replace(/\./g, 'o') + '&p=' + Math.round(S.prior * 100) + '&a=' + bits;
  }
  function decodeState(hash) {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    if (!q.get('g')) return false;
    const grid = q.get('g').split('-').map(r => r.replace(/x/g, '#').replace(/o/g, '.').split(''));
    try { AI.gridSize(grid); } catch (e) { return false; }
    if (grid.length > 15 || grid.some(r => r.some(v => !'.#SP'.includes(v)))) return false;
    S.grid = grid;
    S.prior = Math.min(0.99, Math.max(0.01, (Number(q.get('p')) || 40) / 100));
    S.signals = {};
    const spots = AI.orderSpots(grid, AI.findStart(grid)), bits = q.get('a') || '';
    spots.forEach((s, i) => { S.signals[key(s)] = bits[i] === '1'; });
    return true;
  }
  $('share').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#' + encodeState();
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PG.toast('Link copied — it opens this exact lot.'); }
    catch (e) { PG.toast('Link is in the address bar.'); }
  });
  $('export').addEventListener('click', () => {
    const data = {
      generatedAt: new Date().toISOString(), grid: S.grid, prior: S.prior,
      spaces: S.spots.map((s, i) => ({ label: LABELS[i], cell: s, initialAlert: !!S.signals[key(s)], belief: S.beliefs[i], recheckAvailable: !!S.budgets[i] })),
      action: current.action, spot: current.spot >= 0 ? LABELS[current.spot] : null, path: current.route, trace: current.trace,
      solver: { iterations: current.model.iterations, residual: current.model.residual, states: current.model.stateCount }, model: S.config,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'parking-scenario.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note('Scenario exported.');
  });
  $('import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      AI.gridSize(data.grid);
      if (data.grid.some(r => r.some(v => !'.#SP'.includes(v)))) throw Error('bad cells');
      snapshot();
      S.grid = data.grid;
      if (Number.isFinite(data.prior)) S.prior = data.prior;
      S.signals = {};
      (data.spaces || []).forEach(sp => { S.signals[key(sp.cell)] = !!sp.initialAlert; });
      if (Array.isArray(data.signals)) AI.orderSpots(S.grid).forEach((s, i) => { S.signals[key(s)] = !!data.signals[i]; });
      PG.resetBeliefs();
      note(`Imported ${file.name}.`);
      PG.emit('change', { source: 'import' });
    } catch (err) { PG.toast('That file is not a valid scenario.'); }
    e.target.value = '';
  });

  PG.on('change', render);
  window.addEventListener('resize', () => car.hide());

  if (location.hash.includes('g=') && decodeState(location.hash)) { PG.resetBeliefs(); note('Scenario loaded from link.'); }
  else scenario('original');
  undoStack.length = 0;
  $('undo').disabled = true;
  render();
})();
