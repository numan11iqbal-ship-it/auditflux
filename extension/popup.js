/**
 * AuditFlux SEO — popup controller.
 *
 * The popup is the quick-audit surface: score, counts, top priorities and the
 * actions people reach for most. Deep tables live in the dashboard, which has
 * the room for them. Analysis runs once here and is handed to the dashboard
 * through chrome.storage, so it is never computed twice.
 *
 * Everything originating from the audited page is escaped before rendering.
 */

let DATA = null;
let AUDIT = null;
let TAB = null;
let activeTab = 'overview';
let issueFilter = 'all';
let overlayOn = false;
let PLAN = null;
let USAGE = null;
let AUDIT_BLOCKED = null;

const $ = (s) => document.querySelector(s);

const esc = (v) => v === null || v === undefined ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const clip = (v, n) => {
  const s = String(v ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

async function auditFluxConnection() {
  const stored = await chrome.storage.session.get({ auditfluxConnection: null });
  return stored.auditfluxConnection;
}

async function saveAuditToAuditFlux(openWhenSaved) {
  if (!DATA || !AUDIT || !TAB) return toast('Run an audit before saving it');
  const connection = await auditFluxConnection();
  if (!connection?.apiBase || !connection?.accessToken) {
    return toast('Sign in on the AuditFlux web app and choose Connect Extension first');
  }
  const backend = sccNormalizeBackendUrl(connection.apiBase);
  if (!backend || !await sccRequestBackendPermission(backend)) return toast('Grant access to the AuditFlux API before saving');
  const cached = await chrome.storage.local.get({ sccLatestSavedAudit: null });
  let saved = cached.sccLatestSavedAudit;
  if (!saved || saved.clientAuditId !== AUDIT.__auditfluxClientAuditId) {
    const perfCache = await chrome.storage.local.get({ sccLatestPerformance: null });
    const performance = perfCache.sccLatestPerformance?.url === DATA.page.url
      ? perfCache.sccLatestPerformance.performance
      : null;
    const payload = AUDITFLUX_CONTRACT.normalizeAudit({ data: DATA, audit: AUDIT, tab: TAB, performance });
    AUDIT.__auditfluxClientAuditId = payload.clientAuditId;
    try {
      const response = await fetch(backend + '/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + connection.accessToken },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.auditId) return toast(body?.error || 'AuditFlux could not save this audit');
      saved = { clientAuditId: payload.clientAuditId, auditId: body.auditId, apiBase: backend, savedAt: Date.now() };
      await chrome.storage.local.set({ sccLatestSavedAudit: saved });
      await chrome.runtime.sendMessage({ type: 'auditflux:register-audit', auditId: body.auditId, tabId: TAB.id, windowId: TAB.windowId, url: DATA.page.url });
      toast(body.duplicate ? 'This audit was already saved' : 'Audit saved to AuditFlux');
    } catch { return toast('AuditFlux backend unavailable'); }
  }
  if (openWhenSaved) {
    chrome.tabs.create({ url: saved.apiBase + '/audit/' + encodeURIComponent(saved.auditId) });
    window.close();
  }
}

function showState(which) {
  $('#loadingState').classList.toggle('hidden', which !== 'loading');
  $('#errorState').classList.toggle('hidden', which !== 'error');
  $('#results').classList.toggle('hidden', which !== 'results');
}

function showError(title, body) {
  $('#errorTitle').textContent = title;
  $('#errorBody').textContent = body;
  showState('error');
}

/* ------------------------------ run ------------------------------ */

async function run() {
  showState('loading');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    TAB = tab;

    if (!tab || !tab.url) return showError('No active tab', 'Open a website and try again.');

    if (!/^https?:\/\//i.test(tab.url)) {
      const what = tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') ? 'Chrome restricts access to browser pages'
        : tab.url.startsWith('file://') ? 'Chrome restricts access to local files'
        : tab.url.includes('chrome.google.com/webstore') || tab.url.includes('chromewebstore.google.com') ? 'Chrome blocks extensions on the Web Store'
        : 'This page uses a scheme extensions cannot read';
      return showError('This page can\'t be inspected', what + '. Open a normal http:// or https:// website and try again.');
    }

    $('#pageHost').textContent = tab.url;

    try {
      SCC_ENTITLEMENTS.init(chrome.storage.local);
      const gate = await SCC_ENTITLEMENTS.canUse('pageAudit');
      if (!gate.allowed) {
        await loadPlan();
        return showError('Daily audit limit reached', `You've used ${gate.used} of ${gate.limit} audits today. Open Plans & Usage to see what Pro unlocks.`);
      }
    } catch (e) {}

    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: SCC_ANALYZE });
    if (!injected?.[0]?.result) {
      return showError('Analysis returned nothing', 'Reload the page and run the audit again.');
    }

    DATA = injected[0].result;
    AUDIT = SCC_AUDIT(DATA);

    // The audit already ran, so record it. Counting before the work succeeds
    // would charge people for failures.
    try {
      await SCC_ENTITLEMENTS.record('pageAudit');
      await loadPlan();
    } catch (e) { /* entitlements are non-blocking */ }

    try { $('#pageHost').textContent = new URL(DATA.page.url).host + DATA.page.path; } catch {}

    // Hand the result to the dashboard rather than making it re-analyze.
    try {
      await chrome.storage.local.set({
        sccLatest: { data: DATA, audit: AUDIT, tabId: tab.id, savedAt: Date.now() }
      });
    } catch (e) {
      console.warn('Could not cache audit for the dashboard:', e);
    }

    // Reflect the overlay's real state, then enable the requested default-on heading labels.
    try {
      const state = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!window.__sccOverlayActive
      });
      overlayOn = !!state?.[0]?.result;
    } catch {}
    await enableHeadingOverlayOnOpen();
    syncOverlayButton();

    showState('results');
    render();
  } catch (e) {
    showError('Couldn\'t read this page', e?.message || 'The page blocked the audit script. Reload and try again.');
  }
}


