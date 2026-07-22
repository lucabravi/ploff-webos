'use strict';

var assert = require('assert');
var SearchModel = require('../app/search-model');
var SearchSession = require('../app/search-session');
var T9Input = require('../app/t9-input');
var SearchView = require('../app/search-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '',
    children: [], attributes: {}, style: {}, parentNode: null, clientWidth: 300, clientHeight: 240,
    scrollTop: 0, scrollHeight: 1000, focused: false, src: '', alt: '', type: ''
  };
  value.appendChild = function (child) {
    if (child.parentNode && child.parentNode.removeChild) { child.parentNode.removeChild(child); }
    child.parentNode = value;
    value.children.push(child);
    if (child.textContent) { value.textContent += child.textContent; }
    return child;
  };
  value.removeChild = function (child) {
    var index = value.children.indexOf(child);
    if (index !== -1) { value.children.splice(index, 1); child.parentNode = null; }
    return child;
  };
  value.setAttribute = function (key, attributeValue) { value.attributes[key] = String(attributeValue); };
  value.getAttribute = function (key) { return value.attributes[key]; };
  value.hasAttribute = function (key) { return Object.prototype.hasOwnProperty.call(value.attributes, key); };
  value.focus = function () { value.focused = true; };
  value.getBoundingClientRect = function () {
    return { width: value.clientWidth || 100, height: value.clientHeight || 80, top: 0, bottom: value.clientHeight || 80 };
  };
  value.querySelector = function (selector) { return find(value, selector)[0] || null; };
  value.querySelectorAll = function (selector) { return find(value, selector); };
  value.getElementsByTagName = function (tag) {
    return find(value, tag.toLowerCase() === 'img' ? 'img' : tag);
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      value.children.forEach(function (child) { child.parentNode = null; });
      value.children = [];
      value.textContent = '';
    }
  });
  return value;
}

