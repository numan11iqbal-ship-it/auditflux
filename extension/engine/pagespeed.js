/**
 * AuditFlux SEO — Google performance APIs.
 *
 * Two separate sources that must never be blended:
 *
 *   LAB   — PageSpeed Insights v5 runs Lighthouse on Google's hardware, once,
 *           under simulated conditions. Reproducible, but synthetic.
 *   FIELD — CrUX reports what real Chrome users actually experienced over the
 *           trailing 28 days. Authoritative, but only exists for URLs with
 *           enough traffic.
 *
 * Presenting one as the other is the most common way performance tooling
 * misleads people, so lab and field values never share a code path here, and
 * `dataType` travels with every value.
 *
 * Keys: PageSpeed works without an API key for occasional use, which is what
 * this extension does — a key only raises the request ceiling. CrUX always
 * requires a Google Cloud API key.
 */

const SCC_PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const SCC_CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const SCC_CRUX_HISTORY_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord';

/** Host permissions requested at runtime, only when performance data is asked for. */
const SCC_PERF_ORIGINS = {
  pagespeed: 'https://www.googleapis.com/',
  crux: 'https://chromeuxreport.googleapis.com/'
};

/**
 * Core Web Vitals thresholds, published by Google.
 * Held in one place so the UI never invents its own boundaries.
 */
const SCC_CWV_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000, unit: 'ms', name: 'Largest Contentful Paint',
    what: 'How long until the biggest piece of content on screen has loaded.',
    why: 'It is the closest single measure of "the page looks ready" for a visitor.',
    fix: 'Optimise the largest image or headline block: serve it at the right size, preload it, and avoid loading it through JavaScript.' },
  INP: { good: 200, poor: 500, unit: 'ms', name: 'Interaction to Next Paint',
    what: 'How quickly the page responds after someone taps or clicks.',
    why: 'A page that looks loaded but ignores taps feels broken.',
    fix: 'Break up long JavaScript tasks, defer non-critical work, and keep event handlers light.' },
  CLS: { good: 0.1, poor: 0.25, unit: '', name: 'Cumulative Layout Shift',
    what: 'How much the page jumps around while it loads.',
    why: 'Shifting content causes mis-taps, which is especially costly on checkout and forms.',
    fix: 'Set width and height on images and embeds, and reserve space for banners injected after load.' },
  FCP: { good: 1800, poor: 3000, unit: 'ms', name: 'First Contentful Paint',
    what: 'How long until anything at all appears.',
    why: 'It is the first signal to a visitor that the site is working.',
    fix: 'Reduce render-blocking CSS and JavaScript in the page head.' },
  TTFB: { good: 800, poor: 1800, unit: 'ms', name: 'Time to First Byte',
    what: 'How long the server takes to start responding.',
    why: 'Every other timing waits on this one.',
    fix: 'Look at server processing, database queries and caching. A CDN usually helps most.' },
  SI: { good: 3400, poor: 5800, unit: 'ms', name: 'Speed Index',
    what: 'How quickly the page visibly fills in.',
    why: 'Captures perceived speed better than a single milestone.',
    fix: 'Prioritise above-the-fold content and defer everything else.' },
  TBT: { good: 200, poor: 600, unit: 'ms', name: 'Total Blocking Time',
    what: 'How long the main thread was blocked and unable to respond.',
    why: 'It is the lab stand-in for real-world interaction delay.',
    fix: 'Split large bundles and remove unused JavaScript.' }
};

/** Classifies a value against the published thresholds. Never guesses. */
function sccRateMetric(id, value) {
  const t = SCC_CWV_THRESHOLDS[id];
  if (!t || value === null || value === undefined) {
    return { rating: 'unavailable', label: 'No data', cls: 'info', threshold: t || null };
  }
  if (value <= t.good) return { rating: 'good', label: 'Good', cls: 'ok', threshold: t };
  if (value <= t.poor) return { rating: 'needs-improvement', label: 'Needs improvement', cls: 'warn', threshold: t };
  return { rating: 'poor', label: 'Poor', cls: 'fail', threshold: t };
}

function sccFormatMetric(id, value) {
  if (value === null || value === undefined) return null;
  const t = SCC_CWV_THRESHOLDS[id];
  if (!t) return String(value);
  if (t.unit === 'ms') return value >= 1000 ? (value / 1000).toFixed(2) + ' s' : Math.round(value) + ' ms';
  return String(Number(value).toFixed(3));
}

/* ----------------------------- permissions ----------------------------- */

async function sccHasPerfPermission(which) {
  try {
    return await chrome.permissions.contains({ origins: [SCC_PERF_ORIGINS[which]] });
  } catch { return false; }
}

