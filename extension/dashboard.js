/**
 * AuditFlux SEO — full-page dashboard.
 *
 * Reads the audit the popup already produced from chrome.storage.local, so
 * analysis happens once. Re-scan re-injects into the originating tab; if
 * Chrome's activeTab grant has lapsed (the tab navigated or closed) that is
 * reported honestly rather than silently showing stale data.
 */

let DATA = null, AUDIT = null, TAB_ID = null, SAVED_AT = null;
let view = 'overview';
let issueFilter = 'all';
let headingFilter = 'all';
let sourceQuery = '';
let overlayOn = false;
let SETTINGS_KEYS = { pagespeed: '', crux: '' };
let PERMS = { pagespeed: false, crux: false, backend: false };
// A backend URL is not a secret — it is fine in storage and in the UI. The
// keys above are the sensitive part and stay client-only, bring-your-own-key.
let BACKEND_URL = '';
let BACKEND_STATUS = null; // result of the last /api/status check

const $ = (s) => document.querySelector(s);
const esc = (v) => v === null || v === undefined ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (v, n) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ------------------------------ boot ------------------------------ */

async function boot() {
  let stored;
  try {
    stored = (await chrome.storage.local.get('sccLatest')).sccLatest;
  } catch {
    stored = null;
  }
  if (!stored?.data) {
    $('#loadingState').classList.add('hidden');
    $('#emptyState').classList.remove('hidden');
    return;
  }

  DATA = stored.data;
  AUDIT = stored.audit;
  TAB_ID = stored.tabId;
  SAVED_AT = stored.savedAt;

  $('#pageUrl').textContent = DATA.page.url;
  $('#scanStamp').textContent = 'Scanned ' + new Date(DATA.scannedAt).toLocaleString();
  $('#loadingState').classList.add('hidden');
  $('#shell').classList.remove('hidden');

  const hash = location.hash.replace('#', '');
  if (hash && document.querySelector(`.navitem[data-view="${hash}"]`)) view = hash;

  await loadPlanAndUsage();
  await loadSettings();
  syncOverlayState();
  render();
}

async function syncOverlayState() {
  if (TAB_ID === null) return;
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId: TAB_ID }, func: () => !!window.__sccOverlayActive
    });
    overlayOn = !!r?.[0]?.result;
  } catch { overlayOn = false; }
  const btn = $('#overlayBtn');
  btn.setAttribute('aria-pressed', String(overlayOn));
  btn.textContent = overlayOn ? 'Hide H1–H6 overlay' : 'H1–H6 overlay';
}

/* ------------------------------ helpers ------------------------------ */

const scoreClass = (v) => v === null ? '' : v >= 80 ? 'good' : v >= 50 ? 'mid' : 'bad';
const ringStyle = (v) => {
  const c = v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
  return `background:conic-gradient(${c} 0 ${v}%, #e6eaf2 ${v}% 100%)`;
};
const sevPill = (s) => `<span class="pill ${s === 'critical' ? 'fail' : s === 'warning' ? 'warn' : 'info'}">${esc(s)}</span>`;
const statusRow = (label, value, cls, sub, actions) => `
  <div class="status">
    <div class="s-main"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    <div class="s-act">${actions || ''}<span class="pill ${cls}">${esc(value)}</span></div>
  </div>`;