/* ---------------- entitlements ---------------- */

async function loadPlan() {
  try {
    SCC_ENTITLEMENTS.init(chrome.storage.local);
    const raw = await SCC_ENTITLEMENTS.getUsage();
    PLAN = raw.plan;
    USAGE = raw;
    const badge = $('#planBadge');
    if (badge) badge.textContent = raw.plan.name.toUpperCase();
  } catch (e) { PLAN = null; }
}

/** Renders the Free-plan meter. Shows real counters or nothing at all. */
function usageStrip() {
  if (!USAGE) return '';
  const audits = USAGE.counters.find(c => c.action === 'pageAudit');
  const psi = USAGE.counters.find(c => c.action === 'pageSpeedCheck');
  if (!audits) return '';
  if (audits.unlimited && (!psi || psi.unlimited)) {
    return `<div class="card" style="margin-bottom:14px"><div class="card-body" style="padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:12.5px">${esc(PLAN.name)} plan</b>
        <span class="pill ok">Unlimited audits</span>
      </div></div></div>`;
  }
  const bar = (c) => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span class="tiny" style="color:var(--text-2);font-weight:600">${esc(c.label)}</span>
        <span class="tiny ${c.atLimit ? '' : 'muted'}" style="${c.atLimit ? 'color:var(--red);font-weight:700' : ''}">${c.unlimited ? 'Unlimited' : c.used + ' / ' + c.limit}</span>
      </div>
      <div class="bar"><i class="${c.atLimit ? 'bad' : c.nearLimit ? 'mid' : 'good'}" style="width:${c.unlimited ? 100 : c.percent}%"></i></div>
    </div>`;
  const warn = audits.atLimit || (psi && psi.atLimit);
  const near = audits.nearLimit || (psi && psi.nearLimit);
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-body" style="padding:13px 14px">
      ${bar(audits)}${psi ? bar(psi) : ''}
      ${warn ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
          <span class="tiny" style="color:var(--red)">Daily limit reached — resets tomorrow.</span>
          <button class="btn btn-primary btn-sm" data-action="pricing">Upgrade</button>
        </div>`
      : near ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
          <span class="tiny" style="color:var(--amber)">You're nearing your ${esc(PLAN.name)} plan limit.</span>
          <button class="btn btn-sm" data-action="pricing">See plans</button>
        </div>` : ''}
    </div>
  </div>`;
}

/* --------------------------- overlay --------------------------- */

