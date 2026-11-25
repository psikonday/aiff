'use strict';
/* Node test runner. Writes docs/test-results.json and exits non-zero on failure. */
const fs = require('node:fs');
const path = require('node:path');
const AI = require('../js/core.js');
const Sim = require('../js/sim.js');
const { runAll } = require('./spec.js');

const started = Date.now();
const summary = runAll(AI, Sim, () => performance.now());
for (const r of summary.results) console.log(`${r.status} ${r.name}${r.error ? '  — ' + r.error : ''}`);
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'test-results.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.passed}/${summary.checks} tests passed in ${Date.now() - started} ms; ` +
  `${summary.safetyScenarios} safety scenarios; ${summary.shortestPathComparisons} shortest-path comparisons on ` +
  `${summary.randomMaps} maps; ${summary.simulatedEpisodes} simulated episodes.`);
process.exitCode = summary.failed ? 1 : 0;
