/**
 * AuditFlux SEO — heading overlay.
 *
 * Injected into the audited page to tag every H1–H6 with a coloured level
 * label. Both functions here are serialized by chrome.scripting.executeScript,
 * so each must be fully self-contained.
 *
 * Design constraints that drive the implementation:
 *  - The page's own DOM must never be modified. Labels live in one detached
 *    container appended to <body>; nothing is inserted inside headings, and no
 *    heading text or attribute is touched.
 *  - Labels are absolutely positioned in document space and repositioned on
 *    scroll/resize through requestAnimationFrame, so they stay attached to
 *    their heading without layout thrash.
 *  - A debounced MutationObserver keeps the overlay correct on SPA navigation.
 *  - Everything is namespaced under scc- and removed completely on toggle off.
 */

function SCC_TOGGLE_HEADING_OVERLAY() {
  const ROOT_ID = 'scc-heading-overlay-root';
  const STYLE_ID = 'scc-heading-overlay-style';

  // Toggle off: tear down everything we created and restore prior state.
  if (window.__sccOverlayActive) {
    try { window.__sccOverlayTeardown && window.__sccOverlayTeardown(); } catch (e) {}
    return { enabled: false, count: 0 };
  }

  const COLORS = {
    1: { bg: '#2f5ade', fg: '#ffffff' }, // blue
    2: { bg: '#7b4bc4', fg: '#ffffff' }, // purple
    3: { bg: '#15845a', fg: '#ffffff' }, // green
    4: { bg: '#b4770f', fg: '#ffffff' }, // amber
    5: { bg: '#c0392f', fg: '#ffffff' }, // red
    6: { bg: '#4a5568', fg: '#ffffff' }  // slate
  };

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{position:absolute;top:0;left:0;width:0;height:0;
      pointer-events:none;z-index:2147483000}
    #${ROOT_ID} .scc-tag{position:absolute;pointer-events:none;
      font:700 10px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      letter-spacing:.04em;padding:2px 5px;border-radius:4px;
      box-shadow:0 1px 3px rgba(0,0,0,.28);white-space:nowrap;
      transform:translateY(-100%)}
    #${ROOT_ID} .scc-outline{position:absolute;pointer-events:none;
      border:1px dashed rgba(47,90,222,.45);border-radius:3px}
    @media print{#${ROOT_ID}{display:none}}
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  document.body.appendChild(root);

  let tags = [];
  let rafPending = false;

  function isVisible(el) {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  function build() {
    root.innerHTML = '';
    tags = [];

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(el => !root.contains(el) && isVisible(el));

    headings.forEach(el => {
      const level = Number(el.tagName.substring(1));
      const color = COLORS[level];

      const tag = document.createElement('div');
      tag.className = 'scc-tag';
      tag.textContent = 'H' + level;
      tag.style.background = color.bg;
      tag.style.color = color.fg;

      const outline = document.createElement('div');
      outline.className = 'scc-outline';
      outline.style.borderColor = color.bg + '80';

      root.appendChild(outline);
      root.appendChild(tag);
      tags.push({ el, tag, outline });
    });

    position();
    return headings.length;
  }

  // Positions labels in document coordinates so they track the heading as the
  // user scrolls, without needing a listener per element.
  function position() {
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    for (const { el, tag, outline } of tags) {
      if (!el.isConnected) { tag.style.display = 'none'; outline.style.display = 'none'; continue; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { tag.style.display = 'none'; outline.style.display = 'none'; continue; }

      tag.style.display = '';
      outline.style.display = '';

      const top = r.top + scrollY;
      const left = r.left + scrollX;

      // Sit the label just above the heading; if the heading is at the very
      // top of the document, drop it inside so it stays on screen.
      tag.style.left = left + 'px';
      tag.style.top = (top <= 14 ? top + 16 : top - 2) + 'px';

      outline.style.left = left + 'px';
      outline.style.top = top + 'px';
      outline.style.width = r.width + 'px';
      outline.style.height = r.height + 'px';
    }
  }

  function onScrollOrResize() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; position(); });
  }

  let rebuildTimer = null;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { if (window.__sccOverlayActive) build(); }, 300);
  }

  const observer = new MutationObserver(mutations => {
    // Ignore mutations we caused ourselves, or the overlay would rebuild forever.
    for (const m of mutations) {
      if (root.contains(m.target) || m.target === root || m.target === style) continue;
      scheduleRebuild();
      return;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });

  window.__sccOverlayTeardown = function () {
    try { observer.disconnect(); } catch (e) {}
    clearTimeout(rebuildTimer);
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    const r = document.getElementById(ROOT_ID);
    if (r && r.parentNode) r.parentNode.removeChild(r);
    const s = document.getElementById(STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
    window.__sccOverlayActive = false;
    delete window.__sccOverlayTeardown;
  };

  window.__sccOverlayActive = true;
  const count = build();
  return { enabled: true, count: count };
}

/**
 * Scrolls to the nth heading (DOM order) and flashes a highlight.
 * The highlight is a separate absolutely-positioned element, so the heading
 * itself is never restyled.
 */
function SCC_LOCATE_HEADING(index) {
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const el = headings[index];
  if (!el) return { located: false };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const flash = document.createElement('div');
  const r = el.getBoundingClientRect();
  flash.style.cssText = [
    'position:absolute',
    'left:' + (r.left + (window.scrollX || 0)) + 'px',
    'top:' + (r.top + (window.scrollY || 0)) + 'px',
    'width:' + r.width + 'px',
    'height:' + r.height + 'px',
    'background:rgba(47,90,222,.18)',
    'border:2px solid rgba(47,90,222,.75)',
    'border-radius:4px',
    'pointer-events:none',
    'z-index:2147483000',
    'transition:opacity .5s ease'
  ].join(';');
  document.body.appendChild(flash);

  setTimeout(() => { flash.style.opacity = '0'; }, 1200);
  setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 1800);

  return { located: true, text: (el.textContent || '').trim().slice(0, 120) };
}

