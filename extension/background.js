importScripts('content/overlay.js', 'engine/analyzer.js', 'engine/rules.js', 'engine/audit-contract.js');

const REGISTRY_KEY = 'auditfluxAuditTabRegistry';
const SESSION_KEY = 'auditfluxConnection';

async function registry() {
  const stored = await chrome.storage.local.get({ [REGISTRY_KEY]: {} });
  return stored[REGISTRY_KEY] || {};
}

async function saveRegistry(next) { await chrome.storage.local.set({ [REGISTRY_KEY]: next }); }

function handleConnection(message, sendResponse) {
  if (message?.type !== 'auditflux:connection') return false;
  chrome.storage.session.set({ [SESSION_KEY]: { apiBase: message.apiBase, accessToken: message.accessToken, connectedAt: Date.now() } })
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (handleConnection(message, sendResponse)) return true;
  if (message?.type === 'auditflux:register-audit') {
    registry().then(async records => {
      records[message.auditId] = { tabId: message.tabId, windowId: message.windowId, url: message.url, savedAt: Date.now() };
      await saveRegistry(records);
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (handleConnection(message, sendResponse)) return true;
  if (!message?.auditId) return;
  (async () => {
    const records = await registry();
    const record = records[message.auditId];
    if (!record) return sendResponse({ ok: false, reason: 'AUDIT_TAB_UNAVAILABLE' });
    const tab = await chrome.tabs.get(record.tabId).catch(() => null);
    if (!tab) return sendResponse({ ok: false, reason: 'TAB_CLOSED' });
    if (!tab.url || new URL(tab.url).origin !== new URL(record.url).origin) return sendResponse({ ok: false, reason: 'PAGE_CHANGED' });
    await chrome.tabs.update(record.tabId, { active: true });
    await chrome.windows.update(record.windowId, { focused: true }).catch(() => {});
    if (message.type === 'auditflux:toggle-heading-overlay') {
      const result = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_TOGGLE_HEADING_OVERLAY });
      const overlay = result?.[0]?.result;
      if (!overlay) return sendResponse({ ok: false, reason: 'OVERLAY_FAILED' });
      return sendResponse({ ok: true, ...overlay, sender: sender.origin || null });
    }
    if (message.type === 'auditflux:rescan') {
      const connection = await chrome.storage.session.get({ [SESSION_KEY]: null });
      const session = connection[SESSION_KEY];
      if (!session?.apiBase || !session?.accessToken) return sendResponse({ ok: false, reason: 'CONNECTION_REQUIRED' });
      const analyzed = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_ANALYZE });
      const data = analyzed?.[0]?.result;
      if (!data?.page?.url) return sendResponse({ ok: false, reason: 'ANALYSIS_FAILED' });
      const audit = SCC_AUDIT(data);
      const payload = AUDITFLUX_CONTRACT.normalizeAudit({ data, audit, tab: { id: record.tabId, windowId: record.windowId, url: tab.url } });
      const response = await fetch(new URL('/api/audits', session.apiBase).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.auditId) return sendResponse({ ok: false, reason: 'SAVE_FAILED', error: body?.error || 'AuditFlux could not save the new audit.' });
      records[body.auditId] = { tabId: record.tabId, windowId: record.windowId, url: data.page.url, savedAt: Date.now() };
      await saveRegistry(records);
      await chrome.storage.local.set({ sccLatest: { data, audit, tabId: record.tabId, savedAt: Date.now() }, sccLatestSavedAudit: { clientAuditId: payload.clientAuditId, auditId: body.auditId, apiBase: session.apiBase, savedAt: Date.now() } });
      return sendResponse({ ok: true, auditId: body.auditId, duplicate: Boolean(body.duplicate), sender: sender.origin || null });
    }
    if (message.type !== 'auditflux:locate' || !message.locator) return sendResponse({ ok: false, reason: 'INVALID_REQUEST' });
    const result = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_LOCATE_AUDIT_TARGET, args: [message.locator] });
    const located = result?.[0]?.result || { located: false, reason: 'PAGE_CHANGED' };
    return sendResponse({ ok: Boolean(located.located), ...located, sender: sender.origin || null });
  })().catch(error => sendResponse({ ok: false, reason: 'LOCATE_FAILED', error: error.message }));
  return true;
});