function syncOverlayButton() {
  const btn = $('#overlayBtn');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(overlayOn));
  btn.textContent = overlayOn ? 'Hide H1–H6' : 'H1–H6';
}

async function toggleOverlay() {
  if (!TAB) return;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: TAB.id },
      func: SCC_TOGGLE_HEADING_OVERLAY
    });
    const out = res?.[0]?.result;
    if (!out) return toast('Overlay could not run on this page');
    overlayOn = out.enabled;
    syncOverlayButton();
    toast(out.enabled ? `Tagged ${out.count} heading${out.count === 1 ? '' : 's'} on the page` : 'Heading overlay removed');
  } catch (e) {
    toast('This page blocked the overlay script');
  }
}

async function locateHeading(index) {
  if (!TAB) return;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: TAB.id }, func: SCC_LOCATE_HEADING, args: [index]
    });
    if (res?.[0]?.result?.located) {
      toast('Scrolled to the heading');
      window.close(); // let the user actually see it
    } else {
      toast('That heading is no longer on the page');
    }
  } catch {
    toast('Could not scroll to that heading');
  }
}

async function enableHeadingOverlayOnOpen() {
  if (!TAB || overlayOn) return;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: TAB.id },
      func: SCC_TOGGLE_HEADING_OVERLAY
    });
    const out = res?.[0]?.result;
    if (out?.enabled) overlayOn = true;
  } catch {
    // Auditing still succeeds when a site prevents cosmetic page overlay injection.
  }
}

/* --------------------------- rendering --------------------------- */

const scoreClass = (v) => v === null ? '' : v >= 80 ? 'good' : v >= 50 ? 'mid' : 'bad';
const ringStyle = (v) => {
  const c = v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
  return `background:conic-gradient(${c} 0 ${v}%, #e6eaf2 ${v}% 100%)`;
};
const sevPill = (s) => `<span class="pill ${s === 'critical' ? 'fail' : s === 'warning' ? 'warn' : 'info'}">${esc(s)}</span>`;

function render() {
  const badge = $('#tabIssueCount');
  badge.textContent = AUDIT.issues.length;
  badge.classList.toggle('zero', AUDIT.issues.length === 0);

  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === activeTab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });

  renderQuickCommand();
  const views = {
    overview: viewOverview, issues: viewIssues, headings: viewHeadings, links: viewLinks,
    images: viewImages, schema: viewSchema, performance: viewPerformance, geo: viewGeo, resources: viewResources, actions: viewActions
  };
  $('#panel').innerHTML = views[activeTab]();
  $('#panel').scrollTop = 0;
  bindPanel();
}

function renderQuickCommand() {
  const command = $('#quickCommand');
  if (!command || !DATA || !AUDIT || !window.AUDITFLUX_QUICK_ACTIONS) return;
  const actions = AUDITFLUX_QUICK_ACTIONS.commandItems(DATA, AUDIT);
  const chip = (item) => `<button class="quick-action ${isQuickActionActive(item) ? 'is-active' : ''}" data-view="${item.id}" data-filter="${item.filter || ''}" data-priority="${item.priority}" title="${esc(item.title)}" aria-pressed="${isQuickActionActive(item)}">
    <span class="qa-icon" aria-hidden="true">${esc(item.icon)}</span><span class="qa-label">${esc(item.label)}</span><span class="qa-short">${esc(item.shortLabel)}</span>${item.count === null ? '' : `<span class="qa-count">${item.count}</span>`}</button>`;
  command.classList.remove('hidden');
  command.innerHTML = actions.map(chip).join('');
  command.querySelectorAll('.quick-action').forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    const view = AUDITFLUX_QUICK_ACTIONS.sectionView(button.dataset.view);
    if (filter) { activeTab = 'issues'; issueFilter = filter; return render(); }
    if (!view) return;
    activeTab = view; issueFilter = 'all'; render();
  }));
}

function isQuickActionActive(item) {
  return activeTab === item.id || (item.filter && activeTab === 'issues' && issueFilter === item.filter);
}

