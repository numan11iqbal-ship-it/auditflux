import type { SavedAudit } from './audit-api';
import { auditCoverage, auditDetail, categoryContribution, list, number, record, savedPerformance, securityStatus, sourceStatus, text, type AuditRecord } from './audit-report';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'docx' | 'html' | 'json';

export type NormalizedAuditReport = {
  metadata: { auditId: string; url: string; capturedAt: string; overallScore: number | null; engineVersion: string | null; contractVersion: string | null };
  coverage: ReturnType<typeof auditCoverage>;
  categories: AuditRecord[];
  issues: AuditRecord[];
  headings: AuditRecord[];
  links: AuditRecord[];
  images: AuditRecord[];
  schema: AuditRecord[];
  resources: AuditRecord[];
  performance: AuditRecord[];
  geoAeo: AuditRecord[];
  provenance: AuditRecord[];
  detail: AuditRecord;
  source: ReturnType<typeof sourceStatus>;
  security: ReturnType<typeof securityStatus>;
  actionPlan: AuditRecord[];
};

const severityRank: Record<string, number> = { critical: 0, warning: 1, notice: 2, info: 3, pass: 4 };
const title = (value: unknown, fallback = 'Not Available') => text(value) || fallback;
const stringify = (value: unknown) => value === undefined || value === null || value === '' ? 'Not Available' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export function normalizedAuditReport(saved: SavedAudit): NormalizedAuditReport {
  const audit = record(saved.audit); const detail = auditDetail(saved); const issues = saved.issues.map(record).sort((a, b) => (severityRank[String(a.severity)] ?? 9) - (severityRank[String(b.severity)] ?? 9));
  const byIssue = new Map<string, AuditRecord>();
  issues.filter(issue => String(issue.status) !== 'pass').forEach(issue => {
    const key = `${issue.category || 'uncategorized'}:${issue.title || 'Untitled issue'}`;
    const found = byIssue.get(key);
    byIssue.set(key, { ...issue, affectedCount: (number(found?.affectedCount) || 0) + 1 });
  });
  const payload = record(audit.payload);
  return {
    metadata: { auditId: title(audit.id, 'Not Available'), url: title(audit.url, 'Not Available'), capturedAt: title(audit.captured_at, 'Not Available'), overallScore: number(audit.overall_score), engineVersion: text(audit.engine_version), contractVersion: text(audit.contract_version) },
    coverage: auditCoverage(saved), categories: (saved.categories.length ? saved.categories.map(record) : categoryContribution(saved)).map(record), issues, headings: saved.headings.map(record), links: saved.links.map(record), images: saved.images.map(record), schema: saved.schema.map(record), resources: saved.resources.map(record), performance: savedPerformance(saved), geoAeo: list(payload.geoAeo), provenance: (saved.provenance || []).map(record), detail, source: sourceStatus(saved), security: securityStatus(saved), actionPlan: Array.from(byIssue.values()).sort((a, b) => (severityRank[String(a.severity)] ?? 9) - (severityRank[String(b.severity)] ?? 9)),
  };
}

export function exportReadiness(report: NormalizedAuditReport) {
  const missing: string[] = [];
  if (!report.metadata.auditId || report.metadata.auditId === 'Not Available') missing.push('audit ID');
  if (!report.metadata.url || report.metadata.url === 'Not Available') missing.push('audited URL');
  if (!report.metadata.capturedAt || report.metadata.capturedAt === 'Not Available') missing.push('capture timestamp');
  if (report.metadata.overallScore === null) missing.push('evaluated score');
  if (!report.issues.length && !report.categories.length) missing.push('saved audit modules');
  return { ready: missing.length === 0, missing };
}

export function exportFileBase(report: NormalizedAuditReport) {
  let host = 'website';
  try { host = new URL(report.metadata.url).hostname.replace(/^www\./, ''); } catch { /* retained fallback */ }
  const date = report.metadata.capturedAt === 'Not Available' ? 'undated' : report.metadata.capturedAt.slice(0, 10);
  return `AuditFlux_SEO_Audit_${host.replace(/[^a-z0-9.-]+/gi, '_')}_${date}`;
}