function matches(value, selector) {
  var attribute = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
  if (attribute) { return value.getAttribute(attribute[1]) === attribute[2]; }
  if (selector.charAt(0) === '.') { return (' ' + value.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1; }
  return value.tagName.toLowerCase() === selector.toLowerCase();
}

function find(root, selector, result) {
  var output = result || [];
  root.children.forEach(function (child) {
    if (matches(child, selector)) { output.push(child); }
    find(child, selector, output);
  });
  return output;
}

function fakeDocument() {
  var roots = {};
  var documentRef = {
    createElement: function (tagName) { return node(tagName); },
    createTextNode: function (text) { return node('#text', '', text); },
    getElementById: function (id) { return roots[id]; },
    querySelector: function (selector) {
      var ids = Object.keys(roots);
      var index;
      var result;
      for (index = 0; index < ids.length; index += 1) {
        result = find(roots[ids[index]], selector);
        if (result.length) { return result[0]; }
      }
      return null;
    },
    querySelectorAll: function (selector) {
      var ids = Object.keys(roots);
      var result = [];
      ids.forEach(function (id) { find(roots[id], selector, result); });
      return result;
    }
  };
  [
    'search-view', 'search-query', 'search-t9-legend', 'search-keyboard', 'search-results', 'search-status'
  ].forEach(function (id) {
    roots[id] = node('div');
    roots[id].id = id;
  });
  roots['search-results'].clientWidth = 300;
  roots['search-results'].clientHeight = 240;
  return documentRef;
}

function timersRoot() {
  var timers = [];
  return {
    timers: timers,
    clearTimeout: function (timer) { if (timer) { timer.cleared = true; } },
    setTimeout: function (callback, delay) {
      var timer = { callback: callback, delay: delay, cleared: false };
      timers.push(timer);
      return timer;
    }
  };
}

function createView(overrides) {
  var root = timersRoot();
  var documentRef = fakeDocument();
  var statuses = [];
  var focusEvents = [];
  var callbacks = [];
  var posterCancellations = [];
  var options = {
    root: root,
    document: documentRef,
    SearchModel: SearchModel,
    SearchSession: SearchSession,
    T9Input: T9Input,
    element: function (tagName, className, text) { return node(tagName, className, text); },
    t: function (key) { return key; },
    isActive: function () { return true; },
    navigationCount: 3,
    navTarget: function () { return null; },
    clearFocus: function () {},
    pointerSelectionActive: function () { return false; },
    onStatus: function (status) { statuses.push(status); },
    onFocus: function (focus) { focusEvents.push(focus); },
    onBack: function () { callbacks.push('back'); },
    onOpenResult: function (item) { callbacks.push(item.ratingKey); },
    cardWidth: 100,
    cardHeight: 80,
    resultOverscanRows: 1,
    posterLoader: {
      loadBatch: function () {},
      cancelScope: function (scope) { posterCancellations.push(scope); }
    }
  };
  var key;
  overrides = overrides || {};
  for (key in overrides) { if (Object.prototype.hasOwnProperty.call(overrides, key)) { options[key] = overrides[key]; } }
  return {
    view: SearchView.create(options), root: root, document: documentRef,
    statuses: statuses, focusEvents: focusEvents, callbacks: callbacks, posterCancellations: posterCancellations
  };
}

var fixture = createView();
var view = fixture.view;
var first = { ratingKey: 'one', title: 'One', image: 'one.jpg', libraryTitle: 'Anime' };
var second = { ratingKey: 'two', title: 'Two', image: 'two.jpg', libraryTitle: 'Anime' };

assert.deepStrictEqual(view.snapshot().focus, { zone: 'keyboard', row: 0, column: 0, index: 0, navIndex: 0 }, 'search must start on the keyboard');
view.open(false, 2);
assert.strictEqual(view.snapshot().open, true, 'open must activate the view');
assert.strictEqual(view.snapshot().focus.navIndex, 2, 'open must retain the coordinator navigation index for Up from the keyboard');
assert.ok(fixture.document.getElementById('search-view').className.indexOf('is-hidden') === -1, 'open must reveal the view');

view.setResults(null, [first, second]);
view.focusResult(0);
var firstCard = fixture.document.getElementById('search-results').children[0];
var secondCard = fixture.document.getElementById('search-results').children[1];
assert.strictEqual(firstCard.getAttribute('data-media-key'), 'one', 'result cards must expose their stable media key');
assert.strictEqual(firstCard.querySelector('.search-card-title').textContent, 'One', 'a card must render its title');
assert.strictEqual(firstCard.querySelector('.search-card-image').getAttribute('data-search-image'), 'one.jpg', 'a card image must be associated with its item');

view.setResults(null, [second, { ratingKey: 'three', title: 'Three', image: 'three.jpg', libraryTitle: 'Anime' }]);
var reused = fixture.document.getElementById('search-results').children[0];
assert.strictEqual(reused, secondCard, 'the keyed renderer must reuse a card when its position is recycled');
assert.strictEqual(reused.getAttribute('data-media-key'), 'two', 'reused cards must be rebound to the new item key');
assert.strictEqual(reused.querySelector('.search-card-title').textContent, 'Two', 'reused cards must update their title');
assert.strictEqual(reused.querySelector('.search-card-image').getAttribute('data-search-image'), 'two.jpg', 'reused cards must update their image association');

view.focusKeyboard(4, 0);
view.handleDirection('down');
assert.strictEqual(view.snapshot().focus.zone, 'results', 'down from the keyboard must enter results when they exist');
view.focusKeyboard(0, 0);
view.handleDirection('up');
assert.strictEqual(view.snapshot().focus.zone, 'nav', 'Up through the keyboard must return to navigation');
assert.strictEqual(view.snapshot().focus.navIndex, 2, 'vertical focus movement must preserve the active navigation index');
view.focusResult(0);
view.pointerFocus(reused);
assert.strictEqual(view.snapshot().focus.index, 0, 'pointer focus must select the pointed result');
view.activate();
assert.deepStrictEqual(fixture.callbacks, ['two'], 'activating a focused result must route the selected item');

var stale = createView();
var staleRequests = [];
stale = createView({
  load: function (query, callback) {
    var request = {
      query: query, callback: callback, aborted: false,
      abort: function () { this.aborted = true; }
    };
    staleRequests.push(request);
    return request;
  }
});
stale.view.open(false);
stale.view.applyKey('a');
stale.view.applyKey('t');
assert.strictEqual(stale.root.timers.length, 1, 'a searchable query must be debounced by the composed session');
stale.root.timers[0].callback();
assert.strictEqual(staleRequests.length, 1, 'the composed session must invoke the injected adapter');
stale.view.applyKey('t');
stale.root.timers[1].callback();
assert.strictEqual(staleRequests[0].aborted, true, 'a newer query must cancel the previous request');
staleRequests[0].callback(null, [{ ratingKey: 'stale', title: 'Stale' }]);
assert.deepStrictEqual(stale.view.snapshot().results, [], 'a stale response must not replace current results');
staleRequests[1].callback(null, [{ ratingKey: 'current', title: 'Current' }]);
assert.deepStrictEqual(stale.view.snapshot().results.map(function (item) { return item.ratingKey; }), ['current'], 'the current response must be accepted');
assert.strictEqual(stale.view.snapshot().query, 'att', 'the view must own the query passed to the session');

var backFixture = createView();
backFixture.view.open(false);
backFixture.view.applyKey('a');
backFixture.view.applyKey('t');
backFixture.view.back();
assert.strictEqual(backFixture.view.snapshot().query, '', 'Back must clear a non-empty query before leaving search');
assert.strictEqual(backFixture.view.snapshot().open, true, 'clearing a query with Back must keep search open');
assert.deepStrictEqual(backFixture.callbacks, [], 'clearing a query must not notify the cross-view router');
assert.ok(backFixture.posterCancellations.length > 0, 'clearing a query must cancel obsolete poster work');
backFixture.view.back();
assert.strictEqual(backFixture.view.snapshot().open, false, 'a second Back on an empty query must close search');
assert.deepStrictEqual(backFixture.callbacks, ['back'], 'closing search must notify the coordinator once');
assert.strictEqual(backFixture.posterCancellations[backFixture.posterCancellations.length - 1], 'search', 'closing search must cancel its poster scope');

view.back();
assert.strictEqual(view.snapshot().open, false, 'Back must close the search view');
assert.deepStrictEqual(fixture.callbacks, ['two', 'back'], 'Back must notify the coordinator once');
assert.ok(fixture.document.getElementById('search-view').className.indexOf('is-hidden') !== -1, 'Back must hide the view');
assert.ok(fixture.statuses.length > 0, 'search lifecycle must publish status changes');

console.log('Search view checks passed');
