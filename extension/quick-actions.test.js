'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commandItems, responsiveCommandModel, sectionView } = require('./quick-actions.js');

test('command bar exposes only counts present in the current audit', () => {
  const actions = commandItems({
    headingStats: { total: 16 }, linkStats: { total: 54 }, imageStats: { total: 120 },
    schema: { types: ['Organization', 'WebSite'] }
  }, { issues: Array.from({ length: 28 }), scores: { geo: 72 } });
  assert.deepEqual(actions.map(action => action.count), [28, 16, 54, 120, 2, null, 72]);
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
    'issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'
  ]);
  assert.deepEqual(actions.filter(action => action.priority === 'overflow').map(action => action.id), [
    'schema', 'performance', 'geo'
  ]);
});

test('command bar routes only to existing popup audit sections', () => {
  assert.deepEqual(['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'].map(sectionView), [
    'issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'
  ]);
  assert.equal(sectionView('dashboard'), null);
  assert.equal(sectionView('not-a-route'), null);
});

test('responsive command model preserves priority without horizontal overflow', () => {
  assert.deepEqual(responsiveCommandModel(1120), {
    visible: ['issues', 'headings', 'links', 'images', 'schema', 'performance', 'geo'], overflow: []
  });
  assert.deepEqual(responsiveCommandModel(760), {
    visible: ['issues', 'headings', 'links', 'images'], overflow: ['schema', 'performance', 'geo']
  });
  assert.deepEqual(responsiveCommandModel(430), {
    visible: ['issues', 'headings'], overflow: ['links', 'images', 'schema', 'performance', 'geo']
  });
});
