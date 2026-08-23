/* AuditFlux popup command-bar data. Counts are omitted when the audit did not measure them. */
(function (root) {
  'use strict';

  function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function commandItems(data, audit) {
    const headings = numberOrNull(data?.headingStats?.total);
    const links = numberOrNull(data?.linkStats?.total);
    const images = numberOrNull(data?.imageStats?.total);
    const schema = numberOrNull(data?.schema?.types?.length);
    const performance = numberOrNull(data?.pageSpeed?.scores?.performance)
      ?? numberOrNull(data?.performance?.lab?.scores?.performance);
    const geo = numberOrNull(audit?.scores?.geo);
    const issues = numberOrNull(audit?.issues?.length);

    return [
      { id: 'issues', label: 'Issues', shortLabel: 'Issues', icon: '!', count: issues, title: 'View all SEO issues', priority: 'core' },
      { id: 'headings', label: 'Headings', shortLabel: 'H1–H6', icon: 'H', count: headings, title: 'Inspect H1–H6 structure', priority: 'core' },
      { id: 'links', label: 'Links', shortLabel: 'Links', icon: '↗', count: links, title: 'Analyze internal and external links', priority: 'core' },
      { id: 'images', label: 'Images', shortLabel: 'Images', icon: '▧', count: images, title: 'Check images, ALT and optimization', priority: 'core optional' },
      { id: 'schema', label: 'Schema', shortLabel: 'Schema', icon: '{ }', count: schema, title: 'Inspect structured data', priority: 'overflow' },
      { id: 'performance', label: 'Performance', shortLabel: 'Performance', icon: '◌', count: performance, title: 'View performance metrics', priority: 'overflow' },
      { id: 'geo', label: 'GEO / AEO', shortLabel: 'GEO', icon: '✦', count: geo, title: 'Analyze AI search readiness', priority: 'overflow' }
    ];
  }

  function sectionView(value) {
    return ['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'].includes(value) ? value : null;
  }

  function responsiveCommandModel(width) {
    const all = ['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'];
    if (width > 1024) return { visible: all, overflow: [] };
    if (width > 680) return { visible: ['issues', 'headings', 'links', 'images'], overflow: ['schema', 'performance', 'geo'] };
    if (width > 520) return { visible: ['issues', 'headings', 'links'], overflow: ['images', 'schema', 'performance', 'geo'] };
    return { visible: ['issues', 'headings'], overflow: ['links', 'images', 'schema', 'performance', 'geo'] };
  }

  const api = { commandItems, numberOrNull, sectionView, responsiveCommandModel };
  root.AUDITFLUX_QUICK_ACTIONS = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