function viewOverview() {
  const s = AUDIT.overall;
  const verdict = s >= 85 ? 'Strong' : s >= 70 ? 'Good, with gaps' : s >= 50 ? 'Needs attention' : 'Critical issues detected';
  const lead = AUDIT.counts.critical > 0
    ? `${AUDIT.counts.critical} critical ${AUDIT.counts.critical === 1 ? 'issue needs' : 'issues need'} attention first.`
    : AUDIT.counts.warning > 0 ? 'No critical issues. Work through the warnings next.'
    : 'No critical issues or warnings found on this page.';

  const cats = SCC_CATEGORIES.map(c => {
    const v = AUDIT.scores[c.id];
    if (v === null) {
      return `<div class="catbar"><span class="cname">${esc(c.label)}</span><div class="bar"></div><b class="cval muted">n/a</b></div>`;
    }
    const cinfo = AUDIT.explanation.contributions.find(x => x.id === c.id);
    const ratio = cinfo ? `${cinfo.passed} of ${cinfo.checks}` : 'n/a';
    return `<button class="catbar" data-cat="${esc(c.id)}" title="${esc(c.label)}: ${esc(ratio)} checks passed">
      <span class="cname">${esc(c.label)}</span>
      <div class="bar"><i class="${scoreClass(v)}" style="width:${v}%"></i></div>
      <b class="cval">${esc(ratio)}</b></button>`;
  }).join('');

  const h = DATA.head, p = DATA.page;
  const idx = h.noindex ? ['Not indexable — noindex', 'fail']
    : DATA.robots.pageAllowed === false ? ['Blocked by robots.txt', 'fail']
    : ['Indexable', 'ok'];

  const row = (k, v) => `<div class="snapshot"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;

  return `
  ${usageStrip()}
  <div class="card" style="margin-bottom:14px">
    <div class="card-body">
      <div class="score-row">
        <div class="ring" style="${ringStyle(s)}"><div class="inner"><b>${s}</b><i>/ 100</i></div></div>
        <div class="score-side">
          <h4>${esc(verdict)}</h4>
          <p class="why">${esc(lead)} ${AUDIT.counts.passed} of ${AUDIT.counts.evaluated} applicable checks passed. ${AUDIT.counts.notApplicable} of ${AUDIT.counts.totalRules} total rules were not applicable and are excluded from the score.</p>
          <div class="catgrid">${cats}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="stats-4">
    <button class="stat crit" data-jump="all"><span class="label">Issues</span><span class="value">${AUDIT.issues.length}</span></button>
    <button class="stat warn" data-jump="warning"><span class="label">Warnings</span><span class="value">${AUDIT.counts.warning}</span></button>
    <button class="stat note" data-jump="notice"><span class="label">Notices</span><span class="value">${AUDIT.counts.notice}</span></button>
    <button class="stat pass" data-jump="passed"><span class="label">Passed</span><span class="value">${AUDIT.counts.passed}</span></button>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-head">
      <h3>Page snapshot</h3>
      <span class="sub">${esc(DATA.pageType.type)} page · scanned ${esc(new Date(DATA.scannedAt).toLocaleTimeString())}</span>
    </div>
    <div class="card-body" style="padding-top:4px;padding-bottom:6px">
      ${row('Title', h.title ? `${esc(clip(h.title, 95))} <span class="muted tiny">(${h.titleLength})</span>` : '<span class="pill fail">Missing</span>')}
      ${row('Description', h.metaDescription ? `${esc(clip(h.metaDescription, 120))} <span class="muted tiny">(${h.metaDescriptionLength})</span>` : '<span class="pill fail">Missing</span>')}
      ${row('Search visibility', `<span class="pill ${idx[1]}">${esc(idx[0])}</span>`)}
      ${row('Canonical', h.canonical ? `${esc(clip(h.canonical, 70))} ${h.canonicalIsSelf ? '<span class="pill ok">Self</span>' : '<span class="pill warn">Other URL</span>'}` : '<span class="pill warn">Missing</span>')}
      ${row('Headings', `${DATA.headingStats.total} total · ${DATA.headingStats.h1} H1 · ${DATA.headingStats.skips.length} level skips`)}
      ${row('Content', `${DATA.content.wordCount} words · ${DATA.content.paragraphs} paragraphs`)}
      ${row('Links', `${DATA.linkStats.total} total · ${DATA.linkStats.internal} internal · ${DATA.linkStats.external} external`)}
      ${row('Images', DATA.imageStats.total ? `${DATA.imageStats.total} total · ${DATA.imageStats.altCoverage}% ALT coverage` : 'None on this page')}
      ${row('Server response', p.ttfbMs !== null ? `${p.ttfbMs} ms <span class="muted tiny">TTFB, this load</span>` : '<span class="muted">Not reported by the browser</span>')}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Fix these first</h3><span class="sub">Highest severity</span></div>
    <div class="card-body" style="padding:6px 6px">
      ${AUDIT.issues.length === 0
        ? '<div class="empty"><b>Nothing to fix here</b><p>Every applicable check passed on this page.</p></div>'
        : AUDIT.issues.slice(0, 5).map(i => `
          <div class="status">
            <div class="s-main"><b>${esc(i.title)}</b><span>${esc(clip(i.detected, 90))}</span></div>
            <div class="s-act">${sevPill(i.severity)}</div>
          </div>`).join('')}
    </div>
  </div>`;
}

function viewIssues() {
  const chips = [
    ['all', 'All ' + AUDIT.issues.length],
    ['critical', 'Critical ' + AUDIT.counts.critical],
    ['warning', 'Warnings ' + AUDIT.counts.warning],
    ['notice', 'Notices ' + AUDIT.counts.notice],
    ['passed', 'Passed ' + AUDIT.counts.passed]
  ].map(([k, l]) => `<button class="filter" data-filter="${k}" aria-pressed="${issueFilter === k}">${esc(l)}</button>`).join('');

  const list = issueFilter === 'passed' ? AUDIT.passed
    : issueFilter === 'all' ? AUDIT.issues
    : SCC_CATEGORIES.some(c => c.id === issueFilter)
      ? AUDIT.issues.filter(i => i.category === issueFilter)
      : AUDIT.issues.filter(i => i.severity === issueFilter);

  const body = list.length === 0
    ? `<div class="empty"><b>Nothing in this view</b><p>${issueFilter === 'passed' ? 'No checks passed yet.' : 'No issues match this filter.'}</p></div>`
    : list.map((i, n) => `
      <div class="issue">
        <button class="issue-head" data-toggle="i${n}" aria-expanded="false" aria-controls="i${n}">
          ${issueFilter === 'passed' ? '<span class="pill ok">passed</span>' : sevPill(i.severity)}
          <span class="t">${esc(i.title)}</span>
          <span class="chev" aria-hidden="true">▾</span>
        </button>
        <div class="issue-body hidden" id="i${n}">
          <div class="qa"><h5>Why this matters</h5><p>${esc(i.why)}</p></div>
          <div class="qa"><h5>How to fix it</h5><p>${esc(i.how)}</p></div>
          <div class="qa pair">
            <div><h5>What we found</h5><p>${esc(clip(i.detected, 280))}</p></div>
            <div><h5>What's expected</h5><p>${esc(clip(i.expected, 280))}</p></div>
          </div>
          ${i.evidence?.length ? `<div class="qa"><h5>Evidence</h5><div class="evidence">${i.evidence.slice(0, 10).map(e => `<div>${esc(clip(e, 200))}</div>`).join('')}</div></div>` : ''}
          <div class="qa"><h5>Rule</h5><p class="muted tiny">${esc(i.id)} · ${esc(i.category)}</p></div>
        </div>
      </div>`).join('');

  return `<div class="filters" style="margin-bottom:12px">${chips}</div>${body}`;
}

const sectionHead = (title, detail) => `<div style="margin-bottom:14px"><h3 style="font-size:15px">${esc(title)}</h3><p class="tiny muted" style="margin-top:3px">${esc(detail)}</p></div>`;
const compactStat = (label, value, klass) => `<div class="stat ${klass || ''}"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
const compactStatus = (label, value, klass, detail) => `<div class="status"><div class="s-main"><b>${esc(label)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</div><div class="s-act"><span class="pill ${klass || 'info'}">${esc(value)}</span></div></div>`;

function viewHeadings() {
  const stats = DATA.headingStats;
  return `${sectionHead('Heading structure', 'The page outline in DOM order. Select a heading to locate it on the audited page.')}
    <div class="stats-4">${compactStat('Headings', stats.total)}${compactStat('H1', stats.h1, stats.h1 === 1 ? 'pass' : 'crit')}${compactStat('Level skips', stats.skips.length, stats.skips.length ? 'warn' : 'pass')}${compactStat('Questions', stats.questions)}</div>
    <div class="card outline">${DATA.headings.length ? DATA.headings.map(heading => `<button class="hrow" data-locate="${heading.index}" style="padding-left:${11 + (heading.level - 1) * 14}px"><span class="lvl l${heading.level}">H${heading.level}</span><span class="htext">${heading.empty ? '<em class="muted">(empty heading)</em>' : esc(clip(heading.text, 104))}</span><span class="locate">Locate ›</span></button>`).join('') : '<div class="empty"><b>No headings found</b><p>This page has no heading elements to inspect.</p></div>'}</div>`;
}

function viewLinks() {
  const stats = DATA.linkStats;
  return `${sectionHead('Links', 'Real internal and external links found in the audited document.')}
    <div class="stats-4">${compactStat('Total', stats.total)}${compactStat('Internal', stats.internal, stats.internal ? 'pass' : 'crit')}${compactStat('External', stats.external)}${compactStat('Generic text', stats.generic, stats.generic ? 'warn' : 'pass')}</div>
    <div class="card">${compactStatus('Empty anchor text', String(stats.emptyAnchors), stats.emptyAnchors ? 'warn' : 'ok', 'Links without readable anchor text')}${compactStatus('External domains', String(stats.externalDomains), 'info', 'Distinct linked domains')}${compactStatus('Nofollow links', String(stats.nofollow), 'info', 'Marked for crawler handling')}</div>`;
}

function viewImages() {
  const stats = DATA.imageStats;
  return `${sectionHead('Images', 'Image accessibility and delivery signals from this page.')}
    <div class="stats-4">${compactStat('Images', stats.total)}${compactStat('ALT coverage', stats.altCoverage + '%', stats.altCoverage === 100 ? 'pass' : 'warn')}${compactStat('Missing ALT', stats.altMissing, stats.altMissing ? 'crit' : 'pass')}${compactStat('Broken', stats.broken, stats.broken ? 'crit' : 'pass')}</div>
    <div class="card">${compactStatus('Missing dimensions', String(stats.missingDimensions), stats.missingDimensions ? 'warn' : 'ok', 'Can contribute to layout shift')}${compactStatus('Lazy loaded', String(stats.lazy), 'info', 'Images marked for deferred loading')}${compactStatus('Next-generation formats', String(stats.nextGen), stats.nextGen ? 'ok' : 'info', 'WebP or AVIF image assets')}</div>`;
}

function viewSchema() {
  const schema = DATA.schema;
  const detected = schema.types.length ? schema.types.join(', ') : 'No schema types detected';
  return `${sectionHead('Structured data', 'Machine-readable structured data found on this page.')}
    <div class="stats-4">${compactStat('JSON-LD blocks', schema.jsonLdBlocks)}${compactStat('Invalid blocks', schema.invalidBlocks, schema.invalidBlocks ? 'crit' : 'pass')}${compactStat('Types', schema.types.length)}${compactStat('Microdata', schema.microdataTypes.length)}</div>
    <div class="card">${compactStatus('Detected types', schema.types.length ? String(schema.types.length) : 'None', schema.types.length ? 'ok' : 'info', detected)}${schema.blocks.map((block, index) => compactStatus('Block ' + (index + 1), block.valid ? 'Valid JSON' : 'Invalid JSON', block.valid ? 'ok' : 'fail', block.types?.join(', ') || 'No @type')).join('')}</div>`;
}

function viewPerformance() {
  const live = DATA.live;
  const metric = (label, value, detail) => compactStatus(label, value === null || value === undefined ? 'Unavailable' : String(value), value === null || value === undefined ? 'info' : 'ok', detail);
  return `${sectionHead('Performance', 'Live browser measurements captured during this audit. Lab and field data appear only after a PageSpeed check.')}
    <div class="stats-4">${compactStat('TTFB', DATA.page.ttfbMs === null ? '—' : DATA.page.ttfbMs + ' ms', DATA.page.ttfbMs !== null && DATA.page.ttfbMs <= 800 ? 'pass' : 'warn')}${compactStat('Resources', DATA.perf.resourceCount)}${compactStat('DOM nodes', DATA.page.domNodes)}${compactStat('Long tasks', DATA.perf.longTasks === null ? '—' : DATA.perf.longTasks)}</div>
    <div class="card">${metric('LCP', live?.lcp?.value === null || live?.lcp?.value === undefined ? null : live.lcp.value + ' ms', 'Measured in this browser session')}${metric('CLS', live?.cls?.value, 'Measured in this browser session')}${metric('INP', live?.inp?.value === null || live?.inp?.value === undefined ? null : live.inp.value + ' ms', 'Measured in this browser session')}</div>`;
}

function viewGeo() {
  const geoScore = AUDIT.scores.geo;
  const content = DATA.content;
  return `${sectionHead('GEO / AEO', 'Real signals that help AI systems and answer engines understand the page.')}
    <div class="stats-4">${compactStat('AI readiness', geoScore === null ? '—' : geoScore, geoScore !== null && geoScore >= 70 ? 'pass' : 'note')}${compactStat('Question headings', DATA.headingStats.questions)}${compactStat('Lists', content.lists)}${compactStat('Tables', content.tables)}</div>
    <div class="card">${compactStatus('AI crawler records', String(DATA.robots.bots.length), DATA.robots.bots.some(bot => bot.allowed) ? 'ok' : 'info', 'Parsed from robots.txt')}${compactStatus('llms.txt files', String(DATA.llms.filter(file => file.state === 'FOUND').length), 'info', 'Optional AI discovery convention')}${compactStatus('Outbound citations', String(DATA.linkStats.external), DATA.linkStats.external ? 'ok' : 'info', 'External links found on this page')}</div>`;
}

function viewResources() {
  const resources = Array.isArray(DATA.resources) ? DATA.resources : [];
  const top = resources.slice().sort((a, b) => (b.transferBytes || 0) - (a.transferBytes || 0)).slice(0, 12);
  return `${sectionHead('Resources', 'Largest browser resources found during this audit.')}
    <div class="stats-4">${compactStat('Resources', resources.length)}${compactStat('Third party', DATA.perf?.resources?.thirdPartyCount ?? '—')}${compactStat('Render blockers', DATA.perf?.resources?.renderBlockingCandidates ?? '—')}${compactStat('Known bytes', DATA.perf?.resources?.knownBytes ?? '—')}</div>
    <div class="card">${top.length ? top.map(resource => compactStatus(resource.kind || 'Resource', resource.transferBytes ? Math.round(resource.transferBytes / 1024) + ' KB' : 'Size unavailable', 'info', clip(resource.url || '', 70))).join('') : '<div class="empty"><b>No resource entries available</b><p>This page did not expose resource timing entries to the browser.</p></div>'}</div>`;
}

function viewActions() {
  const origin = DATA.page.origin;
  const sitemap = DATA.sitemaps.find(s => s.ok && s.valid);
  const llms = DATA.llms.find(f => f.state === 'FOUND');

  const act = (id, icon, title, sub, disabled) => `
    <button class="action" data-action="${id}" ${disabled ? 'disabled title="Not reachable on this site"' : ''}>
      <span class="ico" aria-hidden="true">${icon}</span>
      <span class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
    </button>`;

  return `
  <div class="card" style="margin-bottom:14px">
    <div class="card-head"><h3>Inspect this page</h3><span class="sub">Opens in a new tab</span></div>
    <div class="card-body">
      <div class="action-grid">
        ${act('overlay', 'H', overlayOn ? 'Hide heading overlay' : 'Highlight H1–H6', overlayOn ? 'Remove the tags from the page' : 'Tag every heading on the live page')}
        ${act('robots', 'R', 'Open robots.txt', DATA.robots.fetched ? 'Found on this site' : 'Not reachable', !DATA.robots.fetched)}
        ${act('sitemap', 'S', 'Open sitemap', sitemap ? `${sitemap.urlCount} URLs` : 'Not reachable', !sitemap)}
        ${act('llms', 'A', 'Open llms.txt', llms ? 'Found on this site' : 'Not published', !llms)}
        ${act('canonical', 'C', 'Open canonical URL', DATA.head.canonical ? 'Preferred version of this page' : 'No canonical set', !DATA.head.canonical)}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Share the results</h3><span class="sub">Real data from this scan</span></div>
    <div class="card-body">
      <div class="action-grid">
        ${act('copyReport', '¶', 'Copy report', 'Plain text, ready to send to a client')}
        ${act('copyUrl', 'U', 'Copy page URL', 'The current address')}
        ${act('csvIssues', '↓', 'Export issues CSV', `${AUDIT.issues.length + AUDIT.passed.length} rows`)}
        ${act('saveAudit', '⇧', 'Save to AuditFlux', 'Persist this real audit to your workspace')}
        ${act('openSaasAudit', '⤢', 'Open SaaS report', 'Save, then open the full AuditFlux report')}
        ${act('performance', '⚡', 'Performance details', 'Live browser metrics from this audit')}
        ${act('pricing', '★', 'Plans and usage', PLAN ? esc(PLAN.name) + ' plan' : 'Free plan')}
      </div>
    </div>
  </div>`;
}

/* --------------------------- exports --------------------------- */

function download(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function hostSlug() {
  try { return new URL(DATA.page.url).hostname; } catch { return 'page'; }
}

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label); }
  catch { toast('Copy failed — clipboard unavailable'); }
}

