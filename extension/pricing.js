/**
 * AuditFlux SEO — pricing page.
 *
 * Every number rendered here comes from config/plans.js. Nothing is written
 * twice, so changing a price or a limit in that file updates the cards, the
 * comparison table and the usage meters together.
 *
 * The CTAs do not pretend to sell anything: billing is not connected, and the
 * modal says so plainly.
 */

let interval = 'monthly';
let currentPlanId = 'free';

const $ = (s) => document.querySelector(s);
const esc = (v) => v === null || v === undefined ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

const E = SCC_ENTITLEMENTS.init(chrome.storage.local);

/* ------------------------------ plan cards ------------------------------ */

// Headline features per plan, drawn from the entitlement flags so a card can
// never advertise something the app does not actually grant.
const HIGHLIGHTS = {
  free: [
    ['basicAudit', 'Full SEO check set — technical, on-page, content, links, images, schema'],
    ['headingOverlay', 'Live H1–H6 overlay and heading locator'],
    ['pageSpeed', 'PageSpeed Insights (Lighthouse) checks'],
    ['coreWebVitalsLab', 'Core Web Vitals lab data, mobile and desktop'],
    ['cruxAccess', 'CrUX field data with your own API key'],
    ['csvExport', 'CSV export of every table'],
    ['jsonExport', 'JSON export'],
    ['scanHistory', 'Scan history and comparison']
  ],
  pro: [
    ['advancedTechnical', 'Advanced technical diagnostics'],
    ['advancedContent', 'Advanced content and readability analysis'],
    ['aiSearchDeepAnalysis', 'AI search deep analysis'],
    ['cruxHistory', 'CrUX history trends'],
    ['pageSpeedFullAudits', 'Complete Lighthouse audit list'],
    ['scanHistory', 'Scan history and comparison'],
    ['jsonExport', 'JSON export'],
    ['whiteLabel', 'White-label reports']
  ],
  agency: [
    ['whiteLabel', 'White-label reports and agency branding'],
    ['clientWorkspaces', 'Client workspaces'],
    ['apiAccess', 'API access'],
    ['scheduledAudits', 'Scheduled audits'],
    ['prioritySupport', 'Priority processing'],
    ['cruxHistory', 'Everything in Pro']
  ]
};

const KEY_LIMITS = [
  ['dailyPageAudits', 'Page audits / day'],
  ['pageSpeedChecksPerDay', 'PageSpeed checks / day'],
  ['maxProjects', 'Projects'],
  ['pdfReportsPerMonth', 'PDF reports / month']
];

function priceFor(plan) {
  if (plan.price.monthly === null) return { big: plan.price.display, small: plan.price.period, note: '' };
  if (plan.price.monthly === 0) return { big: '$0', small: 'forever', note: 'No card required' };
  if (interval === 'yearly') {
    const saving = sccYearlySaving(plan.id);
    return {
      big: '$' + Math.round(plan.price.yearly / 12),
      small: 'per month, billed yearly',
      note: saving ? `Save $${saving.amount} a year (${saving.percent}%)` : ''
    };
  }
  return { big: '$' + plan.price.monthly, small: 'per month', note: '' };
}

