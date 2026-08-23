importScripts('content/overlay.js', 'engine/analyzer.js', 'engine/rules.js', 'engine/audit-contract.js');

const REGISTRY_KEY = 'auditfluxAuditTabRegistry';
const SESSION_KEY = 'auditfluxConnection';
const INSTALLATION_KEY = 'auditfluxInstallationId';
const AUDITFLUX_WEB_APP_ORIGIN = 'https://auditflux.vercel.app';
const AUDITFLUX_SAAS_ORIGINS = new Set([AUDITFLUX_WEB_APP_ORIGIN]);

async function registry() {
  const stored = await chrome.storage.local.get({ [REGISTRY_KEY]: {} });
  return stored[REGISTRY_KEY] || {};
}

async function saveRegistry(next) { await chrome.storage.local.set({ [REGISTRY_KEY]: next }); }

function normalizedHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function sameAuditedPage(left, right) {
  const a = normalizedHttpUrl(left); const b = normalizedHttpUrl(right);
  return Boolean(a && b && a === b);
}

async function waitForAuditedTab(tab) {
  if (!tab?.id || tab.status === 'complete' || !chrome.tabs.onUpdated?.addListener) return tab;
  return new Promise(resolve => {
    const finish = async () => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(await chrome.tabs.get(tab.id).catch(() => tab));
    };
    const listener = (tabId, changeInfo) => { if (tabId === tab.id && changeInfo.status === 'complete') void finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => void finish(), 10000);
  });
}

async function resolveAuditedTab(message, records) {
  const record = records[message.auditId];
  const expectedUrl = normalizedHttpUrl(message.auditUrl || record?.url);
  if (record?.tabId) {
    const registered = await chrome.tabs.get(record.tabId).catch(() => null);
    if (registered && (!expectedUrl || sameAuditedPage(registered.url, expectedUrl))) return { tab: registered, record };
  }
  if (!expectedUrl) return { tab: null, record: null };
  const candidates = await chrome.tabs.query({ url: [`${new URL(expectedUrl).origin}/*`] }).catch(() => []);
  let tab = candidates.find(candidate => sameAuditedPage(candidate.url, expectedUrl)) || null;
  if (!tab) tab = await chrome.tabs.create({ url: expectedUrl, active: true });
  tab = await waitForAuditedTab(tab);
  if (!tab?.id) return { tab: null, record: null };
  const recovered = { tabId: tab.id, windowId: tab.windowId, url: expectedUrl, savedAt: Date.now() };
  records[message.auditId] = recovered;
  await saveRegistry(records);
  return { tab, record: recovered };
}

async function installationId() {
  const stored = await chrome.storage.local.get({ [INSTALLATION_KEY]: null });
  if (stored[INSTALLATION_KEY]) return stored[INSTALLATION_KEY];
  const next = crypto.randomUUID(); await chrome.storage.local.set({ [INSTALLATION_KEY]: next }); return next;
}

function sessionHeaders(session) {
  return session?.sessionToken ? { 'X-AuditFlux-Extension-Session': session.sessionToken } : session?.accessToken ? { Authorization: 'Bearer ' + session.accessToken } : {};
}

function officialSender(sender) {
  try { return Boolean(sender?.url && AUDITFLUX_SAAS_ORIGINS.has(new URL(sender.url).origin)); } catch { return false; }
}

async function emitWorkspaceEvent(eventType, payload = {}) {
  const tabs = await chrome.tabs.query({ url: [`${AUDITFLUX_WEB_APP_ORIGIN}/*`] }).catch(() => []);
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'auditflux:workspace-event', eventType, payload }).catch(() => null)));
}

