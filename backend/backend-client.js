/**
 * AuditFlux SEO — backend proxy client.
 *
 * This is the secure path: the extension calls its own backend, never Google
 * directly, and never holds an API key. It is a plain URL to the extension —
 * not a secret — so it is fine to store in chrome.storage.local and show in
 * Settings, unlike the "bring your own key" fields in pagespeed.js which are
 * genuinely sensitive.
 *
 * Chrome permission model: the backend origin is requested as an optional
 * host permission at the moment the user first tests or uses it, exactly like
 * the direct-to-Google path already does for googleapis.com.
 */

const SCC_BACKEND_DEFAULT_URL = 'http://localhost:8787';

function sccNormalizeBackendUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // The pathname setter re-normalizes '' back to '/', so trim the trailing
    // slash on the final string instead of round-tripping through the setter.
    const path = u.pathname.replace(/\/+$/, '');
    return u.origin + path;
  } catch (e) { return null; }
}

/** Origin pattern to request as an optional host permission for this backend. */
function sccBackendOriginPattern(backendUrl) {
  const norm = sccNormalizeBackendUrl(backendUrl);
  if (!norm) return null;
  try { return new URL(norm).origin + '/*'; } catch (e) { return null; }
}

async function sccHasBackendPermission(backendUrl) {
  const pattern = sccBackendOriginPattern(backendUrl);
  if (!pattern || typeof chrome === 'undefined' || !chrome.permissions) return false;
  try { return await chrome.permissions.contains({ origins: [pattern] }); }
  catch (e) { return false; }
}

async function sccRequestBackendPermission(backendUrl) {
  const pattern = sccBackendOriginPattern(backendUrl);
  if (!pattern || typeof chrome === 'undefined' || !chrome.permissions) return false;
  try { return await chrome.permissions.request({ origins: [pattern] }); }
  catch (e) { return false; }
}

/** GET /api/status — never returns a key, only whether one is configured. */
async function sccCheckBackendStatus(backendUrl, fetchImpl) {
  const base = sccNormalizeBackendUrl(backendUrl);
  if (!base) return { ok: false, error: 'INVALID_URL', message: 'Enter a valid backend URL.' };
  const doFetch = fetchImpl || fetch;
  try {
    const res = await doFetch(base + '/api/status');
    if (!res.ok) return { ok: false, error: 'BAD_RESPONSE', status: res.status, message: 'The backend did not respond as expected.' };
    const body = await res.json();
    return { ok: true, pagespeed: body.pagespeed, crux: body.crux };
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: 'Could not reach the AuditFlux backend at ' + base + '.' };
  }
}

/**
 * Requests a PageSpeed run through the backend. No API key is sent or held by
 * the extension at any point in this call — the proxy attaches its own
 * server-side key.
 */
async function sccRunPageSpeedViaBackend(url, strategy, backendUrl, fetchImpl) {
  const base = sccNormalizeBackendUrl(backendUrl);
  if (!base) return { ok: false, error: 'INVALID_URL', message: 'Enter a valid backend URL.' };
  const doFetch = fetchImpl || fetch;
  const qs = new URLSearchParams({ url, strategy });

  let res;
  try {
    res = await doFetch(base + '/api/pagespeed?' + qs);
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: 'Could not reach the AuditFlux backend at ' + base + '.' };
  }

  let body;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!body) return { ok: false, error: 'BAD_RESPONSE', status: res.status, message: 'The backend returned an unreadable response.' };

  // The proxy already returns a parsed result in the same shape sccRunPageSpeed
  // produces directly, so the rest of the UI does not need to know which
  // transport was used.
  return body;
}

async function sccQueryCruxViaBackend(url, strategy, backendUrl, fetchImpl) {
  const base = sccNormalizeBackendUrl(backendUrl);
  if (!base) return { ok: false, error: 'INVALID_URL', message: 'Enter a valid backend URL.' };
  const doFetch = fetchImpl || fetch;
  const qs = new URLSearchParams({ url, strategy });
  try {
    const res = await doFetch(base + '/api/crux?' + qs);
    const body = await res.json();
    return body;
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: 'Could not reach the AuditFlux backend at ' + base + '.' };
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCC_BACKEND_DEFAULT_URL, sccNormalizeBackendUrl, sccBackendOriginPattern,
    sccHasBackendPermission, sccRequestBackendPermission,
    sccCheckBackendStatus, sccRunPageSpeedViaBackend, sccQueryCruxViaBackend
  };
}
