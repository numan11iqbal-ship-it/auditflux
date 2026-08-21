/**
 * AuditFlux SEO — plans, pricing and entitlements configuration.
 *
 * THIS IS THE ONLY PLACE PRICING AND LIMITS ARE DEFINED.
 * Nothing else in the codebase should hard-code a price, a limit or a plan
 * comparison. Change a number here and every surface follows: pricing page,
 * comparison table, usage meters, feature locks and upgrade prompts.
 *
 * When Stripe is connected, add the price IDs to `stripe` below and read them
 * server-side. Never trust a plan value that came from the client.
 */

/** Sentinel for "no limit". Kept explicit so `Infinity` never leaks into the UI. */
const SCC_UNLIMITED = -1;

const SCC_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Understand the basics',
    description: 'Audit your own site, learn what is wrong, and fix it. No account, no card.',
    price: { monthly: 0, yearly: 0, currency: 'USD', display: '$0', period: 'forever' },
    popular: false,
    cta: 'Current plan',
    stripe: { monthlyPriceId: null, yearlyPriceId: null },
    limits: {
      dailyPageAudits: 10,
      monthlyPageAudits: SCC_UNLIMITED,
      pageSpeedChecksPerDay: 5,
      maxProjects: 1,
      maxPagesPerCrawl: 100,
      monthlyCrawlUrls: 1000,
      pdfReportsPerMonth: 3,
      csvExportsPerMonth: SCC_UNLIMITED,
      teamMembers: 1
    },
    entitlements: {
      basicAudit: true,
      headingOverlay: true,
      sourceViewer: true,
      csvExport: true,
      jsonExport: false,
      pdfReports: true,
      pageSpeed: true,
      pageSpeedFullAudits: false,
      coreWebVitalsLab: true,
      cruxAccess: true,
      cruxHistory: false,
      advancedTechnical: false,
      advancedContent: false,
      advancedLinks: false,
      advancedSchema: false,
      advancedGeoAeo: false,
      aiSearchDeepAnalysis: false,
      scanHistory: false,
      scanComparison: false,
      scheduledAudits: false,
      whiteLabel: false,
      clientWorkspaces: false,
      apiAccess: false,
      prioritySupport: false
    }
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Understand everything',
    description: 'Full depth on every check, unlimited audits and reports, and history so you can prove progress.',
    price: { monthly: 19, yearly: 190, currency: 'USD', display: '$19', period: 'per month' },
    popular: true,
    cta: 'Upgrade to Pro',
    stripe: { monthlyPriceId: null, yearlyPriceId: null },
    limits: {
      dailyPageAudits: SCC_UNLIMITED,
      monthlyPageAudits: SCC_UNLIMITED,
      pageSpeedChecksPerDay: 100,
      maxProjects: 10,
      maxPagesPerCrawl: 5000,
      monthlyCrawlUrls: 5000,
      pdfReportsPerMonth: SCC_UNLIMITED,
      csvExportsPerMonth: SCC_UNLIMITED,
      teamMembers: 1
    },
    entitlements: {
      basicAudit: true, headingOverlay: true, sourceViewer: true,
      csvExport: true, jsonExport: true, pdfReports: true,
      pageSpeed: true, pageSpeedFullAudits: true,
      coreWebVitalsLab: true, cruxAccess: true, cruxHistory: true,
      advancedTechnical: true, advancedContent: true, advancedLinks: true,
      advancedSchema: true, advancedGeoAeo: true, aiSearchDeepAnalysis: true,
      scanHistory: true, scanComparison: true, scheduledAudits: true,
      whiteLabel: false, clientWorkspaces: false, apiAccess: false,
      prioritySupport: true
    }
  },

  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'Manage SEO professionally',
    description: 'Everything in Pro, plus client workspaces, white-label reporting and team access.',
    // No public price yet — the pricing page renders "Custom" and a sales CTA.
    price: { monthly: null, yearly: null, currency: 'USD', display: 'Custom', period: 'talk to us' },
    popular: false,
    cta: 'Contact sales',
    stripe: { monthlyPriceId: null, yearlyPriceId: null },
    limits: {
      dailyPageAudits: SCC_UNLIMITED,
      monthlyPageAudits: SCC_UNLIMITED,
      pageSpeedChecksPerDay: SCC_UNLIMITED,
      maxProjects: SCC_UNLIMITED,
      maxPagesPerCrawl: SCC_UNLIMITED,
      monthlyCrawlUrls: SCC_UNLIMITED,
      pdfReportsPerMonth: SCC_UNLIMITED,
      csvExportsPerMonth: SCC_UNLIMITED,
      teamMembers: 10
    },
    entitlements: {
      basicAudit: true, headingOverlay: true, sourceViewer: true,
      csvExport: true, jsonExport: true, pdfReports: true,
      pageSpeed: true, pageSpeedFullAudits: true,
      coreWebVitalsLab: true, cruxAccess: true, cruxHistory: true,
      advancedTechnical: true, advancedContent: true, advancedLinks: true,
      advancedSchema: true, advancedGeoAeo: true, aiSearchDeepAnalysis: true,
      scanHistory: true, scanComparison: true, scheduledAudits: true,
      whiteLabel: true, clientWorkspaces: true, apiAccess: true,
      prioritySupport: true
    }
  }
};

/** Yearly billing discount, derived rather than stored twice. */
function sccYearlySaving(planId) {
  const p = SCC_PLANS[planId];
  if (!p || !p.price.monthly || !p.price.yearly) return null;
  const full = p.price.monthly * 12;
  return { amount: full - p.price.yearly, percent: Math.round(((full - p.price.yearly) / full) * 100) };
}