async function pairExtension(message, sender) {
  if (!officialSender(sender) || typeof message?.nonce !== 'string' || !message.nonce.startsWith('af_conn_')) return { ok: false, reason: 'INVALID_PAIRING_REQUEST' };
  const version = chrome.runtime.getManifest().version; const installId = await installationId();
  const response = await fetch(AUDITFLUX_WEB_APP_ORIGIN + '/api/extensions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', nonce: message.nonce, installationId: installId, extensionVersion: version, protocolVersion: '1', browser: navigator.userAgent, capabilities: ['audit-save', 'full-report', 'locate', 'heading-overlay', 'rescan'] }) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.sessionToken) return { ok: false, reason: 'PAIRING_REJECTED' };
  const session = { apiBase: AUDITFLUX_WEB_APP_ORIGIN, sessionToken: body.sessionToken, expiresAt: body.expiresAt, connectedAt: Date.now(), installationId: installId, connection: body.connection };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await emitWorkspaceEvent('AUDITFLUX_EXTENSION_CONNECTED', { installationId: installId, extensionVersion: version, connectedAt: session.connectedAt, connectionId: body.connection?.id || null });
  return { ok: true, state: 'connected', connection: body.connection };
}

async function pairingStatus(sender) {
  if (!officialSender(sender)) return { ok: false, reason: 'INVALID_ORIGIN' };
  const stored = await chrome.storage.session.get({ [SESSION_KEY]: null }); const session = stored[SESSION_KEY];
  if (!session?.sessionToken) return { ok: true, state: 'not_connected' };
  if (!session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) return { ok: true, state: 'expired' };
  return { ok: true, state: 'connected', connection: session.connection || null };
}

function popupSender(sender) {
  try {
    if (sender?.id !== chrome.runtime.id || sender?.tab) return false;
    return !sender.url || sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  } catch { return false; }
}

async function popupConnection(sender) {
  if (!popupSender(sender)) return { ok: false, reason: 'INVALID_CALLER' };
  const stored = await chrome.storage.session.get({ [SESSION_KEY]: null }); const session = stored[SESSION_KEY];
  if (!session?.sessionToken && !session?.accessToken) return { ok: false, reason: 'CONNECTION_REQUIRED' };
  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) { await chrome.storage.session.remove(SESSION_KEY); return { ok: false, reason: 'SESSION_EXPIRED' }; }
  return { ok: true, connection: session };
}

