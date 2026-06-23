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
    .summary { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.85rem; color: var(--muted); margin-bottom: 10px; }
    .summary strong { color: var(--text); }
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
    .step-fail-marker {
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
    }
    .step-fail-marker input { accent-color: var(--fail); }
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
      .header .controls, .status-btn, .copy-btn, .case-notes, .step-fail-marker { display: none !important; }
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
      <button type="button" id="expandAll">Expand all</button>
      <button type="button" id="collapseAll">Collapse all</button>
      <button type="button" id="exportBtn">Export JSON</button>
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
        <li>Open the app at <code>http://localhost:3000</code> (or your deploy URL) in a separate window.</li>
        <li>Pick a <strong>role filter</strong> matching the account you are testing.</li>
        <li>Follow each test’s numbered steps in order. Each step has a <strong>Do</strong> action and a <strong>Verify</strong> checkpoint before continuing.</li>
        <li>Click the status button to cycle: <em>Not run → Pass → Fail → Blocked</em>.</li>
        <li>On failure, mark the failing step number, fill in notes using the template, and use <strong>Copy agent report</strong> to paste into a debugging agent.</li>
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
      return { cases: {}, exportedAt: null };
    }

    function saveState() {
      state.exportedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateSummary();
    }

    function defaultCaseState() {
      return { status: 'pending', notes: '', failedAtStep: null };
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
      const patch = { status: next };
      if (next !== 'fail') patch.failedAtStep = null;
      setCaseState(id, patch);
      render();
    }

    function setNotes(id, notes) {
      setCaseState(id, { notes });
    }

    function setFailedStep(id, stepNum) {
      const cur = getCaseState(id);
      const failedAtStep = cur.failedAtStep === stepNum ? null : stepNum;
      const patch = { failedAtStep };
      if (failedAtStep && cur.status !== 'fail') patch.status = 'fail';
      setCaseState(id, patch);
      render();
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
      const cs = getCaseState(tc.id);
      if (statusF !== 'all' && cs.status !== statusF) return false;
      if (roleF !== 'all' && !tc.roles.includes(roleF)) return false;
      if (q && !stepSearchHay(tc).includes(q)) return false;
      return true;
    }

    function updateSummary() {
      const total = TEST_CASES.length;
      let pass = 0, fail = 0, blocked = 0, pending = 0;
      TEST_CASES.forEach(tc => {
        const s = getCaseState(tc.id).status;
        if (s === 'pass') pass++;
        else if (s === 'fail') fail++;
        else if (s === 'blocked') blocked++;
        else pending++;
      });
      const done = pass + fail + blocked;
      const pct = total ? Math.round((pass / total) * 100) : 0;
      document.getElementById('summary').innerHTML =
        '<span><strong>' + pass + '</strong> pass</span>' +
        '<span><strong>' + fail + '</strong> fail</span>' +
        '<span><strong>' + blocked + '</strong> blocked</span>' +
        '<span><strong>' + pending + '</strong> not run</span>' +
        '<span><strong>' + done + '</strong> / ' + total + ' touched</span>';
      document.getElementById('progressFill').style.width = pct + '%';
    }

    function buildAgentReport(tc) {
      const cs = getCaseState(tc.id);
      const steps = normalizeCaseSteps(tc.steps);
      const sec = SECTIONS.find(s => s.id === tc.section);
      const failedStep = cs.failedAtStep ? steps.find(s => s.n === cs.failedAtStep) : null;
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
        '',
        '## Preconditions',
        tc.preconditions,
        '',
        '## Steps performed',
      ];
      steps.forEach(s => {
        const marker = cs.failedAtStep === s.n ? ' **[FAILED HERE]**' : '';
        lines.push(s.n + '. **Do:** ' + s.action + marker);
        lines.push('   **Verify:** ' + s.verify);
        if (s.ui) lines.push('   **UI:** ' + s.ui);
        lines.push('');
      });
      lines.push('## Overall expected outcome');
      lines.push(tc.expected);
      lines.push('');
      if (failedStep) {
        lines.push('## Failure at step ' + failedStep.n);
        lines.push('- Action attempted: ' + failedStep.action);
        lines.push('- Expected verify: ' + failedStep.verify);
        if (failedStep.ui) lines.push('- UI surface: ' + failedStep.ui);
        lines.push('');
      }
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
        const failed = cs.failedAtStep === s.n;
        const uiRow = s.ui
          ? '<div class="step-row"><span class="step-label ui">UI</span>' + escapeHtml(s.ui) + '</div>'
          : '';
        return '<li class="step' + (failed ? ' step-failed' : '') + '" data-step="' + s.n + '">' +
          '<div class="step-num">' + s.n + '</div>' +
          '<div class="step-body">' +
            '<div class="step-row"><span class="step-label do">Do</span>' + escapeHtml(s.action) + '</div>' +
            '<div class="step-row"><span class="step-label check">Verify</span>' + escapeHtml(s.verify) + '</div>' +
            uiRow +
            '<label class="step-fail-marker">' +
              '<input type="radio" name="fail-' + tc.id + '" value="' + s.n + '"' + (failed ? ' checked' : '') + ' />' +
              'Mark step ' + s.n + ' as failure point' +
            '</label>' +
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
        let secPass = 0;
        cases.forEach(tc => { if (getCaseState(tc.id).status === 'pass') secPass++; });

        const sectionEl = document.createElement('div');
        sectionEl.className = 'section open';
        sectionEl.dataset.section = sec.id;

        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = '<h2>' + sec.id + ' — ' + sec.title + '</h2>' +
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
            '<span class="tag">' + tc.viewport + '</span>';

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
          caseEl.querySelectorAll('.step-fail-marker input').forEach(input => {
            input.addEventListener('change', e => {
              e.stopPropagation();
              if (e.target.checked) setFailedStep(tc.id, Number(e.target.value));
            });
          });

          body.appendChild(caseEl);
        });

        sectionEl.appendChild(header);
        sectionEl.appendChild(body);
        root.appendChild(sectionEl);
      });
      updateSummary();
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
            notes: cs.notes,
            steps,
            agentReport: buildAgentReport(tc),
          };
        });

      return {
        version,
        exportedAt: new Date().toISOString(),
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

    function downloadJson(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    document.getElementById('searchInput').addEventListener('input', render);
    document.getElementById('statusFilter').addEventListener('change', render);
    document.getElementById('roleFilter').addEventListener('change', render);

    document.getElementById('expandAll').addEventListener('click', () => {
      document.querySelectorAll('.section').forEach(el => el.classList.add('open'));
    });
    document.getElementById('collapseAll').addEventListener('click', () => {
      document.querySelectorAll('.section').forEach(el => el.classList.remove('open'));
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      downloadJson('knockscout-regression-' + new Date().toISOString().slice(0, 10) + '.json', buildExportPayload(2));
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
      if (!confirm('Reset all pass/fail/notes for every test case?')) return;
      state.cases = {};
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