/**
 * Feature comparison for the pricing table. Values are either a boolean, the
 * string 'PRO'/'AGENCY' for gated items, or explicit text.
 * Derived from the plan definitions above wherever possible so the table can
 * never contradict the entitlements the app actually enforces.
 */
const SCC_COMPARISON = [
  { group: 'Audits', rows: [
    { label: 'Page audits per day', key: 'limit:dailyPageAudits' },
    { label: 'PageSpeed checks per day', key: 'limit:pageSpeedChecksPerDay' },
    { label: 'Projects', key: 'limit:maxProjects' },
    { label: 'URLs per crawl', key: 'limit:maxPagesPerCrawl' }
  ]},
  { group: 'SEO analysis', rows: [
    { label: 'Technical SEO', key: 'ent:basicAudit' },
    { label: 'On-page & headings', key: 'ent:basicAudit' },
    { label: 'Heading overlay', key: 'ent:headingOverlay' },
    { label: 'Links & anchor text', key: 'ent:basicAudit' },
    { label: 'Images', key: 'ent:basicAudit' },
    { label: 'Schema detection', key: 'ent:basicAudit' },
    { label: 'Advanced technical diagnostics', key: 'ent:advancedTechnical' },
    { label: 'Advanced content analysis', key: 'ent:advancedContent' },
    { label: 'Advanced link analysis', key: 'ent:advancedLinks' },
    { label: 'Advanced schema analysis', key: 'ent:advancedSchema' }
  ]},
  { group: 'AI & GEO', rows: [
    { label: 'AI crawler access checks', key: 'ent:basicAudit' },
    { label: 'llms.txt detection', key: 'ent:basicAudit' },
    { label: 'Basic GEO/AEO signals', key: 'ent:basicAudit' },
    { label: 'Advanced GEO/AEO', key: 'ent:advancedGeoAeo' },
    { label: 'AI search deep analysis', key: 'ent:aiSearchDeepAnalysis' }
  ]},
  { group: 'Performance', rows: [
    { label: 'PageSpeed Insights (Lighthouse)', key: 'ent:pageSpeed' },
    { label: 'Core Web Vitals (lab)', key: 'ent:coreWebVitalsLab' },
    { label: 'Full Lighthouse audit list', key: 'ent:pageSpeedFullAudits' },
    { label: 'CrUX field data', key: 'ent:cruxAccess', note: 'Requires your own API key' },
    { label: 'CrUX history trends', key: 'ent:cruxHistory' }
  ]},
  { group: 'Reports & exports', rows: [
    { label: 'PDF reports per month', key: 'limit:pdfReportsPerMonth' },
    { label: 'CSV export', key: 'ent:csvExport' },
    { label: 'JSON export', key: 'ent:jsonExport' },
    { label: 'Scan history', key: 'ent:scanHistory' },
    { label: 'Scan comparison', key: 'ent:scanComparison' },
    { label: 'White-label reports', key: 'ent:whiteLabel' }
  ]},
  { group: 'Team & platform', rows: [
    { label: 'Team members', key: 'limit:teamMembers' },
    { label: 'Client workspaces', key: 'ent:clientWorkspaces' },
    { label: 'API access', key: 'ent:apiAccess' },
    { label: 'Priority processing', key: 'ent:prioritySupport' }
  ]}
];

const SCC_PRICING_FAQ = [
  { q: 'Is the Free plan really usable?',
    a: 'Yes. Free includes the full SEO check set — technical, on-page, headings, links, images, schema, GEO/AEO and accessibility signals — plus the heading overlay and PageSpeed checks. The limits are on volume, not on which problems you are allowed to see.' },
  { q: 'What counts as a page audit?',
    a: 'One audit is one scan of one page. Re-opening the full report for a scan you already ran does not count again.' },
  { q: 'Do I need a Google API key?',
    a: 'Not for PageSpeed. Google allows PageSpeed Insights requests without a key for occasional use, which is what this extension does. A key is only needed for CrUX field data, and you can add your own in Settings.' },
  { q: 'Can I pay right now?',
    a: 'No. Billing is not connected yet, so no plan can actually be purchased. The pricing and limits you see are the architecture that billing will plug into.' },
  { q: 'Where does my data go?',
    a: 'Page analysis happens entirely in your browser. The only outbound requests are to Google\'s PageSpeed and CrUX APIs, and only when you ask for performance data.' }
];

/** Formats a limit for display. -1 renders as "Unlimited", never as "-1". */

/** Turns a limit key into something a person can read, for the usage screen. */
const SCC_LIMIT_LABELS = {
  dailyPageAudits: 'Page audits per day',
  monthlyPageAudits: 'Page audits per month',
  pageSpeedChecksPerDay: 'PageSpeed checks per day',
  maxProjects: 'Projects',
  maxPagesPerCrawl: 'URLs per crawl',
  monthlyCrawlUrls: 'Crawled URLs per month',
  pdfReportsPerMonth: 'PDF reports per month',
  csvExportsPerMonth: 'CSV exports per month',
  scanHistoryDays: 'Scan history',
  teamMembers: 'Team members'
};

function sccHumanLimitName(key) {
  return SCC_LIMIT_LABELS[key] ||
    key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

function sccFormatLimit(value) {
  if (value === SCC_UNLIMITED) return 'Unlimited';
  if (value === 0) return 'Not included';
  if (typeof value === 'number' && value >= 1000) return value.toLocaleString();
  return String(value);
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCC_PLANS, SCC_UNLIMITED, SCC_COMPARISON, SCC_PRICING_FAQ,
    sccFormatLimit, sccYearlySaving, sccHumanLimitName, SCC_LIMIT_LABELS
  };
}