/* --------------------------- events --------------------------- */

function bindPanel() {
  document.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
    const body = document.getElementById(el.dataset.toggle);
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    el.setAttribute('aria-expanded', String(!open));
  }));

  document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => {
    issueFilter = el.dataset.filter; render();
  }));

  document.querySelectorAll('[data-jump]').forEach(el => el.addEventListener('click', () => {
    issueFilter = el.dataset.jump; activeTab = 'issues'; render();
  }));

  document.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => {
    issueFilter = el.dataset.cat; activeTab = 'issues'; render();
  }));

  document.querySelectorAll('[data-locate]').forEach(el => el.addEventListener('click', () => {
    locateHeading(Number(el.dataset.locate));
  }));

  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
    const a = el.dataset.action;
    const origin = DATA.page.origin;
    const open = (u) => chrome.tabs.create({ url: u });

    if (a === 'overlay') return toggleOverlay().then(render);
    if (a === 'robots') return open(origin + '/robots.txt');
    if (a === 'sitemap') return open(DATA.sitemaps.find(s => s.ok && s.valid).url);
    if (a === 'llms') return open(origin + DATA.llms.find(f => f.state === 'FOUND').file);
    if (a === 'canonical') return open(DATA.head.canonical);
    if (a === 'saveAudit') return saveAuditToAuditFlux(false);
    if (a === 'openSaasAudit') return saveAuditToAuditFlux(true);
    if (a === 'performance') { activeTab = 'performance'; return render(); }
    if (a === 'pricing') return chrome.tabs.create({ url: chrome.runtime.getURL('pricing.html') });
    if (a === 'copyUrl') return copyText(DATA.page.url, 'Page URL copied');
    if (a === 'copyReport') return copyText(SCC_TEXT_REPORT(DATA, AUDIT, SCC_CATEGORIES), 'Report copied to clipboard');
    if (a === 'csvIssues') {
      download(`seo-issues-${hostSlug()}-${new Date().toISOString().slice(0, 10)}.csv`,
        sccToCsv(SCC_EXPORTS.issues(DATA, AUDIT)));
      return toast('Issues CSV downloaded');
    }
  }));
}

async function openDashboard(section) {
  try {
    await chrome.storage.local.set({
      sccLatest: { data: DATA, audit: AUDIT, tabId: TAB?.id ?? null, savedAt: Date.now() }
    });
  } catch (e) {
    return toast('Could not open the full report — storage unavailable');
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + (section ? '#' + section : '') });
  window.close();
}

document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => { activeTab = t.dataset.tab; render(); }));

$('#rescanBtn').addEventListener('click', run);
$('#errorRetry').addEventListener('click', run);
const overlayButton = $('#overlayBtn');
if (overlayButton) overlayButton.addEventListener('click', () => toggleOverlay().then(() => { if (activeTab === 'actions') render(); }));
$('#dashboardBtn').addEventListener('click', () => saveAuditToAuditFlux(true));
const planBadgeEl = $('#planBadge');
if (planBadgeEl) planBadgeEl.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('pricing.html') }));

run();