/** Must be called from a user gesture — Chrome rejects silent permission requests. */
async function sccRequestPerfPermission(which) {
  try {
    return await chrome.permissions.request({ origins: [SCC_PERF_ORIGINS[which]] });
  } catch { return false; }
}

/* ------------------------------- PageSpeed ------------------------------- */

/**
 * Runs PageSpeed Insights for one URL and one strategy.
 * Returns a normalised result, or a structured failure — never a fabricated
 * score, and never a partial result dressed up as a complete one.
 */
async function sccRunPageSpeed(url, strategy, apiKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('strategy', strategy);
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach(c => params.append('category', c));
  if (apiKey) params.set('key', apiKey);

  let res, body;
  try {
    res = await doFetch(`${SCC_PSI_ENDPOINT}?${params.toString()}`);
  } catch (e) {
    return { ok: false, strategy, error: 'NETWORK', message: 'Could not reach the PageSpeed Insights API.', detail: String(e.message || e) };
  }

  try { body = await res.json(); } catch (e) {
    return { ok: false, strategy, error: 'BAD_RESPONSE', message: 'PageSpeed returned a response that could not be read.', detail: String(e.message || e) };
  }

  if (!res.ok) {
    const apiMessage = body?.error?.message || `HTTP ${res.status}`;
    // 429 is the documented rate-limit signal; 403 usually means a key problem.
    const kind = res.status === 429 ? 'RATE_LIMIT'
      : res.status === 403 ? 'FORBIDDEN'
      : res.status === 400 ? 'CANNOT_ANALYZE' : 'API_ERROR';
    const message = {
      RATE_LIMIT: 'PageSpeed API rate limit reached. Add your own API key in Settings, or try again shortly.',
      FORBIDDEN: 'PageSpeed rejected the request. If you configured an API key, check it is valid and PageSpeed Insights API is enabled.',
      CANNOT_ANALYZE: 'PageSpeed could not analyze this URL. It must be publicly reachable — local, staging and password-protected pages cannot be tested.',
      API_ERROR: 'PageSpeed analysis could not be completed.'
    }[kind];
    return { ok: false, strategy, error: kind, message, detail: apiMessage, status: res.status };
  }

  return sccParsePageSpeed(body, strategy);
}

/** Parses a PSI v5 payload. Anything absent stays null rather than defaulting to 0. */
function sccParsePageSpeed(body, strategy) {
  const lh = body?.lighthouseResult;
  if (!lh) {
    return { ok: false, strategy, error: 'BAD_RESPONSE', message: 'PageSpeed returned no Lighthouse result.', detail: null };
  }

  const cat = lh.categories || {};
  const score = (c) => c && typeof c.score === 'number' ? Math.round(c.score * 100) : null;

  const audits = lh.audits || {};
  const numeric = (id) => {
    const a = audits[id];
    return a && typeof a.numericValue === 'number' ? a.numericValue : null;
  };

  // Lighthouse lab metrics. TBT is the lab proxy for responsiveness; INP is a
  // field metric and is deliberately NOT read from the lab run.
  const lab = {
    LCP: numeric('largest-contentful-paint'),
    FCP: numeric('first-contentful-paint'),
    CLS: audits['cumulative-layout-shift']?.numericValue ?? null,
    TTFB: numeric('server-response-time'),
    SI: numeric('speed-index'),
    TBT: numeric('total-blocking-time')
  };

  // Opportunities and diagnostics that Lighthouse actually flagged.
  const opportunities = Object.values(audits)
    .filter(a => a && a.details?.type === 'opportunity' && typeof a.score === 'number' && a.score < 0.9)
    .map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      score: a.score,
      severity: a.score < 0.5 ? 'critical' : a.score < 0.9 ? 'warning' : 'notice',
      savingsMs: a.details?.overallSavingsMs ?? null,
      savingsBytes: a.details?.overallSavingsBytes ?? null,
      displayValue: a.displayValue || null,
      items: (a.details?.items || []).slice(0, 12).map(it => ({
        url: it.url || it.source?.url || null,
        wastedBytes: it.wastedBytes ?? null,
        wastedMs: it.wastedMs ?? null,
        totalBytes: it.totalBytes ?? null
      }))
    }))
    .sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0));

  const diagnostics = Object.values(audits)
    .filter(a => a && typeof a.score === 'number' && a.score < 1 &&
      a.details?.type !== 'opportunity' && a.scoreDisplayMode === 'binary')
    .map(a => ({ id: a.id, title: a.title, description: a.description, displayValue: a.displayValue || null }))
    .slice(0, 20);

  // PSI also returns CrUX field data alongside the lab run when it exists.
  const field = sccParseLoadingExperience(body.loadingExperience);
  const originField = sccParseLoadingExperience(body.originLoadingExperience);

  return {
    ok: true,
    strategy,
    dataType: 'lab',
    fetchedAt: new Date().toISOString(),
    finalUrl: lh.finalUrl || lh.requestedUrl || null,
    lighthouseVersion: lh.lighthouseVersion || null,
    scores: {
      performance: score(cat.performance),
      accessibility: score(cat.accessibility),
      bestPractices: score(cat['best-practices']),
      seo: score(cat.seo)
    },
    lab,
    opportunities,
    diagnostics,
    auditSummary: sccSummarizeAudits(lh),
    // Field data that arrived with the lab response, kept clearly separate.
    fieldFromPsi: field,
    originFieldFromPsi: originField
  };
}