function csvCell(value: unknown) { return `"${stringify(value).replaceAll('"', '""')}"`; }
function csv(headers: string[], rows: unknown[][]) { return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n'); }
function rowsForIssues(report: NormalizedAuditReport) { return report.issues.map(item => [item.id || item.issue_key, item.severity, item.category, item.title, item.status, item.detected, item.expected, item.why, item.recommendation, report.metadata.url, item.evidence, item.provenance]); }
function rowsForHeadings(report: NormalizedAuditReport) { return report.headings.map(item => [item.level, item.text, item.is_question, item.empty, item.position, report.metadata.url]); }
function rowsForLinks(report: NormalizedAuditReport) { return report.links.map(item => [item.anchor, item.absolute_url || item.href, item.link_type, item.rel, item.nofollow, item.sponsored, item.ugc, report.metadata.url]); }
function rowsForImages(report: NormalizedAuditReport) { return report.images.map(item => [item.src, item.alt, item.width, item.height, item.format, item.alt_missing, item.alt_empty, item.broken, report.metadata.url]); }
function rowsForSchema(report: NormalizedAuditReport) { return report.schema.map(item => [Array.isArray(item.types) ? item.types.join(', ') : item.types, item.valid, item.error, item.payload, report.metadata.url]); }
function rowsForResources(report: NormalizedAuditReport) { return report.resources.map(item => [item.url, item.kind, item.transfer_bytes, item.duration_ms, item.cross_origin, item.render_blocking_candidate]); }
function keyValueRows(value: unknown) { return Object.entries(record(value)).map(([key, item]) => [key, item]); }

function reportDatasets(report: NormalizedAuditReport) {
  return {
    '01-summary.csv': { headers: ['Audit ID', 'URL', 'Captured', 'Overall Score', 'Applicable', 'Passed', 'Critical', 'Warnings', 'Notices', 'Not Applicable'], rows: [[report.metadata.auditId, report.metadata.url, report.metadata.capturedAt, report.metadata.overallScore, report.coverage.applicable, report.coverage.pass, report.coverage.critical, report.coverage.warning, report.coverage.notice, report.coverage.notApplicable]] },
    '02-issues.csv': { headers: ['Issue ID', 'Severity', 'Category', 'Title', 'Status', 'What We Found', 'Expected', 'Why It Matters', 'How To Fix', 'Affected URL', 'Evidence', 'Provenance'], rows: rowsForIssues(report) },
    '03-headings.csv': { headers: ['Level', 'Heading Text', 'Question', 'Empty', 'DOM Position', 'URL'], rows: rowsForHeadings(report) },
    '04-links.csv': { headers: ['Anchor Text', 'Destination URL', 'Type', 'Rel', 'Nofollow', 'Sponsored', 'UGC', 'Source URL'], rows: rowsForLinks(report) },
    '05-images.csv': { headers: ['Image URL', 'ALT Text', 'Width', 'Height', 'Format', 'ALT Missing', 'Decorative ALT', 'Broken', 'Source URL'], rows: rowsForImages(report) },
    '06-schema.csv': { headers: ['Types', 'Valid', 'Error', 'Payload', 'Source URL'], rows: rowsForSchema(report) },
    '07-resources.csv': { headers: ['Resource URL', 'Type', 'Transfer Bytes', 'Duration ms', 'Third Party', 'Render Blocking Candidate'], rows: rowsForResources(report) },
    '08-categories.csv': { headers: ['Category', 'Score', 'Checks', 'Passed', 'Failed', 'Applicable', 'Source'], rows: report.categories.map(item => [item.label || item.category_id, item.score, item.checks, item.passed, item.failed, item.applicable, item.source]) },
    '09-performance.csv': { headers: ['Source', 'Strategy', 'Performance Score', 'Accessibility Score', 'Best Practices Score', 'SEO Score', 'Metrics', 'Raw Summary'], rows: report.performance.map(item => [item.source, item.strategy, item.performance_score, item.accessibility_score, item.best_practices_score, item.seo_score, item.metrics, item.raw_summary]) },
    '10-geo-aeo.csv': { headers: ['Signal Key', 'Status', 'Title', 'Detected', 'Expected', 'Evidence', 'Provenance'], rows: report.geoAeo.map(item => [item.signalKey, item.status, item.title, item.detected, item.expected, item.evidence, item.provenance]) },
    '11-provenance.csv': { headers: ['Domain', 'Source', 'Label', 'Method', 'Payload'], rows: report.provenance.map(item => [item.domain, item.source, item.label, item.method, item.payload]) },
    '12-source-capture.csv': { headers: ['Available', 'Reason', 'Captured HTML'], rows: [[report.source.available, report.source.reason, report.source.html]] },
    '13-security.csv': { headers: ['Signal', 'Value'], rows: keyValueRows(report.security) },
    '14-detail.csv': { headers: ['Detail Key', 'Value'], rows: keyValueRows(report.detail) },
  };
}

export function exportCsvSets(report: NormalizedAuditReport) {
  return Object.fromEntries(Object.entries(reportDatasets(report)).map(([name, dataset]) => [name, csv(dataset.headers, dataset.rows)]));
}

const EXCEL_CELL_LIMIT = 32_000;
export function excelExportData(report: NormalizedAuditReport) {
  const longText: string[][] = [];
  const sheets = Object.entries(reportDatasets(report)).map(([name, dataset]) => ({ name, headers: dataset.headers, rows: dataset.rows.map((row, rowIndex) => row.map((value, columnIndex) => {
    const rendered = stringify(value);
    if (rendered.length <= EXCEL_CELL_LIMIT) return rendered;
    const reference = `${name}:${rowIndex + 2}:${dataset.headers[columnIndex] || `column-${columnIndex + 1}`}`;
    for (let start = 0, chunk = 1; start < rendered.length; start += EXCEL_CELL_LIMIT, chunk += 1) longText.push([reference, String(chunk), rendered.slice(start, start + EXCEL_CELL_LIMIT)]);
    return `[Stored losslessly in Long Text: ${reference}]`;
  })) }));
  return { sheets, longText };
}

function htmlEscape(value: unknown) { return stringify(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function table(headers: string[], rows: unknown[][]) { return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map((value, index) => { const content = htmlEscape(value); return index === 0 && /^https?:\/\//.test(String(value || '')) ? `<td><a href="${content}">${content}</a></td>` : `<td>${content}</td>`; }).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Not Evaluated</td></tr>`}</tbody></table></div>`; }
function section(id: string, heading: string, body: string) { return `<section id="${id}"><h2>${htmlEscape(heading)}</h2>${body}</section>`; }

export function standaloneHtml(report: NormalizedAuditReport) {
  const summary = `<div class="hero"><p class="eyebrow">AUDITFLUX · REAL DATA · ACTIONABLE INSIGHTS</p><h1>SEO Audit Report</h1><p>${htmlEscape(report.metadata.url)}</p><div class="metrics"><b>${report.metadata.overallScore ?? 'Not Evaluated'}<small>Overall Score</small></b><b>${report.coverage.critical}<small>Critical</small></b><b>${report.coverage.warning}<small>Warnings</small></b><b>${report.coverage.pass}<small>Passed</small></b></div><p class="muted">Audit ID: ${htmlEscape(report.metadata.auditId)} · Captured: ${htmlEscape(report.metadata.capturedAt)}</p></div>`;
  const categories = table(['Category', 'Score', 'Passed', 'Applicable', 'Failed', 'Source'], report.categories.map(item => [item.label || item.category_id, item.score, item.passed, item.checks, item.failed, item.source]));
  const actions = table(['Priority', 'Severity', 'Issue', 'Affected Checks', 'How To Fix'], report.actionPlan.map((item, index) => [index === 0 ? 'Fix First' : index < 3 ? 'Fix Next' : 'Optimize', item.severity, item.title, item.affectedCount, item.recommendation]));
  const issues = table(['Severity', 'Category', 'Issue', 'What We Found', 'Why It Matters', 'How To Fix', 'Evidence'], report.issues.map(item => [item.severity, item.category, item.title, item.detected, item.why, item.recommendation, item.evidence]));
  const modules = [section('headings', 'Headings', table(['Level', 'Text', 'Question', 'Empty', 'Position'], rowsForHeadings(report))), section('links', 'Links', table(['Anchor', 'Destination', 'Type', 'Rel', 'Nofollow', 'Sponsored', 'UGC', 'Source URL'], rowsForLinks(report))), section('images', 'Images', table(['Image URL', 'ALT', 'Width', 'Height', 'Format', 'ALT Missing', 'Decorative', 'Broken', 'Source URL'], rowsForImages(report))), section('schema', 'Schema', table(['Types', 'Valid', 'Error', 'Payload', 'Source URL'], rowsForSchema(report))), section('performance', 'Performance', table(['Source', 'Strategy', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'Metrics'], report.performance.map(item => [item.source, item.strategy, item.performance_score, item.accessibility_score, item.best_practices_score, item.seo_score, item.metrics]))), section('geo-aeo', 'GEO / AEO', table(['Signal', 'Status', 'Detected', 'Expected', 'Evidence'], report.geoAeo.map(item => [item.title || item.signalKey, item.status, item.detected, item.expected, item.evidence]))), section('resources', 'Resources', table(['URL', 'Type', 'Transfer Bytes', 'Duration ms', 'Third Party', 'Render Blocking'], rowsForResources(report)))].join('');
  const source = report.source.available ? section('html-source', 'Captured HTML Source', `<pre>${htmlEscape(report.source.html)}</pre>`) : section('html-source', 'Captured HTML Source', `<p class="muted">${htmlEscape(report.source.reason)}</p>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AuditFlux SEO Audit</title><style>body{margin:0;background:#07111b;color:#e8f1fb;font:14px/1.55 Inter,Arial,sans-serif}.wrap{max-width:1180px;margin:auto;padding:36px}.hero,section{background:#0c1823;border:1px solid #1d3345;border-radius:16px;padding:28px;margin-bottom:18px}.eyebrow{color:#56a9ff;font-weight:800;letter-spacing:.12em;font-size:10px}.metrics{display:flex;flex-wrap:wrap;gap:12px;margin:22px 0}.metrics b{min-width:120px;background:#07111b;border:1px solid #1d3345;border-radius:10px;padding:14px;font-size:25px}.metrics small{display:block;color:#91a4b8;font-size:10px;text-transform:uppercase}.muted{color:#9aafc1}h1{font-size:36px;margin:8px 0}h2{font-size:22px;margin-top:0}table{width:100%;border-collapse:collapse}th,td{padding:10px;vertical-align:top;text-align:left;border-bottom:1px solid #1d3345;word-break:break-word}th{color:#9fc8ff;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.table-wrap{overflow:auto}a{color:#78b8ff}pre{white-space:pre-wrap;word-break:break-word;background:#07111b;padding:14px;border-radius:8px}@media print{body{background:#fff;color:#111}.hero,section{background:#fff;border-color:#ddd}.muted{color:#555}}</style></head><body><main class="wrap">${summary}${section('score-breakdown', 'Score Breakdown', categories)}${section('action-plan', 'Action Plan', actions)}${section('issues', 'Issues', issues)}${modules}${source}</main></body></html>`;
}

function triggerDownload(data: BlobPart, filename: string, type: string) { const href = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = href; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 0); }

export async function exportReport(format: ExportFormat, report: NormalizedAuditReport) {
  const readiness = exportReadiness(report); if (!readiness.ready) throw new Error(`This saved audit cannot be exported until it includes ${readiness.missing.join(', ')}.`);
  const base = exportFileBase(report);
  if (format === 'json') return triggerDownload(JSON.stringify(report, null, 2), `${base}.json`, 'application/json');
  if (format === 'html') return triggerDownload(standaloneHtml(report), `${base}.html`, 'text/html;charset=utf-8');
  if (format === 'csv') { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); Object.entries(exportCsvSets(report)).forEach(([name, data]) => zip.file(name, data)); return triggerDownload(await zip.generateAsync({ type: 'blob' }), `${base}_CSV.zip`, 'application/zip'); }
  if (format === 'xlsx') {
    const XLSX = await import('xlsx'); const book = XLSX.utils.book_new(); const exportData = excelExportData(report);
    exportData.sheets.forEach(dataset => { const rows = [dataset.headers, ...dataset.rows]; const sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!freeze'] = { xSplit: 0, ySplit: 1 }; sheet['!cols'] = dataset.headers.map(() => ({ wch: 24 })); XLSX.utils.book_append_sheet(book, sheet, dataset.name.replace(/^\d+-/, '').replace('.csv', '').slice(0, 31)); });
    if (exportData.longText.length) { const sourceSheet = XLSX.utils.aoa_to_sheet([['Reference', 'Chunk', 'Exact Text'], ...exportData.longText]); sourceSheet['!freeze'] = { xSplit: 0, ySplit: 1 }; sourceSheet['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 100 }]; XLSX.utils.book_append_sheet(book, sourceSheet, 'Long Text'); }
    return XLSX.writeFile(book, `${base}.xlsx`);
  }
  if (format === 'docx') {
    const docx = await import('docx'); const children: any[] = [new docx.Paragraph({ text: 'AuditFlux SEO Audit Report', heading: docx.HeadingLevel.TITLE }), new docx.Paragraph(`Website: ${report.metadata.url}`), new docx.Paragraph(`Audit ID: ${report.metadata.auditId}`), new docx.Paragraph(`Captured: ${report.metadata.capturedAt}`), new docx.Paragraph({ text: `Overall score: ${report.metadata.overallScore ?? 'Not Evaluated'}`, heading: docx.HeadingLevel.HEADING_1 }), new docx.Paragraph({ text: 'Action Plan', heading: docx.HeadingLevel.HEADING_1 })];
    report.actionPlan.forEach((issue, index) => children.push(new docx.Paragraph({ text: `${index === 0 ? 'Fix First' : index < 3 ? 'Fix Next' : 'Optimize'} · ${title(issue.title)} · ${title(issue.severity)}`, heading: docx.HeadingLevel.HEADING_2 }), new docx.Paragraph(`What we found: ${title(issue.detected)}`), new docx.Paragraph(`Why it matters: ${title(issue.why)}`), new docx.Paragraph(`How to fix: ${title(issue.recommendation)}`)));
    const appendModule = (heading: string, headers: string[], rows: unknown[][]) => { children.push(new docx.Paragraph({ text: heading, heading: docx.HeadingLevel.HEADING_1 })); if (!rows.length) { children.push(new docx.Paragraph('Not Evaluated')); return; } children.push(new docx.Table({ rows: [new docx.TableRow({ children: headers.map(value => new docx.TableCell({ children: [new docx.Paragraph(value)] })) }), ...rows.map(row => new docx.TableRow({ children: row.map(value => new docx.TableCell({ children: [new docx.Paragraph(stringify(value))] })) }))] })); };
    appendModule('Score Breakdown', ['Category', 'Score', 'Passed', 'Applicable', 'Failed', 'Source'], report.categories.map(item => [item.label || item.category_id, item.score, item.passed, item.checks, item.failed, item.source]));
    appendModule('Issues', ['Severity', 'Category', 'Issue', 'Recommendation'], report.issues.map(issue => [issue.severity, issue.category, issue.title, issue.recommendation]));
    appendModule('Headings', ['Level', 'Text', 'Question', 'Empty'], report.headings.map(item => [item.level, item.text, item.is_question, item.empty]));
    appendModule('Links', ['Anchor', 'Destination', 'Type', 'Rel'], report.links.map(item => [item.anchor, item.absolute_url || item.href, item.link_type, item.rel]));
    appendModule('Images', ['Image URL', 'ALT', 'Format', 'ALT Missing'], report.images.map(item => [item.src, item.alt, item.format, item.alt_missing]));
    appendModule('Schema', ['Types', 'Valid', 'Error'], report.schema.map(item => [item.types, item.valid, item.error]));
    appendModule('Performance', ['Source', 'Strategy', 'Performance', 'Accessibility', 'SEO'], report.performance.map(item => [item.source, item.strategy, item.performance_score, item.accessibility_score, item.seo_score]));
    appendModule('GEO / AEO', ['Signal', 'Status', 'Detected', 'Expected'], report.geoAeo.map(item => [item.title || item.signalKey, item.status, item.detected, item.expected]));
    appendModule('Resources', ['URL', 'Type', 'Transfer Bytes', 'Duration ms'], report.resources.map(item => [item.url, item.kind, item.transfer_bytes, item.duration_ms]));
    appendModule('Provenance', ['Domain', 'Source', 'Label', 'Method'], report.provenance.map(item => [item.domain, item.source, item.label, item.method]));
    appendModule('Security', ['Signal', 'Value'], keyValueRows(report.security));
    appendModule('Captured HTML Source', ['Available', 'Status'], [[report.source.available, report.source.available ? 'Included in HTML, JSON, and CSV exports.' : report.source.reason]]);
    return triggerDownload(await docx.Packer.toBlob(new docx.Document({ sections: [{ children }] })), `${base}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  const jspdf = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default; const doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' }); const navy: [number, number, number] = [7, 17, 27]; doc.setFillColor(...navy); doc.rect(0, 0, 595, 130, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(26); doc.text('AuditFlux SEO Audit Report', 42, 60); doc.setFontSize(11); doc.text(report.metadata.url, 42, 83); doc.text(`Audit ID: ${report.metadata.auditId}`, 42, 104); doc.setTextColor(20, 30, 40); doc.setFontSize(18); doc.text(`Overall Score: ${report.metadata.overallScore ?? 'Not Evaluated'}`, 42, 165); autoTable(doc, { startY: 184, head: [['Applicable', 'Passed', 'Critical', 'Warnings', 'Notices']], body: [[report.coverage.applicable, report.coverage.pass, report.coverage.critical, report.coverage.warning, report.coverage.notice]] }); doc.text('Fix First / Action Plan', 42, (doc as any).lastAutoTable.finalY + 32); autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 42, head: [['Priority', 'Severity', 'Issue', 'How To Fix']], body: report.actionPlan.map((issue, index) => [index === 0 ? 'Fix First' : index < 3 ? 'Fix Next' : 'Optimize', title(issue.severity), title(issue.title), title(issue.recommendation)]), styles: { fontSize: 7 } });
  const addModule = (heading: string, headers: string[], rows: unknown[][]) => { doc.addPage(); doc.setFontSize(17); doc.text(heading, 42, 44); autoTable(doc, { startY: 58, head: [headers], body: rows.length ? rows.map(row => row.map(stringify)) : [['Not Evaluated', ...headers.slice(1).map(() => '')]], styles: { fontSize: 7 } }); };
  addModule('Score Breakdown', ['Category', 'Score', 'Passed', 'Applicable', 'Failed', 'Source'], report.categories.map(item => [item.label || item.category_id, item.score, item.passed, item.checks, item.failed, item.source]));
  addModule('Issues', ['Severity', 'Category', 'Issue', 'What We Found', 'How To Fix'], report.issues.map(issue => [issue.severity, issue.category, issue.title, issue.detected, issue.recommendation]));
  addModule('Headings', ['Level', 'Text', 'Question', 'Empty'], report.headings.map(item => [item.level, item.text, item.is_question, item.empty]));
  addModule('Links', ['Anchor', 'Destination', 'Type', 'Rel'], report.links.map(item => [item.anchor, item.absolute_url || item.href, item.link_type, item.rel]));
  addModule('Images', ['Image URL', 'ALT', 'Format', 'ALT Missing'], report.images.map(item => [item.src, item.alt, item.format, item.alt_missing]));
  addModule('Schema', ['Types', 'Valid', 'Error'], report.schema.map(item => [item.types, item.valid, item.error]));
  addModule('Performance', ['Source', 'Strategy', 'Performance', 'Accessibility', 'SEO'], report.performance.map(item => [item.source, item.strategy, item.performance_score, item.accessibility_score, item.seo_score]));
  addModule('GEO / AEO', ['Signal', 'Status', 'Detected', 'Expected'], report.geoAeo.map(item => [item.title || item.signalKey, item.status, item.detected, item.expected]));
  addModule('Resources', ['URL', 'Type', 'Transfer Bytes', 'Duration ms'], report.resources.map(item => [item.url, item.kind, item.transfer_bytes, item.duration_ms]));
  addModule('Provenance', ['Domain', 'Source', 'Label', 'Method'], report.provenance.map(item => [item.domain, item.source, item.label, item.method]));
  addModule('Security', ['Signal', 'Value'], keyValueRows(report.security));
  addModule('Captured HTML Source', ['Available', 'Status'], [[report.source.available, report.source.available ? 'Included in HTML, JSON, and CSV exports.' : report.source.reason]]);
  doc.save(`${base}.pdf`);
}
