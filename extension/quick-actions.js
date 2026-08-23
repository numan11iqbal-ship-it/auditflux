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
      { id: 'headings', label: 'H1–H6', shortLabel: 'H1–H6', icon: 'H', count: headings, title: 'Inspect heading structure', priority: 'core' },
      { id: 'links', label: 'Links', shortLabel: 'Links', icon: '↗', count: links, title: 'Analyze internal and external links', priority: 'core' },
      { id: 'images', label: 'Images', shortLabel: 'Images', icon: '▧', count: images, title: 'Check images, ALT and optimization', priority: 'optional' },
      { id: 'schema', label: 'Schema', shortLabel: 'Schema', icon: '{ }', count: schema, title: 'Inspect structured data', priority: 'optional' },
      { id: 'performance', label: 'Performance', shortLabel: 'Performance', icon: '◌', count: performance, title: 'View performance metrics', priority: 'overflow' },
      { id: 'geo', label: 'GEO / AEO', shortLabel: 'GEO', icon: '✦', count: geo, title: 'Analyze AI search readiness', priority: 'overflow' },
      { id: 'accessibility', label: 'Accessibility', shortLabel: 'A11y', icon: 'A', count: null, title: 'Filter accessibility issues', priority: 'overflow', filter: 'accessibility' },
      { id: 'technical', label: 'Technical', shortLabel: 'Technical', icon: 'T', count: null, title: 'Filter technical issues', priority: 'overflow', filter: 'technical' },
      { id: 'resources', label: 'Resources', shortLabel: 'Resources', icon: 'R', count: numberOrNull(data?.resources?.length), title: 'Inspect page resources', priority: 'overflow' }
    ];
  }

  function sectionView(value) {
    return ['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo', 'resources'].includes(value) ? value : null;
  }

  function responsiveCommandModel(width) {
    const all = ['issues', 'headings', 'links', 'images', 'schema'];
    if (width >= 560) return { visible: all, overflow: ['performance', 'geo', 'accessibility', 'technical', 'resources'] };
    if (width >= 460) return { visible: ['issues', 'headings', 'links', 'images'], overflow: ['schema', 'performance', 'geo', 'accessibility', 'technical', 'resources'] };
    return { visible: ['issues', 'headings', 'links'], overflow: ['images', 'schema', 'performance', 'geo', 'accessibility', 'technical', 'resources'] };
  }

  const api = { commandItems, numberOrNull, sectionView, responsiveCommandModel };
  root.AUDITFLUX_QUICK_ACTIONS = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
