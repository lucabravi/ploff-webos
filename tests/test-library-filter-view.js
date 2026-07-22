'use strict';

var assert = require('assert');
var LibraryFilterView = require('../app/library-filter-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(),
    className: className || '',
    textContent: text || '',
    children: [],
    attributes: {},
    style: {},
    focused: false,
    scrollTop: 0,
    appendChild: function (child) { this.children.push(child); return child; },
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    getAttribute: function (key) { return this.attributes[key]; },
    focus: function () { this.focused = true; },
    scrollIntoView: function () { this.scrolled = true; }
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () { this.children = []; }
  });
  return value;
}

function createFixture() {
  var ids = [
    'library-filter-drawer', 'library-filter-shade', 'library-filter-title',
    'library-filter-hint', 'library-filter-rows', 'library-filter-count',
    'library-filter-reset', 'library-filter-cancel', 'library-filter-apply'
  ];
  var nodes = {};
  var focused = [];
  var callbacks = [];
  var requests = [];
  var keys = ['watched', 'year', 'genre'];
  ids.forEach(function (id) { nodes[id] = node('div'); });
  nodes['library-filter-reset'].setAttribute('data-library-filter-action', 'reset');
  nodes['library-filter-cancel'].setAttribute('data-library-filter-action', 'cancel');
  nodes['library-filter-apply'].setAttribute('data-library-filter-action', 'apply');

  function element(tagName, className, text) {
    return node(tagName, className, text);
  }

  var view = LibraryFilterView.create({
    document: {
      getElementById: function (id) { return nodes[id]; },
      querySelectorAll: function (selector) {
        var source = nodes['library-filter-rows'].children;
        if (selector === '[data-library-advanced-filter]') {
          return source.filter(function (item) { return item.hasAttribute('data-library-advanced-filter'); });
        }
        if (selector === '[data-library-filter-option]') {
          return source.filter(function (item) { return item.hasAttribute('data-library-filter-option'); });
        }
        return [nodes['library-filter-reset'], nodes['library-filter-cancel'], nodes['library-filter-apply']].filter(function (item) {
          return item.style.display !== 'none';
        });
      }
    },
    element: element,
    keys: keys,
    t: function (key, parameters) {
      if (key === 'library.activeFilters') { return 'Active ' + parameters.count; }
      if (key === 'library.filtersHint') { return 'Filters for ' + parameters.library; }
      if (key === 'library.filterAny') { return 'Any'; }
      if (key === 'library.filterPickerHint') { return 'Choose'; }
      if (key === 'common.apply') { return 'Apply'; }
      if (key === 'common.cancel') { return 'Cancel'; }
      return key;
    },
    setText: function (id, value) { nodes[id].textContent = value; },
    libraryTitle: function () { return 'Movies'; },
    loadOptions: function (context, callback) {
      var request = { context: context, callback: callback, aborted: false, abort: function () { this.aborted = true; } };
      requests.push(request);
      return request;
    },
    fallbackOptions: function () { return { year: [], genre: [] }; },
    clearFocus: function () { focused.push('clear'); },
    isPointerSelectionActive: function () { return false; },
    onApply: function (filters) { callbacks.push(['apply', filters]); },
    onReset: function (filters) { callbacks.push(['reset', filters]); },
    onCancel: function () { callbacks.push(['cancel']); },
    onClose: function (reason) { callbacks.push(['close', reason]); }
  });

  return { view: view, nodes: nodes, callbacks: callbacks, requests: requests, focused: focused };
}

function keyEvent(keyCode) {
  return { keyCode: keyCode, prevented: false, preventDefault: function () { this.prevented = true; } };
}