/**
 * Resolves an audit locator against the currently open audited page, scrolls to
 * the exact target, and highlights it without altering the page content.
 */
function SCC_LOCATE_AUDIT_TARGET(locator) {
  if (!locator) return { located: false, reason: 'NO_LOCATOR' };
  let el = null;
  try { if (locator.selector) el = document.querySelector(locator.selector); } catch (e) {}
  if (!el && locator.attributeHints?.id) el = document.getElementById(locator.attributeHints.id);
  if (!el && locator.textSnippet) {
    const expected = locator.textSnippet.replace(/\s+/g, ' ').trim();
    el = Array.from(document.querySelectorAll(locator.tagName || '*')).find(candidate =>
      (candidate.textContent || '').replace(/\s+/g, ' ').trim().slice(0, expected.length) === expected
    ) || null;
  }
  if (!el) return { located: false, reason: 'PAGE_CHANGED' };
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  const flash = document.createElement('div');
  const r = el.getBoundingClientRect();
  flash.style.cssText = [
    'position:absolute', 'left:' + (r.left + (window.scrollX || 0)) + 'px',
    'top:' + (r.top + (window.scrollY || 0)) + 'px', 'width:' + r.width + 'px',
    'height:' + r.height + 'px', 'background:rgba(99,243,107,.18)',
    'border:2px solid rgba(99,243,107,.85)', 'border-radius:4px',
    'pointer-events:none', 'z-index:2147483000', 'transition:opacity .35s ease'
  ].join(';');
  document.body.appendChild(flash);
  setTimeout(() => { flash.style.opacity = '0'; }, 1400);
  setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 1900);
  return { located: true, tagName: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 160) };
}

if (typeof module !== 'undefined') {
  module.exports = { SCC_TOGGLE_HEADING_OVERLAY, SCC_LOCATE_HEADING, SCC_LOCATE_AUDIT_TARGET };
}