/**
 * Counts real Lighthouse audits into applicable / passed / warning / failed /
 * not-applicable, per category. This must never be estimated or hard-coded —
 * it walks `categories[*].auditRefs` (which audits belong to which category)
 * against `audits[*].scoreDisplayMode` and `.score` from the actual response.
 *
 * scoreDisplayMode values that do NOT count as applicable (per Lighthouse's
 * own model, and explicitly excluded here): informative, notApplicable,
 * manual, error. Only binary / numeric / metricSavings audits with a real
 * numeric score are counted as applicable, using Lighthouse's own pass
 * threshold (>=0.9 pass, 0.5-0.89 warning, <0.5 fail).
 */
function sccSummarizeAudits(lh) {
  const audits = lh.audits || {};
  const categories = lh.categories || {};
  const EXCLUDED_MODES = new Set(['informative', 'notApplicable', 'manual', 'error']);

  const perCategory = {};
  let applicable = 0, passed = 0, warning = 0, failed = 0, notApplicable = 0;
  const seen = new Set();

  Object.entries(categories).forEach(([catId, catData]) => {
    const refs = catData.auditRefs || [];
    const bucket = { applicable: 0, passed: 0, warning: 0, failed: 0, notApplicable: 0, title: catData.title || catId };
    refs.forEach(ref => {
      const a = audits[ref.id];
      if (!a) return;
      const mode = a.scoreDisplayMode;
      const key = catId + ':' + ref.id;
      if (seen.has(key)) return; // an audit can be referenced by more than one category
      seen.add(key);

      if (EXCLUDED_MODES.has(mode) || typeof a.score !== 'number') {
        bucket.notApplicable++;
        notApplicable++;
        return;
      }
      bucket.applicable++; applicable++;
      if (a.score >= 0.9) { bucket.passed++; passed++; }
      else if (a.score >= 0.5) { bucket.warning++; warning++; }
      else { bucket.failed++; failed++; }
    });
    perCategory[catId] = bucket;
  });

  return { applicable, passed, warning, failed, notApplicable, byCategory: perCategory };
}

/** Normalises a PSI loadingExperience block (which is CrUX data). */
function sccParseLoadingExperience(exp) {
  if (!exp || !exp.metrics) return null;
  const m = exp.metrics;
  const pick = (key) => {
    const entry = m[key];
    if (!entry || typeof entry.percentile !== 'number') return null;
    return { value: entry.percentile, category: entry.category || null };
  };
  return {
    dataType: 'field',
    source: 'CrUX (via PageSpeed Insights)',
    overallCategory: exp.overall_category || null,
    id: exp.id || null,
    metrics: {
      LCP: pick('LARGEST_CONTENTFUL_PAINT_MS'),
      INP: pick('INTERACTION_TO_NEXT_PAINT') || pick('EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT'),
      CLS: (() => {
        const c = pick('CUMULATIVE_LAYOUT_SHIFT_SCORE');
        // CrUX reports CLS scaled by 100.
        return c ? { value: c.value / 100, category: c.category } : null;
      })(),
      FCP: pick('FIRST_CONTENTFUL_PAINT_MS'),
      TTFB: pick('EXPERIMENTAL_TIME_TO_FIRST_BYTE')
    }
  };
}

/* --------------------------------- CrUX --------------------------------- */