var fixture = createFixture();
fixture.view.setActiveFilters({ watched: 'unwatched', year: '2020', genre: '' });
fixture.view.open({ key: 'movies' });
fixture.requests[0].callback(null, { year: [{ value: '2020', label: '2020' }], genre: [{ value: 'drama', label: 'Drama' }] });
assert.deepStrictEqual(fixture.view.snapshot().draftFilters, { watched: 'unwatched', year: '2020', genre: '' }, 'open must copy committed filters into a draft');
assert.strictEqual(fixture.nodes['library-filter-rows'].children[0].children[1].textContent, 'library.unwatched', 'watch status must be visible inside advanced filters');
fixture.view.handleKeyDown(keyEvent(39), 'right');
assert.strictEqual(fixture.view.snapshot().draftFilters.watched, 'watched', 'watch status must cycle inside advanced filters');
fixture.view.handleKeyDown(keyEvent(40), 'down');
fixture.view.handleKeyDown(keyEvent(40), 'down');
fixture.view.handleKeyDown(keyEvent(13));
assert.strictEqual(fixture.view.snapshot().pickerKey, 'genre', 'Enter must open the focused filter picker');
fixture.view.handleKeyDown(keyEvent(13));
assert.strictEqual(fixture.view.snapshot().draftFilters.genre, '', 'an empty picker must retain its Any value');
fixture.view.activatePointer({ getAttribute: function () { return 'apply'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.deepStrictEqual(fixture.callbacks[0], ['apply', { watched: 'watched', year: '2020', genre: '' }], 'Apply must publish the draft filters');
assert.strictEqual(fixture.view.snapshot().open, false, 'Apply must close the drawer');
fixture.view.open({ key: 'movies' });
fixture.view.activatePointer({ getAttribute: function () { return 'reset'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.deepStrictEqual(fixture.view.snapshot().draftFilters, { watched: '', year: '', genre: '' }, 'Reset must clear only the draft filters');
assert.deepStrictEqual(fixture.callbacks[fixture.callbacks.length - 1], ['reset', { watched: '', year: '', genre: '' }], 'Reset must publish the cleared draft');
fixture.view.activatePointer({ getAttribute: function () { return 'cancel'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });

var applyChanged = createFixture();
applyChanged.view.setActiveFilters({ watched: '', year: '2020', genre: '' });
applyChanged.view.open({ key: 'movies' });
applyChanged.requests[0].callback(null, { year: [
  { value: '2020', label: '2020' }, { value: '2021', label: '2021' }
], genre: [] });
applyChanged.view.handleKeyDown(keyEvent(40), 'down');
applyChanged.view.handleKeyDown(keyEvent(13));
applyChanged.view.handleKeyDown(keyEvent(40), 'down');
applyChanged.view.handleKeyDown(keyEvent(40), 'down');
applyChanged.view.handleKeyDown(keyEvent(13));
assert.strictEqual(applyChanged.view.snapshot().draftFilters.year, '2021', 'selecting a different picker value must update the draft');
applyChanged.view.activatePointer({ getAttribute: function () { return 'apply'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.strictEqual(applyChanged.view.filters().year, '2021', 'Apply must commit the newly selected value');

var cancelChanged = createFixture();
cancelChanged.view.setActiveFilters({ watched: '', year: '2020', genre: 'drama' });
cancelChanged.view.open({ key: 'movies' });
cancelChanged.requests[0].callback(null, { year: [
  { value: '2020', label: '2020' }, { value: '2021', label: '2021' }
], genre: [{ value: 'drama', label: 'Drama' }] });
cancelChanged.view.activatePointer({ getAttribute: function () { return 'year'; }, hasAttribute: function (name) { return name === 'data-library-advanced-filter'; } });
cancelChanged.view.activatePointer({ getAttribute: function () { return '2'; }, hasAttribute: function (name) { return name === 'data-library-filter-option'; } });
assert.strictEqual(cancelChanged.view.snapshot().draftFilters.year, '2021', 'a newly selected value must exist only in the draft before Apply');
cancelChanged.view.activatePointer({ getAttribute: function () { return 'reset'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.deepStrictEqual(cancelChanged.view.snapshot().draftFilters, { watched: '', year: '', genre: '' }, 'Reset must clear the changed draft before Cancel');
cancelChanged.view.activatePointer({ getAttribute: function () { return 'cancel'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.deepStrictEqual(cancelChanged.view.filters(), { watched: '', year: '2020', genre: 'drama' }, 'Cancel must leave committed filters unchanged after draft changes and reset');

fixture.view.open({ key: 'movies' });
fixture.requests[0].callback(null, { year: [{ value: '2020', label: '2020' }], genre: [{ value: 'drama', label: 'Drama' }] });
fixture.view.activatePointer({ getAttribute: function () { return 'genre'; }, hasAttribute: function (name) { return name === 'data-library-advanced-filter'; } });
fixture.view.handleKeyDown(keyEvent(39), 'right');
fixture.view.activatePointer({ getAttribute: function () { return 'cancel'; }, hasAttribute: function (name) { return name === 'data-library-filter-action'; } });
assert.strictEqual(fixture.view.filters().genre, '', 'Cancel must discard draft changes');
assert.strictEqual(fixture.callbacks[fixture.callbacks.length - 2][0], 'cancel', 'Cancel must publish cancellation');
assert.strictEqual(fixture.view.snapshot().open, false, 'Cancel must close the drawer');

fixture.view.open({ key: 'movies' });
fixture.view.handleKeyDown(keyEvent(13));
assert.strictEqual(fixture.view.snapshot().pickerKey, 'watched', 'the first row must open the watch-status picker');
fixture.view.handleKeyDown(keyEvent(38), 'up');
assert.strictEqual(fixture.view.snapshot().focus.index, 1, 'Up must move watch-status picker focus');
fixture.view.handleKeyDown(keyEvent(27));
assert.strictEqual(fixture.view.snapshot().pickerKey, '', 'Back must leave the picker first');
assert.strictEqual(fixture.view.snapshot().focus.zone, 'rows', 'Back from picker must restore row focus');
fixture.view.handleKeyDown(keyEvent(461));
assert.strictEqual(fixture.view.snapshot().open, false, 'Back from rows must close the drawer');

var stale = createFixture();
stale.view.open({ key: 'movies' });
stale.view.close('cancel');
stale.view.open({ key: 'movies' });
assert.strictEqual(stale.requests.length, 2, 'reopening after cancellation must create a new option request');
assert.strictEqual(stale.requests[0].aborted, true, 'closing must abort the obsolete request');
stale.requests[0].callback(null, { year: [{ value: 'old', label: 'Old' }], genre: [] });
assert.strictEqual(stale.view.snapshot().options, null, 'a stale callback must not install options');
stale.requests[1].callback(null, { year: [{ value: 'new', label: 'New' }], genre: [] });
assert.strictEqual(stale.view.snapshot().options.year[0].label, 'New', 'the current callback must install options');

var empty = createFixture();
empty.view.open({ key: 'empty' });
empty.requests[0].callback(null, { year: [], genre: [] });
empty.view.activatePointer({ getAttribute: function () { return 'year'; }, hasAttribute: function (name) { return name === 'data-library-advanced-filter'; } });
assert.strictEqual(empty.nodes['library-filter-rows'].children.length, 1, 'an empty option list must still render the Any choice');
assert.strictEqual(empty.nodes['library-filter-rows'].children[0].textContent, 'Any', 'the empty option state must be selectable');
assert.strictEqual(empty.view.snapshot().focus.zone, 'picker', 'opening an empty picker must preserve picker focus');

assert.ok(fixture.focused.indexOf('clear') !== -1, 'remote focus updates must clear the host logical focus');
assert.strictEqual(fixture.nodes['library-filter-rows'].children[0].focused, true, 'the focused filter target must receive DOM focus');

console.log('Library filter view checks passed');
