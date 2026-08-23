'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commandItems, responsiveCommandModel, sectionView } = require('./quick-actions.js');

test('command bar exposes only counts present in the current audit', () => {
  const actions = commandItems({
    headingStats: { total: 16 }, linkStats: { total: 54 }, imageStats: { total: 120 },
    schema: { types: ['Organization', 'WebSite'] }
  }, { issues: Array.from({ length: 28 }), scores: { geo: 72 } });
  assert.deepEqual(actions.map(action => action.count), [28, 16, 54, 120, 2, null, 72, null, null, null]);
});

test('command bar does not fabricate zeroes for unavailable data', () => {
  const actions = commandItems({}, { issues: [], scores: { geo: null } });
  assert.equal(actions.find(action => action.id === 'issues').count, 0);
  assert.equal(actions.find(action => action.id === 'headings').count, null);
  assert.equal(actions.find(action => action.id === 'performance').count, null);
  assert.equal(actions.find(action => action.id === 'geo').count, null);
});

test('command bar keeps requested primary actions ahead of responsive overflow actions', () => {
  const actions = commandItems({}, { issues: [], scores: {} });
  assert.deepEqual(actions.map(action => action.id), [
    'issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo', 'accessibility', 'technical', 'resources'
  ]);
  assert.deepEqual(actions.filter(action => action.priority === 'overflow').map(action => action.id), [
    'performance', 'geo', 'accessibility', 'technical', 'resources'
  ]);
});

test('command bar routes only to existing popup audit sections', () => {
  assert.deepEqual(['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo', 'resources'].map(sectionView), [
    'issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo', 'resources'
  ]);
  assert.equal(sectionView('dashboard'), null);
  assert.equal(sectionView('not-a-route'), null);
});

test('responsive command model preserves priority without horizontal overflow', () => {
  assert.deepEqual(responsiveCommandModel(600), {
    visible: ['issues', 'headings', 'links', 'images', 'schema'], overflow: ['performance', 'geo', 'accessibility', 'technical', 'resources']
  });
  assert.deepEqual(responsiveCommandModel(480), {
    visible: ['issues', 'headings', 'links', 'images'], overflow: ['schema', 'performance', 'geo', 'accessibility', 'technical', 'resources']
  });
  assert.deepEqual(responsiveCommandModel(360), {
    visible: ['issues', 'headings', 'links'], overflow: ['images', 'schema', 'performance', 'geo', 'accessibility', 'technical', 'resources']
  });
});
