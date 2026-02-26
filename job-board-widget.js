/**
 * Job Board Widget v1.0
 * Free, self-hosted job board powered by Google Sheets CSV export.
 *
 * Usage:
 *   window.JobBoardConfig = {
 *     sheetId: 'YOUR_GOOGLE_SHEET_ID',  // required
 *     containerId: 'job-board-container', // optional, default shown
 *     title: 'Open Positions',            // optional
 *     accentColor: '#0066ff',             // optional
 *     applyButtonText: 'Apply Now',       // optional
 *     csvUrl: 'https://...',              // optional, override full URL
 *   };
 *
 * Google Sheet columns (must be in this order):
 *   Title | Location | Type | Department | Description | ApplyURL | LearnMoreURL | Active
 */

(function () {
  'use strict';

  /* ─── Config defaults ───────────────────────────────────────── */
  const defaults = {
    containerId: 'job-board-container',
    title: 'Open Positions',
    accentColor: '#0066ff',
    applyButtonText: 'Apply Now',
  };

  const cfg = Object.assign({}, defaults, window.JobBoardConfig || {});

  /* ─── Column index map ──────────────────────────────────────── */
  const COL = {
    title: 0,
    location: 1,
    type: 2,
    department: 3,
    description: 4,
    applyURL: 5,
    learnMoreURL: 6,
    active: 7,
  };

  /* ─── State ─────────────────────────────────────────────────── */
  let allJobs = [];
  let selectedJob = null;
  let filterDept = '';
  let filterType = '';
  let searchQuery = '';

  /* ─── Helpers ───────────────────────────────────────────────── */

  /**
   * Minimal, safe CSV parser that handles quoted fields with embedded
   * commas and newlines (RFC 4180 compliant for common cases).
   */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          field += '"';
          i += 2;
        } else if (ch === '"') {
          inQuotes = false;
          i++;
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ',') {
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\r' && next === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
          i += 2;
        } else if (ch === '\n' || ch === '\r') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }

    // Handle final field / row
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function jobFromRow(row) {
    return {
      title: (row[COL.title] || '').trim(),
      location: (row[COL.location] || '').trim(),
      type: (row[COL.type] || '').trim(),
      department: (row[COL.department] || '').trim(),
      description: (row[COL.description] || '').trim(),
      applyURL: (row[COL.applyURL] || '').trim(),
      learnMoreURL: (row[COL.learnMoreURL] || '').trim(),
      active: (row[COL.active] || '').trim().toLowerCase(),
    };
  }

  function typeClass(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('part')) return 'part-time';
    if (t.includes('contract')) return 'contract';
    if (t.includes('intern')) return 'internship';
    return '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function matchesSearch(job, q) {
    if (!q) return true;
    const lq = q.toLowerCase();
    return (
      job.title.toLowerCase().includes(lq) ||
      job.location.toLowerCase().includes(lq) ||
      job.department.toLowerCase().includes(lq) ||
      job.type.toLowerCase().includes(lq)
    );
  }

  function filteredJobs() {
    return allJobs.filter((j) => {
      if (filterDept && j.department !== filterDept) return false;
      if (filterType && j.type !== filterType) return false;
      if (!matchesSearch(j, searchQuery)) return false;
      return true;
    });
  }

  function uniqueValues(jobs, key) {
    const seen = new Set();
    const values = [];
    jobs.forEach((j) => {
      const v = j[key];
      if (v && !seen.has(v)) {
        seen.add(v);
        values.push(v);
      }
    });
    return values.sort();
  }

  /* ─── Render helpers ────────────────────────────────────────── */

  function renderChip(text, cls, icon) {
    if (!text) return '';
    const iconHtml = icon
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
             stroke-linejoin="round">${icon}</svg>`
      : '';
    return `<span class="jb-chip ${escapeHtml(cls)}">${iconHtml}${escapeHtml(text)}</span>`;
  }

  const ICON_LOCATION =
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>';
  const ICON_TYPE =
    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>';
  const ICON_DEPT =
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';

  function cardHtml(job, isActive) {
    const tClass = typeClass(job.type);
    return `
      <div class="jb-card${isActive ? ' active' : ''}" data-title="${escapeHtml(job.title)}">
        <div class="jb-card-title">${escapeHtml(job.title)}</div>
        <div class="jb-card-meta">
          ${job.location ? renderChip(job.location, 'jb-chip-location', ICON_LOCATION) : ''}
          ${job.type ? renderChip(job.type, `jb-chip-type ${tClass}`, ICON_TYPE) : ''}
          ${job.department ? renderChip(job.department, 'jb-chip-dept', ICON_DEPT) : ''}
        </div>
      </div>`;
  }

  function detailHtml(job) {
    const applyBtn = job.applyURL
      ? `<a href="${escapeHtml(job.applyURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            ${escapeHtml(cfg.applyButtonText)}
          </a>`
      : '';

    const learnBtn = job.learnMoreURL
      ? `<a href="${escapeHtml(job.learnMoreURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Learn More
          </a>`
      : '';

    // Allow basic HTML in description field
    const descriptionContent = job.description || '<em>No description provided.</em>';

    return `
      <div class="jb-detail-header">
        <div class="jb-detail-title">${escapeHtml(job.title)}</div>
        <div class="jb-detail-chips">
          ${job.location
            ? `<span class="jb-detail-chip jb-detail-chip-location">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${ICON_LOCATION}
                </svg>
                ${escapeHtml(job.location)}</span>`
            : ''}
          ${job.type
            ? `<span class="jb-detail-chip jb-detail-chip-type">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${ICON_TYPE}
                </svg>
                ${escapeHtml(job.type)}</span>`
            : ''}
          ${job.department
            ? `<span class="jb-detail-chip jb-detail-chip-dept">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${ICON_DEPT}
                </svg>
                ${escapeHtml(job.department)}</span>`
            : ''}
        </div>
      </div>
      <div class="jb-divider"></div>
      <div class="jb-detail-description">${descriptionContent}</div>
      ${applyBtn || learnBtn
        ? `<div class="jb-actions">${applyBtn}${learnBtn}</div>`
        : ''}`;
  }

  /* ─── DOM update functions ──────────────────────────────────── */

  function getContainer() {
    return document.getElementById(cfg.containerId);
  }

  function updateListPanel(jobs) {
    const panel = getContainer().querySelector('.jb-list-panel');
    if (!panel) return;

    if (jobs.length === 0) {
      panel.innerHTML = `
        <div class="jb-empty">
          <div class="jb-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <p>No jobs match your filters.</p>
        </div>`;
      return;
    }

    panel.innerHTML = jobs.map((j) => cardHtml(j, j === selectedJob)).join('');

    // Card click listeners
    panel.querySelectorAll('.jb-card').forEach((card, idx) => {
      card.addEventListener('click', () => {
        selectedJob = jobs[idx];
        updateListPanel(filteredJobs());
        updateDetailPanel(selectedJob);
      });
    });
  }

  function updateDetailPanel(job) {
    const panel = getContainer().querySelector('.jb-detail-panel');
    if (!panel) return;

    if (!job) {
      panel.innerHTML = `
        <div class="jb-detail-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          <p>Select a job to view details</p>
        </div>`;
      return;
    }

    panel.innerHTML = detailHtml(job);
  }

  function updateFilters() {
    const container = getContainer();
    const deptSelect = container.querySelector('.jb-filter-dept');
    const typeSelect = container.querySelector('.jb-filter-type');
    if (!deptSelect || !typeSelect) return;

    const depts = uniqueValues(allJobs, 'department');
    const types = uniqueValues(allJobs, 'type');

    const prevDept = deptSelect.value;
    const prevType = typeSelect.value;

    deptSelect.innerHTML =
      '<option value="">All Departments</option>' +
      depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');

    typeSelect.innerHTML =
      '<option value="">All Types</option>' +
      types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    // Restore previously selected values if still valid
    if (depts.includes(prevDept)) deptSelect.value = prevDept;
    if (types.includes(prevType)) typeSelect.value = prevType;
  }

  function updateJobCount(count, total) {
    const el = getContainer().querySelector('.jb-job-count');
    if (!el) return;
    el.textContent =
      count === total
        ? `${total} position${total !== 1 ? 's' : ''}`
        : `${count} of ${total} positions`;
  }

  /* ─── Full render after filter change ──────────────────────── */

  function applyFilters() {
    const jobs = filteredJobs();
    updateJobCount(jobs.length, allJobs.length);

    // If selected job no longer in results, clear or pick first
    if (selectedJob && !jobs.includes(selectedJob)) {
      selectedJob = jobs[0] || null;
    } else if (!selectedJob && jobs.length > 0) {
      selectedJob = jobs[0];
    }

    updateListPanel(jobs);
    updateDetailPanel(selectedJob);
  }

  /* ─── Build full widget skeleton ─────────────────────────────── */

  function buildWidget(container) {
    container.style.setProperty('--jb-accent', cfg.accentColor || '#0066ff');

    container.innerHTML = `
      <div class="jb-header">
        <h2>${escapeHtml(cfg.title || 'Open Positions')}</h2>
        <div class="jb-job-count"></div>
      </div>
      <div class="jb-filters">
        <input type="text" class="jb-filter-input" placeholder="Search jobs…" autocomplete="off" />
        <select class="jb-filter-select jb-filter-dept">
          <option value="">All Departments</option>
        </select>
        <select class="jb-filter-select jb-filter-type">
          <option value="">All Types</option>
        </select>
      </div>
      <div class="jb-layout">
        <div class="jb-list-panel"></div>
        <div class="jb-detail-panel"></div>
      </div>`;

    // Search input
    const searchInput = container.querySelector('.jb-filter-input');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFilters();
    });

    // Department filter
    const deptSelect = container.querySelector('.jb-filter-dept');
    deptSelect.addEventListener('change', (e) => {
      filterDept = e.target.value;
      applyFilters();
    });

    // Type filter
    const typeSelect = container.querySelector('.jb-filter-type');
    typeSelect.addEventListener('change', (e) => {
      filterType = e.target.value;
      applyFilters();
    });
  }

  /* ─── Loading / Error states ────────────────────────────────── */

  function showLoading(container) {
    container.innerHTML = `
      <div class="jb-loading">
        <div class="jb-spinner"></div>
        <span>Loading positions…</span>
      </div>`;
  }

  function showError(container, message, detail) {
    container.innerHTML = `
      <div class="jb-error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="jb-error-title">${escapeHtml(message)}</div>
        ${detail ? `<div class="jb-error-detail">${escapeHtml(detail)}</div>` : ''}
      </div>`;
  }

  /* ─── Data fetch & init ──────────────────────────────────────── */

  function getCsvUrl() {
    if (cfg.csvUrl) return cfg.csvUrl;
    if (!cfg.sheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/export?format=csv`;
  }

  async function loadJobs(container) {
    const url = getCsvUrl();

    if (!url) {
      showError(
        container,
        'Configuration error',
        'No sheetId or csvUrl provided in window.JobBoardConfig.'
      );
      return;
    }

    showLoading(container);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const text = await response.text();
      const rows = parseCSV(text);

      // Skip header row (first row)
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));

      allJobs = dataRows
        .map(jobFromRow)
        .filter((j) => j.active === 'yes' && j.title);

      if (allJobs.length === 0) {
        buildWidget(container);
        updateFilters();
        updateJobCount(0, 0);
        updateListPanel([]);
        updateDetailPanel(null);
        return;
      }

      buildWidget(container);
      updateFilters();
      selectedJob = allJobs[0];
      applyFilters();
    } catch (err) {
      console.error('[JobBoard]', err);
      showError(
        container,
        'Could not load jobs',
        'Make sure your Google Sheet is published as CSV (File → Share → Publish to web). ' +
          err.message
      );
    }
  }

  /* ─── Bootstrap ──────────────────────────────────────────────── */

  function init() {
    const container = document.getElementById(cfg.containerId);
    if (!container) {
      console.warn(`[JobBoard] Container #${cfg.containerId} not found.`);
      return;
    }
    loadJobs(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