function renderPlans() {
  $('#planCards').innerHTML = Object.values(SCC_PLANS).map(plan => {
    const p = priceFor(plan);
    const isCurrent = plan.id === currentPlanId;
    const features = HIGHLIGHTS[plan.id].map(([flag, label]) => {
      const on = !!plan.entitlements[flag];
      return `<li class="${on ? '' : 'off'}">
        <span class="${on ? 'tick' : 'dash'}" aria-hidden="true">${on ? '✓' : '—'}</span>
        <span>${esc(label)}</span></li>`;
    }).join('');

    const limits = KEY_LIMITS.map(([key, label]) =>
      `<div><span>${esc(label)}</span><b>${esc(sccFormatLimit(plan.limits[key]))}</b></div>`).join('');

    return `<article class="plan ${plan.popular ? 'popular' : ''} ${isCurrent ? 'current' : ''}">
      ${plan.popular && !isCurrent ? '<span class="flag">Most popular</span>' : ''}
      ${isCurrent ? '<span class="flag now">Your plan</span>' : ''}
      <h2>${esc(plan.name)}</h2>
      <p class="tagline">${esc(plan.tagline)}</p>
      <div class="price"><b>${esc(p.big)}</b><span>${esc(p.small)}</span></div>
      <div class="price-note">${esc(p.note)}</div>
      <p class="blurb">${esc(plan.description)}</p>
      <button class="btn ${plan.popular ? 'btn-primary' : ''} plan-cta" data-plan="${esc(plan.id)}"
        ${isCurrent ? 'disabled' : ''}>${esc(isCurrent ? 'Current plan' : plan.cta)}</button>
      <ul>${features}</ul>
      <div class="limits">${limits}</div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-plan]').forEach(b =>
    b.addEventListener('click', () => onUpgrade(b.dataset.plan)));
}

/* ---------------------------- comparison ---------------------------- */

function cellFor(plan, key) {
  const [kind, name] = key.split(':');
  if (kind === 'limit') return esc(sccFormatLimit(plan.limits[name]));
  return plan.entitlements[name]
    ? '<span class="yes" aria-label="Included">✓</span>'
    : '<span class="no" aria-label="Not included">—</span>';
}

function renderComparison() {
  const rows = [];
  SCC_COMPARISON.forEach(group => {
    rows.push(`<tr class="group"><td colspan="4">${esc(group.group)}</td></tr>`);
    group.rows.forEach(r => {
      rows.push(`<tr>
        <td><strong>${esc(r.label)}</strong>${r.note ? `<br><span class="muted tiny">${esc(r.note)}</span>` : ''}</td>
        <td>${cellFor(SCC_PLANS.free, r.key)}</td>
        <td>${cellFor(SCC_PLANS.pro, r.key)}</td>
        <td>${cellFor(SCC_PLANS.agency, r.key)}</td>
      </tr>`);
    });
  });
  $('#comparisonTable').querySelector('tbody').innerHTML = rows.join('');
}

/* ------------------------------- usage ------------------------------- */

async function renderUsage() {
  const { plan, counters } = await E.getUsage();
  currentPlanId = plan.id;
  $('#usagePlanLabel').textContent = `${plan.name} plan`;

  $('#usageBody').innerHTML = counters.map(c => {
    const cls = c.atLimit ? 'full' : c.nearLimit ? 'near' : '';
    const width = c.unlimited ? 0 : c.percent;
    return `<div class="usage-row">
      <div class="u-label">${esc(c.label)}</div>
      <div class="usage-bar"><i class="${cls}" style="width:${width}%"></i></div>
      <div class="u-count">${c.unlimited ? 'Unlimited' : `${c.used} / ${c.limit}`}</div>
    </div>`;
  }).join('') + (counters.some(c => c.nearLimit || c.atLimit)
    ? `<div class="usage-row" style="grid-template-columns:1fr">
         <div class="u-label" style="color:var(--amber)">You're nearing your ${esc(plan.name)} plan limit. Counters reset automatically — daily counters at midnight, monthly on the 1st.</div>
       </div>` : '');
}

/* ------------------------------- FAQ ------------------------------- */

function renderFaq() {
  $('#faq').innerHTML = SCC_PRICING_FAQ.map(f =>
    `<div class="faq-item"><b>${esc(f.q)}</b><p>${esc(f.a)}</p></div>`).join('');
}

/* ------------------------------ upgrade ------------------------------ */

async function onUpgrade(planId) {
  const plan = SCC_PLANS[planId];
  const result = await E.billing.startCheckout(planId, interval);

  $('#modalTitle').textContent = planId === 'agency' ? 'Talk to us about Agency' : 'Payments are coming soon';
  $('#modalBody').textContent = planId === 'agency'
    ? `${result.message} Agency access is configured manually for now — get in touch and we will set up your workspace.`
    : `${result.message} You can still preview what the ${plan.name} plan unlocks: feature locks and usage limits will switch to ${plan.name} across the extension. This is a local preview only and is not a subscription.`;

  const preview = $('#modalPreview');
  preview.classList.toggle('hidden', planId === 'agency');
  preview.textContent = `Preview ${plan.name}`;
  preview.onclick = async () => {
    await E.setPlan(planId);
    currentPlanId = planId;
    await refresh();
    closeModal();
    toast(`Previewing the ${plan.name} plan — local only, not a subscription`);
  };
  $('#modal').classList.remove('hidden');
}

function closeModal() { $('#modal').classList.add('hidden'); }

/* ------------------------------- boot ------------------------------- */

async function refresh() {
  await renderUsage();
  renderPlans();
  renderComparison();
}

document.querySelectorAll('.toggle-opt').forEach(b => b.addEventListener('click', () => {
  interval = b.dataset.interval;
  document.querySelectorAll('.toggle-opt').forEach(x => {
    const on = x === b;
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', String(on));
  });
  renderPlans();
}));

$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#backBtn').addEventListener('click', () => { location.href = 'dashboard.html'; });
$('#usageBtn').addEventListener('click', () => $('#currentUsage').scrollIntoView({ behavior: 'smooth' }));

(async () => {
  const saving = sccYearlySaving('pro');
  if (saving) $('#saveBadge').textContent = `Save ${saving.percent}%`;

  $('#modeBadge').textContent = SCC_MODE.isDevelopment() ? SCC_MODE.label : '';
  $('#footnote').textContent = SCC_MODE.isDevelopment()
    ? 'Billing is not connected. Plan selection on this page is a local preview stored in your browser — it is not a subscription and is not secure. Real plans will be verified server-side before any feature is unlocked.'
    : '';

  await refresh();
  renderFaq();
})();
