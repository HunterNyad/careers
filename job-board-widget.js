/**
 * Job Board Widget v3.0
 * Minimal dark two-level accordion — powered by Google Sheets CSV.
 *
 * window.JobBoardConfig = {
 *   sheetId: 'YOUR_SHEET_ID',          // required (or use csvUrl)
 *   csvUrl:  'https://...',             // optional full CSV URL override
 *   title:   'Open Positions',          // optional
 *   accentColor: '#FF5500',             // optional
 *   applyButtonText: 'Apply Now',       // optional
 *   containerId: 'job-board-container', // optional
 * };
 *
 * Sheet columns (A–H):
 *   Title | Location | Type | Department | Description | ApplyURL | LearnMoreURL | Active
 */

(function () {
  'use strict';

  /* ─── Config ─────────────────────────────────────────────────── */
  const cfg = Object.assign({
    containerId: 'job-board-container',
    title: 'Open Positions',
    accentColor: '#FF5500',
    applyButtonText: 'Apply Now',
  }, window.JobBoardConfig || {});

  /* ─── Column map ──────────────────────────────────────────────── */
  const COL = { title:0, location:1, type:2, department:3,
                description:4, applyURL:5, learnMoreURL:6, active:7 };

  /* ─── State ───────────────────────────────────────────────────── */
  let allJobs = [];

  /* ─── CSV parser ──────────────────────────────────────────────── */
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
        if      (c === '"')                { inQ = true; i++; }
        else if (c === ',')               { row.push(field); field = ''; i++; }
        else if (c === '\r' && n === '\n') { row.push(field); rows.push(row); row=[]; field=''; i+=2; }
        else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row=[]; field=''; i++; }
        else                              { field += c; i++; }
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  /* ─── Helpers ─────────────────────────────────────────────────── */
  function jobFromRow(r) {
    return {
      title:        (r[COL.title]        || '').trim(),
      location:     (r[COL.location]     || '').trim(),
      type:         (r[COL.type]         || '').trim(),
      department:   (r[COL.department]   || '').trim(),
      description:  (r[COL.description]  || '').trim(),
      applyURL:     (r[COL.applyURL]     || '').trim(),
      learnMoreURL: (r[COL.learnMoreURL] || '').trim(),
      active:       (r[COL.active]       || '').trim().toLowerCase(),
    };
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function typeClass(t) {
    t = (t || '').toLowerCase();
    if (t.includes('part'))     return 'part-time';
    if (t.includes('contract')) return 'contract';
    if (t.includes('intern'))   return 'internship';
    return 'full-time';
  }

  // Strip HTML tags and collapse whitespace for plain-text excerpt
  function toPlainText(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeExcerpt(desc, maxLen) {
    if (!desc) return '';
    const text = toPlainText(desc);
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).replace(/\s\S*$/, '') + '…';
  }

  /* ─── Row HTML ────────────────────────────────────────────────── */
  function rowHtml(job) {
    const applyLink = job.applyURL
      ? `<a href="${esc(job.applyURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-row-apply">Apply ↗</a>`
      : '';

    const applyBtn = job.applyURL
      ? `<a href="${esc(job.applyURL)}" target="_blank" rel="noopener noreferrer"
            class="jb-btn-apply">${esc(cfg.applyButtonText)} ↗</a>`
      : '';

    const excerpt = makeExcerpt(job.description, 220);

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

            <!-- Level 1: brief excerpt -->
            <div class="jb-preview-section">
              ${excerpt ? `<p class="jb-excerpt">${esc(excerpt)}</p>` : ''}
              <div class="jb-preview-actions">
                ${applyBtn}
                ${job.description ? `<span class="jb-btn-learn-more">Learn More →</span>` : ''}
              </div>
            </div>

            <!-- Level 2: full description -->
            <div class="jb-full-section">
              <div class="jb-row-desc">${job.description || ''}</div>
              <div class="jb-row-actions">
                ${applyBtn}
                <span class="jb-btn-show-less">Show Less</span>
              </div>
            </div>

          </div>
        </div>
      </div>`;
  }

  /* ─── Render list ─────────────────────────────────────────────── */
  function updateList() {
    const container = document.getElementById(cfg.containerId);
    const list = container.querySelector('.jb-list');
    if (!list) return;

    if (allJobs.length === 0) {
      list.innerHTML = `<div class="jb-empty">No open roles at this time.</div>`;
      return;
    }

    // Group by department, preserving first-seen order
    const order = [], groups = {};
    allJobs.forEach(j => {
      const d = j.department || 'General';
      if (!groups[d]) { groups[d] = []; order.push(d); }
      groups[d].push(j);
    });

    list.innerHTML = order.map(dept => `
      <div class="jb-group">
        <div class="jb-group-header">
          <span class="jb-group-name">${esc(dept)}</span>
        </div>
        ${groups[dept].map(rowHtml).join('')}
      </div>`
    ).join('');

    // Attach event listeners to every row
    list.querySelectorAll('.jb-row').forEach(row => {

      // Click row header → open preview (level 1)
      row.querySelector('.jb-row-main').addEventListener('click', e => {
        if (e.target.closest('.jb-row-apply')) return;
        const isOpen = row.classList.contains('open') || row.classList.contains('full');
        // Close all rows first
        list.querySelectorAll('.jb-row').forEach(r => r.classList.remove('open', 'full'));
        if (!isOpen) row.classList.add('open');
      });

      // "Learn More" → expand to full description (level 2)
      const learnMore = row.querySelector('.jb-btn-learn-more');
      if (learnMore) {
        learnMore.addEventListener('click', e => {
          e.stopPropagation();
          row.classList.remove('open');
          row.classList.add('full');
        });
      }

      // "Show Less" → collapse back to preview (level 1)
      const showLess = row.querySelector('.jb-btn-show-less');
      if (showLess) {
        showLess.addEventListener('click', e => {
          e.stopPropagation();
          row.classList.remove('full');
          row.classList.add('open');
        });
      }
    });
  }

  /* ─── Build widget skeleton ───────────────────────────────────── */
  function buildWidget(container) {
    container.style.setProperty('--jb-accent', cfg.accentColor || '#FF5500');
    container.innerHTML = `
      <div class="jb-header">
        <div class="jb-title">${esc(cfg.title || 'Open Positions')}</div>
      </div>
      <div class="jb-list"></div>`;
  }

  /* ─── Loading / error ─────────────────────────────────────────── */
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

  /* ─── Fetch & init ────────────────────────────────────────────── */
  function csvUrl() {
    if (cfg.csvUrl)  return cfg.csvUrl;
    if (cfg.sheetId) return `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/export?format=csv`;
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
