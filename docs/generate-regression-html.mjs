#!/usr/bin/env node
/**
 * Generates docs/regression-test-procedure.html from structured test cases.
 * Run: node docs/build-regression-cases.mjs && node docs/generate-regression-html.mjs
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { TEST_CASES, SECTIONS } from './regression-test-cases.mjs'
import { FAILURE_NOTE_TEMPLATE } from './regression-test-schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KnockScout — Manual Regression Test Procedure</title>
  <style>
    :root {
      --bg: #0f0f0f;
      --surface: #1a1a1a;
      --border: rgba(255,255,255,0.12);
      --text: #f0f0f0;
      --muted: rgba(255,255,255,0.55);
      --pass: #22c55e;
      --fail: #ef4444;
      --blocked: #f59e0b;
      --pending: rgba(255,255,255,0.25);
      --step-bg: rgba(255,255,255,0.03);
      --step-fail: rgba(239,68,68,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
      font-size: 14px;
    }
    .header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15,15,15,0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 12px 16px;
    }
    .header h1 { margin: 0 0 8px; font-size: 1.15rem; }
    .run-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .run-meta input, .run-meta select {
      font: inherit;
      font-size: 0.8rem;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      width: 150px;
    }
    .run-meta label { font-size: 0.7rem; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 10px; }
    .kpi {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .kpi .kpi-value { font-size: 1.25rem; font-weight: 700; line-height: 1.2; }
    .kpi .kpi-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-top: 2px; }
    .kpi.k-pass .kpi-value { color: var(--pass); }
    .kpi.k-fail .kpi-value { color: var(--fail); }
    .kpi.k-blocked .kpi-value { color: var(--blocked); }
    .summary { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.85rem; color: var(--muted); margin-bottom: 10px; }
    .summary strong { color: var(--text); }
    .section-bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: #333; flex: 1; max-width: 180px; }
    .section-bar span { display: block; height: 100%; }
    .section-bar .sb-pass { background: var(--pass); }
    .section-bar .sb-fail { background: var(--fail); }
    .section-bar .sb-blocked { background: var(--blocked); }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .controls input, .controls select, .controls button {
      font: inherit;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
    }
    .controls button { cursor: pointer; }
    .controls button:hover { background: #252525; }
    .controls button.primary { border-color: var(--pass); color: var(--pass); }
    .progress-wrap { margin-top: 10px; }
    .progress-bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--pass); transition: width 0.2s; }
    main { max-width: 960px; margin: 0 auto; padding: 16px; }
    details.readme { margin-bottom: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    details.readme summary { cursor: pointer; font-weight: 600; }
    details.readme code { font-size: 0.85em; }
    .section { margin-bottom: 20px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: var(--surface);
      cursor: pointer;
      user-select: none;
    }
    .section-header h2 { margin: 0; font-size: 1rem; font-weight: 600; }
    .section-meta { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
    .section-body { display: none; padding: 0 8px 8px; }
    .section.open .section-body { display: block; }
    .case {
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-top: 8px;
      padding: 10px 12px;
      background: #141414;
    }
    .case.hidden { display: none; }
    .case-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; justify-content: space-between; }
    .case-id { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--muted); }
    .case-title { font-weight: 600; flex: 1; min-width: 200px; }
    .case-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tag { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.08); color: var(--muted); text-transform: uppercase; }
    .status-btn {
      min-width: 88px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .status-pending { background: transparent; color: var(--muted); }
    .status-pass { background: rgba(34,197,94,0.15); color: var(--pass); border-color: var(--pass); }
    .status-fail { background: rgba(239,68,68,0.15); color: var(--fail); border-color: var(--fail); }
    .status-blocked { background: rgba(245,158,11,0.15); color: var(--blocked); border-color: var(--blocked); }
    .copy-btn {
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 0.75rem;
      cursor: pointer;
    }
    .copy-btn:hover { color: var(--text); background: rgba(255,255,255,0.06); }
    .case-pre, .case-expected { font-size: 0.85rem; margin: 8px 0 4px; }
    .case-pre strong, .case-expected strong { color: var(--muted); font-weight: 500; }
    .steps-heading {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin: 10px 0 6px;
    }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .step {
      display: flex;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--step-bg);
    }
    .step.step-failed { border-color: var(--fail); background: var(--step-fail); }
    .step.step-passed { border-color: rgba(34,197,94,0.45); background: rgba(34,197,94,0.05); }
    .step-num {
      flex-shrink: 0;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--muted);
    }
    .step.step-failed .step-num { background: rgba(239,68,68,0.25); color: var(--fail); }
    .step.step-passed .step-num { background: rgba(34,197,94,0.25); color: var(--pass); }
    .step-body { flex: 1; min-width: 0; }
    .step-row { margin: 0 0 4px; font-size: 0.85rem; }
    .step-row:last-child { margin-bottom: 0; }
    .step-label {
      display: inline-block;
      min-width: 3.5rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--muted);
      vertical-align: top;
    }
    .step-label.do { color: #93c5fd; }
    .step-label.check { color: #86efac; }
    .step-label.ui { color: #fcd34d; }
    .step-actions { display: flex; gap: 6px; margin-top: 8px; }
    .step-btn {
      padding: 3px 14px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .step-btn:hover { color: var(--text); }
    .step-btn.pass.on { background: rgba(34,197,94,0.18); color: var(--pass); border-color: var(--pass); }
    .step-btn.fail.on { background: rgba(239,68,68,0.18); color: var(--fail); border-color: var(--fail); }
    .step-actual { margin-top: 8px; }
    .step-actual-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--fail);
      margin-bottom: 4px;
    }
    .step-actual-input {
      width: 100%;
      min-height: 56px;
      resize: vertical;
      font: inherit;
      font-size: 0.85rem;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid rgba(239,68,68,0.4);
      background: var(--bg);
      color: var(--text);
    }
    .case-notes-wrap { margin-top: 10px; }
    .case-notes-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .case-notes {
      width: 100%;
      min-height: 88px;
      resize: vertical;
      font: inherit;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
    }
    @media print {
      .header .controls, .status-btn, .copy-btn, .case-notes, .step-actions { display: none !important; }
      .section-body { display: block !important; }
      .case::after {
        content: " [" attr(data-status-print) "]";
        font-weight: bold;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>KnockScout Manual Regression Test Procedure</h1>
    <div class="run-meta">
      <label>Tester<input type="text" id="runTester" placeholder="Your name" /></label>
      <label>Build / commit<input type="text" id="runBuild" placeholder="e.g. 7759524" /></label>
      <label>Environment<select id="runEnv">
        <option value="production">Production</option>
        <option value="preview">Preview</option>
        <option value="localhost">Localhost</option>
      </select></label>
      <label>Run started<input type="text" id="runStarted" readonly /></label>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="summary" id="summary"></div>
    <div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
    </div>
    <div class="controls" style="margin-top:10px">
      <input type="search" id="searchInput" placeholder="Search cases, steps, UI…" aria-label="Search" />
      <select id="statusFilter" aria-label="Status filter">
        <option value="all">All statuses</option>
        <option value="pending">Not run</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
        <option value="blocked">Blocked</option>
      </select>
      <select id="roleFilter" aria-label="Role filter">
        <option value="all">All roles</option>
        <option value="solo">Solo</option>
        <option value="team-admin">Team admin</option>
        <option value="team-member">Team member</option>
        <option value="logged-out">Logged out</option>
      </select>
      <select id="sectionFilter" aria-label="Section filter">
        <option value="all">All sections</option>
      </select>
      <button type="button" id="expandAll">Expand all</button>
      <button type="button" id="collapseAll">Collapse all</button>
      <button type="button" id="exportBtn">Export JSON</button>
      <button type="button" id="exportCsvBtn">Export CSV</button>
      <button type="button" id="exportAgentBtn" class="primary">Export agent bundle</button>
      <button type="button" id="importBtn">Import JSON</button>
      <input type="file" id="importFile" accept="application/json" hidden />
      <button type="button" id="resetAll">Reset all</button>
    </div>
  </header>
  <main>
    <details class="readme">
      <summary>How to use this checklist</summary>
      <ol>
        <li>Fill in <strong>Tester</strong>, <strong>Build/commit</strong> (e.g. from <code>git log -1 --oneline</code>), and <strong>Environment</strong> at the top — these are stamped into every export and agent report.</li>
        <li>Open the app at <code>http://localhost:3000</code> (or your deploy URL) in a separate window.</li>
        <li>Pick a <strong>role filter</strong> matching the account you are testing.</li>
        <li>Follow each test’s numbered steps in order. Each step has a <strong>Do</strong> action and a <strong>Verify</strong> checkpoint — mark it <strong>Pass</strong> or <strong>Fail</strong> as you go.</li>
        <li>When you mark a step <strong>Fail</strong>, a box appears asking what you actually saw — describe it there. Failure notes auto-fill from your step results (Verify statement = expected, your description = actual).</li>
        <li>The case status is set automatically: any failed step marks the case Fail; all steps passed marks it Pass. The status button still works as a manual override (e.g. for Blocked).</li>
        <li>Use <strong>Copy agent report</strong> on a failed case to paste a full debugging report into an agent.</li>
        <li>Progress saves automatically in this browser via localStorage.</li>
        <li>Use <strong>Export agent bundle</strong> to download all failures with full step context for batch debugging.</li>
      </ol>
    </details>
    <div id="sections"></div>
  </main>
  <script>
    const STORAGE_KEY = 'knockscout-regression-v2';
    const FAILURE_NOTE_TEMPLATE = ${JSON.stringify(FAILURE_NOTE_TEMPLATE)};
    const SECTIONS = ${JSON.stringify(SECTIONS)};
    const TEST_CASES = ${JSON.stringify(TEST_CASES, null, 2)};

    const STATUSES = ['pending', 'pass', 'fail', 'blocked'];
    const STATUS_LABELS = { pending: 'Not run', pass: 'Pass', fail: 'Fail', blocked: 'Blocked' };

    let state = loadState();

    function normalizeCaseSteps(steps) {
      return steps.map((s, i) => {
        if (typeof s === 'string') {
          return { n: i + 1, action: s, verify: 'Step completes without error.', ui: '' };
        }
        return { n: i + 1, action: s.action, verify: s.verify, ui: s.ui || '' };
      });
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
        const legacy = localStorage.getItem('knockscout-regression-v1');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          return { cases: parsed.cases || {}, exportedAt: parsed.exportedAt || null };
        }
      } catch (_) {}
      return { cases: {}, exportedAt: null, run: null };
    }

    function ensureRun() {
      if (!state.run) {
        state.run = { tester: '', build: '', env: 'production', startedAt: new Date().toISOString() };
        saveState();
      }
      return state.run;
    }

    function saveState() {
      state.exportedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateSummary();
    }

    function defaultCaseState() {
      return { status: 'pending', notes: '', notesEdited: false, failedAtStep: null, updatedAt: null, steps: {} };
    }

    function getStepState(cs, n) {
      return (cs.steps && cs.steps[n]) || { status: null, actual: '' };
    }

    function getCaseState(id) {
      return { ...defaultCaseState(), ...(state.cases[id] || {}) };
    }

    function setCaseState(id, patch) {
      state.cases[id] = { ...getCaseState(id), ...patch };
      saveState();
    }

    function cycleStatus(id) {
      const cur = getCaseState(id);
      const idx = STATUSES.indexOf(cur.status);
      const next = STATUSES[(idx + 1) % STATUSES.length];
      const patch = { status: next, updatedAt: new Date().toISOString() };
      if (next !== 'fail') patch.failedAtStep = null;
      setCaseState(id, patch);
      render();
    }

    function setNotes(id, notes) {
      // Manual edits stick; clearing the field re-enables auto-fill from step states.
      setCaseState(id, { notes, notesEdited: notes.trim() !== '' });
    }

    let focusStep = null;

    function generateAutoNotes(tcDef, stepStates) {
      const norm = normalizeCaseSteps(tcDef.steps);
      const failed = norm.filter(s => stepStates[s.n] && stepStates[s.n].status === 'fail');
      if (!failed.length) return '';
      const blocks = failed.map(s => {
        const actual = (stepStates[s.n].actual || '').trim();
        const lines = [
          'Failed at step ' + s.n + ':',
          'Step action attempted: ' + s.action,
          'Expected behavior (verify): ' + s.verify,
          'Actual behavior: ' + (actual || '(describe what you saw in the box under step ' + s.n + ')'),
        ];
        if (s.ui) lines.push('UI surface: ' + s.ui);
        return lines.join('\\n');
      });
      return blocks.join('\\n\\n') +
        '\\n\\nConsole/network errors:\\nScreenshot or recording:\\nRegression test ID: ' + tcDef.id;
    }

    function deriveCaseFromSteps(tcDef, stepStates) {
      const total = normalizeCaseSteps(tcDef.steps).length;
      const failedNums = Object.keys(stepStates)
        .filter(n => stepStates[n] && stepStates[n].status === 'fail')
        .map(Number)
        .sort((a, b) => a - b);
      const passCount = Object.keys(stepStates)
        .filter(n => stepStates[n] && stepStates[n].status === 'pass').length;
      let status = 'pending';
      if (failedNums.length) status = 'fail';
      else if (passCount === total) status = 'pass';
      return { status, failedAtStep: failedNums[0] || null };
    }

    function markStep(id, n, targetStatus) {
      const tcDef = TEST_CASES.find(t => t.id === id);
      const cs = getCaseState(id);
      const steps = { ...(cs.steps || {}) };
      const cur = steps[n] || { status: null, actual: '' };
      const next = cur.status === targetStatus ? null : targetStatus;
      steps[n] = { ...cur, status: next };
      const derived = deriveCaseFromSteps(tcDef, steps);
      const patch = { steps, status: derived.status, failedAtStep: derived.failedAtStep, updatedAt: new Date().toISOString() };
      if (!cs.notesEdited) patch.notes = generateAutoNotes(tcDef, steps);
      setCaseState(id, patch);
      if (next === 'fail') focusStep = { caseId: id, n };
      render();
    }

    function setStepActual(id, n, text) {
      const tcDef = TEST_CASES.find(t => t.id === id);
      const cs = getCaseState(id);
      const steps = { ...(cs.steps || {}) };
      steps[n] = { ...(steps[n] || { status: 'fail', actual: '' }), actual: text };
      const patch = { steps };
      if (!cs.notesEdited) {
        patch.notes = generateAutoNotes(tcDef, steps);
      }
      setCaseState(id, patch);
      // Update the visible notes textarea in place (no re-render, keeps typing focus)
      if (patch.notes != null) {
        document.querySelectorAll('.case-notes').forEach(ta => {
          if (ta.dataset.id === id) ta.value = patch.notes;
        });
      }
    }

    function stepSearchHay(tc) {
      const parts = [tc.id, tc.title, tc.preconditions, tc.expected];
      tc.steps.forEach(s => {
        if (typeof s === 'string') parts.push(s);
        else parts.push(s.action, s.verify, s.ui || '');
      });
      return parts.join(' ').toLowerCase();
    }

    function matchesFilters(tc) {
      const q = document.getElementById('searchInput').value.trim().toLowerCase();
      const statusF = document.getElementById('statusFilter').value;
      const roleF = document.getElementById('roleFilter').value;
      const sectionF = document.getElementById('sectionFilter').value;
      const cs = getCaseState(tc.id);
      if (statusF !== 'all' && cs.status !== statusF) return false;
      if (roleF !== 'all' && !tc.roles.includes(roleF)) return false;
      if (sectionF !== 'all' && tc.section !== sectionF) return false;
      if (q && !stepSearchHay(tc).includes(q)) return false;
      return true;
    }

    function computeTotals() {
      const total = TEST_CASES.length;
      let pass = 0, fail = 0, blocked = 0, pending = 0;
      const timestamps = [];
      TEST_CASES.forEach(tc => {
        const cs = getCaseState(tc.id);
        if (cs.status === 'pass') pass++;
        else if (cs.status === 'fail') fail++;
        else if (cs.status === 'blocked') blocked++;
        else pending++;
        if (cs.updatedAt) timestamps.push(cs.updatedAt);
      });
      const done = pass + fail + blocked;
      return { total, pass, fail, blocked, pending, done, timestamps };
    }

    function updateSummary() {
      const t = computeTotals();
      const completionPct = t.total ? Math.round((t.done / t.total) * 100) : 0;
      const passRate = t.done ? Math.round((t.pass / t.done) * 100) : 0;

      // Pace: cases touched in the last hour of activity
      let pace = '—';
      if (t.timestamps.length >= 2) {
        const times = t.timestamps.map(ts => new Date(ts).getTime()).sort((a, b) => a - b);
        const elapsedH = (times[times.length - 1] - times[0]) / 3600000;
        if (elapsedH > 0.01) {
          const perHour = t.done / elapsedH;
          pace = perHour.toFixed(0) + '/hr';
        }
      }
      let eta = '—';
      if (pace !== '—' && t.pending > 0) {
        const perHour = parseFloat(pace);
        if (perHour > 0) {
          const hrsLeft = t.pending / perHour;
          eta = hrsLeft >= 1 ? hrsLeft.toFixed(1) + ' hr left' : Math.ceil(hrsLeft * 60) + ' min left';
        }
      }

      document.getElementById('kpis').innerHTML =
        kpi(t.total, 'Total cases') +
        kpi(t.pass, 'Pass', 'k-pass') +
        kpi(t.fail, 'Fail', 'k-fail') +
        kpi(t.blocked, 'Blocked', 'k-blocked') +
        kpi(t.pending, 'Not run') +
        kpi(completionPct + '%', 'Completion') +
        kpi(passRate + '%', 'Pass rate (of run)') +
        kpi(pace, 'Pace') +
        kpi(eta, 'Est. remaining');

      document.getElementById('summary').innerHTML =
        '<span><strong>' + t.done + '</strong> / ' + t.total + ' touched</span>' +
        (t.fail ? '<span style="color:var(--fail)"><strong>' + t.fail + '</strong> need debugging — use Export agent bundle</span>' : '');
      document.getElementById('progressFill').style.width = completionPct + '%';
    }

    function kpi(value, label, cls) {
      return '<div class="kpi ' + (cls || '') + '"><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div></div>';
    }

    function buildAgentReport(tc) {
      const cs = getCaseState(tc.id);
      const steps = normalizeCaseSteps(tc.steps);
      const sec = SECTIONS.find(s => s.id === tc.section);
      const stepStates = cs.steps || {};
      const failedSteps = steps.filter(s => stepStates[s.n] && stepStates[s.n].status === 'fail');
      const run = state.run || {};
      const lines = [
        '# Regression failure report',
        '',
        '## Test case',
        '- ID: ' + tc.id,
        '- Title: ' + tc.title,
        '- Section: ' + (sec ? sec.id + ' — ' + sec.title : tc.section),
        '- Roles: ' + tc.roles.join(', '),
        '- Viewport: ' + tc.viewport,
        '- Status: ' + cs.status,
        '- Build/commit: ' + (run.build || 'unknown'),
        '- Environment: ' + (run.env || 'unknown'),
        '- Tester: ' + (run.tester || 'unknown'),
        '',
        '## Preconditions',
        tc.preconditions,
        '',
        '## Steps performed',
      ];
      steps.forEach(s => {
        const st = stepStates[s.n];
        const marker = st && st.status === 'fail' ? ' **[FAILED]**'
          : st && st.status === 'pass' ? ' [passed]'
          : (cs.failedAtStep === s.n ? ' **[FAILED HERE]**' : '');
        lines.push(s.n + '. **Do:** ' + s.action + marker);
        lines.push('   **Verify:** ' + s.verify);
        if (s.ui) lines.push('   **UI:** ' + s.ui);
        lines.push('');
      });
      lines.push('## Overall expected outcome');
      lines.push(tc.expected);
      lines.push('');
      failedSteps.forEach(fs => {
        const actual = (stepStates[fs.n].actual || '').trim();
        lines.push('## Failure at step ' + fs.n);
        lines.push('- Action attempted: ' + fs.action);
        lines.push('- Expected behavior (verify): ' + fs.verify);
        lines.push('- Actual behavior: ' + (actual || '(not described)'));
        if (fs.ui) lines.push('- UI surface: ' + fs.ui);
        lines.push('');
      });
      lines.push('## Tester notes');
      lines.push(cs.notes || '(none)');
      lines.push('');
      lines.push('## Agent task');
      lines.push('Reproduce this regression test failure, identify root cause in the codebase, and fix it. Focus on the failed step UI surface and verify criteria above.');
      return lines.join('\\n');
    }

    function renderSteps(tc, cs) {
      const steps = normalizeCaseSteps(tc.steps);
      return steps.map(s => {
        const st = getStepState(cs, s.n);
        const failed = st.status === 'fail';
        const passed = st.status === 'pass';
        const uiRow = s.ui
          ? '<div class="step-row"><span class="step-label ui">UI</span>' + escapeHtml(s.ui) + '</div>'
          : '';
        const actualBox = failed
          ? '<div class="step-actual">' +
              '<label class="step-actual-label">Verify failed — what did you actually see? (auto-fills failure notes)</label>' +
              '<textarea class="step-actual-input" data-case="' + tc.id + '" data-step="' + s.n + '" ' +
                'placeholder="Describe the actual behavior…">' + escapeHtml(st.actual || '') + '</textarea>' +
            '</div>'
          : '';
        return '<li class="step' + (failed ? ' step-failed' : '') + (passed ? ' step-passed' : '') + '" data-step="' + s.n + '">' +
          '<div class="step-num">' + s.n + '</div>' +
          '<div class="step-body">' +
            '<div class="step-row"><span class="step-label do">Do</span>' + escapeHtml(s.action) + '</div>' +
            '<div class="step-row"><span class="step-label check">Verify</span>' + escapeHtml(s.verify) + '</div>' +
            uiRow +
            '<div class="step-actions">' +
              '<button type="button" class="step-btn pass' + (passed ? ' on' : '') + '" data-case="' + tc.id + '" data-step="' + s.n + '" data-set="pass">Pass</button>' +
              '<button type="button" class="step-btn fail' + (failed ? ' on' : '') + '" data-case="' + tc.id + '" data-step="' + s.n + '" data-set="fail">Fail</button>' +
            '</div>' +
            actualBox +
          '</div>' +
        '</li>';
      }).join('');
    }

    function notesPlaceholder(tc) {
      return FAILURE_NOTE_TEMPLATE.replace('Regression test ID:', 'Regression test ID: ' + tc.id);
    }

    function render() {
      const root = document.getElementById('sections');
      root.innerHTML = '';
      SECTIONS.forEach(sec => {
        const cases = TEST_CASES.filter(tc => tc.section === sec.id);
        const visible = cases.filter(matchesFilters);
        let secPass = 0, secFail = 0, secBlocked = 0;
        cases.forEach(tc => {
          const s = getCaseState(tc.id).status;
          if (s === 'pass') secPass++;
          else if (s === 'fail') secFail++;
          else if (s === 'blocked') secBlocked++;
        });

        const sectionEl = document.createElement('div');
        sectionEl.className = 'section open';
        sectionEl.dataset.section = sec.id;

        const pctOf = n => cases.length ? (n / cases.length) * 100 : 0;
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = '<h2>' + sec.id + ' — ' + sec.title + '</h2>' +
          '<div class="section-bar" title="' + secPass + ' pass / ' + secFail + ' fail / ' + secBlocked + ' blocked">' +
            '<span class="sb-pass" style="width:' + pctOf(secPass) + '%"></span>' +
            '<span class="sb-fail" style="width:' + pctOf(secFail) + '%"></span>' +
            '<span class="sb-blocked" style="width:' + pctOf(secBlocked) + '%"></span>' +
          '</div>' +
          '<span class="section-meta">' + secPass + '/' + cases.length + ' pass · ' + visible.length + ' shown</span>';
        header.addEventListener('click', () => sectionEl.classList.toggle('open'));

        const body = document.createElement('div');
        body.className = 'section-body';

        cases.forEach(tc => {
          const cs = getCaseState(tc.id);
          const show = matchesFilters(tc);
          const caseEl = document.createElement('div');
          caseEl.className = 'case' + (show ? '' : ' hidden');
          caseEl.dataset.statusPrint = STATUS_LABELS[cs.status];

          const tags = tc.roles.map(r => '<span class="tag">' + r + '</span>').join('') +
            '<span class="tag">' + tc.viewport + '</span>' +
            (cs.updatedAt ? '<span class="tag" title="Last status change">' + new Date(cs.updatedAt).toLocaleString() + '</span>' : '');

          caseEl.innerHTML =
            '<div class="case-top">' +
              '<div><div class="case-id">' + tc.id + '</div><div class="case-title">' + escapeHtml(tc.title) + '</div>' +
              '<div class="tags">' + tags + '</div></div>' +
              '<div class="case-actions">' +
                '<button type="button" class="copy-btn" data-copy="' + tc.id + '" title="Copy agent-friendly failure report">Copy agent report</button>' +
                '<button type="button" class="status-btn status-' + cs.status + '" data-id="' + tc.id + '">' +
                  STATUS_LABELS[cs.status] + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="case-pre"><strong>Preconditions:</strong> ' + escapeHtml(tc.preconditions) + '</div>' +
            '<div class="steps-heading">Procedure (' + normalizeCaseSteps(tc.steps).length + ' steps)</div>' +
            '<ol class="steps">' + renderSteps(tc, cs) + '</ol>' +
            '<div class="case-expected"><strong>Overall expected:</strong> ' + escapeHtml(tc.expected) + '</div>' +
            '<div class="case-notes-wrap">' +
              '<div class="case-notes-label"><span>Failure notes (for agent debugging)</span></div>' +
              '<textarea class="case-notes" placeholder="' + escapeHtml(notesPlaceholder(tc)) + '" data-id="' + tc.id + '">' +
                escapeHtml(cs.notes || '') + '</textarea>' +
            '</div>';

          caseEl.querySelector('.status-btn').addEventListener('click', e => {
            e.stopPropagation();
            cycleStatus(tc.id);
          });
          caseEl.querySelector('.case-notes').addEventListener('input', e => {
            setNotes(tc.id, e.target.value);
          });
          caseEl.querySelector('[data-copy]').addEventListener('click', e => {
            e.stopPropagation();
            const text = buildAgentReport(tc);
            navigator.clipboard.writeText(text).then(() => {
              e.target.textContent = 'Copied!';
              setTimeout(() => { e.target.textContent = 'Copy agent report'; }, 1500);
            }).catch(() => alert(text));
          });
          caseEl.querySelectorAll('.step-btn').forEach(btn => {
            btn.addEventListener('click', e => {
              e.stopPropagation();
              markStep(btn.dataset.case, Number(btn.dataset.step), btn.dataset.set);
            });
          });
          caseEl.querySelectorAll('.step-actual-input').forEach(input => {
            input.addEventListener('input', () => {
              setStepActual(input.dataset.case, Number(input.dataset.step), input.value);
            });
          });

          body.appendChild(caseEl);
        });

        sectionEl.appendChild(header);
        sectionEl.appendChild(body);
        root.appendChild(sectionEl);
      });
      updateSummary();
      if (focusStep) {
        const sel = '.step-actual-input[data-case="' + focusStep.caseId + '"][data-step="' + focusStep.n + '"]';
        const ta = document.querySelector(sel);
        if (ta) ta.focus();
        focusStep = null;
      }
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function buildExportPayload(version) {
      const failures = TEST_CASES
        .filter(tc => {
          const s = getCaseState(tc.id);
          return s.status === 'fail' || s.status === 'blocked';
        })
        .map(tc => {
          const cs = getCaseState(tc.id);
          const steps = normalizeCaseSteps(tc.steps);
          const stepStates = cs.steps || {};
          const failedSteps = steps
            .filter(s => stepStates[s.n] && stepStates[s.n].status === 'fail')
            .map(s => ({ ...s, actual: (stepStates[s.n].actual || '').trim() }));
          const failedStep = cs.failedAtStep ? steps.find(s => s.n === cs.failedAtStep) : null;
          return {
            id: tc.id,
            title: tc.title,
            section: tc.section,
            roles: tc.roles,
            viewport: tc.viewport,
            preconditions: tc.preconditions,
            expected: tc.expected,
            status: cs.status,
            failedAtStep: cs.failedAtStep,
            failedStep,
            failedSteps,
            stepStates,
            notes: cs.notes,
            steps,
            agentReport: buildAgentReport(tc),
          };
        });

      return {
        version,
        exportedAt: new Date().toISOString(),
        run: state.run || null,
        summary: {
          total: TEST_CASES.length,
          pass: TEST_CASES.filter(tc => getCaseState(tc.id).status === 'pass').length,
          fail: TEST_CASES.filter(tc => getCaseState(tc.id).status === 'fail').length,
          blocked: TEST_CASES.filter(tc => getCaseState(tc.id).status === 'blocked').length,
        },
        cases: state.cases,
        failures,
      };
    }

    function buildCsv() {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const run = state.run || {};
      const rows = [
        ['id', 'section', 'title', 'roles', 'viewport', 'status', 'failedSteps', 'stepsPassed', 'updatedAt', 'notes', 'tester', 'build', 'env'].map(esc).join(','),
      ];
      TEST_CASES.forEach(tc => {
        const cs = getCaseState(tc.id);
        const stepStates = cs.steps || {};
        const failedNums = Object.keys(stepStates).filter(n => stepStates[n] && stepStates[n].status === 'fail');
        const passedNums = Object.keys(stepStates).filter(n => stepStates[n] && stepStates[n].status === 'pass');
        rows.push([
          tc.id, tc.section, tc.title, tc.roles.join('|'), tc.viewport,
          cs.status, failedNums.join(';'), passedNums.length, cs.updatedAt || '', cs.notes || '',
          run.tester || '', run.build || '', run.env || '',
        ].map(esc).join(','));
      });
      return rows.join('\\n');
    }

    function downloadJson(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // Populate section filter
    (function () {
      const sel = document.getElementById('sectionFilter');
      SECTIONS.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.id + ' — ' + sec.title;
        sel.appendChild(opt);
      });
    })();

    // Run metadata wiring
    (function () {
      const run = ensureRun();
      const tester = document.getElementById('runTester');
      const build = document.getElementById('runBuild');
      const env = document.getElementById('runEnv');
      const started = document.getElementById('runStarted');
      tester.value = run.tester || '';
      build.value = run.build || '';
      env.value = run.env || 'production';
      started.value = new Date(run.startedAt).toLocaleString();
      tester.addEventListener('input', () => { state.run.tester = tester.value; saveState(); });
      build.addEventListener('input', () => { state.run.build = build.value; saveState(); });
      env.addEventListener('change', () => { state.run.env = env.value; saveState(); });
    })();

    document.getElementById('searchInput').addEventListener('input', render);
    document.getElementById('statusFilter').addEventListener('change', render);
    document.getElementById('roleFilter').addEventListener('change', render);
    document.getElementById('sectionFilter').addEventListener('change', render);

    document.getElementById('expandAll').addEventListener('click', () => {
      document.querySelectorAll('.section').forEach(el => el.classList.add('open'));
    });
    document.getElementById('collapseAll').addEventListener('click', () => {
      document.querySelectorAll('.section').forEach(el => el.classList.remove('open'));
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      downloadJson('knockscout-regression-' + new Date().toISOString().slice(0, 10) + '.json', buildExportPayload(2));
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      const blob = new Blob([buildCsv()], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'knockscout-regression-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('exportAgentBtn').addEventListener('click', () => {
      const payload = buildExportPayload(2);
      if (!payload.failures.length) {
        alert('No failed or blocked cases to export. Mark failures first.');
        return;
      }
      downloadJson('knockscout-regression-agent-' + new Date().toISOString().slice(0, 10) + '.json', payload);
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.cases) state.cases = { ...state.cases, ...data.cases };
          saveState();
          render();
          alert('Import complete.');
        } catch (err) {
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('resetAll').addEventListener('click', () => {
      if (!confirm('Reset all pass/fail/notes for every test case and start a new run?')) return;
      state.cases = {};
      state.run = null;
      ensureRun();
      const run = state.run;
      document.getElementById('runTester').value = run.tester || '';
      document.getElementById('runBuild').value = run.build || '';
      document.getElementById('runEnv').value = run.env || 'production';
      document.getElementById('runStarted').value = new Date(run.startedAt).toLocaleString();
      saveState();
      render();
    });

    render();
  </script>
</body>
</html>
`

writeFileSync(join(__dirname, 'regression-test-procedure.html'), HTML, 'utf8')
console.log('Wrote regression-test-procedure.html with', TEST_CASES.length, 'test cases')
