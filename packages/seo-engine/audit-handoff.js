(function handoffModule(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AUDITFLUX_HANDOFF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAuditFluxHandoff() {
  const SOURCE = 'extension';

  function canonicalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }

  function createCurrentAuditHandoff(input) {
    const normalizedUrl = canonicalUrl(input?.normalizedUrl || input?.auditedUrl);
    const auditId = typeof input?.auditId === 'string' ? input.auditId : '';
    const clientAuditId = typeof input?.clientAuditId === 'string' ? input.clientAuditId : '';
    const auditTimestamp = typeof input?.auditTimestamp === 'string' ? input.auditTimestamp : '';
    const extensionId = typeof input?.extensionId === 'string' ? input.extensionId : '';
    const workspaceSessionId = typeof input?.workspaceSessionId === 'string' ? input.workspaceSessionId : null;
    const tabId = Number.isInteger(input?.tabId) ? input.tabId : null;
    if (!auditId || !clientAuditId || !normalizedUrl || !auditTimestamp || !extensionId || tabId === null) return null;
    const hostname = new URL(normalizedUrl).hostname;
    return { auditId, clientAuditId, auditedUrl: normalizedUrl, normalizedUrl, hostname, tabId, auditTimestamp, extensionId, workspaceSessionId, source: SOURCE };
  }

  function isCurrentAuditHandoff(value) {
    const normalized = createCurrentAuditHandoff(value);
    if (!normalized || value?.source !== SOURCE) return false;
    return normalized.auditId === value.auditId && normalized.clientAuditId === value.clientAuditId && normalized.auditedUrl === value.auditedUrl && normalized.normalizedUrl === value.normalizedUrl && normalized.hostname === value.hostname;
  }

  function verifyReturnedAudit(handoff, audit) {
    if (!isCurrentAuditHandoff(handoff) || !audit || typeof audit.id !== 'string') return { ok: false, auditIdMatch: false, urlMatch: false };
    const returnedUrl = canonicalUrl(audit.url);
    return { ok: audit.id === handoff.auditId && returnedUrl === handoff.normalizedUrl, auditIdMatch: audit.id === handoff.auditId, urlMatch: returnedUrl === handoff.normalizedUrl };
  }

  function encodeHandoff(handoff) { return encodeURIComponent(JSON.stringify(handoff)); }
  function decodeHandoff(value) { try { const parsed = JSON.parse(decodeURIComponent(String(value || ''))); return isCurrentAuditHandoff(parsed) ? parsed : null; } catch { return null; } }

  return { SOURCE, canonicalUrl, createCurrentAuditHandoff, isCurrentAuditHandoff, verifyReturnedAudit, encodeHandoff, decodeHandoff };
});
