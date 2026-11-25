/* Team cards, defense timer, in-browser test runner, theme, shortcuts and scroll effects. */
(function () {
  'use strict';
  const { $ } = PG;

  /* ---------------- Team ---------------- */
  const TEAM = [
    { name: 'Dilnaz', initials: 'DI', color: '#d7e7a3', role: 'Problem, interface & evaluation', lab: 'sim',
      items: ['Problem statement and objectives', 'Planner user flow and map editor', 'Monte Carlo simulation lab'], defends: 'Opens the defense and leads the live demo' },
    { name: 'Aruana', initials: 'AR', color: '#f0c9a8', role: 'Search & route validation', lab: 'search',
      items: ['BFS with queue and predecessor map', 'DFS and A* comparison lab', 'Blocked-cell and oracle tests'], defends: 'Explains why BFS finds the shortest route' },
    { name: 'Madina', initials: 'MA', color: '#b9d4ef', role: 'Bayesian inference', lab: 'bayes',
      items: ['Sensor model and assumptions', 'Derivation of 75% and 7.7%', 'Repeated-reading lab'], defends: 'Explains how a reading changes the belief' },
    { name: 'Alnur', initials: 'AL', color: '#e8d48f', role: 'MDP, Value Iteration & testing', lab: 'mdp',
      items: ['States, actions, rewards, transitions', 'Value Iteration and convergence', 'Automated test suite'], defends: 'Explains the decision and the test results' },
  ];
  $('team-grid').innerHTML = TEAM.map(m => `<article class="card member reveal">
      <span class="avatar" style="background:${m.color}">${m.initials}</span>
      <div><h3>${m.name}</h3><div class="role">${m.role}</div></div>
      <ul>${m.items.map(i => `<li>${i}</li>`).join('')}</ul>
      <div class="role">🎤 ${m.defends}</div>
      <a class="btn small" href="#labs" data-open-lab="${m.lab}">Open ${m.name}'s lab →</a>
    </article>`).join('');

  /* ---------------- Defense mode ---------------- */
  const SEGMENTS = [
    { title: 'Problem statement & objectives', who: 'Dilnaz', secs: 120, target: 'top' },
    { title: 'Live demo', who: 'Dilnaz · Aruana', secs: 240, target: 'planner' },
    { title: 'Three AI topics', who: 'Aruana (BFS) · Madina (Bayes) · Alnur (MDP)', secs: 120, target: 'how' },
    { title: 'Questions & answers', who: 'Everyone answers individually', secs: 180, target: 'team' },
  ];
  const D = { on: false, seg: 0, elapsed: SEGMENTS.map(() => 0), running: false, last: 0, raf: 0 };
  $('defense-track').innerHTML = SEGMENTS.map((s, i) => `<button class="defense-seg" style="--w:${s.secs}" data-seg="${i}"><div class="bar"><span></span></div><small>${s.title} · ${Math.round(s.secs / 60)} min</small></button>`).join('');
  const fmt = t => { const s = Math.abs(Math.round(t)); return (t < 0 ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function drawDefense() {
    const s = SEGMENTS[D.seg], left = s.secs - D.elapsed[D.seg];
    $('defense-clock').textContent = fmt(left);
    $('defense-clock').classList.toggle('over', left < 0);
    $('defense-title').textContent = `${D.seg + 1}/${SEGMENTS.length} · ${s.title}`;
    $('defense-who').textContent = s.who;
    $('defense-play').textContent = D.running ? '❚❚ Pause' : '▶ Start';
    document.querySelectorAll('.defense-seg').forEach((b, i) => {
      b.classList.toggle('now', i === D.seg);
      b.querySelector('span').style.width = Math.min(100, D.elapsed[i] / SEGMENTS[i].secs * 100) + '%';
    });
  }
  function loop(t) {
    if (!D.running) return;
    D.elapsed[D.seg] += (t - D.last) / 1000;
    D.last = t;
    drawDefense();
    D.raf = requestAnimationFrame(loop);
  }
  function playPause() {
    D.running = !D.running;
    if (D.running) { D.last = performance.now(); D.raf = requestAnimationFrame(loop); }
    drawDefense();
  }
  function goto(i) {
    D.seg = Math.max(0, Math.min(SEGMENTS.length - 1, i));
    const el = $(SEGMENTS[D.seg].target);
    if (el) el.scrollIntoView({ behavior: PG.reducedMotion() ? 'auto' : 'smooth' });
    drawDefense();
  }
  function toggleDefense(force) {
    D.on = force === undefined ? !D.on : force;
    $('defense').classList.toggle('on', D.on);
    $('defense-toggle').setAttribute('aria-pressed', D.on);
    if (!D.on && D.running) playPause();
    drawDefense();
  }
  PG.toggleDefense = toggleDefense;
  $('defense-toggle').addEventListener('click', () => toggleDefense());
  $('defense-close').addEventListener('click', () => toggleDefense(false));
  $('defense-play').addEventListener('click', playPause);
  $('defense-next').addEventListener('click', () => goto(D.seg + 1));
  $('defense-prev').addEventListener('click', () => goto(D.seg - 1));
  $('defense-reset').addEventListener('click', () => { D.elapsed = SEGMENTS.map(() => 0); D.seg = 0; if (D.running) playPause(); drawDefense(); });
  $('defense-track').addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (b) goto(Number(b.dataset.seg)); });
  drawDefense();

  /* ---------------- In-browser tests ---------------- */
  let testsRan = false;
  function runTests() {
    const btn = $('run-tests');
    btn.disabled = true;
    btn.textContent = 'Running…';
    $('test-list').innerHTML = '<p class="muted" style="padding:22px;font-size:12px">Running 30+ checks, including about 25,000 simulated episodes…</p>';
    setTimeout(() => {
      const t0 = performance.now();
      const res = window.ParkingTests.runAll(PG.AI, window.ParkingSim, () => performance.now());
      const ms = performance.now() - t0;
      testsRan = true;
      $('score-big').innerHTML = `${res.passed}<small>/${res.checks}</small>`;
      $('score-bar').style.width = (res.passed / res.checks * 100) + '%';
      $('score-bar').style.background = res.failed ? 'var(--exit)' : 'var(--drive)';
      $('fact-safety').textContent = res.safetyScenarios;
      $('fact-paths').textContent = res.shortestPathComparisons;
      $('fact-episodes').textContent = (res.simulatedEpisodes / 1000).toFixed(1) + 'k';
      $('fact-time').textContent = (ms / 1000).toFixed(2) + 's';
      $('stat-tests').textContent = res.checks;
      let group = '';
      $('test-list').innerHTML = res.results.map(r => {
        const head = r.group !== group ? `<div class="test-group">${(group = r.group)}</div>` : '';
        return head + `<div class="test-row ${r.status.toLowerCase()}"><span class="badge">${r.status}</span><span>${PG.esc(r.name)}${r.error ? `<br><small class="mono">${PG.esc(r.error)}</small>` : ''}</span><span class="ms">${r.ms} ms</span></div>`;
      }).join('');
      btn.disabled = false;
      btn.textContent = '↻ Run again';
      PG.toast(res.failed ? `${res.failed} test(s) failed` : `All ${res.checks} tests passed`);
    }, 40);
  }
  $('run-tests').addEventListener('click', runTests);
  try { $('stat-tests').textContent = window.ParkingTests.defineTests(PG.AI, window.ParkingSim).tests.length; } catch (e) { /* keep static value */ }

  /* ---------------- Theme ---------------- */
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('pg-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  }
  $('theme-toggle').addEventListener('click', toggleTheme);

  /* ---------------- Shortcuts ---------------- */
  $('shortcuts-open').addEventListener('click', () => $('shortcuts').showModal());
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag) || $('shortcuts').open) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); PG.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && D.on && tag !== 'button') { e.preventDefault(); playPause(); return; }
    const brushes = { 1: 'wall', 2: 'spot', 3: 'start', 4: 'road' };
    if (brushes[k]) PG.setBrush(brushes[k]);
    else if (k === 'p') PG.preview();
    else if (k === 'h') PG.toggleHeat();
    else if (k === 'r') PG.scenario('random');
    else if (k === 'd') toggleDefense();
    else if (k === 't') toggleTheme();
    else if (k === '?') $('shortcuts').showModal();
    else if (D.on && k === 'arrowright') goto(D.seg + 1);
    else if (D.on && k === 'arrowleft') goto(D.seg - 1);
  });

  /* ---------------- Scroll effects ---------------- */
  const progress = $('scroll-progress');
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    progress.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    const links = [...document.querySelectorAll('.site-nav a')];
    const spy = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    ['planner', 'how', 'labs', 'results', 'team'].forEach(id => spy.observe($(id)));

    const reveal = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll('.how-item, .member, .resource, .score, .story > div').forEach(el => { el.classList.add('reveal'); reveal.observe(el); });

    const auto = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting && !testsRan) { auto.disconnect(); runTests(); }
    }), { threshold: 0.25 });
    auto.observe($('results'));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }
})();