/** Queries the CrUX API. Requires the user's own Google Cloud API key. */
async function sccQueryCrux(target, formFactor, apiKey, fetchImpl) {
  if (!apiKey) {
    return { ok: false, error: 'NO_KEY', message: 'Connect CrUX to unlock real-user Core Web Vitals.' };
  }
  const doFetch = fetchImpl || fetch;
  const payload = { formFactor };
  // A URL query returns page-level data; an origin query covers the whole site.
  if (target.origin) payload.origin = target.origin; else payload.url = target.url;

  let res, body;
  try {
    res = await doFetch(`${SCC_CRUX_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: 'Could not reach the CrUX API.', detail: String(e.message || e) };
  }
  try { body = await res.json(); } catch (e) {
    return { ok: false, error: 'BAD_RESPONSE', message: 'CrUX returned a response that could not be read.', detail: String(e.message || e) };
  }

  if (!res.ok) {
    // 404 is the documented "not enough data" answer, and is normal for most URLs.
    if (res.status === 404) {
      return { ok: false, error: 'NO_DATA',
        message: 'No CrUX field data is available for this ' + (target.origin ? 'origin' : 'URL') + '. Google only publishes field data for pages with enough real-user traffic.' };
    }
    const kind = res.status === 429 ? 'RATE_LIMIT' : res.status === 403 ? 'FORBIDDEN' : 'API_ERROR';
    return {
      ok: false, error: kind, status: res.status,
      message: {
        RATE_LIMIT: 'CrUX API quota reached for your key.',
        FORBIDDEN: 'CrUX rejected this API key. Check the key is valid and the Chrome UX Report API is enabled in your Google Cloud project.',
        API_ERROR: 'The CrUX request could not be completed.'
      }[kind],
      detail: body?.error?.message || `HTTP ${res.status}`
    };
  }

  return sccParseCrux(body, formFactor, target);
}

function sccParseCrux(body, formFactor, target) {
  const record = body?.record;
  if (!record?.metrics) {
    return { ok: false, error: 'NO_DATA', message: 'No CrUX field data is available for this URL.' };
  }
  const m = record.metrics;
  const p75 = (key, scale) => {
    const entry = m[key];
    if (!entry || entry.percentiles?.p75 === undefined) return null;
    const raw = Number(entry.percentiles.p75);
    return { value: scale ? raw * scale : raw, histogram: entry.histogram || null };
  };

  return {
    ok: true,
    dataType: 'field',
    source: 'Chrome UX Report',
    formFactor,
    scope: target.origin ? 'origin' : 'url',
    key: record.key || null,
    collectionPeriod: record.collectionPeriod || null,
    metrics: {
      LCP: p75('largest_contentful_paint'),
      INP: p75('interaction_to_next_paint'),
      CLS: p75('cumulative_layout_shift'),
      FCP: p75('first_contentful_paint'),
      TTFB: p75('experimental_time_to_first_byte')
    }
  };
}

/** CrUX History: up to 25 weekly data points per metric, for trend charts. */
async function sccQueryCruxHistory(target, formFactor, apiKey, fetchImpl) {
  if (!apiKey) return { ok: false, error: 'NO_KEY', message: 'A CrUX API key is required for historical data.' };
  const doFetch = fetchImpl || fetch;
  const payload = { formFactor };
  if (target.origin) payload.origin = target.origin; else payload.url = target.url;

  let res, body;
  try {
    res = await doFetch(`${SCC_CRUX_HISTORY_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    body = await res.json();
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: 'Could not reach the CrUX History API.', detail: String(e.message || e) };
  }
  if (!res.ok) {
    if (res.status === 404) return { ok: false, error: 'NO_DATA', message: 'No historical CrUX data available for this URL.' };
    return { ok: false, error: 'API_ERROR', message: 'The CrUX History request could not be completed.', detail: body?.error?.message || `HTTP ${res.status}` };
  }

  const record = body?.record;
  if (!record?.metrics) return { ok: false, error: 'NO_DATA', message: 'No historical CrUX data available for this URL.' };

  const periods = (record.collectionPeriods || []).map(p => p.lastDate
    ? `${p.lastDate.year}-${String(p.lastDate.month).padStart(2, '0')}-${String(p.lastDate.day).padStart(2, '0')}`
    : null);

  const series = (key, scale) => {
    const entry = record.metrics[key];
    if (!entry?.percentilesTimeseries?.p75s) return null;
    return entry.percentilesTimeseries.p75s.map((v, i) => ({
      date: periods[i] || null,
      value: v === null || v === undefined ? null : (scale ? Number(v) * scale : Number(v))
    }));
  };

  return {
    ok: true, dataType: 'field', source: 'Chrome UX Report history',
    formFactor, scope: target.origin ? 'origin' : 'url', periods,
    series: { LCP: series('largest_contentful_paint'), INP: series('interaction_to_next_paint'), CLS: series('cumulative_layout_shift') }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCC_PSI_ENDPOINT, SCC_CRUX_ENDPOINT, SCC_CRUX_HISTORY_ENDPOINT, SCC_PERF_ORIGINS,
    SCC_CWV_THRESHOLDS, sccRateMetric, sccFormatMetric,
    sccRunPageSpeed, sccParsePageSpeed, sccParseLoadingExperience, sccSummarizeAudits,
    sccQueryCrux, sccParseCrux, sccQueryCruxHistory,
    sccHasPerfPermission, sccRequestPerfPermission
  };
}
