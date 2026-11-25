/* Lab 01 — step through BFS, DFS and A* on the planner's lot. */
(function () {
  'use strict';
  const { AI, $, state: S, LABELS, key } = PG;
  const view = new PG.GridView($('search-map'));
  const NAMES = { bfs: 'BFS', dfs: 'DFS', astar: 'A*' };
  const FRONTIER = { bfs: 'Queue (next out first)', dfs: 'Stack (next out first)', astar: 'Priority queue (lowest f = g + h first)' };
  const PSEUDO = {
    bfs: ['frontier ← queue [start]', 'while frontier not empty:', '  cell ← frontier.pop_front()', '  if cell = goal: return path', '  for each free neighbour n not seen:', '    parent[n] ← cell; frontier.push_back(n)'],
    dfs: ['frontier ← stack [start]', 'while frontier not empty:', '  cell ← frontier.pop_back()', '  if cell = goal: return path', '  for each free neighbour n not expanded:', '    parent[n] ← cell; frontier.push(n)'],
    astar: ['frontier ← priority queue [start], g[start] ← 0', 'while frontier not empty:', '  cell ← frontier.pop_min(g + h)', '  if cell = goal: return path', '  for each free neighbour n with better g:', '    g[n] ← g[cell] + 1; frontier.push(n, g[n] + |n − goal|)'],
  };
  let algo = 'bfs', trace = null, step = 0, timer = null, targetIndex = 0;

  function blocked() {
    if (!$('search-avoid').checked) return [];
    return S.spots.filter((s, i) => i !== targetIndex && S.beliefs[i] >= 0.5);
  }

  function rebuild() {
    stop();
    const sel = $('search-target');
    const prev = sel.value;
    sel.innerHTML = S.spots.map((s, i) => `<option value="${i}">Space ${LABELS[i]} (row ${s[0] + 1}, col ${s[1] + 1})</option>`).join('');
    if (prev !== '' && Number(prev) < S.spots.length) sel.value = prev;
    else if (PG.current && PG.current.spot >= 0) sel.value = PG.current.spot;
    targetIndex = Number(sel.value) || 0;
    trace = S.spots.length ? AI.searchTrace(S.grid, S.start, S.spots[targetIndex], blocked(), algo) : null;
    step = 0;
    renderCompare();
    draw();
  }

  function draw() {
    const { rows, cols } = AI.gridSize(S.grid);
    view.ensure(rows, cols);
    const spotIndex = new Map(S.spots.map((s, i) => [key(s), i]));
    const frames = trace ? trace.frames.slice(0, step) : [];
    const order = new Map(frames.map((f, i) => [key(f.cell), i + 1]));
    const last = frames[frames.length - 1];
    const frontier = last ? last.frontier : trace ? [S.start] : [];
    const frontierSet = new Set(frontier.map(key));
    const done = trace && step >= trace.frames.length;
    const pathSet = new Set(done && trace.path ? trace.path.map(key) : []);
    const blockedSet = new Set(blocked().map(key));

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r + ',' + c, i = spotIndex.has(k) ? spotIndex.get(k) : -1, el = view.cell(r, c);
      const base = PG.baseCell(S.grid, r, c, i, null);
      let cls = base.cls, html = base.html;
      if (i >= 0 && blockedSet.has(k)) cls += ' alerted';
      if (i === targetIndex) cls += ' selected';
      if (S.grid[r][c] === '.' || S.grid[r][c] === 'P') {
        if (pathSet.has(k) && S.grid[r][c] === '.') cls = 'cell path';
        else if (order.has(k) && S.grid[r][c] === '.') { cls = 'cell visited'; html = `<span class="dist">${order.get(k)}</span>`; }
        if (frontierSet.has(k)) cls += ' frontier';
      }
      if (last && key(last.cell) === k && !done) cls += ' current';
      el.className = cls;
      el.innerHTML = html;
    }

    $('search-expanded').textContent = frames.length;
    $('search-frontier-size').textContent = done ? '—' : frontier.length;
    $('search-length').textContent = done ? (trace.path ? trace.path.length - 1 : 'none') : '—';
    $('search-frontier-label').textContent = FRONTIER[algo];
    const shown = algo === 'dfs' ? frontier.slice().reverse() : frontier;
    const pri = last && algo === 'astar' ? last.priorities : null;
    $('search-frontier').innerHTML = done ? `<span class="chip">${trace.path ? 'Goal reached ✓' : 'Frontier empty — goal unreachable'}</span>`
      : shown.slice(0, 40).map((c, i) => `<span class="chip${i === 0 ? ' next' : ''}">(${c[0] + 1},${c[1] + 1})${pri ? ' f=' + pri[i] : ''}</span>`).join('') + (shown.length > 40 ? `<span class="chip">+${shown.length - 40}</span>` : '');
    const line = done ? 3 : step === 0 ? 0 : 4;
    $('search-pseudo').innerHTML = PSEUDO[algo].map((l, i) => i === line ? `<span class="hl">${PG.esc(l)}</span>` : PG.esc(l)).join('\n');
    $('search-play').textContent = timer ? '❚❚ Pause' : '▶ Play';
  }

  function renderCompare() {
    if (!S.spots.length) { $('search-compare').innerHTML = '<tr><td colspan="5" class="muted">Add a parking space in the planner.</td></tr>'; return; }
    const best = AI.bfs(S.grid, S.start, S.spots[targetIndex], blocked()).path;
    $('search-compare').innerHTML = ['bfs', 'dfs', 'astar'].map(a => {
      const t = AI.searchTrace(S.grid, S.start, S.spots[targetIndex], blocked(), a);
      const len = t.path ? t.path.length - 1 : null, opt = best && len === best.length - 1;
      return `<tr${a === algo ? ' style="font-weight:900"' : ''}><td>${NAMES[a]}</td><td class="num">${t.expanded}</td><td class="num">${t.maxFrontier}</td><td class="num">${len === null ? '—' : len}</td><td>${len === null ? '—' : opt ? '✓ yes' : '✗ longer'}</td></tr>`;
    }).join('');
  }

  function stop() { clearInterval(timer); timer = null; }
  function play() {
    if (!trace) return;
    if (timer) { stop(); draw(); return; }
    if (step >= trace.frames.length) step = 0;
    timer = setInterval(() => {
      step++;
      if (step >= trace.frames.length) stop();
      draw();
    }, 1000 / Number($('search-speed').value));
    draw();
  }

  $('search-play').addEventListener('click', play);
  $('search-step').addEventListener('click', () => { if (!trace) return; stop(); step = Math.min(step + 1, trace.frames.length); draw(); });
  $('search-end').addEventListener('click', () => { if (!trace) return; stop(); step = trace.frames.length; draw(); });
  $('search-reset').addEventListener('click', () => { stop(); step = 0; draw(); });
  $('search-target').addEventListener('change', rebuild);
  $('search-avoid').addEventListener('change', rebuild);
  $('search-speed').addEventListener('input', e => {
    $('search-speed-val').textContent = e.target.value + '/s';
    if (timer) { stop(); play(); }
  });
  PG.segmented($('search-algo'), 'algo', a => { algo = a; rebuild(); });

  PG.on('change', () => { if (PG.activeLab === 'search') rebuild(); });
  PG.on('lab', ({ name }) => { if (name === 'search') rebuild(); else stop(); });
  rebuild();
})();
