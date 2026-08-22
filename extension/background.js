importScripts('content/overlay.js');

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
  if (message?.type !== 'auditflux:locate' || !message.auditId || !message.locator) return;
  (async () => {
    const records = await registry();
    const record = records[message.auditId];
    if (!record) return sendResponse({ ok: false, reason: 'AUDIT_TAB_UNAVAILABLE' });
    const tab = await chrome.tabs.get(record.tabId).catch(() => null);
    if (!tab) return sendResponse({ ok: false, reason: 'TAB_CLOSED' });
    if (!tab.url || new URL(tab.url).origin !== new URL(record.url).origin) return sendResponse({ ok: false, reason: 'PAGE_CHANGED' });
    await chrome.tabs.update(record.tabId, { active: true });
    await chrome.windows.update(record.windowId, { focused: true }).catch(() => {});
    const result = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_LOCATE_AUDIT_TARGET, args: [message.locator] });
    const located = result?.[0]?.result || { located: false, reason: 'PAGE_CHANGED' };
    return sendResponse({ ok: Boolean(located.located), ...located, sender: sender.origin || null });
  })().catch(error => sendResponse({ ok: false, reason: 'LOCATE_FAILED', error: error.message }));
  return true;
});
