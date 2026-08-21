/**
 * AuditFlux SEO — data provenance.
 *
 * Every metric the product shows carries where it came from and how much it
 * should be trusted. This exists because the single most damaging thing an SEO
 * tool can do is present an assumption as a measurement.
 *
 * The rule that matters most: UNAVAILABLE never becomes PASS. If we could not
 * measure something, we say so — we do not quietly score it as fine.
 */

const SCC_SOURCE = {
  DOM: 'Current DOM',
  PERF_API: 'Browser Performance API',
  RESPONSE: 'HTTP response headers',
  SERVED_HTML: 'Served HTML',
  ROBOTS: 'robots.txt',
  SITEMAP: 'XML sitemap',
  WELL_KNOWN: 'Well-known files',
  PAGESPEED: 'PageSpeed Insights API',
  CRUX: 'Chrome UX Report (CrUX)',
  GSC: 'Google Search Console',
  GA4: 'Google Analytics 4',
  ENGINE: 'AuditFlux SEO engine'
};

/**
 * Status of a value. Ordered from strongest to weakest claim.
 *
 *  VERIFIED   — read directly from an authoritative response (e.g. a header)
 *  DETECTED   — observed in the page (e.g. a meta tag, a framework marker)
 *  CALCULATED — derived deterministically from observed values (e.g. a score)
 *  ESTIMATED  — inferred with a heuristic (e.g. pixel width, page type)
 *  UNAVAILABLE— we tried and could not get it
 *  REQUIRES_CONNECTION — needs an API key or OAuth the user has not provided
 *  NOT_APPLICABLE — does not apply to this page; excluded from scoring
 */
const SCC_STATUS = {
  VERIFIED: 'VERIFIED',
  DETECTED: 'DETECTED',
  CALCULATED: 'CALCULATED',
  ESTIMATED: 'ESTIMATED',
  UNAVAILABLE: 'UNAVAILABLE',
  REQUIRES_CONNECTION: 'REQUIRES CONNECTION',
  NOT_APPLICABLE: 'NOT APPLICABLE'
};

/** Maps a status to a UI pill class. Unknown states are never styled as success. */
function sccStatusClass(status) {
  switch (status) {
    case SCC_STATUS.VERIFIED:
    case SCC_STATUS.DETECTED:
      return 'ok';
    case SCC_STATUS.CALCULATED:
      return 'blue';
    case SCC_STATUS.ESTIMATED:
      return 'warn';
    case SCC_STATUS.REQUIRES_CONNECTION:
      return 'purple';
    case SCC_STATUS.UNAVAILABLE:
    case SCC_STATUS.NOT_APPLICABLE:
    default:
      return 'info';
  }
}

/** Wraps a value with its provenance so the UI never has to guess. */
function sccMetric(value, source, status, note) {
  return {
    value: value,
    source: source,
    status: status || (value === null || value === undefined ? SCC_STATUS.UNAVAILABLE : SCC_STATUS.DETECTED),
    note: note || null
  };
}

/** True when a metric carries a real measurement we may reason about. */
function sccIsMeasured(metric) {
  if (!metric) return false;
  return metric.status === SCC_STATUS.VERIFIED ||
         metric.status === SCC_STATUS.DETECTED ||
         metric.status === SCC_STATUS.CALCULATED ||
         metric.status === SCC_STATUS.ESTIMATED;
}

if (typeof module !== 'undefined') {
  module.exports = { SCC_SOURCE, SCC_STATUS, sccStatusClass, sccMetric, sccIsMeasured };
}
