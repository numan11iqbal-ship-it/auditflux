(function attachAuditFluxContract(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AUDITFLUX_CONTRACT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAuditFluxContract() {
  const CONTRACT_VERSION = '1.0.0';
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

  function normalizeAudit({ data, audit, tab, performance, engineVersion }) {
    if (!data?.page?.url || !audit) throw new Error('A completed extension audit with a page URL is required.');
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
      url: data.page.url,
      canonicalUrl: data.head?.canonical || null,
      capturedAt,
      engineVersion: engineVersion || 'extension-5.2.0',
      tab: tab ? { tabId: tab.id ?? null, windowId: tab.windowId ?? null, url: tab.url || data.page.url } : null,
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

  return { CONTRACT_VERSION, cloneWithoutSecrets, normalizeAudit, geoAeoRows };
});
