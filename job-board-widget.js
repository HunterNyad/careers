/**
 * Job Board Widget v2.0
 * Minimal dark accordion layout — powered by Google Sheets CSV.
 *
 * window.JobBoardConfig = {
 *   sheetId: 'YOUR_SHEET_ID',       // required (or use csvUrl)
 *   csvUrl:  'https://...',          // optional full CSV URL override
 *   title:   'Open Positions',       // optional
 *   accentColor: '#FF5500',          // optional
 *   applyButtonText: 'Apply Now',    // optional
 *   containerId: 'job-board-container', // optional
 * };
 *
 * Sheet columns (A–H):
 *   Title | Location | Type | Department | Description | ApplyURL | LearnMoreURL | Active
 */

(function () {
  'use strict';

  /* ─── Config ────────────────────────────────────────────────── */
  const cfg = Object.assign({
    containerId: 'job-board-container',
    title: 'Open Positions',
    accentColor: '#FF5500',
    applyButtonText: 'Apply Now',
  }, window.JobBoardConfig || {});

  /* ─── Column map ─────────────────────────────────────────────── */
  const COL = { title:0, location:1, type:2, department:3,
                description:4, applyURL:5, learnMoreURL:6, active:7 };

  /* ─── State ──────────────────────────────────────────────────── */
  let allJobs    = [];
  let filterDept = '';
  let filterType = '';
  let searchQuery = '';

  /* ─── CSV parser ─────────────────────────────────────────────── */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQ = false, i = 0;
    while (i < text.length) {
      const c = text[i], n = text[i+1];
      if (inQ) {
        if (c === '"' && n === '"') { field += '"'; i += 2; }
        else if (c === '"')         { inQ = false; i++; }
        else                        { field += c; i++; }
      } else {
        if      (c === '"')                  { inQ = true; i++; }
        else if (c === ',')                  { row.push(field); field = ''; i++; }
        else if (c === '\r' && n === '\n')   { row.push(field); rows.push(row); row=[]; field=''; i+=2; }
        else if (c === '\n' || c === '\r')   { row.push(field); rows.push(row); row=[]; field=''; i++; }
        else                                 { field += c; i++; }
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  /* ─── Helpers ────────────────────────────────────────────────── */
  function jobFromRow(r) {
    return {
      title:       (r[COL.title]       || '').trim(),
      location:    (r[COL.location]    || '').trim(),
      type:        (r[COL.type]        || '').trim(),
      department:  (r[COL.department]  || '').trim(),
      description: (r[COL.description] || '').trim(),
      applyURL:    (r[COL.applyURL]    || '').trim(),
      learnMoreURL:(r[COL.learnMoreURL]|| '').trim(),
      active:      (r[COL.active]      || '').trim().toLowerCase(),
    };
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function typeClass(t) {
    t = (t||'').toLowerCase();
    if (t.includes('part'))     return 'part-time';
    if (t.includes('contract')) return 'contract';
    if (t.includes('intern'))   return 'internship';
    return 'full-time';
  }

  function matches(job, q) {
    if (!q) return true;
    const lq = q.toLowerCase();
    return job.title.toLowerCase().includes(lq)
        || job.location.toLowerCase().includes(lq)
        || job.department.toLowerCase().includes(lq)
        || job.type.toLowerCase().includes(lq);
  }

  function filtered() {
    return allJobs.filter(j =>
      (!filterDept || j.department === filterDept) &&
      (!filterType || j.type === filterType) &&
      matches(j, searchQuery)
    );
  }

  function uniqueVals(jobs, key) {
    const seen = new Set(), out = [];
    jobs.forEach(j => { if (j[key] && !seen.has(j[key])) { seen.add(j[key]); out.push(j[key]); } });
    return out.sort();
  }

  /* ─── Row HTML ───────────────────────────────────────────────── */
  function rowHtml(job) {
    const applyLink = job.applyURL
      ? `<a href="${esc(job.applyURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-row-apply" tabindex="-1">Apply ↗</a>`
      : '';

    const applyBtn = job.applyURL
      ? `<a href="${esc(job.applyURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-btn-apply">${esc(cfg.applyButtonText)} ↗</a>`
      : '';

    const learnBtn = job.learnMoreURL
      ? `<a href="${esc(job.learnMoreURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-btn-more">Learn More</a>`
      : '';

    const desc = job.description || '<p>No description provided.</p>';

    return `
      <div class="jb-row">
        <div class="jb-row-main">
          <span class="jb-row-title">${esc(job.title)}</span>
          <div class="jb-row-meta">
            ${job.location ? `<span class="jb-row-loc">${esc(job.location)}</span>` : ''}
            ${job.type     ? `<span class="jb-row-type ${typeClass(job.type)}">${esc(job.type)}</span>` : ''}
          </div>
          ${applyLink}
          <span class="jb-row-toggle">+</span>
        </div>
        <div class="jb-row-detail">
          <div class="jb-row-detail-inner">
            <div class="jb-row-desc">${desc}</div>
            ${applyBtn || learnBtn ? `<div class="jb-row-actions">${applyBtn}${learnBtn}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  /* ─── Render list ────────────────────────────────────────────── */
  function updateList() {
    const container = document.getElementById(cfg.containerId);
    const list = container.querySelector('.jb-list');
    const countEl = container.querySelector('.jb-count');
    if (!list) return;

    const jobs = filtered();

    if (countEl) {
      countEl.textContent = jobs.length === allJobs.length
        ? `${allJobs.length} open role${allJobs.length !== 1 ? 's' : ''}`
        : `${jobs.length} of ${allJobs.length} roles`;
    }

    if (jobs.length === 0) {
      list.innerHTML = `<div class="jb-empty">No roles match.</div>`;
      return;
    }

    // Group by department (preserve first-seen order)
    const order = [], groups = {};
    jobs.forEach(j => {
      const d = j.department || 'General';
      if (!groups[d]) { groups[d] = []; order.push(d); }
      groups[d].push(j);
    });

    list.innerHTML = order.map(dept => `
      <div class="jb-group">
        <div class="jb-group-header">
          <span class="jb-group-name">${esc(dept)}</span>
          <span class="jb-group-count">${groups[dept].length}</span>
        </div>
        ${groups[dept].map(rowHtml).join('')}
      </div>`
    ).join('');

    // Accordion click — toggle open/close
    list.querySelectorAll('.jb-row').forEach(row => {
      row.querySelector('.jb-row-main').addEventListener('click', e => {
        if (e.target.closest('.jb-row-apply')) return; // let apply link through
        const isOpen = row.classList.contains('open');
        list.querySelectorAll('.jb-row.open').forEach(r => r.classList.remove('open'));
        if (!isOpen) row.classList.add('open');
      });
    });
  }

  /* ─── Update filter dropdowns ────────────────────────────────── */
  function updateDropdowns() {
    const container = document.getElementById(cfg.containerId);
    const deptSel = container.querySelector('.jb-filter-dept');
    const typeSel = container.querySelector('.jb-filter-type');
    if (!deptSel || !typeSel) return;

    const depts = uniqueVals(allJobs, 'department');
    const types = uniqueVals(allJobs, 'type');

    deptSel.innerHTML = '<option value="">All Departments</option>'
      + depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

    typeSel.innerHTML = '<option value="">All Types</option>'
      + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  /* ─── Build skeleton ─────────────────────────────────────────── */
  function buildWidget(container) {
    container.style.setProperty('--jb-accent', cfg.accentColor || '#FF5500');

    container.innerHTML = `
      <div class="jb-header">
        <span class="jb-title">${esc(cfg.title || 'Open Positions')}</span>
        <div class="jb-controls">
          <input type="text" class="jb-search" placeholder="Search roles" autocomplete="off">
          <select class="jb-filter-select jb-filter-dept">
            <option value="">All Departments</option>
          </select>
          <select class="jb-filter-select jb-filter-type">
            <option value="">All Types</option>
          </select>
        </div>
      </div>
      <div class="jb-list"></div>`;

    container.querySelector('.jb-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      updateList();
    });
    container.querySelector('.jb-filter-dept').addEventListener('change', e => {
      filterDept = e.target.value;
      updateList();
    });
    container.querySelector('.jb-filter-type').addEventListener('change', e => {
      filterType = e.target.value;
      updateList();
    });
  }

  /* ─── Loading / error ────────────────────────────────────────── */
  function showLoading(c) {
    c.innerHTML = `<div class="jb-loading"><div class="jb-spinner"></div><span>Loading</span></div>`;
  }

  function showError(c, msg, detail) {
    c.innerHTML = `
      <div class="jb-error">
        <div class="jb-error-title">${esc(msg)}</div>
        ${detail ? `<div class="jb-error-detail">${esc(detail)}</div>` : ''}
      </div>`;
  }

  /* ─── Fetch & init ───────────────────────────────────────────── */
  function csvUrl() {
    if (cfg.csvUrl)   return cfg.csvUrl;
    if (cfg.sheetId)  return `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/export?format=csv`;
    return null;
  }

  async function load(container) {
    const url = csvUrl();
    if (!url) { showError(container, 'Configuration error', 'No sheetId or csvUrl set.'); return; }

    showLoading(container);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = parseCSV(await res.text());
      allJobs = rows.slice(1)
        .filter(r => r.some(c => c.trim()))
        .map(jobFromRow)
        .filter(j => j.active === 'yes' && j.title);

      buildWidget(container);
      updateDropdowns();
      updateList();
    } catch (err) {
      console.error('[JobBoard]', err);
      showError(container, 'Could not load roles',
        'Ensure your Google Sheet is published as CSV (File → Share → Publish to web). ' + err.message);
    }
  }

  function init() {
    const container = document.getElementById(cfg.containerId);
    if (!container) { console.warn(`[JobBoard] #${cfg.containerId} not found`); return; }
    load(container);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
