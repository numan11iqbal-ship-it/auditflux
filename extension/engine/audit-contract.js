(function attachAuditFluxContract(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AUDITFLUX_CONTRACT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAuditFluxContract() {
  const CONTRACT_VERSION = '1.1.0';
  const SOURCE_TYPES = new Set(['LIVE', 'LAB', 'FIELD']);
  const SECRET_KEY = /api.?key|authorization|token|secret|password|cookie/i;

  function cloneWithoutSecrets(value) {
    if (Array.isArray(value)) return value.map(cloneWithoutSecrets);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, nested]) => [key, cloneWithoutSecrets(nested)]));
  }

  function newClientId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeSource(value, fallback) {
    return SOURCE_TYPES.has(value) ? value : fallback;
  }

  function normalizeAuditUrl(value) {
    if (typeof value !== 'string') return null;
    let candidate = value.trim();
    if (!candidate) return null;
    candidate = candidate.replace(/^https?:\/+(https?:\/+)/i, '$1');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
      url.protocol = url.protocol.toLowerCase();
      url.hostname = url.hostname.toLowerCase();
      url.hash = '';
      return url.href;
    } catch { return null; }
  }

  function issueLocator(issue, data) {
    if (issue.locator) return cloneWithoutSecrets(issue.locator);
    const category = String(issue.category || '').toLowerCase();
    const text = `${issue.id || ''} ${issue.title || ''}`.toLowerCase();
    if (category.includes('heading') || text.includes('heading') || text.includes('h1')) {
      return data.headings?.find(item => item.empty || item.level === 1)?.locator || null;
    }
    if (category.includes('image') || text.includes('image') || text.includes('alt')) {
      return data.images?.find(item => item.altMissing || item.altEmpty || item.broken)?.locator || null;
    }
    if (category.includes('link') || text.includes('link') || text.includes('anchor')) {
      return data.links?.find(item => !item.anchor || item.type === 'other')?.locator || null;
    }
    return null;
  }

  function categoryRows(audit) {
    return (audit.explanation?.contributions || []).map(item => ({
      id: item.id,
      label: item.label,
      score: item.score ?? null,
      applicable: Boolean(item.applied),
      checks: item.checks || 0,
      passed: item.passed || 0,
      failed: item.failed || 0,
      source: 'CALCULATED',
    }));
  }

  function geoAeoRows(audit, data) {
    const rows = [];
    const add = (item, status) => {
      if (item?.category !== 'geo') return;
      rows.push({
        signalKey: item.id || `geo-${rows.length}`,
        status: status || item.status || 'unavailable',
        title: item.title || 'GEO / AEO signal',
        detected: item.detected || null,
        expected: item.expected || null,
        evidence: cloneWithoutSecrets(item.evidence || []),
        locator: issueLocator(item, data),
        provenance: { source: 'CALCULATED', method: 'AuditFlux deterministic GEO / AEO rules' },
      });
    };
    (audit.issues || []).forEach(item => add(item, item.status || 'fail'));
    (audit.passed || []).forEach(item => add(item, item.status || 'pass'));
    return rows;
  }

  function pageEssentials(data) {
    const page = data.page || {};
    const head = data.head || {};
    const source = data.source || {};
    const security = data.security || {};
    const robots = data.robots || {};
    const pageType = data.pageType || {};
    const exactUrl = normalizeAuditUrl(page.url);
    const numericStatus = Number.isFinite(Number(page.httpStatus)) && Number(page.httpStatus) > 0
      ? Number(page.httpStatus)
      : Number.isFinite(Number(source.status)) && Number(source.status) > 0 ? Number(source.status) : null;
    const httpStatusSource = Number.isFinite(Number(page.httpStatus)) && Number(page.httpStatus) > 0
      ? 'extension_navigation'
      : Number.isFinite(Number(source.status)) && Number(source.status) > 0 ? 'server_fetch' : 'unavailable';
    const xRobotsTag = typeof security.xRobotsTag === 'string' ? security.xRobotsTag.toLowerCase() : '';
    let indexability = 'unknown'; let indexabilityReason = 'Browser capture could not determine robots directives for this page.'; let indexabilitySource = 'unavailable';
    if (head.noindex) { indexability = 'noindex'; indexabilityReason = 'Meta robots or Googlebot directive contains noindex.'; indexabilitySource = 'meta_robots'; }
    else if (xRobotsTag.includes('noindex')) { indexability = 'noindex'; indexabilityReason = 'X-Robots-Tag response header contains noindex.'; indexabilitySource = 'response_header'; }
    else if (robots.pageAllowed === false) { indexability = 'blocked'; indexabilityReason = 'robots.txt blocks Googlebot from the audited path.'; indexabilitySource = 'robots_txt'; }
    else if (robots.pageAllowed === true) { indexability = 'indexable'; indexabilityReason = 'No noindex directive was detected and robots.txt permits Googlebot for the audited path.'; indexabilitySource = 'robots_txt'; }
    else if (head.robotsMeta || xRobotsTag) { indexability = 'indexable'; indexabilityReason = 'Captured robots directives do not contain noindex.'; indexabilitySource = head.robotsMeta ? 'meta_robots' : 'response_header'; }
    const canonicalUrl = normalizeAuditUrl(head.canonical);
    let canonicalStatus = 'missing'; let canonicalEvidence = 'No canonical link element was captured.';
    if (head.canonicalCount > 1) { canonicalStatus = 'multiple'; canonicalEvidence = `${head.canonicalCount} canonical link elements were captured.`; }
    else if (head.canonical && !canonicalUrl) { canonicalStatus = 'invalid'; canonicalEvidence = 'A canonical link was present but could not be normalized as an HTTP URL.'; }
    else if (canonicalUrl && exactUrl) {
      const canonicalHost = new URL(canonicalUrl).hostname; const auditedHost = new URL(exactUrl).hostname;
      canonicalStatus = canonicalHost !== auditedHost ? 'cross-domain' : head.canonicalIsSelf ? 'self-referencing' : 'present';
      canonicalEvidence = canonicalStatus === 'cross-domain' ? 'The captured canonical points to a different hostname.' : head.canonicalIsSelf ? 'The captured canonical matches the audited URL.' : 'One valid canonical link element was captured.';
    } else if (canonicalUrl) { canonicalStatus = 'present'; canonicalEvidence = 'One valid canonical link element was captured.'; }
    const detectedType = typeof pageType.type === 'string' ? pageType.type : 'unknown';
    const pageTypeValue = detectedType === 'generic' ? 'unknown' : detectedType;
    const pageTypeEvidence = Array.isArray(pageType.reasons) && pageType.reasons.length ? pageType.reasons.map(String) : ['No reliable classification signal was captured.'];
    const pageTypeConfidence = pageTypeValue === 'unknown' ? 'unavailable' : pageTypeEvidence.some(reason => /schema/i.test(reason)) ? 'high' : 'medium';
    return {
      url: exactUrl,
      urlSource: 'extension_location',
      fetchedUrl: normalizeAuditUrl(source.url) || exactUrl,
      httpStatus: numericStatus,
      httpStatusSource,
      httpStatusAvailability: numericStatus === null ? 'unavailable' : 'available',
      indexability,
      indexabilityReason,
      indexabilitySource,
      canonicalUrl,
      canonicalStatus,
      canonicalSource: head.canonical ? 'dom_link' : 'unavailable',
      canonicalEvidence,
      pageType: pageTypeValue,
      pageTypeConfidence,
      pageTypeEvidence,
    };
  }

  function normalizeAudit({ data, audit, tab, performance, engineVersion }) {
    if (!data?.page?.url || !audit) throw new Error('A completed extension audit with a page URL is required.');
    const auditUrl = normalizeAuditUrl(data.page.url);
    if (!auditUrl) throw new Error('The current audited page URL is invalid.');
    const tabUrl = normalizeAuditUrl(tab?.url) || auditUrl;
    const capturedAt = data.scannedAt || new Date().toISOString();
    const counts = audit.counts || {};
    const normalizedIssues = (audit.issues || []).map((issue, index) => ({
      id: `${issue.id || 'issue'}-${index}`,
      ruleId: issue.id || null,
      category: issue.category || 'uncategorized',
      severity: issue.severity || 'notice',
      title: issue.title || 'Untitled issue',
      detected: issue.detected || '',
      expected: issue.expected || '',
      why: issue.why || '',
      recommendation: issue.how || '',
      evidence: cloneWithoutSecrets(issue.evidence || []),
      status: issue.status || 'fail',
      locator: issueLocator(issue, data),
      provenance: { source: 'CALCULATED', method: 'AuditFlux deterministic rules engine' },
    }));

    const detail = cloneWithoutSecrets({
      page: data.page,
      head: data.head,
      social: data.social,
      headings: data.headings,
      headingStats: data.headingStats,
      content: data.content,
      links: data.links,
      linkStats: data.linkStats,
      images: data.images,
      imageStats: data.imageStats,
      schema: data.schema,
      tech: data.tech,
      security: data.security,
      accessibility: data.accessibility,
      mobile: data.mobile,
      resources: data.resources,
      resourceSummary: data.live?.resources,
      robots: data.robots,
      sitemaps: data.sitemaps,
      llms: data.llms,
      wellKnown: data.wellKnown,
      rendering: data.rendering,
      source: data.source,
      pageEssentials: pageEssentials(data),
    });

    const performancePayload = cloneWithoutSecrets(performance || {
      live: data.live ? { source: 'LIVE', data: data.live } : null,
      lab: null,
      field: null,
    });
    const geoAeo = geoAeoRows(audit, data);

    return {
      contractVersion: CONTRACT_VERSION,
      clientAuditId: newClientId(),
      url: auditUrl,
      canonicalUrl: data.head?.canonical || null,
      capturedAt,
      engineVersion: engineVersion || 'extension-5.2.0',
      tab: tab ? { tabId: tab.id ?? null, windowId: tab.windowId ?? null, url: tabUrl } : null,
      overallScore: audit.overall ?? null,
      coverage: {
        total: counts.totalRules || 0,
        applicable: counts.evaluated || 0,
        pass: counts.passed || 0,
        warn: counts.warning || 0,
        fail: (counts.critical || 0) + (counts.warning || 0) + (counts.notice || 0),
        critical: counts.critical || 0,
        notice: counts.notice || 0,
        na: counts.notApplicable || 0,
      },
      categories: categoryRows(audit),
      issues: normalizedIssues,
      passed: cloneWithoutSecrets(audit.passed || []),
      detail,
      geoAeo,
      performance: performancePayload,
      provenance: {
        generatedBy: 'AuditFlux deterministic extension engine',
        scores: { source: 'CALCULATED', method: audit.explanation?.method || null },
        live: data.live ? { source: 'LIVE', label: data.live.label || 'Live Browser Observation' } : null,
        lab: performancePayload.lab ? { source: normalizeSource(performancePayload.lab.source, 'LAB') } : null,
        field: performancePayload.field ? { source: normalizeSource(performancePayload.field.source, 'FIELD') } : null,
      },
    };
  }

  return { CONTRACT_VERSION, cloneWithoutSecrets, normalizeAuditUrl, normalizeAudit, geoAeoRows, pageEssentials };
});