const stat = (label, value, cls) => `<div class="stat ${cls || ''}"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
const emptyBlock = (t, b) => `<div class="empty"><div class="icon" aria-hidden="true">i</div><b>${esc(t)}</b><p>${esc(b)}</p></div>`;
const head = (t, s) => `<h1 class="page-title">${esc(t)}</h1><p class="page-sub">${esc(s)}</p>`;

/* ------------------------------ render ------------------------------ */

function render() {
  document.querySelectorAll('.navitem').forEach(n => {
    const on = n.dataset.view === view;
    n.classList.toggle('active', on);
    n.setAttribute('aria-selected', String(on));
  });
  const nav = $('#navIssues');
  nav.textContent = AUDIT.issues.length;
  nav.classList.toggle('zero', AUDIT.issues.length === 0);

  const views = {
    overview: vOverview, issues: vIssues, headings: vHeadings, links: vLinks,
    images: vImages, schema: vSchema, geo: vGeo, performance: vPerformance,
    accessibility: vAccessibility, technical: vTechnical, resources: vResources, source: vSource,
    usage: vUsage, settings: vSettings
  };
  $('#content').innerHTML = views[view]();
  window.scrollTo(0, 0);
  bind();
}

function vOverview() {
  const s = AUDIT.overall;
  const verdict = s >= 85 ? 'Strong' : s >= 70 ? 'Good, with gaps' : s >= 50 ? 'Needs attention' : 'Critical issues detected';
  const lead = AUDIT.counts.critical > 0
    ? `${AUDIT.counts.critical} critical ${AUDIT.counts.critical === 1 ? 'issue needs' : 'issues need'} attention first.`
    : AUDIT.counts.warning > 0 ? 'No critical issues on this page. Work through the warnings next.'
    : 'No critical issues or warnings found on this page.';

  const cats = SCC_CATEGORIES.map(c => {
    const v = AUDIT.scores[c.id];
    if (v === null) return `<div class="catbar"><span class="cname">${esc(c.label)}</span><div class="bar"></div><b class="cval muted">n/a</b></div>`;
    const cinfo = AUDIT.explanation.contributions.find(x => x.id === c.id);
    const ratio = cinfo ? `${cinfo.passed} of ${cinfo.checks}` : 'n/a';
    return `<button class="catbar" data-cat="${esc(c.id)}" title="${esc(c.label)}: ${esc(ratio)} checks passed">
      <span class="cname">${esc(c.label)}</span>
      <div class="bar"><i class="${scoreClass(v)}" style="width:${v}%"></i></div>
      <b class="cval">${esc(ratio)}</b></button>`;
  }).join('');

  const h = DATA.head;
  const idx = h.noindex ? ['Not indexable — noindex', 'fail']
    : DATA.robots.pageAllowed === false ? ['Blocked by robots.txt', 'fail'] : ['Indexable', 'ok'];

  return `
  ${head('Page overview', `A ${DATA.pageType.type} page. Scores come from checks that applied to this page; anything not applicable is excluded rather than counted as a failure.`)}

  <div class="card"><div class="card-body">
    <div class="hero">
      <div class="ring" style="${ringStyle(s)}"><div class="inner"><b>${s}</b><i>/ 100</i></div></div>
      <div class="hero-side">
        <h2>${esc(verdict)}</h2>
        <p class="lead">${esc(lead)} ${AUDIT.counts.passed} of ${AUDIT.counts.evaluated} applicable checks passed. ${AUDIT.counts.notApplicable} of ${AUDIT.counts.totalRules} total rules were not applicable and are excluded from the score.</p>
        <div class="catlist">${cats}</div>
      </div>
    </div>
  </div></div>

  <div class="grid-4">
    <button class="stat crit" data-jump="critical"><span class="label">Critical</span><span class="value">${AUDIT.counts.critical} of ${AUDIT.counts.evaluated}</span></button>
    <button class="stat warn" data-jump="warning"><span class="label">Warnings</span><span class="value">${AUDIT.counts.warning} of ${AUDIT.counts.evaluated}</span></button>
    <button class="stat note" data-jump="notice"><span class="label">Notices</span><span class="value">${AUDIT.counts.notice} of ${AUDIT.counts.evaluated}</span></button>
    <button class="stat pass" data-jump="passed"><span class="label">Passed</span><span class="value">${AUDIT.counts.passed} of ${AUDIT.counts.evaluated}</span></button>
  </div>

  <div class="card coverage-card">
    <div class="card-body">
      <div class="coverage-row">
        <div><span class="label">Audit coverage</span><strong>${AUDIT.counts.evaluated} of ${AUDIT.counts.totalRules}</strong><small>rules evaluated</small></div>
        <div><span class="label">Checks passed</span><strong>${AUDIT.counts.passed} of ${AUDIT.counts.evaluated}</strong><small>applicable checks</small></div>
        <div><span class="label">Not applicable</span><strong>${AUDIT.counts.notApplicable} of ${AUDIT.counts.totalRules}</strong><small>excluded honestly</small></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>How this score was calculated</h3><span class="sub">Nothing hidden</span></div>
    <div class="card-body" style="padding-bottom:6px">
      <p class="tiny muted" style="margin-bottom:12px;line-height:1.6">${esc(AUDIT.explanation.method)}</p>
      <div class="table-wrap" style="border-radius:var(--r)">
        <table><thead><tr><th>Category</th><th>Checks</th><th>Failed</th><th>Score</th><th>Weight</th><th>Contribution</th></tr></thead>
        <tbody>${AUDIT.explanation.contributions.map(c => `<tr>
          <td><strong>${esc(c.label)}</strong></td>
          <td>${c.applied ? c.checks : '<span class="muted">—</span>'}</td>
          <td>${c.applied ? (c.failed || 0) : '<span class="muted">—</span>'}</td>
          <td>${c.applied ? c.score : '<span class="pill info">not applicable</span>'}</td>
          <td>${c.applied ? c.weight : '<span class="muted">excluded</span>'}</td>
          <td>${c.applied ? ((c.score * c.weight) / AUDIT.explanation.totalWeightApplied).toFixed(1) : '<span class="muted">0</span>'}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      ${AUDIT.explanation.categoriesExcluded.length ? `<p class="tiny muted" style="margin-top:10px">Excluded because no check applied to this page: ${esc(AUDIT.explanation.categoriesExcluded.join(', '))}. Excluded categories neither help nor hurt the score.</p>` : ''}
    </div>
  </div>

  <div class="grid-2">
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Page essentials</h3></div>
      <div>
        ${statusRow('Title', h.title ? h.titleLength + ' chars' : 'Missing', h.title ? (h.titleLength >= 30 && h.titleLength <= 60 ? 'ok' : 'warn') : 'fail', h.title || 'No title tag')}
        ${statusRow('Meta description', h.metaDescription ? h.metaDescriptionLength + ' chars' : 'Missing', h.metaDescription ? (h.metaDescriptionLength <= 160 ? 'ok' : 'warn') : 'fail', h.metaDescription || 'No meta description')}
        ${statusRow('Search visibility', idx[0], idx[1], DATA.head.robotsMeta || 'No robots meta directive')}
        ${statusRow('Canonical', h.canonical ? (h.canonicalIsSelf ? 'Self' : 'Other URL') : 'Missing', h.canonical ? (h.canonicalIsSelf ? 'ok' : 'warn') : 'warn', h.canonical || 'No canonical link')}
        ${statusRow('H1', DATA.headingStats.h1 + ' found', DATA.headingStats.h1 === 1 ? 'ok' : DATA.headingStats.h1 === 0 ? 'fail' : 'warn', DATA.headingStats.h1Texts[0] || 'No H1 on this page')}
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Fix these first</h3><span class="sub">Highest severity</span></div>
      <div>
        ${AUDIT.issues.length === 0 ? emptyBlock('Nothing to fix', 'Every applicable check passed.')
          : AUDIT.issues.slice(0, 6).map(i => statusRow(i.title, i.severity, i.severity === 'critical' ? 'fail' : i.severity === 'warning' ? 'warn' : 'info', clip(i.detected, 80))).join('')}
      </div>
    </div>
  </div>`;
}

function vIssues() {
  const sevChips = [['all', 'All ' + AUDIT.issues.length], ['critical', 'Critical ' + AUDIT.counts.critical],
    ['warning', 'Warnings ' + AUDIT.counts.warning], ['notice', 'Notices ' + AUDIT.counts.notice],
    ['passed', 'Passed ' + AUDIT.counts.passed]];
  const catChips = SCC_CATEGORIES.map(c => [c.id, c.label]);

  const chip = ([k, l]) => `<button class="filter" data-filter="${esc(k)}" aria-pressed="${issueFilter === k}">${esc(l)}</button>`;

  const list = issueFilter === 'passed' ? AUDIT.passed
    : issueFilter === 'all' ? AUDIT.issues
    : SCC_CATEGORIES.some(c => c.id === issueFilter) ? AUDIT.issues.filter(i => i.category === issueFilter)
    : AUDIT.issues.filter(i => i.severity === issueFilter);

  return `
  ${head('Issues', 'Every check that applied to this page, with what we found, why it matters and how to fix it.')}
  <div class="filters" style="margin-bottom:10px">${sevChips.map(chip).join('')}</div>
  <div class="filters" style="margin-bottom:18px">${catChips.map(chip).join('')}</div>
  ${list.length === 0 ? emptyBlock('Nothing in this view', 'No checks match this filter.')
    : list.map((i, n) => `
    <div class="issue">
      <button class="issue-head" data-toggle="i${n}" aria-expanded="false" aria-controls="i${n}">
        ${issueFilter === 'passed' ? '<span class="pill ok">passed</span>' : sevPill(i.severity)}
        <span class="t">${esc(i.title)}</span>
        <span class="pill info">${esc(i.category)}</span>
        <span class="chev" aria-hidden="true">▾</span>
      </button>
      <div class="issue-body hidden" id="i${n}">
        <div class="qa"><h5>Why this matters</h5><p>${esc(i.why)}</p></div>
        <div class="qa"><h5>How to fix it</h5><p>${esc(i.how)}</p></div>
        <div class="qa pair">
          <div><h5>What we found</h5><p>${esc(clip(i.detected, 400))}</p></div>
          <div><h5>What's expected</h5><p>${esc(clip(i.expected, 400))}</p></div>
        </div>
        ${i.evidence?.length ? `<div class="qa"><h5>Evidence</h5><div class="evidence">${i.evidence.slice(0, 14).map(e => `<div>${esc(clip(e, 260))}</div>`).join('')}</div></div>` : ''}
        <div class="qa"><h5>Rule</h5><p class="muted tiny">${esc(i.id)}</p></div>
      </div>
    </div>`).join('')}`;
}

function vHeadings() {
  const st = DATA.headingStats;
  const chips = [['all', 'All ' + st.total], ['1', 'H1 ' + st.h1], ['2', 'H2 ' + st.h2],
    ['3', 'H3 ' + st.h3], ['4', 'H4–H6 ' + st.h4plus], ['problems', 'Problems only']]
    .map(([k, l]) => `<button class="filter" data-hfilter="${k}" aria-pressed="${headingFilter === k}">${esc(l)}</button>`).join('');

  const skipSet = new Set(st.skips.map(s => s.text));
  const dupSet = new Set(st.duplicates.map(d => d.text));

  let rows = DATA.headings.map(h => ({
    h, problem: h.empty || skipSet.has(h.text) || dupSet.has(h.text.toLowerCase())
  }));
  if (headingFilter === 'problems') rows = rows.filter(r => r.problem);
  else if (headingFilter === '4') rows = rows.filter(r => r.h.level >= 4);
  else if (headingFilter !== 'all') rows = rows.filter(r => r.h.level === Number(headingFilter));

  return `
  ${head('Heading structure', 'The document outline in DOM order. Click any heading to scroll to it on the page, or use the H1–H6 overlay to see them tagged in place.')}
  <div class="grid-4">
    ${stat('Total headings', st.total)}
    ${stat('H1', st.h1, st.h1 === 1 ? 'pass' : 'crit')}
    ${stat('Level skips', st.skips.length, st.skips.length ? 'warn' : 'pass')}
    ${stat('Question headings', st.questions, st.questions ? 'pass' : 'note')}
  </div>
  <div class="filters" style="margin-bottom:16px">${chips}</div>
  ${st.skips.length ? `<div class="card"><div class="card-head"><h3>Structural notes</h3><span class="sub">Outline, not a ranking penalty</span></div><div>
      ${st.skips.slice(0, 8).map(s => statusRow(`H${s.from} jumps to H${s.to}`, 'Level skipped', 'warn', s.text)).join('')}
    </div></div>` : ''}
  ${rows.length === 0 ? emptyBlock('No headings in this view', 'Try a different filter.')
    : `<div class="card outline">${rows.map(({ h, problem }) => `
      <button class="hrow ${problem ? 'problem' : ''}" data-locate="${h.index}" style="padding-left:${11 + (h.level - 1) * 20}px">
        <span class="lvl l${h.level}">H${h.level}</span>
        <span class="htext">${h.empty ? '<em class="muted">(empty heading)</em>' : esc(h.text)}</span>
        ${h.isQuestion && h.level >= 2 ? '<span class="pill purple">Question</span>' : ''}
        <span class="locate">Locate ›</span>
      </button>`).join('')}</div>`}`;
}

function vLinks() {
  const s = DATA.linkStats;
  const rows = DATA.links.filter(l => l.type !== 'other');

  return `
  ${head('Links', 'Every link on the page, how it is marked up, and where it points. Click any destination to open it.')}
  <div class="grid-4">
    ${stat('Total links', s.total)}
    ${stat('Internal', s.internal, s.internal ? 'pass' : 'crit')}
    ${stat('External', s.external)}
    ${stat('Generic anchors', s.generic, s.generic ? 'warn' : 'pass')}
  </div>

  <div class="grid-2">
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Link profile</h3><span class="sub">${s.uniqueInternal} unique internal destinations</span></div>
      <div>
        ${statusRow('Nofollow', String(s.nofollow), 'info')}
        ${statusRow('Sponsored / UGC', String(s.sponsored + s.ugc), 'info')}
        ${statusRow('Empty anchor text', String(s.emptyAnchors), s.emptyAnchors ? 'warn' : 'ok', 'Links with no text and no image')}
        ${statusRow('target="_blank" without noopener', String(s.targetBlankNoRel), s.targetBlankNoRel ? 'warn' : 'ok')}
        ${statusRow('External domains', String(s.externalDomains), 'info')}
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Top external domains</h3><span class="sub">Outbound citations</span></div>
      <div>${s.topExternalDomains.length
        ? s.topExternalDomains.map(d => statusRow(d.domain, d.count + (d.count > 1 ? ' links' : ' link'), 'info')).join('')
        : emptyBlock('No external links', 'This page does not link out to other sites.')}</div>
    </div>
  </div>

  ${s.genericSamples.length ? `<div class="card">
    <div class="card-head"><h3>Generic anchor text</h3><span class="sub">Describe the destination instead</span></div>
    <div>${s.genericSamples.map(g => statusRow(`"${g.anchor}"`, 'Generic', 'warn', g.href)).join('')}</div>
  </div>` : ''}

  <div class="card">
    <div class="card-head"><h3>All links</h3><span class="sub">${rows.length} shown</span></div>
    <div class="table-wrap" style="max-height:560px;border:0;border-radius:0 0 var(--r-lg) var(--r-lg)">
      <table><thead><tr><th>Anchor text</th><th>Destination</th><th>Type</th><th>Rel</th><th></th></tr></thead>
      <tbody>${rows.map(l => `<tr>
        <td><strong>${l.anchor ? esc(clip(l.anchor, 60)) : (l.hasImageOnly ? '<em class="muted">image link</em>' : '<em class="muted">empty</em>')}</strong></td>
        <td class="w"><a href="${esc(l.absolute || l.href)}" target="_blank" rel="noopener noreferrer">${esc(clip(l.absolute || l.href, 78))}</a></td>
        <td><span class="pill ${l.type === 'internal' ? 'blue' : 'info'}">${esc(l.type)}</span></td>
        <td>${l.nofollow ? '<span class="pill warn">nofollow</span>' : '<span class="muted tiny">follow</span>'}${l.sponsored ? ' <span class="pill info">sponsored</span>' : ''}${l.ugc ? ' <span class="pill info">ugc</span>' : ''}</td>
        <td><button class="btn btn-sm" data-copy="${esc(l.absolute || l.href)}">Copy</button></td>
      </tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

function vImages() {
  const s = DATA.imageStats;
  if (s.total === 0) return head('Images', 'No images found on this page.') + emptyBlock('No images', 'This page contains no img elements.');

  return `
  ${head('Images', 'ALT coverage, delivery and layout-stability signals for every image on the page.')}
  <div class="grid-4">
    ${stat('Images', s.total)}
    ${stat('ALT coverage', s.altCoverage + '%', s.altCoverage === 100 ? 'pass' : 'warn')}
    ${stat('Missing ALT', s.altMissing, s.altMissing ? 'crit' : 'pass')}
    ${stat('Broken', s.broken, s.broken ? 'crit' : 'pass')}
  </div>

  <div class="card">
    <div class="card-head"><h3>Optimization signals</h3><span class="sub">${s.total} images analyzed</span></div>
    <div>
      ${statusRow('Decorative images (alt="")', String(s.altEmpty), 'info', 'Correct for images that add no information')}
      ${statusRow('ALT longer than 125 characters', String(s.altTooLong), s.altTooLong ? 'warn' : 'ok')}
      ${statusRow('Missing width/height attributes', String(s.missingDimensions), s.missingDimensions ? 'warn' : 'ok', 'Reserving space prevents layout shift')}
      ${statusRow('Lazy loaded', String(s.lazy), 'info')}
      ${statusRow('Responsive (srcset)', String(s.srcset), 'info')}
      ${statusRow('WebP / AVIF', String(s.nextGen), s.nextGen ? 'ok' : 'info')}
      ${statusRow('Served over 2× display size', String(s.oversized), s.oversized ? 'warn' : 'ok', 'Wasted bytes on mobile connections')}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>All images</h3></div>
    <div class="table-wrap" style="max-height:560px;border:0;border-radius:0 0 var(--r-lg) var(--r-lg)">
      <table><thead><tr><th>Image</th><th>ALT</th><th>Natural</th><th>Displayed</th><th>Format</th><th>Loading</th></tr></thead>
      <tbody>${DATA.images.map(i => `<tr>
        <td class="w">${i.src ? `<a href="${esc(i.src)}" target="_blank" rel="noopener noreferrer">${esc(clip(i.src, 58))}</a>` : '<span class="muted">(no src)</span>'}${i.broken ? ' <span class="pill fail">broken</span>' : ''}</td>
        <td>${i.altMissing ? '<span class="pill fail">missing</span>' : i.altEmpty ? '<span class="pill info">decorative</span>' : esc(clip(i.alt, 52))}</td>
        <td>${i.naturalWidth ? i.naturalWidth + '×' + i.naturalHeight : '<span class="muted">—</span>'}</td>
        <td>${i.displayWidth ? i.displayWidth + '×' + i.displayHeight : '<span class="muted">—</span>'}</td>
        <td>${i.format ? esc(i.format) : '<span class="muted">—</span>'}</td>
        <td>${i.loading ? esc(i.loading) : '<span class="muted">eager</span>'}</td>
      </tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

function vSchema() {
  const s = DATA.schema;

  // Recommendations follow the detected page type rather than listing everything.
  const RECS = {
    homepage: ['Organization', 'WebSite', 'BreadcrumbList'],
    article: ['Article', 'BreadcrumbList', 'Organization', 'Person'],
    product: ['Product', 'Offer', 'AggregateRating', 'BreadcrumbList'],
    localbusiness: ['LocalBusiness', 'PostalAddress', 'OpeningHoursSpecification', 'Organization'],
    service: ['Service', 'Organization', 'BreadcrumbList', 'FAQPage'],
    category: ['CollectionPage', 'BreadcrumbList', 'ItemList'],
    generic: ['WebPage', 'Organization', 'BreadcrumbList']
  };
  const recommended = RECS[DATA.pageType.type] || RECS.generic;

  if (s.jsonLdBlocks === 0 && s.microdataTypes.length === 0 && s.rdfaCount === 0) {
    return `
    ${head('Structured data', 'Structured data describes your page to search engines and AI systems in a machine-readable form.')}
    <div class="card"><div class="card-body">
      ${emptyBlock('No structured data found', 'Search engines have less structured information about this page. Structured data is not required to rank, but it is how rich results become possible and how AI systems resolve entities.')}
    </div></div>
    <div class="card">
      <div class="card-head"><h3>Recommended for this page</h3><span class="sub">Based on a detected ${esc(DATA.pageType.type)} page</span></div>
      <div>${recommended.map(t => statusRow(t, 'Suggested', 'blue')).join('')}
        <div class="status"><div class="s-main"><span>${esc(DATA.pageType.reasons.join('; '))}</span></div></div>
      </div>
    </div>`;
  }

  return `
  ${head('Structured data', 'Syntax and required-property checks on the markup found in this page. This is not Google\'s Rich Results Test — validate there before relying on rich result eligibility.')}
  <div class="grid-3">
    ${stat('JSON-LD blocks', s.jsonLdBlocks)}
    ${stat('Invalid blocks', s.invalidBlocks, s.invalidBlocks ? 'crit' : 'pass')}
    ${stat('Types detected', s.types.length)}
  </div>

  <div class="card">
    <div class="card-head"><h3>Detected blocks</h3><span class="sub">AuditFlux SEO schema validation</span></div>
    <div>${s.blocks.map(b => statusRow(
      'Block ' + (b.index + 1) + (b.types.length ? ' · ' + b.types.join(', ') : ' · no @type'),
      b.valid ? 'Valid JSON' : 'Invalid JSON',
      b.valid ? 'ok' : 'fail',
      b.error || (b.hasContext ? b.bytes + ' bytes' : 'Missing @context')
    )).join('')}</div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Type coverage</h3><span class="sub">Recommended for a ${esc(DATA.pageType.type)} page</span></div>
    <div>${recommended.map(t => statusRow(t, s.types.indexOf(t) !== -1 ? 'Present' : 'Not found',
      s.types.indexOf(t) !== -1 ? 'ok' : 'info')).join('')}</div>
  </div>

  ${s.microdataTypes.length ? `<div class="card">
    <div class="card-head"><h3>Microdata</h3></div>
    <div>${s.microdataTypes.map(t => statusRow(t, 'Detected', 'ok')).join('')}</div>
  </div>` : ''}`;
}

function vGeo() {
  const geoScore = AUDIT.scores.geo;
  const c = DATA.content;

  const bots = DATA.robots.bots.length
    ? DATA.robots.bots.map(b => statusRow(b.name, b.allowed ? 'Allowed' : 'Blocked', b.allowed ? 'ok' : 'fail',
        b.source === 'no-robots' ? 'No robots.txt on this domain'
        : b.source === 'specific' ? 'Has its own robots.txt group' + (b.rule ? ' · ' + b.rule : '')
        : b.source === 'wildcard' ? 'Falls under User-agent: *' + (b.rule ? ' · ' + b.rule : '')
        : 'No matching rule')).join('')
    : `<div class="status"><div class="s-main"><b>Crawler access unknown</b><span>robots.txt could not be read, so access is not reported as allowed.</span></div></div>`;

  const signals = [
    ['Question-style headings', DATA.headingStats.questions > 0, DATA.headingStats.questions + ' found', 'Headings phrased as questions match how people prompt AI assistants'],
    ['Lists', c.lists > 0, c.lists + ' lists, ' + c.listItems + ' items', 'Lists are among the formats answer engines lift most reliably'],
    ['Tables', c.tables > 0, c.tables + ' tables', 'Structured comparisons are easy to extract'],
    ['Concise opening paragraph', c.firstParagraphWords >= 20 && c.firstParagraphWords <= 120, c.firstParagraphWords + ' words', 'The opening passage is the one most likely to be quoted'],
    ['Author signal', DATA.schema.hasAuthor || !!c.authorMeta || c.authorRel,
      DATA.schema.hasAuthor ? 'In structured data' : c.authorMeta ? 'Meta author tag' : c.authorRel ? 'Byline markup' : 'Not detected', 'Named authorship supports credibility assessment'],
    ['Publication date', DATA.schema.hasDatePublished || !!c.publishedMeta,
      DATA.schema.hasDatePublished ? 'In structured data' : c.publishedMeta ? 'Meta tag' : 'Not detected', 'Lets engines judge freshness'],
    ['Updated date', DATA.schema.hasDateModified || !!c.modifiedMeta,
      DATA.schema.hasDateModified ? 'In structured data' : c.modifiedMeta ? 'Meta tag' : 'Not detected', 'Signals that content is maintained'],
    ['sameAs entity links', DATA.schema.hasSameAs, DATA.schema.hasSameAs ? 'Present' : 'Not detected', 'Connects your brand to known profiles elsewhere'],
    ['Outbound citations', DATA.linkStats.external > 0, DATA.linkStats.external + ' external links', 'Citing sources is common in content AI systems reference']
  ].map(([l, ok, detail, why]) => statusRow(l, ok ? 'Yes' : 'No', ok ? 'ok' : 'info', detail + ' — ' + why)).join('');

  return `
  ${head('How ready this page is for AI search', 'This measures signals that help answer engines and AI systems understand and extract information from this page. These are readiness signals, not confirmed ranking factors — no engine publishes a GEO algorithm.')}

  <div class="card"><div class="card-body">
    <div class="hero">
      <div class="ring" style="${ringStyle(geoScore === null ? 0 : geoScore)}"><div class="inner"><b>${geoScore === null ? '—' : geoScore}</b><i>AI readiness</i></div></div>
      <div class="hero-side">
        <h2>${geoScore >= 70 ? 'Well structured for AI answers' : geoScore >= 40 ? 'Partly ready' : 'Little AI-ready structure'}</h2>
        <p class="lead">Two things drive this: whether AI crawlers are allowed to fetch the page at all, and whether the content is structured so a passage can be lifted as an answer.</p>
      </div>
    </div>
  </div></div>

  <div class="card">
    <div class="card-head"><h3>AI crawler access</h3><span class="sub">Parsed from this domain's robots.txt</span></div>
    <div>${bots}</div>
  </div>

  <div class="card">
    <div class="card-head"><h3>llms.txt</h3><span class="sub">Optional convention</span></div>
    <div>
      ${DATA.llms.map(f => statusRow(f.file, f.state, f.state === 'FOUND' ? 'ok' : f.state === 'UNREACHABLE' ? 'warn' : 'info',
        f.state === 'FOUND' ? f.bytes + ' bytes' : 'HTTP ' + (f.status === null ? 'no response' : f.status))).join('')}
      <div class="status"><div class="s-main"><span>llms.txt is a proposed convention for pointing AI systems at key content. No major search engine requires it or uses it as a ranking factor — treat it as an optional readiness signal.</span></div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Answer engine signals</h3><span class="sub">Content structure</span></div>
    <div>${signals}</div>
  </div>`;
}

function vTechnical() {
  const p = DATA.page, sec = DATA.security, r = DATA.robots;

  const secRows = sec.available ? `
    ${statusRow('HSTS', sec.hsts.present ? 'Set' : 'Not set', sec.hsts.present ? 'ok' : p.isHttps ? 'warn' : 'info', sec.hsts.value || 'Strict-Transport-Security header not sent')}
    ${statusRow('Content-Security-Policy', sec.csp.present ? 'Set' : 'Not set', sec.csp.present ? 'ok' : 'info', sec.csp.value ? clip(sec.csp.value, 120) : 'No CSP header')}
    ${statusRow('X-Content-Type-Options', sec.contentTypeOptions.present ? 'Set' : 'Not set', sec.contentTypeOptions.present ? 'ok' : 'info', sec.contentTypeOptions.value || 'nosniff not sent')}
    ${statusRow('Referrer-Policy', sec.referrerPolicy.present ? 'Set' : 'Not set', sec.referrerPolicy.present ? 'ok' : 'info', sec.referrerPolicy.value || 'Header not sent')}
    ${statusRow('Clickjacking protection', sec.frameOptions.present ? 'Set' : 'Not set', sec.frameOptions.present ? 'ok' : 'info', sec.frameOptions.value || 'No X-Frame-Options or CSP frame-ancestors')}
    ${statusRow('Permissions-Policy', sec.permissionsPolicy.present ? 'Set' : 'Not set', sec.permissionsPolicy.present ? 'ok' : 'info', sec.permissionsPolicy.value ? clip(sec.permissionsPolicy.value, 120) : 'Header not sent')}
    ${sec.xRobotsTag ? statusRow('X-Robots-Tag', sec.xRobotsTag, /noindex/i.test(sec.xRobotsTag) ? 'fail' : 'info', 'Robots directive sent as an HTTP header') : ''}
  ` : `<div class="status"><div class="s-main"><b>Response headers not available</b><span>${esc(DATA.source.error || 'The page could not be refetched, so headers could not be read. They are reported as unavailable rather than assumed.')}</span></div></div>`;

  const sitemapRows = DATA.sitemaps.map(s => statusRow(
    clip(s.url, 70),
    s.error ? 'Unreachable' : s.ok ? (s.valid ? (s.isIndex ? 'Sitemap index' : 'Valid XML') : 'Not XML') : 'HTTP ' + s.status,
    s.ok && s.valid ? 'ok' : (s.error || !s.ok) ? 'info' : 'warn',
    s.ok && s.valid ? `${s.urlCount} URLs${s.declaredInRobots ? ' · declared in robots.txt' : ''}` : '',
    `<a class="btn btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
  )).join('');

  return `
  ${head('Technical', 'How the page is delivered, what crawlers are told, and which security headers the server sends.')}

  <div class="card">
    <div class="card-head"><h3>Delivery</h3><span class="sub">Measured on this page load</span></div>
    <div>
      ${statusRow('HTTPS', p.isHttps ? 'Secure' : 'Not secure', p.isHttps ? 'ok' : 'fail', p.protocol)}
      ${statusRow('Mixed content', DATA.tech.mixedContentCount === 0 ? 'None' : DATA.tech.mixedContentCount + ' insecure resources', DATA.tech.mixedContentCount ? 'fail' : 'ok')}
      ${statusRow('Server response (TTFB)', p.ttfbMs === null ? 'Not available' : p.ttfbMs + ' ms', p.ttfbMs === null ? 'info' : p.ttfbMs <= 800 ? 'ok' : 'warn', 'From the Navigation Timing API, not a lab test')}
      ${statusRow('DOM elements', String(p.domNodes), p.domNodes > 1500 ? 'warn' : 'ok')}
      ${statusRow('Language', p.lang || 'Not set', p.lang ? 'ok' : 'warn')}
      ${statusRow('Charset', p.charset || 'Unknown', 'info')}
      ${statusRow('Rendering', DATA.spa.detected ? 'JavaScript-rendered content likely' : 'Content present in served HTML', DATA.spa.detected ? 'warn' : 'ok', DATA.spa.reason)}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Security headers</h3><span class="sub">Read from the real response</span></div>
    <div>${secRows}</div>
  </div>

  <div class="card">
    <div class="card-head">
      <h3>robots.txt</h3>
      <span class="sub">${r.fetched && !r.isHtml ? `${r.groups} groups · ${r.sitemaps.length} sitemap directives` : ''}</span>
    </div>
    <div>
      ${statusRow('File', r.error ? 'Unreachable' : r.isHtml ? 'Returned HTML, not plain text' : 'HTTP ' + r.status,
        (r.fetched && !r.isHtml) ? 'ok' : 'warn', p.origin + '/robots.txt',
        `<a class="btn btn-sm" href="${esc(p.origin)}/robots.txt" target="_blank" rel="noopener noreferrer">Open</a>`)}
      ${r.pageAllowed !== null ? statusRow('This URL for Googlebot', r.pageAllowed ? 'Allowed' : 'Blocked', r.pageAllowed ? 'ok' : 'fail') : ''}
    </div>
    ${r.raw && !r.isHtml ? `<div class="card-body" style="padding-top:0"><pre class="code" style="border-radius:var(--r);max-height:240px"><table><tbody>${
      r.raw.split('\n').slice(0, 120).map((line, n) => `<tr><td class="ln">${n + 1}</td><td class="src">${esc(line)}</td></tr>`).join('')
    }</tbody></table></pre></div>` : ''}
  </div>

  <div class="card">
    <div class="card-head"><h3>Sitemaps</h3><span class="sub">Declared and common locations</span></div>
    <div>${sitemapRows || '<div class="status"><div class="s-main"><span>No sitemap locations checked.</span></div></div>'}</div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Indexability</h3></div>
    <div>
      ${statusRow('Meta robots', DATA.head.robotsMeta || 'Not set', DATA.head.noindex ? 'fail' : 'ok', DATA.head.noindex ? 'This page asks not to be indexed' : 'No noindex directive')}
      ${statusRow('Canonical', DATA.head.canonical ? (DATA.head.canonicalIsSelf ? 'Self-referencing' : 'Points elsewhere') : 'Missing',
        DATA.head.canonical ? (DATA.head.canonicalIsSelf ? 'ok' : 'warn') : 'warn', DATA.head.canonical || 'No canonical link element')}
      ${statusRow('Blocked by robots.txt', r.pageAllowed === null ? 'Unknown' : r.pageAllowed ? 'No' : 'Yes', r.pageAllowed === false ? 'fail' : r.pageAllowed === null ? 'info' : 'ok')}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Tracking &amp; tags</h3><span class="sub">Detected in page source</span></div>
    <div>
      ${DATA.tech.tracking.map(t => statusRow(t.name, t.found ? 'Detected' : 'Not found', t.found ? 'ok' : 'info')).join('')}
      <div class="status"><div class="s-main"><span>Detection confirms a script is present, not that it is configured correctly.</span></div></div>
    </div>
  </div>`;
}

function vSource() {
  const src = DATA.source;
  if (!src.fetched || !src.html) {
    return head('HTML source', 'The HTML your server sent for this URL.') +
      emptyBlock('Source not available', src.error || `The page could not be refetched (HTTP ${src.status}). Nothing is shown rather than guessing at the markup.`);
  }

  const lines = src.html.split('\n');
  const q = sourceQuery.toLowerCase();
  let hits = 0;

  const rows = lines.map((line, n) => {
    let rendered = esc(line);
    let isHit = false;
    if (q && line.toLowerCase().includes(q)) {
      isHit = true; hits++;
      // Highlight on the escaped string so markup can never be injected.
      const escQ = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rendered = rendered.replace(new RegExp(escQ, 'gi'), m => `<mark>${m}</mark>`);
    }
    return `<tr class="${isHit ? 'hit' : ''}"><td class="ln">${n + 1}</td><td class="src">${rendered}</td></tr>`;
  }).join('');

  return `
  ${head('HTML source', 'This is the HTML the server sent, which is what non-rendering crawlers see. It can differ from the rendered DOM on JavaScript-heavy pages.')}
  <div class="grid-4">
    ${stat('HTTP status', src.status ?? '—', src.status === 200 ? 'pass' : 'warn')}
    ${stat('Size', (src.bytes / 1024).toFixed(1) + ' KB')}
    ${stat('Lines', lines.length)}
    ${stat('Rendering', DATA.spa.detected ? 'JS-rendered' : 'Server-rendered', DATA.spa.detected ? 'warn' : 'pass')}
  </div>
  <div class="card">
    <div class="source-toolbar">
      <input type="search" id="sourceSearch" placeholder="Search the source…" value="${esc(sourceQuery)}" aria-label="Search HTML source">
      <span class="tiny muted">${sourceQuery ? `${hits} matching line${hits === 1 ? '' : 's'}` : `${lines.length} lines`}${src.truncated ? ' · truncated at 1.5 MB' : ''}</span>
      <button class="btn btn-sm" id="copySource">Copy source</button>
      <button class="btn btn-sm" id="downloadSource">Download .html</button>
    </div>
    <pre class="code"><table><tbody>${rows}</tbody></table></pre>
  </div>`;
}


/* ---------- provenance badge ---------- */

// Shows where a number came from, so a measurement is never mistaken for a guess.
const prov = (source, status) =>
  `<span class="pill ${sccStatusClass(status)}" title="Source: ${esc(source)}">${esc(status)}</span>`;

const fmtMs = (v) => v === null || v === undefined ? null : v + ' ms';
const fmtBytes = (b) => {
  if (b === null || b === undefined) return null;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
};

/** Renders a measurement row, or an explicit unavailable state — never a fake zero. */
function metricRow(label, value, status, source, note, verdict) {
  const shown = value === null || value === undefined ? 'Unavailable' : value;
  return `<div class="status">
    <div class="s-main"><b>${esc(label)}</b><span>${esc(note || '')}${note ? ' · ' : ''}Source: ${esc(source)}</span></div>
    <div class="s-act">
      ${verdict ? `<span class="pill ${verdict[1]}">${esc(verdict[0])}</span>` : ''}
      <strong style="font-size:13px">${esc(shown)}</strong>
      ${prov(source, status)}
    </div>
  </div>`;
}

/* ---------------- PageSpeed / CrUX state ---------------- */

// Held per strategy so mobile and desktop are never blended into one number.
let PSI = { mobile: null, desktop: null };
let PSI_STATE = { mobile: 'idle', desktop: 'idle' };   // idle | running | done | error
let PSI_ERROR = { mobile: null, desktop: null };
let PSI_META = { mobile: null, desktop: null };   // { fromCache, ageMs }
let CRUX = { mobile: null, desktop: null };
let CRUX_STATE = 'idle';
let CRUX_ERROR = null;
let PERF_STRATEGY = 'mobile';

async function persistAvailablePerformance() {
  if (!DATA?.page?.url) return;
  const lab = Object.entries(PSI).flatMap(([strategy, result]) => result?.ok ? [{ ...result, source: 'LAB', strategy }] : []);
  const field = Object.entries(PSI).flatMap(([strategy, result]) => {
    const direct = CRUX[strategy];
    if (direct?.ok) return [{ ...direct, source: 'FIELD', strategy }];
    return result?.fieldFromPsi ? [{ source: 'FIELD', strategy, data: result.fieldFromPsi, metrics: result.fieldFromPsi.metrics || {} }] : [];
  });
  await chrome.storage.local.set({
    sccLatestPerformance: {
      url: DATA.page.url,
      savedAt: Date.now(),
      performance: {
        live: DATA.live ? { source: 'LIVE', strategy: 'browser', data: DATA.live } : null,
        lab,
        field,
      },
    },
  });
}
let PLAN = null;
let USAGE = null;

const CWV_ORDER = ['LCP', 'INP', 'CLS'];
const LAB_ORDER = ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTFB'];

// sccRateMetric already returns {rating, label, cls, threshold}; use it rather
// than re-deriving labels here, so thresholds live in exactly one place.
/* ============================================================
   PERFORMANCE — three separate data layers, never blended.
   A. LIVE  — Chrome Performance APIs, this page in this browser
   B. LAB   — Google PageSpeed Insights v5 (Lighthouse)
   C. FIELD — Chrome UX Report (real users)
   ============================================================ */

// Badges say what kind of measurement this is, not a vague "verified".
function srcBadge(kind, extra) {
  const map = {
    LIVE: ['LIVE', 'ok', 'Measured in your browser just now'],
    LAB: ['LAB', 'blue', 'Google Lighthouse test environment'],
    FIELD: ['FIELD', 'purple', 'Real Chrome users, 28-day window'],
    CACHED: ['CACHED', 'info', 'Stored result, no new request made'],
    ESTIMATED: ['ESTIMATED', 'warn', 'Approximated from available data'],
    NA: ['NOT AVAILABLE', 'info', 'No measurement for this metric']
  };
  const [label, cls, title] = map[kind] || map.NA;
  return `<span class="pill ${cls}" title="${esc(title)}${extra ? ' · ' + esc(extra) : ''}">${label}</span>`;
}

const SOURCE_HELP = {
  LIVE: 'Measured directly from the page currently open in your browser. This represents this browser session and device, not all visitors.',
  LAB: "Generated by Google's Lighthouse test environment on Google's hardware. Results can vary between runs.",
  FIELD: 'Real-user performance data from Chrome UX Report, when Google has sufficient data for the URL.'
};

/** One live metric row, with an honest state when there is no value. */
function liveRow(label, metric, id, note) {
  if (!metric) return '';
  const has = metric.state === 'measured' && metric.value !== null;
  const rated = has && id ? sccRateMetric(id, metric.value) : null;

  let shown, badge;
  if (has) {
    shown = id ? sccFormatMetric(id, metric.value) : String(metric.value);
    badge = srcBadge(metric.reason && metric.reason.startsWith('Approximated') ? 'ESTIMATED' : 'LIVE');
  } else {
    shown = metric.state === 'needs-interaction' ? 'Not available yet'
      : metric.state === 'unsupported' ? 'Not supported'
      : 'Not measurable';
    badge = srcBadge('NA');
  }

  return `<div class="status">
    <div class="s-main">
      <b>${esc(label)}</b>
      <span>${esc(metric.reason || note || 'Source: Live Browser Observation')}</span>
    </div>
    <div class="s-act">
      ${rated ? `<span class="pill ${rated.cls}">${esc(rated.label)}</span>` : ''}
      <strong style="font-size:13px">${esc(shown)}</strong>
      ${badge}
    </div>
  </div>`;
}

/** Big headline card for a Core Web Vital, used by both LIVE and FIELD. */
function vitalCard(id, value, kind, subtitle, state) {
  const t = SCC_CWV_THRESHOLDS[id];
  const has = value !== null && value !== undefined;
  const rated = has ? sccRateMetric(id, value) : null;
  const shown = has ? sccFormatMetric(id, value)
    : state === 'needs-interaction' ? 'Not enough interaction data'
    : state === 'unsupported' ? 'Not supported'
    : 'No data';

  return `<div class="card" style="margin:0">
    <div class="card-head">
      <h3>${esc(id)} <span class="muted tiny">${esc(t.name)}</span></h3>
      ${srcBadge(kind)}
    </div>
    <div class="card-body">
      <div style="display:flex;align-items:baseline;gap:11px;margin-bottom:7px">
        <strong style="font-size:${has ? '30px' : '15px'};letter-spacing:-.02em">${esc(shown)}</strong>
        ${rated ? `<span class="pill ${rated.cls}">${esc(rated.label)}</span>` : ''}
      </div>
      <p class="tiny muted" style="line-height:1.6">${esc(subtitle || t.what)}</p>
      <p class="tiny muted" style="margin-top:6px">Good ≤ ${esc(sccFormatMetric(id, t.good))} · Poor > ${esc(sccFormatMetric(id, t.poor))}</p>
    </div>
  </div>`;
}

/* ---------------- A. LIVE BROWSER ---------------- */

function sectionLive() {
  const L = DATA.live;
  if (!L) return '';
  const r = L.resources;

  const kindRows = (r.byKind || []).sort((a, b) => b.count - a.count).map(k =>
    statusRow(k.kind, `${k.count} request${k.count === 1 ? '' : 's'}`, 'info',
      `${k.bytesKnown ? fmtBytes(k.bytes) + ' measured' : 'size unknown'} · ${k.durationMs} ms total`)).join('');

  return `
  <h2 style="font-size:17px;margin:26px 0 3px">Live browser data</h2>
  <p class="page-sub" style="margin-bottom:14px">${esc(SOURCE_HELP.LIVE)}</p>

  <div class="grid-3">
    ${vitalCard('LCP', L.lcp.value, 'LIVE', L.lcp.reason, L.lcp.state)}
    ${vitalCard('CLS', L.cls.value, 'LIVE', L.cls.shiftCount !== undefined ? `${L.cls.shiftCount} layout shifts counted${L.cls.ignoredAfterInput ? `, ${L.cls.ignoredAfterInput} ignored after input` : ''}.` : null, L.cls.state)}
    ${vitalCard('INP', L.inp.value, L.inp.value !== null ? 'ESTIMATED' : 'LIVE', L.inp.reason, L.inp.state)}
  </div>

  <div class="card">
    <div class="card-head"><h3>Loading milestones</h3>${srcBadge('LIVE')}</div>
    <div>
      ${liveRow('Time to first byte', L.ttfb, 'TTFB', 'How long the server took to start responding')}
      ${liveRow('First contentful paint', L.fcp, 'FCP', 'When the first content appeared')}
      ${L.firstPaint !== null ? statusRow('First paint', L.firstPaint + ' ms', 'info', 'First pixels of any kind') : ''}
      ${statusRow('DOM content loaded', L.timing.domContentLoaded !== null ? L.timing.domContentLoaded + ' ms' : 'Not available', L.timing.domContentLoaded !== null ? 'ok' : 'info')}
      ${statusRow('Load event', L.timing.load !== null ? L.timing.load + ' ms' : 'Not available', L.timing.load !== null ? 'ok' : 'info')}
      ${liveRow('Long tasks', L.longTasks && L.longTasks.value ? { value: L.longTasks.value.count, state: L.longTasks.state, reason: `${L.longTasks.value.totalMs} ms of main-thread blocking` } : L.longTasks, null)}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Connection phases</h3>${srcBadge('LIVE')}</div>
    <div>
      ${statusRow('DNS lookup', L.timing.dns !== null ? L.timing.dns + ' ms' : 'Not available', 'info')}
      ${statusRow('TCP connect', L.timing.tcp !== null ? L.timing.tcp + ' ms' : 'Not available', 'info')}
      ${statusRow('TLS handshake', L.timing.tls !== null ? L.timing.tls + ' ms' : 'Not applicable', 'info')}
      ${statusRow('Request', L.timing.request !== null ? L.timing.request + ' ms' : 'Not available', 'info')}
      ${statusRow('Response', L.timing.response !== null ? L.timing.response + ' ms' : 'Not available', 'info')}
      ${statusRow('HTML transfer size', L.timing.transferBytes !== null ? fmtBytes(L.timing.transferBytes) : 'Not available', 'info')}
    </div>
  </div>

  <div class="grid-4">
    ${stat('Requests', r.count)}
    ${stat('Measured transfer', fmtBytes(r.knownTransferBytes) || '—')}
    ${stat('Third-party', r.thirdPartyCount, r.thirdPartyCount > r.count / 2 ? 'warn' : '')}
    ${stat('Render-blocking', r.renderBlockingCandidates, r.renderBlockingCandidates > 4 ? 'warn' : '')}
  </div>

  <div class="grid-2">
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Resource breakdown</h3>${srcBadge('LIVE')}</div>
      <div>${kindRows || '<div class="status"><div class="s-main"><span>No resource timings reported.</span></div></div>'}</div>
      ${r.unknownSizeCount ? `<div class="card-body" style="padding-top:0"><p class="tiny muted">${r.unknownSizeCount} cross-origin resources did not report a size (no Timing-Allow-Origin header). They are counted, but their bytes are unknown rather than zero.</p></div>` : ''}
    </div>
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Largest resources</h3>${srcBadge('LIVE')}</div>
      <div>${(r.largest || []).slice(0, 8).map(x =>
        statusRow(clip(x.url.split('/').pop() || x.url, 40), fmtBytes(x.transferBytes),
          x.transferBytes > 500000 ? 'warn' : 'info', `${x.kind} · ${x.durationMs} ms${x.crossOrigin ? ' · third-party' : ''}`)).join('')
        || '<div class="status"><div class="s-main"><span>No sized resources reported.</span></div></div>'}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Slowest resources</h3>${srcBadge('LIVE')}</div>
    <div>${(r.slowest || []).slice(0, 8).map(x =>
      statusRow(clip(x.url.split('/').pop() || x.url, 46), x.durationMs + ' ms',
        x.durationMs > 1000 ? 'warn' : 'info',
        `${x.kind}${x.transferBytes ? ' · ' + fmtBytes(x.transferBytes) : ''}${x.crossOrigin ? ' · third-party' : ''}`)).join('')
      || '<div class="status"><div class="s-main"><span>No resource timings reported.</span></div></div>'}</div>
  </div>`;
}

/* ---------------- B. LIGHTHOUSE LAB ---------------- */

function labFailureCard(strategy) {
  const e = PSI_ERROR[strategy];
  const reason = {
    RATE_LIMIT: 'Rate limit reached',
    TIMEOUT: 'Request timed out',
    CANNOT_ANALYZE: 'Google could not analyze this URL',
    NO_PERMISSION: 'Permission was declined',
    NETWORK: 'Network error',
    BAD_RESPONSE: 'Unexpected response',
    NOT_CONFIGURED: 'PageSpeed API is not configured',
    INVALID_KEY: 'API key rejected'
  }[e?.error] || 'Request failed';

  const explain = e?.error === 'RATE_LIMIT'
    ? (e?.message?.includes('this proxy')
        ? e.message
        : 'Google has temporarily limited PageSpeed requests from this connection. Adding your own API key raises this limit.')
    : e?.error === 'NO_PERMISSION'
      ? `Chrome asks for permission before the extension can contact ${e?.detail === 'backend' ? 'your backend' : 'Google'}. Nothing was sent.`
      : e?.error === 'NOT_CONFIGURED'
        ? (e?.message || 'Your AuditFlux backend has no PAGESPEED_API_KEY set. Add one to server/.env and restart the backend — see server/README.md.')
        : e?.error === 'INVALID_KEY'
          ? 'The configured PageSpeed API key was rejected by Google. Check it in Settings.'
          : (e?.message || 'The request did not complete.');

  // Deliberately compact: a failed lab call must not take over the page, because
  // the live browser data below it is still perfectly valid.
  return `<div class="card" style="border-color:var(--amber)">
    <div class="card-body" style="padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="pill warn">Lighthouse temporarily unavailable</span>
        <b style="font-size:12.5px">${esc(reason)}</b>
      </div>
      <p class="tiny muted" style="margin-top:7px;line-height:1.6">${esc(explain)}</p>
      <p class="tiny" style="margin-top:6px;color:var(--text-2)"><strong>Your live browser performance data below is unaffected.</strong></p>
      <div style="margin-top:11px;display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-psi-run="${esc(strategy)}">Retry</button>
        <button class="btn btn-sm" data-nav="settings">${SETTINGS_KEYS.pagespeed ? 'Check API key' : 'Use my API key'}</button>
        <button class="btn btn-sm" data-toggle="psiDetail">Technical details</button>
      </div>
      <div class="evidence hidden" id="psiDetail" style="margin-top:10px">
        <div>Error code: ${esc(e?.error || 'unknown')}</div>
        <div>HTTP status: ${esc(e?.status ?? 'none')}</div>
        <div>${esc(e?.detail || e?.message || 'No further detail returned.')}</div>
      </div>
    </div>
  </div>`;
}

function sectionLab() {
  const strategy = PERF_STRATEGY;
  const result = PSI[strategy];
  const state = PSI_STATE[strategy];
  const meta = PSI_META[strategy];

  const controls = `
    <div class="filters" style="margin-bottom:14px;align-items:center">
      <button class="filter" data-strategy="mobile" aria-pressed="${strategy === 'mobile'}">Mobile</button>
      <button class="filter" data-strategy="desktop" aria-pressed="${strategy === 'desktop'}">Desktop</button>
      <span style="flex:1"></span>
      ${meta?.fromCache ? `<span class="tiny muted">Last checked ${esc(sccFormatAge(meta.ageMs))}</span> ${srcBadge('CACHED')}` : ''}
      ${USAGE ? `<span class="tiny muted">${esc(USAGE.pageSpeedLabel)}</span>` : ''}
      <button class="btn btn-primary btn-sm" data-psi-run="${strategy}" ${state === 'running' ? 'disabled' : ''}>
        ${state === 'running' ? 'Analysis in progress…' : result ? 'Run again' : 'Run PageSpeed'}
      </button>
    </div>`;

  let body;
  if (state === 'running') {
    body = `<div class="card"><div class="card-body"><div class="empty" style="padding:30px">
      <div class="spinner" style="margin:0 auto 12px"></div>
      <b>Analysis in progress…</b>
      <p>Google is loading and analyzing this URL as ${esc(strategy)}. This usually takes 10–30 seconds.</p>
    </div></div></div>`;
  } else if (state === 'error') {
    body = labFailureCard(strategy);
  } else if (!result) {
    body = `<div class="card"><div class="card-body"><div class="empty" style="padding:30px">
      <b>No Lighthouse data yet</b>
      <p>PageSpeed Insights is available without an API key for occasional use. Running it asks Chrome for permission to contact googleapis.com — nothing is sent until you click.</p>
      <button class="btn btn-primary" style="margin-top:13px" data-psi-run="${strategy}">Run PageSpeed on ${esc(strategy)}</button>
    </div></div></div>`;
  } else {
    const lab = result.lab;
    body = `
      <div class="grid-4">
        ${scoreDial('Performance', result.scores.performance)}
        ${scoreDial('Accessibility', result.scores.accessibility)}
        ${scoreDial('Best Practices', result.scores.bestPractices)}
        ${scoreDial('SEO', result.scores.seo)}
      </div>
      <p class="tiny muted" style="margin:-10px 0 18px">
        Source: Google PageSpeed Insights${meta?.viaBackend ? ' (via your AuditFlux backend — key never touched this browser)' : ''} · Lighthouse ${esc(result.lighthouseVersion || '')} · ${esc(strategy)} · ${esc(clip(result.finalUrl || DATA.page.url, 80))}
        ${meta?.fromCache ? ' · cached result, no new request made' : ''}
      </p>
      ${result.auditSummary ? `<p class="tiny muted" style="margin:0 0 18px">
        ${result.auditSummary.applicable} applicable checks —
        ${result.auditSummary.passed} passed,
        ${result.auditSummary.warning} warnings,
        ${result.auditSummary.failed} failed
        ${result.auditSummary.notApplicable ? ` · ${result.auditSummary.notApplicable} not applicable to this page` : ''}
      </p>` : ''}

      <div class="card">
        <div class="card-head"><h3>Lab metrics</h3>${srcBadge('LAB')}</div>
        <div>
          ${['LCP', 'FCP', 'CLS', 'TBT', 'SI', 'TTFB'].map(id => {
            const v = lab[id];
            const rated = v === null || v === undefined ? null : sccRateMetric(id, v);
            return `<div class="status">
              <div class="s-main"><b>${esc(SCC_CWV_THRESHOLDS[id].name)}</b><span>Source: Google Lighthouse Lab Data</span></div>
              <div class="s-act">${rated ? `<span class="pill ${rated.cls}">${esc(rated.label)}</span>` : ''}
                <strong style="font-size:13px">${v === null || v === undefined ? 'Not reported' : esc(sccFormatMetric(id, v))}</strong>
                ${srcBadge('LAB')}</div>
            </div>`;
          }).join('')}
          <div class="status"><div class="s-main"><b>INP</b>
            <span>INP is a field-only metric and is not produced by a lab run. Total Blocking Time above is the lab stand-in.</span></div>
            <div class="s-act">${srcBadge('NA')}</div></div>
        </div>
      </div>

      ${result.opportunities.length ? `
      <h3 style="font-size:14px;margin:20px 0 10px">Top opportunities</h3>
      ${result.opportunities.slice(0, 10).map((o, n) => `
        <div class="issue">
          <button class="issue-head" data-toggle="opp${n}" aria-expanded="false" aria-controls="opp${n}">
            <span class="pill ${o.severity === 'critical' ? 'fail' : 'warn'}">${esc(o.severity)}</span>
            <span class="t">${esc(o.title)}</span>
            ${o.savingsMs ? `<span class="pill blue">~${Math.round(o.savingsMs)} ms</span>` : ''}
            <span class="chev" aria-hidden="true">▾</span>
          </button>
          <div class="issue-body hidden" id="opp${n}">
            <div class="qa"><h5>What Lighthouse found</h5><p>${esc(o.description)}</p></div>
            ${o.displayValue ? `<div class="qa"><h5>Measured</h5><p>${esc(o.displayValue)}</p></div>` : ''}
            ${o.items.length ? `<div class="qa"><h5>Affected resources</h5><div class="evidence">${o.items.map(it =>
              `<div>${esc(clip(it.url || '(inline)', 110))}${it.wastedBytes ? ' — ' + fmtBytes(it.wastedBytes) : ''}${it.wastedMs ? ' — ' + Math.round(it.wastedMs) + ' ms' : ''}</div>`).join('')}</div>
              ${o.items[0]?.url ? `<div style="margin-top:8px;display:flex;gap:6px">
                <button class="btn btn-sm" data-copy="${esc(o.items[0].url)}">Copy URL</button>
                <a class="btn btn-sm" href="${esc(o.items[0].url)}" target="_blank" rel="noopener noreferrer">Open resource</a></div>` : ''}
            </div>` : ''}
          </div>
        </div>`).join('')}` : ''}`;
  }

  return `
  <h2 style="font-size:17px;margin:26px 0 3px">Lighthouse lab data</h2>
  <p class="page-sub" style="margin-bottom:14px">${esc(SOURCE_HELP.LAB)}</p>
  ${controls}${body}`;
}

/* ---------------- C. CrUX FIELD ---------------- */

function sectionField() {
  const strategy = PERF_STRATEGY;
  const result = PSI[strategy];
  // PSI returns CrUX data alongside the lab run; the CrUX API adds origin/history.
  const psiField = result?.fieldFromPsi || null;
  const psiOrigin = result?.originFieldFromPsi || null;
  const direct = CRUX[strategy];
  const connected = !!SETTINGS_KEYS.crux;

  let body;
  if (!psiField && !direct && !psiOrigin) {
    body = `<div class="card"><div class="card-body"><div class="empty" style="padding:30px">
      <b>${connected ? 'No field data' : 'Not connected'}</b>
      <p>${connected
        ? 'Chrome UX Report does not currently have sufficient real-user data for this URL. This is a valid state, not an error — it usually means the page does not yet get enough traffic.'
        : 'Real-user data comes from Chrome UX Report. PageSpeed returns it automatically for URLs Google has data for; connecting a CrUX API key adds origin-level queries and history.'}</p>
      <div style="margin-top:13px;display:flex;gap:7px;justify-content:center">
        ${connected ? `<button class="btn btn-primary" data-psi-run="${strategy}">Run PageSpeed to fetch field data</button>`
                    : '<button class="btn btn-primary" data-nav="settings">Connect CrUX</button>'}
      </div>
    </div></div></div>`;
  } else {
    const src = direct || psiField;
    const m = src.metrics || {};
    body = `
      <div class="grid-3">
        ${vitalCard('LCP', m.LCP?.value ?? null, 'FIELD', '75th percentile of real users over the last 28 days.')}
        ${vitalCard('INP', m.INP?.value ?? null, 'FIELD', '75th percentile. Field data is the only real source for INP.')}
        ${vitalCard('CLS', m.CLS?.value ?? null, 'FIELD', '75th percentile of real users.')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Additional field metrics</h3>${srcBadge('FIELD')}</div>
        <div>
          ${['FCP', 'TTFB'].map(id => {
            const v = m[id]?.value ?? null;
            const rated = v === null ? null : sccRateMetric(id, v);
            return `<div class="status">
              <div class="s-main"><b>${esc(SCC_CWV_THRESHOLDS[id].name)}</b><span>Source: Chrome UX Report Field Data · 75th percentile</span></div>
              <div class="s-act">${rated ? `<span class="pill ${rated.cls}">${esc(rated.label)}</span>` : ''}
                <strong style="font-size:13px">${v === null ? 'No data' : esc(sccFormatMetric(id, v))}</strong>
                ${srcBadge(v === null ? 'NA' : 'FIELD')}</div></div>`;
          }).join('')}
          ${statusRow('Data source', esc(src.source || 'Chrome UX Report'), 'purple', direct ? 'CrUX API (your key)' : 'Returned with the PageSpeed response')}
        </div>
      </div>
      ${psiOrigin ? `<div class="card">
        <div class="card-head"><h3>Origin-level field data</h3>${srcBadge('FIELD')}</div>
        <div>${['LCP', 'INP', 'CLS'].map(id => {
          const v = psiOrigin.metrics[id]?.value ?? null;
          const rated = v === null ? null : sccRateMetric(id, v);
          return `<div class="status">
            <div class="s-main"><b>${esc(id)}</b><span>Across the whole site, not just this URL</span></div>
            <div class="s-act">${rated ? `<span class="pill ${rated.cls}">${esc(rated.label)}</span>` : ''}
              <strong style="font-size:13px">${v === null ? 'No data' : esc(sccFormatMetric(id, v))}</strong>
              ${srcBadge(v === null ? 'NA' : 'FIELD')}</div></div>`;
        }).join('')}</div>
      </div>` : ''}`;
  }

  return `
  <h2 style="font-size:17px;margin:26px 0 3px">Real-user field data</h2>
  <p class="page-sub" style="margin-bottom:14px">${esc(SOURCE_HELP.FIELD)}</p>
  <div style="margin-bottom:12px">
    ${statusRow('Chrome UX Report', connected ? 'Connected' : 'Not connected', connected ? 'ok' : 'info',
      connected ? 'API key configured in Settings' : 'Field data still arrives with PageSpeed where Google publishes it')}
  </div>
  ${body}`;
}

/* ---------------- the page ---------------- */

function vPerformance() {
  const L = DATA.live;
  const result = PSI[PERF_STRATEGY];
  const psiField = result?.fieldFromPsi;

  // Three independent headline states. Deliberately not merged into one number:
  // they answer three different questions and are not comparable.
  const overview = `
  <div class="grid-3">
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Live browser</h3>${srcBadge('LIVE')}</div>
      <div class="card-body">
        <strong style="font-size:22px">${L && L.lcp.value !== null ? esc(sccFormatMetric('LCP', L.lcp.value)) : '—'}</strong>
        <p class="tiny muted" style="margin-top:5px">LCP in this browser session${L && L.lcp.value === null ? ' — not measurable on this page' : ''}</p>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Lighthouse lab</h3>${srcBadge('LAB')}</div>
      <div class="card-body">
        <strong style="font-size:22px">${result && result.scores.performance !== null ? result.scores.performance : '—'}</strong>
        <p class="tiny muted" style="margin-top:5px">${result ? 'Performance score, ' + esc(PERF_STRATEGY) : 'Not run yet'}</p>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-head"><h3>Real users</h3>${srcBadge('FIELD')}</div>
      <div class="card-body">
        <strong style="font-size:22px">${psiField && psiField.metrics.LCP ? esc(sccFormatMetric('LCP', psiField.metrics.LCP.value)) : '—'}</strong>
        <p class="tiny muted" style="margin-top:5px">${psiField ? 'LCP, 75th percentile' : 'No field data yet'}</p>
      </div>
    </div>
  </div>`;

  return `
  ${head('Performance', 'Three separate sources, never blended: what your browser measured just now, how Google\u2019s Lighthouse lab scores the page, and what real Chrome users experienced. Each metric carries its source.')}
  ${overview}
  ${sectionLive()}
  ${sectionLab()}
  ${sectionField()}`;
}

/* ---------------- usage ---------------- */

function usageBar(c) {
  const cls = c.atLimit ? 'bad' : c.nearLimit ? 'mid' : 'good';
  return `<div style="padding:12px 14px;border-bottom:1px solid var(--line)">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
      <b style="font-size:12.5px">${esc(c.label)}</b>
      <span class="tiny ${c.atLimit ? '' : 'muted'}" style="${c.atLimit ? 'color:var(--red);font-weight:700' : ''}">
        ${c.unlimited ? 'Unlimited' : `${c.used} / ${c.limit}`}
      </span>
    </div>
    <div class="bar"><i class="${cls}" style="width:${c.unlimited ? 100 : c.percent}%"></i></div>
    ${c.atLimit ? `<p class="tiny" style="margin-top:7px;color:var(--red)">Limit reached. It resets ${c.period === 'daily' ? 'tomorrow' : 'next month'}.</p>`
      : c.nearLimit ? `<p class="tiny" style="margin-top:7px;color:var(--amber)">You're nearing your plan limit.</p>` : ''}
  </div>`;
}

function vUsage() {
  if (!USAGE || !USAGE.raw) {
    return head('Usage', 'How much of your plan you have used.') +
      emptyBlock('Usage not loaded', 'Reopen this report to load your usage counters.');
  }
  const { plan, counters } = USAGE.raw;
  const dev = SCC_ENTITLEMENTS.mode.isDevelopment();

  return `
  ${head('Usage', 'Counters increment only when an action actually succeeds — nothing here is simulated.')}

  ${dev ? `<div class="card" style="border-color:var(--amber);background:var(--amber-soft)">
    <div class="card-body">
      <b style="font-size:13px">Development mode — not secure billing</b>
      <p class="tiny" style="margin-top:5px;line-height:1.6">Your plan and usage are stored locally in this browser, so they can be edited by anyone with access to it. This is a preview of how entitlements will behave, not an enforcement mechanism. Real limits must be enforced server-side before any money changes hands.</p>
    </div>
  </div>` : ''}

  <div class="card">
    <div class="card-head">
      <h3>Current plan</h3>
      <span class="pill ${plan.id === 'free' ? 'info' : 'blue'}">${esc(plan.name)}</span>
    </div>
    <div class="card-body">
      <p class="tiny muted" style="line-height:1.6">${esc(plan.tagline || '')}</p>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-nav="pricing">View plans</button>
        ${plan.id !== 'free' ? '<button class="btn btn-sm" data-billing="portal">Manage subscription</button>' : ''}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>This period</h3><span class="sub">Resets automatically</span></div>
    <div>${counters.map(usageBar).join('')}</div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Plan limits</h3></div>
    <div>
      ${Object.entries(plan.limits).map(([k, v]) => statusRow(
        sccHumanLimitName ? sccHumanLimitName(k) : k,
        sccFormatLimit(v), v === SCC_UNLIMITED ? 'ok' : 'info')).join('')}
    </div>
  </div>`;
}

/* ---------------- settings ---------------- */

function vSettings() {
  const keys = SETTINGS_KEYS || {};
  return `
  ${head('Settings', 'API keys and integrations. Keys are stored locally in this browser and are never sent anywhere except directly to Google.')}

  <div class="card" style="border-color:var(--amber);background:var(--amber-soft)">
    <div class="card-body">
      <b style="font-size:13px">About storing keys here</b>
      <p class="tiny" style="margin-top:5px;line-height:1.6">A key saved in the extension lives in this browser's local storage. Anyone with access to this browser profile can read it. Restrict your keys in Google Cloud Console to the APIs you need, and treat them as replaceable. For a production SaaS, keys belong on a server, never in a client.</p>
    </div>
  </div>

  <div class="card" style="border-color:${BACKEND_STATUS?.ok && BACKEND_STATUS.pagespeed?.configured ? 'var(--green)' : 'var(--line)'}">
    <div class="card-head"><h3>AuditFlux backend (recommended)</h3>
      <span class="pill ${BACKEND_STATUS?.ok ? (BACKEND_STATUS.pagespeed?.configured ? 'ok' : 'warn') : 'info'}">
        ${!BACKEND_URL ? 'Not set up' : BACKEND_STATUS?.ok ? (BACKEND_STATUS.pagespeed?.configured ? 'Connected — key never leaves the server' : 'Reachable, but no key configured server-side') : 'Not reachable'}
      </span>
    </div>
    <div class="card-body">
      <p class="tiny muted" style="line-height:1.6;margin-bottom:12px">
        The most secure option: a small server you run holds the real PageSpeed API key and this extension never sees it. Point this at your own deployment of the <code>server/</code> folder shipped alongside this extension — see <code>server/README.md</code> for setup.
        A backend URL is not a secret, so it is fine to store here.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="text" class="setting-input" id="backendUrl" placeholder="http://localhost:8787" value="${esc(BACKEND_URL)}" autocomplete="off">
        <button class="btn btn-primary btn-sm" data-save-backend>Save</button>
        <button class="btn btn-sm" data-test-backend>Test Connection</button>
        ${BACKEND_URL ? '<button class="btn btn-sm" data-clear-backend>Remove</button>' : ''}
      </div>
      <div id="backendStatus" style="margin-top:10px"></div>
      ${BACKEND_URL && BACKEND_STATUS?.ok && !BACKEND_STATUS.pagespeed?.configured ? `<p class="tiny" style="margin-top:8px;color:var(--amber)">Your backend is reachable but has no PAGESPEED_API_KEY set — see server/.env.example.</p>` : ''}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>PageSpeed Insights</h3>
      <span class="pill ${keys.pagespeed ? 'ok' : 'info'}">${keys.pagespeed ? 'Key configured' : 'No key — using unauthenticated access'}</span>
    </div>
    <div class="card-body">
      <p class="tiny muted" style="line-height:1.6;margin-bottom:12px">Available without an API key for occasional use, which is how this extension calls it. A key is recommended for frequent or automated requests and raises your quota. It is optional — PageSpeed works without one.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="password" class="setting-input" id="psiKey" placeholder="Optional Google API key" value="${esc(keys.pagespeed || '')}" autocomplete="off">
        <button class="btn btn-primary btn-sm" data-savekey="pagespeed">Save</button>
        <button class="btn btn-sm" data-testkey="pagespeed">Test Connection</button>
        ${keys.pagespeed ? '<button class="btn btn-sm" data-clearkey="pagespeed">Remove</button>' : ''}
      </div>
      <div id="psiKeyStatus" style="margin-top:10px"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Chrome UX Report (CrUX)</h3>
      <span class="pill ${keys.crux ? 'ok' : 'purple'}">${keys.crux ? 'Connected' : 'Not configured'}</span>
    </div>
    <div class="card-body">
      <p class="tiny muted" style="line-height:1.6;margin-bottom:12px">CrUX requires a Google Cloud API key and is available within Google's documented quota. Without a key you still get field data through PageSpeed Insights where Google publishes it; a key adds direct origin queries and history. Nothing else in AuditFlux SEO requires this.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="password" class="setting-input" id="cruxKey" placeholder="Google Cloud API key" value="${esc(keys.crux || '')}" autocomplete="off">
        <button class="btn btn-primary btn-sm" data-savekey="crux">Save</button>
        <button class="btn btn-sm" data-testkey="crux">Test Connection</button>
        ${keys.crux ? '<button class="btn btn-sm" data-clearkey="crux">Remove</button>' : ''}
      </div>
      <div id="cruxKeyStatus" style="margin-top:10px"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>PageSpeed cache</h3></div>
    <div class="card-body" style="display:flex;justify-content:space-between;align-items:center">
      <p class="tiny muted" style="margin:0;max-width:480px">Successful results are cached for 30 minutes so switching tabs or reopening the report never spends another request. "Run PageSpeed" always fetches a fresh result.</p>
      <button class="btn btn-sm" data-clear-psi-cache>Clear cache</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Host permissions</h3></div>
    <div>
      ${statusRow('googleapis.com (PageSpeed)', PERMS.pagespeed ? 'Granted' : 'Not granted', PERMS.pagespeed ? 'ok' : 'info', 'Requested only when you run PageSpeed')}
      ${statusRow('chromeuxreport.googleapis.com (CrUX)', PERMS.crux ? 'Granted' : 'Not granted', PERMS.crux ? 'ok' : 'info', 'Requested only when you query CrUX')}
      ${BACKEND_URL ? statusRow('Your AuditFlux backend', PERMS.backend ? 'Granted' : 'Not granted', PERMS.backend ? 'ok' : 'info', 'Requested only when you use the backend transport') : ''}
    </div>
    <div class="card-body" style="padding-top:0">
      <p class="tiny muted">The extension installs with no host access at all. These are optional permissions Chrome asks you to approve at the moment they are first needed.</p>
    </div>
  </div>`;
}


function vAccessibility() {
  const a = DATA.accessibility || {};
  const m = DATA.mobile || {};
  const S = SCC_SOURCE, ST = SCC_STATUS;
  const yn = (bad, count, total) => count === 0 ? ['Pass', 'ok'] : [bad, 'fail'];

  return `
  ${head('Accessibility signals', 'Checks that can be read reliably from the DOM. This is not a full accessibility audit — contrast, focus order and screen-reader behaviour need real assistive technology and human judgement.')}

  <div class="grid-4">
    ${stat('Form fields', a.inputs ?? 0)}
    ${stat('Unlabelled', a.unlabelledInputs ?? 0, (a.unlabelledInputs || 0) ? 'crit' : 'pass')}
    ${stat('Nameless buttons', a.namelessButtons ?? 0, (a.namelessButtons || 0) ? 'crit' : 'pass')}
    ${stat('Nameless links', a.namelessLinks ?? 0, (a.namelessLinks || 0) ? 'warn' : 'pass')}
  </div>

  <div class="card">
    <div class="card-head"><h3>Names and labels</h3><span class="sub">Source: ${esc(S.DOM)}</span></div>
    <div>
      ${statusRow('Form fields with labels', `${(a.inputs || 0) - (a.unlabelledInputs || 0)} of ${a.inputs || 0}`, (a.unlabelledInputs || 0) ? 'fail' : 'ok', a.unlabelledInputSamples?.length ? 'Unlabelled: ' + a.unlabelledInputSamples.join(', ') : 'Every field is labelled')}
      ${statusRow('Buttons with accessible names', `${(a.buttons || 0) - (a.namelessButtons || 0)} of ${a.buttons || 0}`, (a.namelessButtons || 0) ? 'fail' : 'ok')}
      ${statusRow('Links with accessible names', `${(a.links || 0) - (a.namelessLinks || 0)} of ${a.links || 0}`, (a.namelessLinks || 0) ? 'warn' : 'ok')}
      ${statusRow('Iframes with titles', `${(a.iframes || 0) - (a.untitledIframes || 0)} of ${a.iframes || 0}`, (a.untitledIframes || 0) ? 'warn' : 'ok', a.iframes ? '' : 'No iframes on this page')}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Structure and navigation</h3></div>
    <div>
      ${statusRow('Page language', a.lang || 'Not set', a.lang ? 'ok' : 'warn')}
      ${statusRow('Main landmark', a.landmarks?.main ? 'Present' : 'Missing', a.landmarks?.main ? 'ok' : 'warn', 'Lets assistive tech skip navigation')}
      ${statusRow('Navigation landmarks', String(a.landmarks?.nav ?? 0), 'info')}
      ${statusRow('Skip link', a.skipLink ? 'Found' : 'Not found', a.skipLink ? 'ok' : 'info')}
      ${statusRow('ARIA roles in use', String(a.ariaRoles ?? 0), 'info')}
      ${statusRow('Positive tabindex', String(a.positiveTabindex ?? 0), (a.positiveTabindex || 0) ? 'warn' : 'ok', 'Overrides natural focus order')}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Mobile and zoom</h3></div>
    <div>
      ${statusRow('Viewport meta tag', m.hasViewport ? 'Present' : 'Missing', m.hasViewport ? 'ok' : 'fail', m.viewport || '')}
      ${statusRow('Pinch zoom', a.blocksZoom ? 'Blocked' : 'Allowed', a.blocksZoom ? 'fail' : 'ok', a.blocksZoom ? 'user-scalable=no or maximum-scale prevents magnification' : '')}
      ${statusRow('Horizontal overflow', m.horizontalOverflow ? 'Page scrolls sideways' : 'Fits the viewport', m.horizontalOverflow ? 'warn' : 'ok', m.documentWidth ? `Document ${m.documentWidth}px in a ${m.viewportWidth}px viewport` : '')}
      ${m.overflowSamples?.length ? statusRow('Overflowing elements', String(m.overflowSamples.length), 'warn', m.overflowSamples.join(', ')) : ''}
    </div>
  </div>`;
}

function vResources() {
  const list = DATA.resources || [];
  const totals = DATA.perf?.resourceTotals || [];

  if (!list.length) {
    return head('Page resources', 'Everything the browser loaded for this page.') +
      emptyBlock('No resource timings available', 'The browser reported no Resource Timing entries. Nothing is shown rather than guessing at what loaded.');
  }

  const known = list.filter(r => r.transferBytes !== null);
  const totalBytes = known.reduce((s, r) => s + r.transferBytes, 0);

  return `
  ${head('Page resources', `Every request the browser made, from the Resource Timing API. Transfer size is unavailable for cross-origin responses that do not send Timing-Allow-Origin — those show as unknown rather than zero.`)}

  <div class="grid-4">
    ${stat('Requests', list.length)}
    ${stat('Measured size', fmtBytes(totalBytes) || '—')}
    ${stat('Size unknown', list.length - known.length, (list.length - known.length) ? 'note' : 'pass')}
    ${stat('Third-party', list.filter(r => r.crossOrigin).length)}
  </div>

  <div class="card">
    <div class="card-head"><h3>By type</h3><span class="sub">Source: ${esc(SCC_SOURCE.PERF_API)}</span></div>
    <div>${totals.sort((a, b) => b.count - a.count).map(t => statusRow(
      t.kind, `${t.count} request${t.count === 1 ? '' : 's'}`, 'info',
      `${t.bytesKnown ? fmtBytes(t.bytes) + ' measured across ' + t.bytesKnown : 'size unknown'} · ${t.durationMs} ms total`
    )).join('')}</div>
  </div>

  <div class="card">
    <div class="card-head"><h3>All requests</h3><span class="sub">${list.length} shown</span></div>
    <div class="table-wrap" style="max-height:560px;border:0;border-radius:0 0 var(--r-lg) var(--r-lg)">
      <table><thead><tr><th>URL</th><th>Type</th><th>Size</th><th>Duration</th><th>Origin</th><th></th></tr></thead>
      <tbody>${list.slice(0, 400).map(r => `<tr>
        <td class="w"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(clip(r.url, 74))}</a></td>
        <td><span class="pill info">${esc(r.kind)}</span></td>
        <td>${r.transferBytes !== null ? esc(fmtBytes(r.transferBytes)) : (r.cached ? '<span class="muted tiny">cached</span>' : '<span class="muted tiny">unknown</span>')}</td>
        <td>${r.durationMs} ms</td>
        <td>${r.crossOrigin ? '<span class="pill warn">third-party</span>' : '<span class="muted tiny">same-origin</span>'}</td>
        <td><button class="btn btn-sm" data-copy="${esc(r.url)}">Copy</button></td>
      </tr>`).join('')}</tbody></table>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Important files</h3><span class="sub">Well-known resources</span></div>
    <div>
      ${statusRow('robots.txt', DATA.robots.fetched ? 'Found' : 'Missing', DATA.robots.fetched ? 'ok' : 'warn', DATA.page.origin + '/robots.txt',
        `<a class="btn btn-sm" href="${esc(DATA.page.origin)}/robots.txt" target="_blank" rel="noopener noreferrer">Open</a>`)}
      ${DATA.sitemaps.map(s => statusRow('Sitemap', s.ok && s.valid ? `${s.urlCount} URLs` : (s.error ? 'Unreachable' : 'HTTP ' + s.status), s.ok && s.valid ? 'ok' : 'info', s.url,
        `<a class="btn btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open</a>`)).join('')}
      ${DATA.llms.map(f => statusRow(f.file, f.state, f.state === 'FOUND' ? 'ok' : 'info', '',
        f.state === 'FOUND' ? `<a class="btn btn-sm" href="${esc(DATA.page.origin + f.file)}" target="_blank" rel="noopener noreferrer">Open</a>` : '')).join('')}
      ${(DATA.wellKnown || []).map(f => statusRow(f.label, f.state, f.state === 'FOUND' || f.state === 'DECLARED' ? 'ok' : 'info', f.file,
        (f.state === 'FOUND' || f.state === 'DECLARED') ? `<a class="btn btn-sm" href="${esc(f.file.startsWith('http') ? f.file : DATA.page.origin + f.file)}" target="_blank" rel="noopener noreferrer">Open</a>` : '')).join('')}
      ${DATA.head.canonical ? statusRow('Canonical URL', DATA.head.canonicalIsSelf ? 'Self' : 'Other URL', DATA.head.canonicalIsSelf ? 'ok' : 'warn', DATA.head.canonical,
        `<a class="btn btn-sm" href="${esc(DATA.head.canonical)}" target="_blank" rel="noopener noreferrer">Open</a>`) : ''}
    </div>
  </div>`;
}



/* ---------------- entitlements, keys and permissions ---------------- */

async function loadPlanAndUsage() {
  try {
    SCC_ENTITLEMENTS.init(chrome.storage.local);
    const raw = await SCC_ENTITLEMENTS.getUsage();
    PLAN = raw.plan;
    const psi = raw.counters.find(c => c.action === 'pageSpeedCheck');
    USAGE = {
      raw,
      pageSpeedLabel: psi ? (psi.unlimited ? 'PageSpeed: unlimited' : `PageSpeed checks: ${psi.used} / ${psi.limit} today`) : '',
      canRunPageSpeed: !psi || psi.unlimited || !psi.atLimit
    };
    PLAN.canRunPageSpeed = USAGE.canRunPageSpeed;
    const badge = $('#planBadge');
    if (badge) badge.textContent = raw.plan.name.toUpperCase();
  } catch (e) {
    console.warn('Entitlements unavailable:', e);
  }
}

async function loadSettings() {
  try {
    const got = await chrome.storage.local.get(['sccApiKeys', 'sccBackendUrl']);
    SETTINGS_KEYS = Object.assign({ pagespeed: '', crux: '' }, got.sccApiKeys || {});
    BACKEND_URL = got.sccBackendUrl || '';
  } catch (e) { /* keys stay empty */ }
  try {
    PERMS.pagespeed = await sccHasPerfPermission('pagespeed');
    PERMS.crux = await sccHasPerfPermission('crux');
    if (BACKEND_URL) PERMS.backend = await sccHasBackendPermission(BACKEND_URL);
  } catch (e) { /* permission API unavailable in tests */ }
  if (BACKEND_URL) {
    // A quiet status check on load — never spends a PageSpeed quota unit,
    // just asks the proxy whether it has a key configured.
    BACKEND_STATUS = await sccCheckBackendStatus(BACKEND_URL).catch(() => null);
  }
}

/* ---------------- PageSpeed runner ---------------- */

async function runPageSpeed(strategy, force) {
  // A request already in flight for this exact URL+strategy must be joined,
  // never duplicated — covers double-clicks and a re-render firing twice.
  if (!force && sccIsPageSpeedRunning(DATA.page.url, strategy, !!SETTINGS_KEYS.pagespeed)) {
    toast('Analysis already in progress…');
    return;
  }

  let allowed = { allowed: true };
  try { allowed = await SCC_ENTITLEMENTS.canUse('pageSpeedCheck'); } catch (e) {}
  if (!allowed.allowed && !force) {
    // A cached result can still be shown even at the daily limit — the limit
    // is on new requests to Google, not on re-reading what you already have.
    const cached = await SCC_PSI_CACHE.read(chrome.storage.local, DATA.page.url, strategy, !!SETTINGS_KEYS.pagespeed);
    if (cached) {
      PSI[strategy] = cached.result; PSI_STATE[strategy] = 'done';
      PSI_META[strategy] = { fromCache: true, ageMs: cached.ageMs };
      await persistAvailablePerformance();
      toast('Showing your last cached result — daily limit reached for new checks.');
      render();
      return;
    }
    toast(allowed.reason === 'LIMIT_REACHED'
      ? `Daily PageSpeed limit reached (${allowed.used}/${allowed.limit}). Resets tomorrow.`
      : 'PageSpeed is not included in your current plan.');
    view = 'usage'; render();
    return;
  }

  // Prefer the backend proxy when it is configured and actually has a key —
  // that path never puts an API key in this browser at all. Otherwise fall
  // back to the existing bring-your-own-key / unauthenticated direct path.
  const useBackend = !!BACKEND_URL && BACKEND_STATUS?.ok && BACKEND_STATUS.pagespeed?.configured;

  if (useBackend && !PERMS.backend) {
    let granted = false;
    try { granted = await sccRequestBackendPermission(BACKEND_URL); } catch (e) { granted = false; }
    PERMS.backend = granted;
    if (!granted) {
      PSI_STATE[strategy] = 'error';
      PSI_ERROR[strategy] = { error: 'NO_PERMISSION', message: 'Chrome permission to contact your AuditFlux backend was declined.', status: null, detail: null };
      render();
      return;
    }
  } else if (!useBackend && !PERMS.pagespeed) {
    let granted = false;
    try { granted = await sccRequestPerfPermission('pagespeed'); } catch (e) { granted = false; }
    PERMS.pagespeed = granted;
    if (!granted) {
      PSI_STATE[strategy] = 'error';
      PSI_ERROR[strategy] = { error: 'NO_PERMISSION', message: 'Chrome permission to contact googleapis.com was declined.', status: null, detail: null };
      render();
      return;
    }
  }

  PSI_STATE[strategy] = 'running';
  PSI_ERROR[strategy] = null;
  render();

  const outcome = useBackend
    ? await (async () => {
        // The backend already caches and dedupes server-side, so the client
        // cache is skipped for this path — a second cache would only add
        // staleness, not safety.
        const result = await sccRunPageSpeedViaBackend(DATA.page.url, strategy, BACKEND_URL);
        return { result, fromCache: !!result.fromCache, ageMs: result.ageMs || 0, deduped: !!result.deduped, spentRequest: !!(result.ok && !result.fromCache && !result.deduped) };
      })()
    : await sccGetPageSpeed({
        url: DATA.page.url, strategy, apiKey: SETTINGS_KEYS.pagespeed || null,
        storage: chrome.storage.local, force: !!force
      });

  if (outcome.result.ok) {
    PSI[strategy] = outcome.result;
    PSI_STATE[strategy] = 'done';
    PSI_META[strategy] = { fromCache: outcome.fromCache, ageMs: outcome.ageMs, viaBackend: useBackend };
    await persistAvailablePerformance();
    // Only a request that actually reached Google spends a usage unit — never
    // a cache hit, a dedup join, or a request blocked before it was sent.
    if (outcome.spentRequest) {
      try { await SCC_ENTITLEMENTS.record('pageSpeedCheck'); } catch (e) {}
      await loadPlanAndUsage();
    }
    if (!useBackend && SETTINGS_KEYS.crux) queryCrux(strategy);
  } else {
    PSI_STATE[strategy] = 'error';
    PSI_ERROR[strategy] = outcome.result;
    // A failed lab call must never block the rest of the page — live browser
    // data is independent and stays fully rendered underneath the error card.
  }
  render();
}

async function queryCrux(strategy) {
  if (!SETTINGS_KEYS.crux) return;
  if (!PERMS.crux) {
    let granted = false;
    try { granted = await sccRequestPerfPermission('crux'); } catch (e) { granted = false; }
    PERMS.crux = granted;
    if (!granted) return;
  }
  CRUX_STATE = 'running';
  const res = await sccQueryCrux(DATA.page.url, strategy, SETTINGS_KEYS.crux);
  if (res.ok) { CRUX[strategy] = res; CRUX_STATE = 'done'; await persistAvailablePerformance(); }
  else { CRUX_ERROR = res; CRUX_STATE = 'error'; }
  render();
}


async function testKey(which) {
  const input = $(which === 'pagespeed' ? '#psiKey' : '#cruxKey');
  const statusEl = $(which === 'pagespeed' ? '#psiKeyStatus' : '#cruxKeyStatus');
  const key = input ? input.value.trim() : '';
  if (!key) {
    if (statusEl) statusEl.innerHTML = which === 'pagespeed'
      ? '<span class="pill info">No key entered — PageSpeed already works without one</span>'
      : '<span class="pill purple">No key entered</span>';
    return;
  }
  if (statusEl) statusEl.innerHTML = '<span class="pill info">Testing…</span>';

  // A real, minimal request against the audited URL — a genuine round trip,
  // not a format check, so "Connected" only appears once Google accepts it.
  if (which === 'pagespeed') {
    if (!PERMS.pagespeed) {
      const granted = await sccRequestPerfPermission('pagespeed').catch(() => false);
      PERMS.pagespeed = granted;
      if (!granted) { statusEl.innerHTML = '<span class="pill fail">Permission declined</span>'; return; }
    }
    const r = await sccRunPageSpeed(DATA.page.url, 'mobile', key);
    statusEl.innerHTML = r.ok ? '<span class="pill ok">Connected</span>'
      : r.error === 'RATE_LIMIT' ? '<span class="pill warn">Key accepted, but rate limited right now</span>'
      : `<span class="pill fail">Invalid — ${esc(r.message || r.error)}</span>`;
  } else {
    if (!PERMS.crux) {
      const granted = await sccRequestPerfPermission('crux').catch(() => false);
      PERMS.crux = granted;
      if (!granted) { statusEl.innerHTML = '<span class="pill fail">Permission declined</span>'; return; }
    }
    const r = await sccQueryCrux(DATA.page.url, 'mobile', key);
    statusEl.innerHTML = r.ok ? '<span class="pill ok">Connected</span>'
      : r.error === 'NO_DATA' ? '<span class="pill ok">Connected — no field data for this URL, which is normal</span>'
      : `<span class="pill fail">Invalid — ${esc(r.message || r.error)}</span>`;
  }
}


async function saveBackendUrl() {
  const input = $('#backendUrl');
  const raw = input ? input.value.trim() : '';
  const normalized = raw ? sccNormalizeBackendUrl(raw) : '';
  if (raw && !normalized) { toast('That does not look like a valid URL'); return; }
  BACKEND_URL = normalized || '';
  try { await chrome.storage.local.set({ sccBackendUrl: BACKEND_URL }); } catch (e) {}
  PERMS.backend = BACKEND_URL ? await sccHasBackendPermission(BACKEND_URL).catch(() => false) : false;
  BACKEND_STATUS = BACKEND_URL ? await sccCheckBackendStatus(BACKEND_URL).catch(() => null) : null;
  toast(BACKEND_URL ? 'Backend URL saved' : 'Backend URL cleared');
  render();
}

async function clearBackendUrl() {
  BACKEND_URL = ''; BACKEND_STATUS = null;
  try { await chrome.storage.local.set({ sccBackendUrl: '' }); } catch (e) {}
  toast('Backend disconnected — falling back to direct requests');
  render();
}

async function testBackendUrl() {
  const input = $('#backendUrl');
  const statusEl = $('#backendStatus');
  const raw = input ? input.value.trim() : BACKEND_URL;
  if (!raw) { if (statusEl) statusEl.innerHTML = '<span class="pill info">Enter a backend URL first</span>'; return; }
  if (statusEl) statusEl.innerHTML = '<span class="pill info">Testing…</span>';

  const normalized = sccNormalizeBackendUrl(raw);
  if (!normalized) { if (statusEl) statusEl.innerHTML = '<span class="pill fail">Not a valid URL</span>'; return; }

  if (!(await sccHasBackendPermission(normalized))) {
    const granted = await sccRequestBackendPermission(normalized).catch(() => false);
    if (!granted) { if (statusEl) statusEl.innerHTML = '<span class="pill fail">Permission declined</span>'; return; }
    PERMS.backend = true;
  }

  const result = await sccCheckBackendStatus(normalized);
  BACKEND_STATUS = result;
  if (!result.ok) {
    statusEl.innerHTML = `<span class="pill fail">Not reachable — ${esc(result.message || result.error)}</span>`;
  } else if (!result.pagespeed?.configured) {
    statusEl.innerHTML = '<span class="pill warn">Reachable, but PAGESPEED_API_KEY is not set on the server</span>';
  } else {
    statusEl.innerHTML = '<span class="pill ok">Connected — PageSpeed will run through your backend</span>';
  }
}

async function saveKey(which) {
  const input = $(which === 'pagespeed' ? '#psiKey' : '#cruxKey');
  if (!input) return;
  SETTINGS_KEYS[which] = input.value.trim();
  try {
    await chrome.storage.local.set({ sccApiKeys: SETTINGS_KEYS });
    toast(SETTINGS_KEYS[which] ? 'API key saved locally' : 'API key cleared');
  } catch (e) { toast('Could not save the key'); }
  render();
}

async function clearKey(which) {
  SETTINGS_KEYS[which] = '';
  try { await chrome.storage.local.set({ sccApiKeys: SETTINGS_KEYS }); } catch (e) {}
  toast('API key removed');
  render();
}

/* ------------------------------ actions ------------------------------ */

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

async function rescan() {
  if (TAB_ID === null) return toast('No source tab recorded — run the audit from the popup');
  const btn = $('#refreshBtn');
  btn.disabled = true; btn.textContent = 'Scanning…';
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: TAB_ID }, func: SCC_ANALYZE });
    if (!res?.[0]?.result) throw new Error('no result');
    DATA = res[0].result;
    AUDIT = SCC_AUDIT(DATA);
    await chrome.storage.local.set({ sccLatest: { data: DATA, audit: AUDIT, tabId: TAB_ID, savedAt: Date.now() } });
    $('#scanStamp').textContent = 'Scanned ' + new Date(DATA.scannedAt).toLocaleString();
    render();
    toast('Re-scanned the page');
  } catch {
    // activeTab access expires when the tab navigates or closes; say so plainly.
    toast('Chrome\'s access to that tab has expired. Open the page and click the extension icon to refresh.');
  } finally {
    btn.disabled = false; btn.textContent = 'Re-scan';
  }
}

async function toggleOverlay() {
  if (TAB_ID === null) return toast('No source tab recorded');
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId: TAB_ID }, func: SCC_TOGGLE_HEADING_OVERLAY });
    const out = res?.[0]?.result;
    if (!out) return toast('Overlay could not run on that page');
    overlayOn = out.enabled;
    const btn = $('#overlayBtn');
    btn.setAttribute('aria-pressed', String(overlayOn));
    btn.textContent = overlayOn ? 'Hide H1–H6 overlay' : 'H1–H6 overlay';
    toast(out.enabled ? `Tagged ${out.count} headings — switch to that tab to see them` : 'Heading overlay removed');
  } catch {
    toast('Chrome\'s access to that tab has expired');
  }
}

/* ------------------------------ events ------------------------------ */

function bind() {
  document.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
    const body = document.getElementById(el.dataset.toggle);
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    el.setAttribute('aria-expanded', String(!open));
  }));

  document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => { issueFilter = el.dataset.filter; render(); }));
  document.querySelectorAll('[data-hfilter]').forEach(el => el.addEventListener('click', () => { headingFilter = el.dataset.hfilter; render(); }));
  document.querySelectorAll('[data-jump]').forEach(el => el.addEventListener('click', () => { issueFilter = el.dataset.jump; view = 'issues'; render(); }));
  document.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => { issueFilter = el.dataset.cat; view = 'issues'; render(); }));
  document.querySelectorAll('[data-copy]').forEach(el => el.addEventListener('click', () => copyText(el.dataset.copy, 'URL copied')));
  document.querySelectorAll('[data-strategy]').forEach(el => el.addEventListener('click', () => { PERF_STRATEGY = el.dataset.strategy; render(); }));
  document.querySelectorAll('[data-psi-run]').forEach(el => el.addEventListener('click', () => runPageSpeed(el.dataset.psiRun)));
  document.querySelectorAll('[data-savekey]').forEach(el => el.addEventListener('click', () => saveKey(el.dataset.savekey)));
  document.querySelectorAll('[data-clearkey]').forEach(el => el.addEventListener('click', () => clearKey(el.dataset.clearkey)));
  document.querySelectorAll('[data-testkey]').forEach(el => el.addEventListener('click', () => testKey(el.dataset.testkey)));
  const saveBackendBtn = document.querySelector('[data-save-backend]');
  if (saveBackendBtn) saveBackendBtn.addEventListener('click', saveBackendUrl);
  const testBackendBtn = document.querySelector('[data-test-backend]');
  if (testBackendBtn) testBackendBtn.addEventListener('click', testBackendUrl);
  const clearBackendBtn = document.querySelector('[data-clear-backend]');
  if (clearBackendBtn) clearBackendBtn.addEventListener('click', clearBackendUrl);
  const clearCacheBtn = document.querySelector('[data-clear-psi-cache]');
  if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => {
    await SCC_PSI_CACHE.clear(chrome.storage.local);
    toast('PageSpeed cache cleared');
  });
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.nav === 'pricing') { chrome.tabs.create({ url: chrome.runtime.getURL('pricing.html') }); return; }
    view = el.dataset.nav; render();
  }));
  document.querySelectorAll('[data-billing]').forEach(el => el.addEventListener('click', async () => {
    const r = await SCC_ENTITLEMENTS.billing.openCustomerPortal();
    toast(r.message);
  }));

  document.querySelectorAll('[data-locate]').forEach(el => el.addEventListener('click', async () => {
    if (TAB_ID === null) return toast('No source tab recorded');
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: TAB_ID }, func: SCC_LOCATE_HEADING, args: [Number(el.dataset.locate)]
      });
      if (r?.[0]?.result?.located) {
        await chrome.tabs.update(TAB_ID, { active: true });
      } else {
        toast('That heading is no longer on the page');
      }
    } catch {
      toast('Chrome\'s access to that tab has expired');
    }
  }));

  const search = $('#sourceSearch');
  if (search) {
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sourceQuery = search.value.trim();
        render();
        const s = $('#sourceSearch');
        if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      }, 250);
    });
  }
  const copySrc = $('#copySource');
  if (copySrc) copySrc.addEventListener('click', () => copyText(DATA.source.html, 'HTML source copied'));
  const dlSrc = $('#downloadSource');
  if (dlSrc) dlSrc.addEventListener('click', () => {
    download(`source-${hostSlug()}-${new Date().toISOString().slice(0, 10)}.html`, DATA.source.html, 'text/html');
    toast('HTML source downloaded');
  });
}

document.querySelectorAll('.navitem').forEach(n => n.addEventListener('click', () => {
  view = n.dataset.view; location.hash = view; render();
}));

document.querySelectorAll('[data-csv]').forEach(btn => btn.addEventListener('click', () => {
  const kind = btn.dataset.csv;
  const rows = kind === 'issues' ? SCC_EXPORTS.issues(DATA, AUDIT) : SCC_EXPORTS[kind](DATA);
  if (rows.length <= 1) return toast(`No ${kind} to export from this page`);
  download(`seo-${kind}-${hostSlug()}-${new Date().toISOString().slice(0, 10)}.csv`, sccToCsv(rows));
  toast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} CSV downloaded (${rows.length - 1} rows)`);
}));

$('#copyBtn').addEventListener('click', () => copyText(SCC_TEXT_REPORT(DATA, AUDIT, SCC_CATEGORIES, PSI), 'Report copied to clipboard'));
$('#refreshBtn').addEventListener('click', rescan);
$('#overlayBtn').addEventListener('click', toggleOverlay);
$('#openPageBtn').addEventListener('click', () => chrome.tabs.create({ url: DATA.page.url }));
const printPdfBtn = $('#printPdfBtn');
if (printPdfBtn) printPdfBtn.addEventListener('click', async () => {
  try {
    SCC_ENTITLEMENTS.init(chrome.storage.local);
    const gate = await SCC_ENTITLEMENTS.canUse('pdfReport');
    if (!gate.allowed) return toast(gate.reason === 'PLAN_REQUIRED' ? 'PDF reports require Pro.' : `PDF report limit reached: ${gate.used} of ${gate.limit} this month.`);
    await SCC_ENTITLEMENTS.record('pdfReport');
    window.print();
  } catch { window.print(); }
});
const jsonExportBtn = $('#jsonExportBtn');
if (jsonExportBtn) jsonExportBtn.addEventListener('click', async () => {
  try {
    SCC_ENTITLEMENTS.init(chrome.storage.local);
    if (!(await SCC_ENTITLEMENTS.canUse('jsonExport')).allowed) return toast('JSON export is available on Pro and Agency.');
    download(`auditflux-${hostSlug()}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ data: DATA, audit: AUDIT }, null, 2), 'application/json');
    toast('JSON report downloaded');
  } catch { toast('JSON export failed'); }
});
const planBadgeEl = $('#planBadge');
if (planBadgeEl) planBadgeEl.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('pricing.html') }));

boot();
