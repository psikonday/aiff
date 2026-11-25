/* Shared UI state, event bus and small rendering helpers. Exposes window.PG. */
(function () {
  'use strict';
  const AI = window.ParkingAI;
  // Guard: if the browser served an outdated cached core.js, explain instead of showing an empty page.
  if (!AI || typeof AI.findStart !== 'function' || typeof AI.searchTrace !== 'function') {
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:999;background:#b5524a;color:#fff;padding:16px 20px;border-radius:14px;font:800 14px/1.5 Arial,sans-serif;text-transform:uppercase';
    box.textContent = 'An old cached version of the scripts was loaded. Press Ctrl+Shift+R (Cmd+Shift+R on Mac) to reload the page.';
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
    throw Error('Outdated js/core.js in browser cache — hard reload required.');
  }
  const PG = window.PG = {};
  const LABELS = 'ABCDEF';
  const MAX_SPOTS = 6;
  const key = ([r, c]) => r + ',' + c;

  PG.AI = AI;
  PG.LABELS = LABELS;
  PG.MAX_SPOTS = MAX_SPOTS;
  PG.key = key;
  PG.$ = id => document.getElementById(id);
  PG.pct = (p, d = 1) => (p * 100).toFixed(d) + '%';
  PG.reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- State ---------------- */
  const S = PG.state = {
    grid: AI.DEFAULT_GRID.map(r => r.slice()),
    prior: 0.4,
    signals: {},             // cell key -> boolean (initial sensor alert)
    config: { ...AI.CONFIG },
    start: [0, 0],
    spots: [],
    beliefs: [],
    budgets: [],
    startIndex: 0,
  };

  /** Recompute spots and beliefs from the grid, prior and initial signals. Clears rechecks. */
  PG.resetBeliefs = function () {
    S.start = AI.findStart(S.grid);
    S.spots = AI.orderSpots(S.grid, S.start);
    const keys = new Set(S.spots.map(key));
    for (const k of Object.keys(S.signals)) if (!keys.has(k)) delete S.signals[k];
    S.beliefs = S.spots.map(s => AI.occupancy(S.prior, !!S.signals[key(s)], S.config.sensitivity, S.config.falsePositive));
    S.budgets = S.spots.map(() => 1);
    S.startIndex = 0;
  };

  PG.plan = function () {
    return AI.plan(S.grid, S.beliefs, S.budgets, S.startIndex, { spots: S.spots, start: S.start, config: S.config });
  };

  /** Update model settings. Sensor changes re-derive the beliefs. */
  PG.setConfig = function (patch, source) {
    const sensorChanged = ('sensitivity' in patch && patch.sensitivity !== S.config.sensitivity) ||
      ('falsePositive' in patch && patch.falsePositive !== S.config.falsePositive);
    Object.assign(S.config, patch);
    if (sensorChanged) PG.resetBeliefs();
    PG.emit('change', { source: source || 'config' });
  };

  PG.setPrior = function (p, source) {
    S.prior = p;
    PG.resetBeliefs();
    PG.emit('change', { source: source || 'prior' });
  };

  /* ---------------- Event bus ---------------- */
  const listeners = {};
  PG.on = (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); };
  PG.emit = (name, detail) => { (listeners[name] || []).forEach(fn => fn(detail || {})); };

  /* ---------------- Toast & tooltip ---------------- */
  let toastTimer;
  PG.toast = function (text) {
    const t = PG.$('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  };
  PG.tip = {
    show(html, x, y) {
      const t = PG.$('tooltip');
      t.innerHTML = html;
      t.classList.add('on');
      const w = t.offsetWidth, h = t.offsetHeight;
      t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px';
      t.style.top = Math.max(8, y - h - 12) + 'px';
    },
    hide() { PG.$('tooltip').classList.remove('on'); },
  };

  /* ---------------- Grid view ---------------- */
  PG.GridView = function (el, { interactive = false } = {}) {
    this.el = el;
    this.cells = [];
    this.rows = 0;
    this.cols = 0;
    this.interactive = interactive;
  };
  PG.GridView.prototype.ensure = function (rows, cols) {
    if (rows === this.rows && cols === this.cols) return;
    this.rows = rows;
    this.cols = cols;
    this.el.style.setProperty('--cols', cols);
    this.el.toggleAttribute('data-dense', cols > 7);
    this.el.innerHTML = '';
    this.cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = document.createElement(this.interactive ? 'button' : 'div');
      if (this.interactive) cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      this.el.appendChild(cell);
      this.cells.push(cell);
    }
  };
  PG.GridView.prototype.cell = function (r, c) { return this.cells[r * this.cols + c]; };

  /** Base classes and text for a lot cell. */
  PG.baseCell = function (grid, r, c, spotIndex, beliefs) {
    const v = grid[r][c];
    if (v === '#') return { cls: 'cell wall', html: '', label: 'obstacle' };
    if (v === 'S') return { cls: 'cell start', html: grid.length > 7 ? 'IN' : 'START', label: 'entrance' };
    if (spotIndex >= 0) {
      const b = beliefs ? beliefs[spotIndex] : undefined;
      const alerted = b != null && b >= 0.5;
      return {
        cls: 'cell spot' + (alerted ? ' alerted' : ''),
        html: LABELS[spotIndex] + (b != null && grid.length <= 9 ? `<span class="belief">${Math.round(b * 100)}%</span>` : ''),
        label: `space ${LABELS[spotIndex]}` + (b != null ? `, ${Math.round(b * 100)}% occupied` : ''),
      };
    }
    return { cls: 'cell', html: '', label: 'road' };
  };

  /* ---------------- Car ---------------- */
  const CAR_SVG = '<svg viewBox="-26 -26 52 52"><rect x="-22" y="-14" width="44" height="28" rx="9" fill="#244D3F"/><path d="M-10 -9h16l6 6v8h-28v-8z" fill="#D7E7A3"/><rect x="-25" y="-15" width="7" height="5" rx="2" fill="#10201a"/><rect x="18" y="-15" width="7" height="5" rx="2" fill="#10201a"/><rect x="-25" y="10" width="7" height="5" rx="2" fill="#10201a"/><rect x="18" y="10" width="7" height="5" rx="2" fill="#10201a"/><circle cx="19" cy="-6" r="2.4" fill="#ffe7a3"/><circle cx="19" cy="6" r="2.4" fill="#ffe7a3"/></svg>';
  PG.Car = function (el, view) {
    this.el = el;
    this.view = view;
    this.token = 0;
    el.innerHTML = CAR_SVG;
  };
  PG.Car.prototype.place = function ([r, c], angle) {
    const cell = this.view.cell(r, c);
    if (!cell) return;
    const x = cell.offsetLeft + cell.offsetWidth / 2, y = cell.offsetTop + cell.offsetHeight / 2;
    this.el.style.setProperty('--car-size', Math.max(18, cell.offsetWidth * 0.82) + 'px');
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    if (angle !== undefined) this.el.firstChild.style.transform = `rotate(${angle}deg)`;
    this.el.classList.add('on');
  };
  PG.Car.prototype.hide = function () { this.token++; this.el.classList.remove('on'); };
  /** Animate along a path; resolves true when finished, false if cancelled. */
  PG.Car.prototype.drive = function (path, stepMs = 320, onStep) {
    const token = ++this.token;
    const ms = PG.reducedMotion() ? 0 : stepMs;
    return new Promise(resolve => {
      let i = 0, angle = 0;
      const tick = () => {
        if (token !== this.token) return resolve(false);
        const cur = path[i], next = path[i + 1] || null;
        const ref = next ? [cur, next] : (i > 0 ? [path[i - 1], cur] : null);
        if (ref) angle = Math.atan2(ref[1][0] - ref[0][0], ref[1][1] - ref[0][1]) * 180 / Math.PI;
        this.place(cur, angle);
        if (onStep) onStep(i, cur);
        if (++i >= path.length) return setTimeout(() => resolve(token === this.token), ms);
        setTimeout(tick, ms);
      };
      tick();
    });
  };
  PG.wait = ms => new Promise(r => setTimeout(r, PG.reducedMotion() ? 0 : ms));

  /* ---------------- Tiny SVG chart helpers ---------------- */
  PG.SERIES = ['#4f8a5b', '#3d7ab8', '#d29b2f', '#b5524a', '#8a62c4', '#2f9a9a'];
  PG.scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0);
  PG.esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /**
   * Line chart into an <svg viewBox="0 0 W H">.
   * opts: { series: [{ points: [[x,y]], color, dots, dashed, label }], x: [min,max], y: [min,max],
   *         xTicks, yTicks, xFmt, yFmt, hline: { y, label } }
   */
  PG.lineChart = function (svg, opts) {
    const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
    const m = { l: 44, r: 14, t: 12, b: 28 };
    const sx = PG.scale(opts.x[0], opts.x[1], m.l, W - m.r), sy = PG.scale(opts.y[0], opts.y[1], H - m.b, m.t);
    const xf = opts.xFmt || (v => v), yf = opts.yFmt || (v => v);
    let out = '';
    (opts.yTicks || []).forEach(v => { out += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${m.l - 6}" y="${sy(v) + 3}" text-anchor="end">${yf(v)}</text>`; });
    (opts.xTicks || []).forEach(v => { out += `<text x="${sx(v)}" y="${H - m.b + 16}" text-anchor="middle">${xf(v)}</text>`; });
    out += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/><line class="axis" x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}"/>`;
    if (opts.hline) out += `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${sy(opts.hline.y)}" y2="${sy(opts.hline.y)}"/><text x="${W - m.r}" y="${sy(opts.hline.y) - 5}" text-anchor="end" style="fill:var(--exit)">${opts.hline.label || ''}</text>`;
    opts.series.forEach(s => {
      if (!s.points.length) return;
      const d = s.points.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('');
      out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 5"' : ''}/>`;
      if (s.dots) s.points.forEach((p, i) => { out += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="4.5" fill="${(s.dotColors && s.dotColors[i]) || s.color}" stroke="var(--surface)" stroke-width="2"/>`; });
      if (s.label) { const p = s.points[s.points.length - 1]; out += `<text x="${sx(p[0]) + 4}" y="${sy(p[1]) - 6}" style="fill:${s.color};font-weight:800">${PG.esc(s.label)}</text>`; }
    });
    svg.innerHTML = out;
    return { sx, sy, m, W, H };
  };

  /** Horizontal bar rows for a few labelled values. */
  PG.hbars = function (title, rows, fmt) {
    const min = Math.min(0, ...rows.map(r => r.value - (r.err || 0))), max = Math.max(0, ...rows.map(r => r.value + (r.err || 0)));
    const span = max - min || 1, zero = (-min / span) * 100;
    return `<div class="bar-group"><h4>${title}</h4>` + rows.map(r => {
      const left = r.value >= 0 ? zero : zero + (r.value / span) * 100, width = Math.abs(r.value) / span * 100;
      return `<div class="hbar"><span>${r.label}</span><div class="track"><span class="${r.cls}" style="left:${left}%;width:${width}%"></span></div><b>${fmt(r)}</b></div>`;
    }).join('') + '</div>';
  };

  /* ---------------- Lab tabs ---------------- */
  PG.activeLab = 'search';
  PG.openLab = function (name, scroll) {
    PG.activeLab = name;
    document.querySelectorAll('[role=tab][data-lab]').forEach(t => {
      const on = t.dataset.lab === name;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      PG.$('lab-' + t.dataset.lab).hidden = !on;
    });
    PG.emit('lab', { name });
    if (scroll) PG.$('labs').scrollIntoView({ behavior: PG.reducedMotion() ? 'auto' : 'smooth' });
  };
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open-lab]');
    if (opener) { e.preventDefault(); PG.openLab(opener.dataset.openLab, true); }
    const tab = e.target.closest('[role=tab][data-lab]');
    if (tab) PG.openLab(tab.dataset.lab);
  });
  document.addEventListener('keydown', e => {
    const tab = e.target.closest && e.target.closest('[role=tab][data-lab]');
    if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('[role=tab][data-lab]')];
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    PG.openLab(next.dataset.lab);
  });

  /** Segmented button group helper: calls fn(value) on change. */
  PG.segmented = function (el, attr, fn) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-' + attr + ']');
      if (!b) return;
      el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      fn(b.dataset[attr]);
    });
  };
  PG.setSegmented = function (el, attr, value) {
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset[attr] === value));
  };

  PG.resetBeliefs();
})();
