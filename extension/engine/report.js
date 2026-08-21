/**
 * AuditFlux SEO — report and export engine.
 *
 * Shared by the popup and the dashboard so exports can never drift between
 * them. Every builder reads the live audit result; nothing here invents data.
 */

function sccCsvEscape(value) {
  const v = value === null || value === undefined ? '' : String(value);
  // Quote when the value contains a delimiter, quote or newline; double any
  // embedded quotes. A leading =,+,-,@ is prefixed with a quote to stop
  // spreadsheets treating pasted values as formulas.
  const needsQuote = /[",\r\n]/.test(v);
  const safe = /^[=+\-@]/.test(v) ? "'" + v : v;
  return needsQuote ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function sccToCsv(rows) {
  return rows.map(r => r.map(sccCsvEscape).join(',')).join('\r\n');
}

const SCC_EXPORTS = {
  issues(data, audit) {
    const rows = [['Rule ID', 'Category', 'Severity', 'Status', 'Issue', 'Detected', 'Expected', 'How to fix', 'Evidence', 'URL']];
    audit.issues.forEach(i => rows.push([i.id, i.category, i.severity, 'failed', i.title, i.detected, i.expected, i.how, (i.evidence || []).join(' | '), data.page.url]));
    audit.passed.forEach(i => rows.push([i.id, i.category, i.severity, 'passed', i.title, i.detected, i.expected, '', '', data.page.url]));
    return rows;
  },

  headings(data) {
    const rows = [['Order', 'Level', 'Text', 'Length', 'Empty', 'Question', 'URL']];
    data.headings.forEach((h, n) => rows.push([n + 1, 'H' + h.level, h.text, h.length, h.empty ? 'yes' : 'no', h.isQuestion ? 'yes' : 'no', data.page.url]));
    return rows;
  },

  links(data) {
    const rows = [['Anchor text', 'Destination', 'Type', 'Rel', 'Nofollow', 'Sponsored', 'UGC', 'Target', 'Source URL']];
    data.links.forEach(l => rows.push([
      l.anchor || (l.hasImageOnly ? '(image link)' : ''),
      l.absolute || l.href, l.type, l.rel,
      l.nofollow ? 'yes' : 'no', l.sponsored ? 'yes' : 'no', l.ugc ? 'yes' : 'no',
      l.target || '', data.page.url
    ]));
    return rows;
  },

  images(data) {
    const rows = [['Image URL', 'ALT text', 'ALT status', 'Natural width', 'Natural height', 'Display width', 'Width attr', 'Height attr', 'Loading', 'Srcset', 'Format', 'Broken', 'Source URL']];
    data.images.forEach(i => rows.push([
      i.src || '', i.alt || '',
      i.altMissing ? 'missing' : i.altEmpty ? 'decorative' : 'present',
      i.naturalWidth || '', i.naturalHeight || '', i.displayWidth || '',
      i.widthAttr || '', i.heightAttr || '', i.loading || '',
      i.srcset ? 'yes' : 'no', i.format || '', i.broken ? 'yes' : 'no', data.page.url
    ]));
    return rows;
  },

  schema(data) {
    const rows = [['Block', 'Types', 'Valid JSON', 'Has @context', 'Bytes', 'Error', 'Source URL']];
    data.schema.blocks.forEach(b => rows.push([
      b.index + 1, b.types.join(' | '), b.valid ? 'yes' : 'no',
      b.hasContext ? 'yes' : 'no', b.bytes, b.error || '', data.page.url
    ]));
    data.schema.microdataTypes.forEach(t => rows.push(['microdata', t, 'n/a', 'n/a', '', '', data.page.url]));
    return rows;
  }
};

/** Plain-text report intended to be pasted into an email to a client or developer. */
function SCC_TEXT_REPORT(data, audit, categories, psi) {
  const L = [];
  const rule = (c) => c.repeat(60);
  const pad = (s, n) => String(s).padEnd(n);

  L.push('AUDITFLUX SEO — PAGE AUDIT');
  L.push(rule('='));
  L.push('URL:        ' + data.page.url);
  L.push('Scanned:    ' + new Date(data.scannedAt).toLocaleString());
  L.push('Page type:  ' + data.pageType.type);
  L.push('');

  L.push('EXECUTIVE SUMMARY');
  L.push(rule('-'));
  const verdict = audit.overall >= 85 ? 'Strong'
    : audit.overall >= 70 ? 'Good, with gaps'
    : audit.overall >= 50 ? 'Needs work' : 'Significant problems';
  L.push(`Overall score: ${audit.overall}/100 — ${verdict}`);
  L.push(`Scored from ${audit.counts.evaluated} checks that applied to this page.`);
  L.push('');
  L.push(`Critical: ${audit.counts.critical}   Warnings: ${audit.counts.warning}   Notices: ${audit.counts.notice}   Passed: ${audit.counts.passed}`);
  L.push('');

  L.push('CATEGORY SCORES');
  L.push(rule('-'));
  categories.forEach(c => {
    const v = audit.scores[c.id];
    L.push('  ' + pad(c.label, 14) + (v === null ? 'not applicable' : v + '/100'));
  });
  L.push('');

  const bySeverity = (sev) => audit.issues.filter(i => i.severity === sev);

  if (bySeverity('critical').length) {
    L.push('CRITICAL ISSUES');
    L.push(rule('-'));
    bySeverity('critical').forEach((i, n) => {
      L.push(`${n + 1}. ${i.title}`);
      L.push(`   What we found: ${i.detected}`);
      L.push(`   Expected:      ${i.expected}`);
      L.push(`   Fix:           ${i.how}`);
      (i.evidence || []).slice(0, 5).forEach(e => L.push('     - ' + e));
      L.push('');
    });
  }

  ['warning', 'notice'].forEach(sev => {
    const list = bySeverity(sev);
    if (!list.length) return;
    L.push((sev === 'warning' ? 'WARNINGS' : 'NOTICES'));
    L.push(rule('-'));
    list.forEach((i, n) => {
      L.push(`${n + 1}. ${i.title} — ${i.detected}`);
      L.push(`   Fix: ${i.how}`);
    });
    L.push('');
  });

  L.push('PAGE DETAIL');
  L.push(rule('-'));
  L.push('Title:            ' + (data.head.title || '(missing)') + ` [${data.head.titleLength} chars]`);
  L.push('Meta description: ' + (data.head.metaDescription || '(missing)') + ` [${data.head.metaDescriptionLength} chars]`);
  L.push('Canonical:        ' + (data.head.canonical || '(missing)') + (data.head.canonicalIsSelf ? ' (self)' : ''));
  L.push('Indexable:        ' + (data.head.noindex ? 'No — noindex' : data.robots.pageAllowed === false ? 'No — blocked by robots.txt' : 'Yes'));
  L.push('');
  L.push(`Headings:  ${data.headingStats.total} total, ${data.headingStats.h1} H1, ${data.headingStats.h2} H2, ${data.headingStats.skips.length} level skips`);
  L.push(`Content:   ${data.content.wordCount} words, ${data.content.paragraphs} paragraphs, ${data.content.lists} lists, ${data.content.tables} tables`);
  L.push(`Links:     ${data.linkStats.total} total (${data.linkStats.internal} internal, ${data.linkStats.external} external), ${data.linkStats.generic} generic anchors`);
  L.push(`Images:    ${data.imageStats.total} total, ${data.imageStats.altCoverage === null ? 'n/a' : data.imageStats.altCoverage + '%'} ALT coverage, ${data.imageStats.broken} broken`);
  L.push(`Schema:    ${data.schema.jsonLdBlocks} JSON-LD blocks${data.schema.types.length ? ' — ' + data.schema.types.join(', ') : ''}`);
  L.push('');

  if ((data.live) || (psi && (psi.mobile || psi.desktop))) {
    L.push('PERFORMANCE');
    L.push(rule('-'));

    if (data.live) {
      const lv = data.live;
      L.push('LIVE BROWSER OBSERVATION (this browser session)');
      const row = (label, m, id) => {
        if (!m) return;
        const v = m.value !== null && m.value !== undefined ? (id ? sccFormatMetric(id, m.value) : m.value) : (m.state === 'needs-interaction' ? 'not enough interaction data' : 'not measurable');
        L.push(`  ${label}: ${v}`);
      };
      row('TTFB', lv.ttfb, 'TTFB');
      row('FCP', lv.fcp, 'FCP');
      row('LCP', lv.lcp, 'LCP');
      row('CLS', lv.cls, 'CLS');
      row('INP', lv.inp, 'INP');
      L.push(`  Requests: ${lv.resources.count}   Third-party: ${lv.resources.thirdPartyCount}`);
      L.push('');
    }

    for (const strategy of ['mobile', 'desktop']) {
      const r = psi && psi[strategy];
      if (!r) continue;
      L.push(`LIGHTHOUSE LAB DATA — ${strategy.toUpperCase()} (Google PageSpeed Insights)`);
      L.push(`  Performance ${r.scores.performance ?? 'n/a'}   Accessibility ${r.scores.accessibility ?? 'n/a'}   Best Practices ${r.scores.bestPractices ?? 'n/a'}   SEO ${r.scores.seo ?? 'n/a'}`);
      const lab = Object.entries(r.lab).filter(([, v]) => v !== null)
        .map(([k, v]) => k + ' ' + sccFormatMetric(k, v)).join('   ');
      if (lab) L.push('  Lab metrics: ' + lab);

      const field = r.fieldFromPsi;
      L.push('REAL-USER FIELD DATA — ' + strategy.toUpperCase() + ' (Chrome UX Report)');
      if (field) {
        const parts = ['LCP', 'INP', 'CLS'].map(id => {
          const m = field.metrics[id];
          return m && m.value !== null ? `${id} ${sccFormatMetric(id, m.value)} (${sccRateMetric(id, m.value).label}, 75th percentile)` : null;
        }).filter(Boolean);
        L.push('  ' + (parts.length ? parts.join('   ') : 'No field data available for this URL'));
      } else {
        L.push('  No field data available for this URL');
      }

      if (r.opportunities.length) {
        L.push('  Top Lighthouse opportunities:');
        r.opportunities.slice(0, 5).forEach(o =>
          L.push(`    - ${o.title}${o.savingsMs ? ` (~${Math.round(o.savingsMs)} ms)` : ''}`));
      }
      L.push('');
    }
    L.push('  Live, Lab and Field are three separate measurements and are never interchangeable.');
    L.push('');
  }

  L.push('AI SEARCH READINESS');  L.push('AI SEARCH READINESS');
  L.push(rule('-'));
  const blockedBots = data.robots.bots.filter(b => !b.allowed);
  L.push('AI crawler access: ' + (data.robots.bots.length
    ? (blockedBots.length ? 'Blocked — ' + blockedBots.map(b => b.name).join(', ') : 'All checked crawlers allowed')
    : 'Unknown — robots.txt could not be read'));
  L.push('llms.txt: ' + data.llms.map(f => f.file + ' ' + f.state).join(', '));
  L.push('');

  L.push('TECHNICAL RESOURCES');
  L.push(rule('-'));
  L.push('robots.txt: ' + data.page.origin + '/robots.txt' + (data.robots.fetched ? ' (found)' : ' (not reachable)'));
  data.sitemaps.filter(s => s.ok && s.valid).forEach(s => L.push('Sitemap:    ' + s.url + ` (${s.urlCount} URLs)`));
  L.push('');
  L.push('Generated by AuditFlux SEO. Scores reflect checks that applied to this page.');

  return L.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { SCC_EXPORTS, SCC_TEXT_REPORT, sccToCsv, sccCsvEscape };
}