async function disconnectPairing(sender) {
  if (!officialSender(sender)) return { ok: false, reason: 'INVALID_ORIGIN' };
  const stored = await chrome.storage.session.get({ [SESSION_KEY]: null }); const session = stored[SESSION_KEY];
  if (session?.sessionToken && session?.connection?.id) await fetch(AUDITFLUX_WEB_APP_ORIGIN + '/api/extensions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sessionHeaders(session) }, body: JSON.stringify({ action: 'disconnect', connectionId: session.connection.id }) }).catch(() => null);
  await chrome.storage.session.remove(SESSION_KEY); await emitWorkspaceEvent('AUDITFLUX_EXTENSION_DISCONNECTED', { connectionId: session?.connection?.id || null }); return { ok: true, state: 'disconnected' };
}

function handleConnection(message, sendResponse) {
  if (message?.type !== 'auditflux:connection') return false;
  chrome.storage.session.set({ [SESSION_KEY]: { apiBase: message.apiBase, accessToken: message.accessToken, connectedAt: Date.now() } })
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (handleConnection(message, sendResponse)) return true;
  if (message?.type === 'auditflux:pair') { pairExtension(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'CONNECTION_FAILED' })); return true; }
  if (message?.type === 'auditflux:connection-status') { pairingStatus(sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'CONNECTION_FAILED' })); return true; }
  if (message?.type === 'auditflux:get-popup-connection') { popupConnection(sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'CONNECTION_FAILED' })); return true; }
  if (message?.type === 'auditflux:audit-saved') { if (!popupSender(sender) || typeof message.auditId !== 'string') return sendResponse({ ok: false, reason: 'INVALID_CALLER' }); emitWorkspaceEvent('AUDITFLUX_AUDIT_SAVED', { auditId: message.auditId, url: message.url || null, createdAt: Date.now() }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false, reason: 'EVENT_FAILED' })); return true; }
  if (message?.type === 'auditflux:disconnect') { disconnectPairing(sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'CONNECTION_FAILED' })); return true; }
  if (message?.type === 'auditflux:command') { if (!officialSender(sender)) return sendResponse({ ok: false, reason: 'INVALID_ORIGIN' }); runAuditCommand(message.command, sender).then(sendResponse).catch(() => sendResponse({ ok: false, reason: 'COMMAND_FAILED' })); return true; }
  if (message?.type === 'auditflux:register-audit') {
    registry().then(async records => {
      records[message.auditId] = { tabId: message.tabId, windowId: message.windowId, url: message.url, savedAt: Date.now() };
      await saveRegistry(records);
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function runAuditCommand(message, sender) {
    if (!message?.auditId) return { ok: false, reason: 'INVALID_REQUEST' };
    const records = await registry();
    const recovered = await resolveAuditedTab(message, records);
    const tab = recovered.tab; const record = recovered.record;
    if (!tab || !record) return { ok: false, reason: 'AUDIT_TAB_UNAVAILABLE' };
    await chrome.tabs.update(record.tabId, { active: true });
    await chrome.windows.update(record.windowId, { focused: true }).catch(() => {});
    if (message.type === 'auditflux:toggle-heading-overlay') {
      const result = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_TOGGLE_HEADING_OVERLAY });
      const overlay = result?.[0]?.result;
      if (!overlay) return { ok: false, reason: 'OVERLAY_FAILED' };
      return { ok: true, ...overlay, sender: sender.origin || null };
    }
    if (message.type === 'auditflux:rescan') {
      const connection = await chrome.storage.session.get({ [SESSION_KEY]: null });
      const session = connection[SESSION_KEY];
      if (!session?.apiBase || (!session?.accessToken && !session?.sessionToken)) return { ok: false, reason: 'CONNECTION_REQUIRED' };
      const analyzed = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_ANALYZE });
      const data = analyzed?.[0]?.result;
      if (!data?.page?.url) return { ok: false, reason: 'ANALYSIS_FAILED' };
      const audit = SCC_AUDIT(data);
      const payload = AUDITFLUX_CONTRACT.normalizeAudit({ data, audit, tab: { id: record.tabId, windowId: record.windowId, url: tab.url } });
      const response = await fetch(new URL('/api/audits', session.apiBase).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders(session) },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.auditId) return { ok: false, reason: 'SAVE_FAILED', error: body?.error || 'AuditFlux could not save the new audit.' };
      records[body.auditId] = { tabId: record.tabId, windowId: record.windowId, url: data.page.url, savedAt: Date.now() };
      await saveRegistry(records);
      await chrome.storage.local.set({ sccLatest: { data, audit, tabId: record.tabId, savedAt: Date.now() }, sccLatestSavedAudit: { clientAuditId: payload.clientAuditId, auditId: body.auditId, apiBase: session.apiBase, savedAt: Date.now() } });
      await emitWorkspaceEvent('AUDITFLUX_AUDIT_SAVED', { auditId: body.auditId, url: data.page.url, createdAt: Date.now(), rescan: true });
      return { ok: true, auditId: body.auditId, duplicate: Boolean(body.duplicate), sender: sender.origin || null };
    }
    if (message.type !== 'auditflux:locate' || !message.locator) return { ok: false, reason: 'INVALID_REQUEST' };
    const result = await chrome.scripting.executeScript({ target: { tabId: record.tabId }, func: SCC_LOCATE_AUDIT_TARGET, args: [message.locator] });
    const located = result?.[0]?.result || { located: false, reason: 'PAGE_CHANGED' };
    return { ok: Boolean(located.located), ...located, sender: sender.origin || null };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (handleConnection(message, sendResponse)) return true;
  runAuditCommand(message, sender).then(sendResponse).catch(error => sendResponse({ ok: false, reason: 'LOCATE_FAILED', error: error.message }));
  return true;
});
