/**
 * AuditFlux SEO — page analyzer.
 *
 * This entire function is serialized by chrome.scripting.executeScript and run
 * inside the audited tab, so it MUST be self-contained: no references to
 * anything outside its own body. It only reads the DOM and fetches same-origin
 * files (robots.txt, llms.txt, sitemaps). It never writes to the page.
 *
 * Returns plain JSON-serializable facts. All scoring/judgement happens in
 * rules.js — this file only reports what is actually there.
 */
async function SCC_ANALYZE() {
  const GENERIC_ANCHORS = [
    'click here', 'here', 'read more', 'more', 'learn more', 'this', 'link',
    'this link', 'go', 'download', 'view', 'see more', 'continue', 'details',
    'find out more', 'more info', 'more information'
  ];

  const QUESTION_STARTS = [
    'how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'do', 'does',
    'is', 'are', 'should', 'will', 'would', 'could'
  ];

  const AI_BOTS = [
    { name: 'Googlebot', kind: 'search' },
    { name: 'Bingbot', kind: 'search' },
    { name: 'GPTBot', kind: 'ai-training' },
    { name: 'OAI-SearchBot', kind: 'ai-search' },
    { name: 'ChatGPT-User', kind: 'ai-user' },
    { name: 'ClaudeBot', kind: 'ai-training' },
    { name: 'Claude-User', kind: 'ai-user' },
    { name: 'PerplexityBot', kind: 'ai-search' },
    { name: 'Google-Extended', kind: 'ai-training' },
    { name: 'Applebot-Extended', kind: 'ai-training' },
    { name: 'CCBot', kind: 'ai-training' },
    { name: 'meta-externalagent', kind: 'ai-training' }
  ];

  /* ---------------- helpers ---------------- */

  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const attr = (el, a) => (el && el.hasAttribute(a) ? el.getAttribute(a) : null);

  function locatorFor(el, text) {
    if (!el) return null;
    const attributes = {};
    ['id', 'name', 'role', 'aria-label', 'alt', 'href', 'src'].forEach(key => {
      const value = el.getAttribute && el.getAttribute(key);
      if (value) attributes[key] = String(value).slice(0, 240);
    });
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      const tag = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(tag + '#' + node.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')); break; }
      let nth = 1;
      let sibling = node;
      while ((sibling = sibling.previousElementSibling)) if (sibling.tagName === node.tagName) nth += 1;
      parts.unshift(tag + ':nth-of-type(' + nth + ')');
      node = node.parentElement;
    }
    const selector = parts.join(' > ');
    return {
      selector: selector || null,
      tagName: el.tagName ? el.tagName.toLowerCase() : null,
      textSnippet: String(text || txt(el)).slice(0, 240),
      attributeHints: attributes,
    };
  }

  function metaContent(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const c = el.getAttribute('content');
    return c === null ? null : c.trim();
  }

  function absolute(href) {
    try { return new URL(href, document.baseURI).href; } catch (e) { return null; }
  }

  function sameUrl(a, b) {
    if (!a || !b) return false;
    try {
      const ua = new URL(a), ub = new URL(b);
      ua.hash = ''; ub.hash = '';
      const norm = (u) => (u.origin + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
      return norm(ua) === norm(ub);
    } catch (e) { return false; }
  }

  /* ---------------- document basics ---------------- */

  const loc = window.location;
  const origin = loc.origin;

  let nav = null;
  try { nav = performance.getEntriesByType('navigation')[0] || null; } catch (e) { nav = null; }

  const page = {
    url: loc.href,
    origin: origin,
    path: loc.pathname,
    protocol: loc.protocol,
    isHttps: loc.protocol === 'https:',
    // responseStatus is Chrome 109+; null rather than a guess if unavailable.
    httpStatus: nav && typeof nav.responseStatus === 'number' && nav.responseStatus > 0
      ? nav.responseStatus : null,
    ttfbMs: nav && nav.responseStart && nav.requestStart
      ? Math.round(nav.responseStart - nav.requestStart) : null,
    domLoadMs: nav && nav.domContentLoadedEventEnd
      ? Math.round(nav.domContentLoadedEventEnd) : null,
    domNodes: document.getElementsByTagName('*').length,
    charset: document.characterSet || null,
    lang: attr(document.documentElement, 'lang'),
    dir: attr(document.documentElement, 'dir')
  };

  /* ---------------- head / on-page ---------------- */

  const titleEl = document.querySelector('head title');
  const titleText = titleEl ? txt(titleEl) : null;

  const canonicalEls = Array.from(document.querySelectorAll('link[rel~="canonical" i]'));
  const canonicalHref = canonicalEls.length ? absolute(canonicalEls[0].getAttribute('href') || '') : null;

  const metaDesc = metaContent('meta[name="description" i]');
  const robotsMeta = metaContent('meta[name="robots" i]');
  const googlebotMeta = metaContent('meta[name="googlebot" i]');
  const robotsTokens = (robotsMeta || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const googlebotTokens = (googlebotMeta || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  const head = {
    title: titleText,
    titleLength: titleText ? titleText.length : 0,
    titleCount: document.querySelectorAll('head title').length,
    metaDescription: metaDesc,
    metaDescriptionLength: metaDesc ? metaDesc.length : 0,
    canonical: canonicalHref,
    canonicalCount: canonicalEls.length,
    canonicalIsSelf: sameUrl(canonicalHref, loc.href),
    robotsMeta: robotsMeta,
    googlebotMeta: googlebotMeta,
    noindex: robotsTokens.includes('noindex') || googlebotTokens.includes('noindex'),
    nofollow: robotsTokens.includes('nofollow') || googlebotTokens.includes('nofollow'),
    viewport: metaContent('meta[name="viewport" i]'),
    favicon: (() => {
      const f = document.querySelector('link[rel~="icon" i]');
      return f ? absolute(f.getAttribute('href') || '') : null;
    })(),
    hreflang: Array.from(document.querySelectorAll('link[rel="alternate" i][hreflang]')).map(l => ({
      hreflang: l.getAttribute('hreflang'),
      href: absolute(l.getAttribute('href') || '')
    })),
    amp: (() => {
      const a = document.querySelector('link[rel="amphtml" i]');
      return a ? absolute(a.getAttribute('href') || '') : null;
    })(),
    prev: (() => { const p = document.querySelector('link[rel="prev" i]'); return p ? absolute(p.getAttribute('href') || '') : null; })(),
    next: (() => { const n = document.querySelector('link[rel="next" i]'); return n ? absolute(n.getAttribute('href') || '') : null; })()
  };

  /* ---------------- social ---------------- */

  const social = {
    ogTitle: metaContent('meta[property="og:title" i]'),
    ogDescription: metaContent('meta[property="og:description" i]'),
    ogImage: metaContent('meta[property="og:image" i]'),
    ogType: metaContent('meta[property="og:type" i]'),
    ogUrl: metaContent('meta[property="og:url" i]'),
    ogSiteName: metaContent('meta[property="og:site_name" i]'),
    twitterCard: metaContent('meta[name="twitter:card" i]'),
    twitterTitle: metaContent('meta[name="twitter:title" i]'),
    twitterImage: metaContent('meta[name="twitter:image" i]')
  };

  /* ---------------- headings ---------------- */

  const headingEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headings = headingEls.map((el, i) => {
    const t = txt(el);
    const first = t.split(' ')[0] || '';
    return {
      index: i,
      level: Number(el.tagName.substring(1)),
      text: t.slice(0, 300),
      length: t.length,
      empty: t.length === 0,
      isQuestion: t.endsWith('?') || QUESTION_STARTS.indexOf(first.toLowerCase()) !== -1,
      locator: locatorFor(el, t)
    };
  });

  const headingSkips = [];
  let lastLevel = 0;
  headings.forEach(h => {
    if (lastLevel && h.level > lastLevel + 1) {
      headingSkips.push({ from: lastLevel, to: h.level, text: h.text });
    }
    lastLevel = h.level;
  });

  const headingTextCounts = {};
  headings.forEach(h => {
    if (!h.text) return;
    const k = h.text.toLowerCase();
    headingTextCounts[k] = (headingTextCounts[k] || 0) + 1;
  });
  const duplicateHeadings = Object.keys(headingTextCounts)
    .filter(k => headingTextCounts[k] > 1)
    .map(k => ({ text: k, count: headingTextCounts[k] }));

  const headingStats = {
    total: headings.length,
    h1: headings.filter(h => h.level === 1).length,
    h2: headings.filter(h => h.level === 2).length,
    h3: headings.filter(h => h.level === 3).length,
    h4plus: headings.filter(h => h.level >= 4).length,
    empty: headings.filter(h => h.empty).length,
    questions: headings.filter(h => h.isQuestion && h.level >= 2).length,
    skips: headingSkips,
    duplicates: duplicateHeadings,
    h1Texts: headings.filter(h => h.level === 1).map(h => h.text)
  };

  /* ---------------- content ---------------- */

  const contentRoot = document.querySelector('main, article, [role="main"]') || document.body;
  let contentClone = null;
  try {
    contentClone = contentRoot.cloneNode(true);
    contentClone.querySelectorAll('script,style,noscript,template,svg,nav,footer,header,aside,form')
      .forEach(n => n.remove());
  } catch (e) { contentClone = null; }

  const contentText = contentClone ? (contentClone.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const words = contentText ? contentText.split(' ').filter(w => /[a-z0-9\u00c0-\uffff]/i.test(w)) : [];

  const paragraphs = Array.from((contentClone || document.body).querySelectorAll('p'))
    .map(p => (p.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 0);

  const content = {
    wordCount: words.length,
    charCount: contentText.length,
    contentRoot: contentRoot === document.body ? 'body' : contentRoot.tagName.toLowerCase(),
    paragraphs: paragraphs.length,
    avgParagraphWords: paragraphs.length
      ? Math.round(paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0) / paragraphs.length) : 0,
    lists: (contentClone || document.body).querySelectorAll('ul,ol').length,
    listItems: (contentClone || document.body).querySelectorAll('li').length,
    tables: (contentClone || document.body).querySelectorAll('table').length,
    blockquotes: (contentClone || document.body).querySelectorAll('blockquote').length,
    // A short lead paragraph directly under a question heading reads as a direct answer.
    firstParagraphWords: paragraphs.length ? paragraphs[0].split(/\s+/).length : 0,
    timeElements: Array.from(document.querySelectorAll('time[datetime]')).map(t => t.getAttribute('datetime')).slice(0, 10),
    publishedMeta: metaContent('meta[property="article:published_time" i]'),
    modifiedMeta: metaContent('meta[property="article:modified_time" i]'),
    authorMeta: metaContent('meta[name="author" i]'),
    authorRel: !!document.querySelector('[rel="author" i], [itemprop="author" i], .author, .byline')
  };

  /* ---------------- links ---------------- */

  const anchorEls = Array.from(document.querySelectorAll('a[href]'));
  const links = [];
  anchorEls.forEach(a => {
    const raw = a.getAttribute('href') || '';
    if (/^(javascript:|mailto:|tel:|#|data:)/i.test(raw.trim())) {
      links.push({
        href: raw, absolute: null, anchor: txt(a).slice(0, 200), type: 'other',
        rel: attr(a, 'rel') || '', nofollow: false, sponsored: false, ugc: false,
        target: attr(a, 'target'), hasImageOnly: !txt(a) && !!a.querySelector('img'),
        locator: locatorFor(a, txt(a))
      });
      return;
    }
    const abs = absolute(raw);
    if (!abs) return;
    let type = 'external';
    try { type = new URL(abs).origin === origin ? 'internal' : 'external'; } catch (e) {}
    const rel = (attr(a, 'rel') || '').toLowerCase();
    const anchorText = txt(a);
    links.push({
      href: raw,
      absolute: abs,
      anchor: anchorText.slice(0, 200),
      type: type,
      rel: rel,
      nofollow: rel.split(/\s+/).indexOf('nofollow') !== -1,
      sponsored: rel.split(/\s+/).indexOf('sponsored') !== -1,
      ugc: rel.split(/\s+/).indexOf('ugc') !== -1,
      target: attr(a, 'target'),
      hasImageOnly: !anchorText && !!a.querySelector('img'),
      locator: locatorFor(a, anchorText)
    });
  });

  const internalLinks = links.filter(l => l.type === 'internal');
  const externalLinks = links.filter(l => l.type === 'external');
  const genericAnchors = links.filter(l =>
    l.anchor && GENERIC_ANCHORS.indexOf(l.anchor.toLowerCase().replace(/[^a-z ]/g, '').trim()) !== -1
  );
  const emptyAnchors = links.filter(l => !l.anchor && !l.hasImageOnly && l.type !== 'other');

  const externalDomains = {};
  externalLinks.forEach(l => {
    try { const h = new URL(l.absolute).hostname; externalDomains[h] = (externalDomains[h] || 0) + 1; } catch (e) {}
  });

  const linkStats = {
    total: links.length,
    internal: internalLinks.length,
    external: externalLinks.length,
    uniqueInternal: new Set(internalLinks.map(l => l.absolute)).size,
    nofollow: links.filter(l => l.nofollow).length,
    sponsored: links.filter(l => l.sponsored).length,
    ugc: links.filter(l => l.ugc).length,
    generic: genericAnchors.length,
    genericSamples: genericAnchors.slice(0, 10).map(l => ({ anchor: l.anchor, href: l.absolute })),
    emptyAnchors: emptyAnchors.length,
    emptyAnchorSamples: emptyAnchors.slice(0, 10).map(l => ({ href: l.absolute })),
    externalDomains: Object.keys(externalDomains).length,
    topExternalDomains: Object.keys(externalDomains)
      .map(d => ({ domain: d, count: externalDomains[d] }))
      .sort((a, b) => b.count - a.count).slice(0, 12),
    targetBlankNoRel: links.filter(l => l.target === '_blank' && l.rel.indexOf('noopener') === -1).length
  };

  /* ---------------- images ---------------- */

  const imgEls = Array.from(document.querySelectorAll('img'));
  const images = imgEls.map(img => {
    const src = img.currentSrc || img.getAttribute('src') || '';
    const abs = src ? absolute(src) : null;
    let format = null;
    if (abs) {
      const m = abs.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
      format = m ? m[1].toLowerCase() : null;
    }
    const altAttr = img.getAttribute('alt');
    return {
      src: abs,
      alt: altAttr,
      altMissing: altAttr === null,
      altEmpty: altAttr !== null && altAttr.trim() === '',
      altLength: altAttr ? altAttr.length : 0,
      widthAttr: img.getAttribute('width'),
      heightAttr: img.getAttribute('height'),
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
      displayWidth: Math.round(img.clientWidth || 0),
      displayHeight: Math.round(img.clientHeight || 0),
      loading: img.getAttribute('loading'),
      srcset: !!img.getAttribute('srcset'),
      format: format,
      // complete + zero natural size means the fetch failed.
      broken: img.complete && img.naturalWidth === 0 && !!src,
      locator: locatorFor(img, altAttr || '')
    };
  });

  const withAlt = images.filter(i => !i.altMissing && !i.altEmpty);
  const imageStats = {
    total: images.length,
    altMissing: images.filter(i => i.altMissing).length,
    altEmpty: images.filter(i => i.altEmpty).length,
    altPresent: withAlt.length,
    altCoverage: images.length ? Math.round((withAlt.length / images.length) * 100) : null,
    altTooLong: images.filter(i => i.altLength > 125).length,
    missingDimensions: images.filter(i => !i.widthAttr || !i.heightAttr).length,
    lazy: images.filter(i => i.loading === 'lazy').length,
    srcset: images.filter(i => i.srcset).length,
    broken: images.filter(i => i.broken).length,
    nextGen: images.filter(i => i.format === 'webp' || i.format === 'avif').length,
    // Rendered much smaller than the file's real pixels = wasted bytes.
    oversized: images.filter(i =>
      i.naturalWidth > 0 && i.displayWidth > 0 && i.naturalWidth > i.displayWidth * 2
    ).length
  };

  /* ---------------- structured data ---------------- */

  const jsonLdBlocks = [];
  Array.from(document.querySelectorAll('script[type="application/ld+json" i]')).forEach((s, i) => {
    const raw = (s.textContent || '').trim();
    const block = { index: i, bytes: raw.length, valid: false, error: null, types: [], hasContext: false };
    try {
      const parsed = JSON.parse(raw);
      block.valid = true;
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(collect); return; }
        if (node['@context']) block.hasContext = true;
        if (node['@type']) {
          const t = node['@type'];
          (Array.isArray(t) ? t : [t]).forEach(x => {
            if (typeof x === 'string' && block.types.indexOf(x) === -1) block.types.push(x);
          });
        }
        if (node['@graph']) collect(node['@graph']);
        Object.keys(node).forEach(k => {
          if (k !== '@graph' && node[k] && typeof node[k] === 'object') collect(node[k]);
        });
      };
      collect(parsed);
      block.sameAs = JSON.stringify(parsed).indexOf('"sameAs"') !== -1;
      block.hasAuthor = JSON.stringify(parsed).indexOf('"author"') !== -1;
      block.hasDatePublished = JSON.stringify(parsed).indexOf('"datePublished"') !== -1;
      block.hasDateModified = JSON.stringify(parsed).indexOf('"dateModified"') !== -1;
    } catch (e) {
      block.error = String(e.message || e).slice(0, 200);
    }
    jsonLdBlocks.push(block);
  });

  const allTypes = [];
  jsonLdBlocks.forEach(b => b.types.forEach(t => { if (allTypes.indexOf(t) === -1) allTypes.push(t); }));

  const microdataTypes = Array.from(document.querySelectorAll('[itemtype]'))
    .map(el => (el.getAttribute('itemtype') || '').split('/').pop())
    .filter(Boolean);

  const schema = {
    jsonLdBlocks: jsonLdBlocks.length,
    invalidBlocks: jsonLdBlocks.filter(b => !b.valid).length,
    missingContext: jsonLdBlocks.filter(b => b.valid && !b.hasContext).length,
    missingType: jsonLdBlocks.filter(b => b.valid && b.types.length === 0).length,
    types: allTypes,
    blocks: jsonLdBlocks,
    microdataTypes: Array.from(new Set(microdataTypes)).slice(0, 20),
    rdfaCount: document.querySelectorAll('[typeof]').length,
    hasSameAs: jsonLdBlocks.some(b => b.sameAs),
    hasAuthor: jsonLdBlocks.some(b => b.hasAuthor),
    hasDatePublished: jsonLdBlocks.some(b => b.hasDatePublished),
    hasDateModified: jsonLdBlocks.some(b => b.hasDateModified)
  };

  /* ---------------- tracking / tech ---------------- */

  const scripts = Array.from(document.querySelectorAll('script'));
  const scriptSrcs = scripts.map(s => s.getAttribute('src') || '').join(' ');
  const inlineScripts = scripts.filter(s => !s.getAttribute('src'))
    .map(s => (s.textContent || '').slice(0, 4000)).join(' ');
  const haystack = (scriptSrcs + ' ' + inlineScripts).toLowerCase();

  const tracking = [
    { name: 'Google Tag Manager', found: haystack.indexOf('googletagmanager.com/gtm.js') !== -1 || haystack.indexOf('gtm-') !== -1 },
    { name: 'Google Analytics 4', found: /gtag\/js\?id=g-|['"]g-[a-z0-9]{6,}['"]/i.test(haystack) },
    { name: 'Google Ads / gtag', found: haystack.indexOf('googletagmanager.com/gtag/js') !== -1 },
    { name: 'Meta Pixel', found: haystack.indexOf('connect.facebook.net') !== -1 || haystack.indexOf('fbq(') !== -1 },
    { name: 'Microsoft Clarity', found: haystack.indexOf('clarity.ms') !== -1 },
    { name: 'Hotjar', found: haystack.indexOf('hotjar') !== -1 },
    { name: 'Matomo', found: haystack.indexOf('matomo') !== -1 || haystack.indexOf('piwik') !== -1 },
    { name: 'Segment', found: haystack.indexOf('cdn.segment.com') !== -1 },
    { name: 'LinkedIn Insight', found: haystack.indexOf('snap.licdn.com') !== -1 },
    { name: 'TikTok Pixel', found: haystack.indexOf('analytics.tiktok.com') !== -1 }
  ];

  let mixedContent = [];
  if (page.isHttps) {
    const grab = (sel, a) => Array.from(document.querySelectorAll(sel))
      .map(el => el.getAttribute(a) || '')
      .filter(v => /^http:\/\//i.test(v));
    mixedContent = grab('img[src]', 'src')
      .concat(grab('script[src]', 'src'))
      .concat(grab('link[href]', 'href'))
      .concat(grab('iframe[src]', 'src'))
      .slice(0, 20);
  }

  const tech = {
    tracking: tracking,
    mixedContent: mixedContent,
    mixedContentCount: mixedContent.length,
    iframes: document.querySelectorAll('iframe').length,
    inlineStyles: document.querySelectorAll('[style]').length,
    scripts: scripts.length,
    stylesheets: document.querySelectorAll('link[rel="stylesheet" i]').length
  };

  /* ---------------- robots.txt ---------------- */

  function parseRobots(text) {
    const groups = [];
    const sitemaps = [];
    let current = null;
    let lastWasAgent = false;

    text.split(/\r?\n/).forEach(rawLine => {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) return;
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();

      if (field === 'user-agent') {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [], crawlDelay: null };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
      } else if (field === 'disallow' || field === 'allow') {
        if (!current) { current = { agents: ['*'], rules: [], crawlDelay: null }; groups.push(current); }
        current.rules.push({ type: field, path: value });
        lastWasAgent = false;
      } else if (field === 'crawl-delay') {
        if (current) current.crawlDelay = value;
        lastWasAgent = false;
      } else if (field === 'sitemap') {
        sitemaps.push(value);
        lastWasAgent = false;
      } else {
        lastWasAgent = false;
      }
    });
    return { groups: groups, sitemaps: sitemaps };
  }

  function ruleMatches(path, pattern) {
    if (pattern === '') return false;
    let anchored = false;
    let p = pattern;
    if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp('^' + escaped + (anchored ? '$' : ''));
    return re.test(path);
  }

  function robotsVerdict(parsed, agent, path) {
    const lower = agent.toLowerCase();
    let group = parsed.groups.find(g => g.agents.indexOf(lower) !== -1);
    let source = 'specific';
    if (!group) {
      group = parsed.groups.find(g => g.agents.indexOf('*') !== -1);
      source = group ? 'wildcard' : 'none';
    }
    if (!group) return { allowed: true, source: 'none', rule: null };

    let best = null;
    group.rules.forEach(r => {
      if (r.path === '' && r.type === 'disallow') return; // "Disallow:" empty = allow all
      if (!ruleMatches(path, r.path)) return;
      if (!best || r.path.length > best.path.length ||
        (r.path.length === best.path.length && r.type === 'allow')) {
        best = r;
      }
    });
    if (!best) return { allowed: true, source: source, rule: null };
    return { allowed: best.type === 'allow', source: source, rule: best.type + ': ' + best.path };
  }

  async function fetchText(url, cap) {
    try {
      const res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let body = '';
      if (res.ok) {
        body = await res.text();
        if (cap && body.length > cap) body = body.slice(0, cap);
      }
      return { ok: res.ok, status: res.status, contentType: ct, body: body, url: res.url, error: null };
    } catch (e) {
      return { ok: false, status: null, contentType: '', body: '', url: url, error: String(e.message || e) };
    }
  }

  // Some servers answer 200 with an HTML page for files that don't exist.
  function looksLikeHtml(res) {
    if (res.contentType.indexOf('text/html') !== -1) return true;
    return /^\s*(<!doctype html|<html)/i.test(res.body);
  }

  const robotsRes = await fetchText(origin + '/robots.txt', 200000);
  const robots = {
    status: robotsRes.status,
    fetched: robotsRes.ok,
    error: robotsRes.error,
    isHtml: robotsRes.ok ? looksLikeHtml(robotsRes) : false,
    raw: robotsRes.ok ? robotsRes.body.slice(0, 20000) : '',
    sitemaps: [],
    groups: 0,
    bots: [],
    pageAllowed: null
  };

  if (robots.fetched && !robots.isHtml) {
    const parsed = parseRobots(robotsRes.body);
    robots.sitemaps = parsed.sitemaps;
    robots.groups = parsed.groups.length;
    robots.bots = AI_BOTS.map(b => {
      const v = robotsVerdict(parsed, b.name, page.path);
      return {
        name: b.name, kind: b.kind, allowed: v.allowed,
        source: v.source, rule: v.rule
      };
    });
    const googleVerdict = robotsVerdict(parsed, 'Googlebot', page.path);
    robots.pageAllowed = googleVerdict.allowed;
  } else if (robots.status === 404) {
    // No robots.txt means everything is crawlable.
    robots.bots = AI_BOTS.map(b => ({ name: b.name, kind: b.kind, allowed: true, source: 'no-robots', rule: null }));
    robots.pageAllowed = true;
  }

  /* ---------------- llms.txt ---------------- */

  const llmsFiles = [];
  for (const name of ['/llms.txt', '/llms-full.txt']) {
    const r = await fetchText(origin + name, 5000);
    let state = 'MISSING';
    if (r.error) state = 'UNREACHABLE';
    else if (r.ok && !looksLikeHtml(r)) state = 'FOUND';
    llmsFiles.push({ file: name, state: state, status: r.status, bytes: r.body.length });
  }

  /* ---------------- sitemaps ---------------- */

  const candidates = [];
  robots.sitemaps.forEach(s => { if (candidates.indexOf(s) === -1) candidates.push(s); });
  [origin + '/sitemap.xml', origin + '/sitemap_index.xml'].forEach(s => {
    if (candidates.indexOf(s) === -1) candidates.push(s);
  });

  const sitemaps = [];
  for (const url of candidates.slice(0, 4)) {
    const r = await fetchText(url, 2000000);
    const entry = {
      url: url, status: r.status, ok: r.ok, error: r.error,
      isIndex: false, urlCount: null, valid: null, declaredInRobots: robots.sitemaps.indexOf(url) !== -1
    };
    if (r.ok && !looksLikeHtml(r)) {
      try {
        const doc = new DOMParser().parseFromString(r.body, 'application/xml');
        const parseError = doc.querySelector('parsererror');
        entry.valid = !parseError;
        if (!parseError) {
          entry.isIndex = !!doc.querySelector('sitemapindex');
          entry.urlCount = doc.querySelectorAll('url > loc, sitemap > loc').length;
        }
      } catch (e) { entry.valid = false; }
    } else if (r.ok) {
      entry.valid = false; // served HTML instead of XML
    }
    sitemaps.push(entry);
  }

  /* ---------------- response headers + served source ---------------- */

  /**
   * Refetches the current URL same-origin. Same-origin responses expose every
   * header, so this is how we read real security headers rather than guessing.
   * It also gives us the HTML the server actually sent, which is a different
   * artifact from the rendered DOM — useful on its own for spotting
   * client-rendered content.
   */
  const MAX_SOURCE_BYTES = 1500000;
  let source = {
    fetched: false, status: null, error: null, html: '', bytes: 0,
    truncated: false, headers: {}
  };

  try {
    const res = await fetch(loc.href, { credentials: 'include', redirect: 'follow' });
    const headers = {};
    res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
    let html = await res.text();
    const bytes = html.length;
    const truncated = bytes > MAX_SOURCE_BYTES;
    if (truncated) html = html.slice(0, MAX_SOURCE_BYTES);
    source = { fetched: res.ok, status: res.status, url: res.url, error: null, html, bytes, truncated, headers };
  } catch (e) {
    source.error = String(e.message || e);
  }

  const h = source.headers;
  const headerCheck = (key, present) => ({
    name: key,
    value: h[key] || null,
    present: present !== undefined ? present : !!h[key]
  });

  const cspValue = h['content-security-policy'] || null;
  const security = {
    available: source.fetched,
    hsts: headerCheck('strict-transport-security'),
    csp: headerCheck('content-security-policy'),
    contentTypeOptions: headerCheck('x-content-type-options'),
    referrerPolicy: headerCheck('referrer-policy'),
    permissionsPolicy: headerCheck('permissions-policy'),
    // frame-ancestors in CSP supersedes X-Frame-Options.
    frameOptions: {
      name: 'x-frame-options',
      value: h['x-frame-options'] || null,
      present: !!h['x-frame-options'] || !!(cspValue && cspValue.indexOf('frame-ancestors') !== -1)
    },
    server: h['server'] || null,
    cacheControl: h['cache-control'] || null,
    xRobotsTag: h['x-robots-tag'] || null
  };

  /* ---------------- page type detection ---------------- */

  /**
   * Used to make schema recommendations contextual instead of listing every
   * type for every page. Signals are ranked, first match wins.
   */
  function detectPageType() {
    const types = schema.types.map(t => t.toLowerCase());
    const path = loc.pathname.toLowerCase();
    const bodyText = (document.body.textContent || '').toLowerCase().slice(0, 20000);
    const reasons = [];

    if (types.indexOf('product') !== -1) { reasons.push('Product schema present'); return { type: 'product', reasons }; }
    if (types.indexOf('localbusiness') !== -1) { reasons.push('LocalBusiness schema present'); return { type: 'localbusiness', reasons }; }
    if (types.indexOf('article') !== -1 || types.indexOf('blogposting') !== -1) {
      reasons.push('Article schema present'); return { type: 'article', reasons };
    }

    if (loc.pathname === '/' || loc.pathname === '') { reasons.push('Root URL'); return { type: 'homepage', reasons }; }

    if (/\/(product|products|shop|item|p)\//.test(path) ||
        document.querySelector('[itemprop="price"], .price, .add-to-cart, [class*="add-to-cart"]')) {
      reasons.push('Product URL pattern or price/cart element');
      return { type: 'product', reasons };
    }
    if (/\/(blog|news|article|post|posts)\//.test(path) || document.querySelector('article time, article [rel="author"]')) {
      reasons.push('Article URL pattern or article metadata');
      return { type: 'article', reasons };
    }
    if (/\/(service|services|solutions)\//.test(path)) { reasons.push('Service URL pattern'); return { type: 'service', reasons }; }
    if (/\/(contact|about|location)/.test(path) &&
        /\b(opening hours|address|phone|call us)\b/.test(bodyText)) {
      reasons.push('Contact page with business details');
      return { type: 'localbusiness', reasons };
    }
    if (/\/(category|collection|categories|tag)\//.test(path)) { reasons.push('Category URL pattern'); return { type: 'category', reasons }; }
    reasons.push('No stronger signal detected');
    return { type: 'generic', reasons };
  }

  const pageType = detectPageType();

  /**
   * SPA detection. Comparing the served HTML to the rendered DOM is the honest
   * test: if the server sent far less text than the browser now shows, the
   * content is being built client-side, which affects how crawlers see it.
   */
  const spa = (() => {
    if (!source.fetched || !source.html) return { detected: false, reason: 'Source not available', confidence: 'unknown' };
    const servedText = source.html.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const servedWords = servedText ? servedText.split(' ').length : 0;
    const renderedWords = words.length;
    const frameworkHints = /__NEXT_DATA__|data-reactroot|ng-version|data-vue|__NUXT__|svelte-/i.test(source.html);
    const bigGap = renderedWords > 50 && servedWords < renderedWords * 0.4;
    return {
      detected: bigGap || frameworkHints,
      servedWords: servedWords,
      renderedWords: renderedWords,
      frameworkHints: frameworkHints,
      confidence: bigGap && frameworkHints ? 'high' : (bigGap || frameworkHints) ? 'medium' : 'low',
      reason: bigGap
        ? 'Served HTML contains much less text than the rendered page'
        : frameworkHints ? 'JavaScript framework markers found in source' : 'No strong SPA signals'
    };
  })();

  /* ---------------- LIVE BROWSER OBSERVATION ---------------- */

  /**
   * Layer A of three. Everything here is measured from the page currently open
   * in this browser, on this connection and device. It is never Lighthouse lab
   * data and never CrUX field data — those are separate services and live in
   * separate code paths.
   *
   * Why PerformanceObserver rather than getEntriesByType: LCP, layout-shift and
   * event-timing entries are NOT retrievable through getEntriesByType in Chrome.
   * They are only delivered to an observer, and `buffered: true` replays entries
   * that occurred before the observer existed. That distinction is the reason
   * LCP previously reported "Unavailable" on pages that clearly had an LCP.
   */
  const supportsEntry = (type) => {
    try {
      return typeof PerformanceObserver !== 'undefined' &&
        Array.isArray(PerformanceObserver.supportedEntryTypes) &&
        PerformanceObserver.supportedEntryTypes.indexOf(type) !== -1;
    } catch (e) { return false; }
  };

  /**
   * Collects buffered entries of one type. Resolves null when the entry type is
   * not supported at all, which is different from "supported but nothing
   * happened" — an empty array. Conflating those is how a browser that cannot
   * measure something gets scored as perfect.
   */
  function collectBuffered(type, waitMs, extraOptions) {
    if (!supportsEntry(type)) return Promise.resolve(null);
    return new Promise(resolve => {
      const entries = [];
      let observer = null;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { if (observer) observer.disconnect(); } catch (e) {}
        resolve(entries);
      };
      try {
        observer = new PerformanceObserver(list => {
          try { list.getEntries().forEach(e => entries.push(e)); } catch (e) {}
        });
        observer.observe(Object.assign({ type: type, buffered: true }, extraOptions || {}));
      } catch (e) { resolve(null); return; }
      setTimeout(finish, waitMs);
    });
  }

  // Gathered together so the observers share one waiting window.
  const OBSERVE_MS = 350;
  const [paintEntries, lcpEntries, shiftEntries, eventEntries, longTaskEntries] = await Promise.all([
    collectBuffered('paint', OBSERVE_MS),
    collectBuffered('largest-contentful-paint', OBSERVE_MS),
    collectBuffered('layout-shift', OBSERVE_MS),
    collectBuffered('event', OBSERVE_MS, { durationThreshold: 16 }),
    collectBuffered('longtask', OBSERVE_MS)
  ]);

  /**
   * Every live metric is wrapped with an explicit availability state so the UI
   * never has to guess why a number is missing:
   *   measured        — we have a real value
   *   not-measurable  — the browser reported no entry for this page session
   *   unsupported     — this browser does not implement the API
   *   needs-interaction — valid, but requires the user to interact first
   */
  const liveMetric = (value, state, reason) => ({
    value: value === undefined ? null : value,
    state: state,
    reason: reason || null
  });

  // --- FCP (paint observer) ---
  let fcp;
  if (paintEntries === null) {
    fcp = liveMetric(null, 'unsupported', 'This browser does not report paint timing.');
  } else {
    const entry = paintEntries.find(e => e.name === 'first-contentful-paint');
    fcp = entry
      ? liveMetric(Math.round(entry.startTime), 'measured')
      : liveMetric(null, 'not-measurable', 'No first-contentful-paint entry was reported for this page session.');
  }

  let firstPaint = null;
  if (paintEntries) {
    const fp = paintEntries.find(e => e.name === 'first-paint');
    if (fp) firstPaint = Math.round(fp.startTime);
  }

  // --- LCP (last entry wins; LCP is revised upward as bigger elements render) ---
  let lcp;
  if (lcpEntries === null) {
    lcp = liveMetric(null, 'unsupported', 'This browser does not report largest-contentful-paint.');
  } else if (!lcpEntries.length) {
    lcp = liveMetric(null, 'not-measurable',
      'No LCP entry was reported by this page or browser session. This is normal for pages with no qualifying content element, and for navigations that finished before measurement began.');
  } else {
    const last = lcpEntries[lcpEntries.length - 1];
    lcp = liveMetric(Math.round(last.startTime), 'measured');
    lcp.element = last.element && last.element.tagName ? last.element.tagName.toLowerCase() : null;
    lcp.size = last.size || null;
    lcp.url = last.url || null;
  }

  // --- CLS (sum of shifts not attributable to recent user input) ---
  let cls;
  if (shiftEntries === null) {
    cls = liveMetric(null, 'unsupported', 'This browser does not report layout-shift.');
  } else {
    const counted = shiftEntries.filter(s => !s.hadRecentInput);
    const total = counted.reduce((sum, s) => sum + (s.value || 0), 0);
    cls = liveMetric(Number(total.toFixed(4)), 'measured');
    cls.shiftCount = counted.length;
    cls.ignoredAfterInput = shiftEntries.length - counted.length;
  }

  // --- INP (approximated from event timing; needs real interactions) ---
  let inp;
  if (eventEntries === null) {
    inp = liveMetric(null, 'unsupported', 'This browser does not report event timing.');
  } else {
    const interactions = eventEntries.filter(e => e.interactionId > 0);
    if (!interactions.length) {
      inp = liveMetric(null, 'needs-interaction',
        'INP requires interaction data from this page session. Click or type on the page, then re-scan.');
    } else {
      // The worst interaction is the standard approximation for a short session.
      const worst = interactions.reduce((m, e) => e.duration > m.duration ? e : m, interactions[0]);
      inp = liveMetric(Math.round(worst.duration), 'measured',
        'Approximated from the slowest of ' + interactions.length + ' interaction(s) in this session.');
      inp.interactionCount = interactions.length;
      inp.slowestType = worst.name || null;
    }
  }

  // --- long tasks ---
  const longTasks = longTaskEntries === null
    ? liveMetric(null, 'unsupported', 'This browser does not report long tasks.')
    : liveMetric({ count: longTaskEntries.length, totalMs: Math.round(longTaskEntries.reduce((s, t) => s + t.duration, 0)) }, 'measured');

  // --- navigation timing (connection phases) ---
  const navPhase = (a, b) => nav && typeof nav[a] === 'number' && typeof nav[b] === 'number' && nav[b] >= nav[a]
    ? Math.round(nav[b] - nav[a]) : null;

  const navTiming = {
    ttfb: page.ttfbMs,
    dns: navPhase('domainLookupStart', 'domainLookupEnd'),
    tcp: navPhase('connectStart', 'connectEnd'),
    tls: nav && nav.secureConnectionStart ? navPhase('secureConnectionStart', 'connectEnd') : null,
    request: navPhase('requestStart', 'responseStart'),
    response: navPhase('responseStart', 'responseEnd'),
    domContentLoaded: nav && nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    load: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
    transferBytes: nav && typeof nav.transferSize === 'number' && nav.transferSize > 0 ? nav.transferSize : null,
    type: nav ? nav.type : null
  };

  /* ---------------- resource timing ---------------- */

  const RESOURCE_KIND = {
    script: 'JavaScript', css: 'CSS', link: 'CSS', img: 'Images', image: 'Images',
    font: 'Fonts', video: 'Media', audio: 'Media', fetch: 'Fetch/XHR',
    xmlhttprequest: 'Fetch/XHR', iframe: 'Frames', navigation: 'HTML', other: 'Other'
  };

  const resources = [];
  const resourceTotals = {};
  let thirdPartyBytes = 0, thirdPartyCount = 0, knownBytes = 0;

  try {
    performance.getEntriesByType('resource').forEach(r => {
      let kind = RESOURCE_KIND[r.initiatorType] || 'Other';
      // initiatorType 'link' covers stylesheets, preloads and fonts alike.
      if (r.initiatorType === 'link' && /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(r.name)) kind = 'Fonts';
      if (r.initiatorType === 'css' && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(r.name)) kind = 'Images';

      // transferSize is 0 for cross-origin responses without Timing-Allow-Origin.
      // That means "unknown", not "free", so it is reported as null.
      const transfer = typeof r.transferSize === 'number' && r.transferSize > 0 ? r.transferSize : null;
      const decoded = typeof r.decodedBodySize === 'number' && r.decodedBodySize > 0 ? r.decodedBodySize : null;
      let crossOrigin = false;
      try { crossOrigin = new URL(r.name).origin !== origin; } catch (e) {}

      const entry = {
        url: r.name, kind: kind, initiator: r.initiatorType || 'other',
        durationMs: Math.round(r.duration),
        startMs: Math.round(r.startTime),
        transferBytes: transfer, decodedBytes: decoded,
        cached: typeof r.transferSize === 'number' && r.transferSize === 0 && decoded > 0,
        crossOrigin: crossOrigin,
        // Blocking candidates: same-document CSS/JS that started before first paint.
        renderBlockingCandidate: (kind === 'CSS' || kind === 'JavaScript') &&
          fcp.value !== null && r.startTime < fcp.value
      };
      resources.push(entry);

      if (transfer !== null) knownBytes += transfer;
      if (crossOrigin) { thirdPartyCount++; if (transfer !== null) thirdPartyBytes += transfer; }

      const t = resourceTotals[kind] || { count: 0, bytes: 0, bytesKnown: 0, durationMs: 0 };
      t.count++; t.durationMs += Math.round(r.duration);
      if (transfer !== null) { t.bytes += transfer; t.bytesKnown++; }
      resourceTotals[kind] = t;
    });
  } catch (e) {}

  const bySize = resources.filter(r => r.transferBytes !== null)
    .sort((a, b) => b.transferBytes - a.transferBytes);
  const bySlowest = resources.slice().sort((a, b) => b.durationMs - a.durationMs);

  const resourceSummary = {
    count: resources.length,
    knownTransferBytes: knownBytes,
    unknownSizeCount: resources.filter(r => r.transferBytes === null).length,
    thirdPartyCount: thirdPartyCount,
    thirdPartyBytes: thirdPartyBytes,
    byKind: Object.keys(resourceTotals).map(k => ({ kind: k, ...resourceTotals[k] })),
    largest: bySize.slice(0, 10),
    slowest: bySlowest.slice(0, 10),
    renderBlockingCandidates: resources.filter(r => r.renderBlockingCandidate).length
  };

  /**
   * Layer A output. `dataSource` is carried so no consumer can mistake this for
   * Lighthouse or CrUX.
   */
  const live = {
    dataSource: 'LIVE',
    label: 'Live Browser Observation',
    collectedAt: new Date().toISOString(),
    navigationType: navTiming.type,
    ttfb: liveMetric(navTiming.ttfb, navTiming.ttfb === null ? 'not-measurable' : 'measured',
      navTiming.ttfb === null ? 'Navigation Timing was not available for this page.' : null),
    fcp: fcp,
    firstPaint: firstPaint,
    lcp: lcp,
    cls: cls,
    inp: inp,
    longTasks: longTasks,
    timing: navTiming,
    resources: resourceSummary,
    domNodes: page.domNodes
  };

  // Kept for backwards compatibility with existing views and rules.
  const perf = {
    ttfbMs: navTiming.ttfb,
    domContentLoadedMs: navTiming.domContentLoaded,
    loadMs: navTiming.load,
    transferBytes: navTiming.transferBytes,
    firstPaintMs: firstPaint,
    firstContentfulPaintMs: fcp.value,
    largestContentfulPaintMs: lcp.value,
    cumulativeLayoutShift: cls.value,
    interactionToNextPaintMs: inp.value,
    longTasks: longTasks.value,
    resourceCount: resources.length,
    resourceTotals: resourceSummary.byKind,
    domNodes: page.domNodes
  };


  /* ---------------- technology / rendering signals ---------------- */

  const stackHaystack = (source.html || document.documentElement.outerHTML.slice(0, 200000)).toLowerCase();
  const generator = metaContent('meta[name="generator" i]');

  const STACK_TESTS = [
    { name: 'Next.js', test: () => /__next_data__|\/_next\/static/.test(stackHaystack) },
    { name: 'React', test: () => /data-reactroot|react-dom|__react/.test(stackHaystack) || !!document.querySelector('[data-reactroot],#__next') },
    { name: 'Vue', test: () => /__nuxt__|data-v-[a-f0-9]{8}|vue\.runtime/.test(stackHaystack) },
    { name: 'Nuxt', test: () => /__nuxt__/.test(stackHaystack) },
    { name: 'Angular', test: () => /ng-version|angular\.min\.js/.test(stackHaystack) || !!document.querySelector('[ng-version]') },
    { name: 'Svelte', test: () => /svelte-[a-z0-9]{6}/.test(stackHaystack) },
    { name: 'WordPress', test: () => /wp-content|wp-includes|wp-json/.test(stackHaystack) || /wordpress/i.test(generator || '') },
    { name: 'Elementor', test: () => /elementor/.test(stackHaystack) },
    { name: 'Shopify', test: () => /cdn\.shopify\.com|shopify\.theme|myshopify/.test(stackHaystack) },
    { name: 'Webflow', test: () => /webflow/.test(stackHaystack) || /webflow/i.test(generator || '') },
    { name: 'Wix', test: () => /wix\.com|wixstatic|_wixcssimports/.test(stackHaystack) },
    { name: 'Squarespace', test: () => /squarespace/.test(stackHaystack) },
    { name: 'Drupal', test: () => /drupal-settings-json|\/sites\/default\/files/.test(stackHaystack) },
    { name: 'Joomla', test: () => /\/media\/jui\/|joomla/.test(stackHaystack) }
  ];

  const stack = [];
  STACK_TESTS.forEach(t => { try { if (t.test()) stack.push(t.name); } catch (e) {} });

  const rendering = {
    stack: stack,
    generator: generator,
    hasNoscript: document.querySelectorAll('noscript').length > 0,
    noscriptCount: document.querySelectorAll('noscript').length,
    hydrationMarkers: /__next_data__|__nuxt__|data-reactroot|ng-version|window\.__initial_state__/.test(stackHaystack)
  };

  /* ---------------- accessibility signals ---------------- */

  /**
   * Signals only, deliberately not a full accessibility audit: contrast,
   * focus order and screen-reader behaviour cannot be judged from a static
   * DOM read, and claiming otherwise would be misleading.
   */
  const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
    .filter(el => el.type !== 'hidden');
  const unlabelledInputs = inputs.filter(el => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
    if (el.id) {
      // CSS.escape is unavailable in some contexts, so fall back to a manual scan.
      let labelled = false;
      try {
        const sel = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : null;
        labelled = sel ? !!document.querySelector('label[for="' + sel + '"]')
                       : Array.from(document.querySelectorAll('label[for]')).some(l => l.getAttribute('for') === el.id);
      } catch (e) { labelled = false; }
      if (labelled) return false;
    }
    return !el.closest('label');
  });

  const accessibleName = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return true;
    if (el.getAttribute('aria-labelledby')) return true;
    if (el.getAttribute('title')) return true;
    if (txt(el)) return true;
    const img = el.querySelector('img[alt]');
    return !!(img && (img.getAttribute('alt') || '').trim());
  };

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'));
  const namelessButtons = buttons.filter(b => {
    if (b.tagName === 'INPUT') return !(b.getAttribute('value') || '').trim() && !b.getAttribute('aria-label');
    return !accessibleName(b);
  });

  const anchorsForA11y = Array.from(document.querySelectorAll('a[href]'));
  const namelessLinks = anchorsForA11y.filter(a => !accessibleName(a));

  const iframes = Array.from(document.querySelectorAll('iframe'));
  const untitledIframes = iframes.filter(f => !(f.getAttribute('title') || '').trim());

  const accessibility = {
    lang: page.lang,
    viewport: head.viewport,
    // Zoom-blocking is a real accessibility failure and is checkable from the tag.
    blocksZoom: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*(1(\.0)?|0)/i.test(head.viewport || ''),
    inputs: inputs.length,
    unlabelledInputs: unlabelledInputs.length,
    unlabelledInputSamples: unlabelledInputs.slice(0, 8).map(el =>
      (el.tagName.toLowerCase() + (el.type ? '[type=' + el.type + ']' : '') + (el.name ? ' name=' + el.name : ''))),
    buttons: buttons.length,
    namelessButtons: namelessButtons.length,
    links: anchorsForA11y.length,
    namelessLinks: namelessLinks.length,
    iframes: iframes.length,
    untitledIframes: untitledIframes.length,
    ariaRoles: document.querySelectorAll('[role]').length,
    ariaHidden: document.querySelectorAll('[aria-hidden="true"]').length,
    skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href^="#main"], a[href^="#content"]'),
    landmarks: {
      main: document.querySelectorAll('main, [role="main"]').length,
      nav: document.querySelectorAll('nav, [role="navigation"]').length,
      header: document.querySelectorAll('header, [role="banner"]').length,
      footer: document.querySelectorAll('footer, [role="contentinfo"]').length
    },
    positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length
  };

  /* ---------------- mobile signals ---------------- */

  const docWidth = document.documentElement.scrollWidth;
  const viewWidth = window.innerWidth || docWidth;
  const overflowing = [];
  try {
    Array.from(document.body.querySelectorAll('*')).slice(0, 4000).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > viewWidth + 4 && overflowing.length < 12) {
        overflowing.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
      }
    });
  } catch (e) {}

  const mobile = {
    hasViewport: !!head.viewport,
    viewport: head.viewport,
    documentWidth: docWidth,
    viewportWidth: viewWidth,
    horizontalOverflow: docWidth > viewWidth + 4,
    overflowSamples: overflowing,
    blocksZoom: accessibility.blocksZoom,
    fixedWidthElements: overflowing.length
  };

  /* ---------------- well-known resources ---------------- */

  const wellKnown = [];
  for (const spec of [
    { file: '/.well-known/security.txt', label: 'security.txt' },
    { file: '/security.txt', label: 'security.txt (root)' },
    { file: '/manifest.json', label: 'Web app manifest' }
  ]) {
    const r = await fetchText(origin + spec.file, 6000);
    let state = 'MISSING';
    if (r.error) state = 'UNREACHABLE';
    else if (r.ok && !looksLikeHtml(r)) state = 'FOUND';
    wellKnown.push({ file: spec.file, label: spec.label, state: state, status: r.status, bytes: r.body.length });
  }

  // A manifest declared in the HTML is more reliable than guessing at /manifest.json.
  const manifestLink = document.querySelector('link[rel="manifest" i]');
  if (manifestLink) {
    const href = absolute(manifestLink.getAttribute('href') || '');
    if (href) wellKnown.push({ file: href, label: 'Web app manifest (declared)', state: 'DECLARED', status: null, bytes: 0 });
  }

  /* ---------------- output ---------------- */

  return {
    scannedAt: new Date().toISOString(),
    source: source,
    security: security,
    pageType: pageType,
    spa: spa,
    perf: perf,
    live: live,
    resources: resources.slice(0, 600),
    rendering: rendering,
    accessibility: accessibility,
    mobile: mobile,
    wellKnown: wellKnown,
    page: page,
    head: head,
    social: social,
    headings: headings.slice(0, 300),
    headingStats: headingStats,
    content: content,
    links: links.slice(0, 1500),
    linkStats: linkStats,
    images: images.slice(0, 500),
    imageStats: imageStats,
    schema: schema,
    tech: tech,
    robots: robots,
    llms: llmsFiles,
    sitemaps: sitemaps
  };
}

if (typeof module !== 'undefined') { module.exports = { SCC_ANALYZE }; }
