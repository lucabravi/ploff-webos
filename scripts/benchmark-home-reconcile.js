'use strict';

var path = require('path');
var root = process.cwd();
var rootArgument = process.argv.filter(function (value) { return value.indexOf('--controller-root=') === 0; })[0];
if (rootArgument) { root = path.resolve(rootArgument.split('=').slice(1).join('=')); }

var ShellController = require(path.join(root, 'app/coordinator/shell-controller'));
var HomeState = require(path.join(root, 'app/home-state'));
var FocusModel = require(path.join(root, 'app/focus-model'));
var NavigationModel = require(path.join(root, 'app/navigation-model'));
var NavbarWindow = require(path.join(root, 'app/navbar-window'));
var CardLayout = require(path.join(root, 'app/card-layout'));
var MediaLabels = require(path.join(root, 'app/media-labels'));
var NavigationIcon = require(path.join(root, 'app/navigation-icon'));

var counters = { cardMoves: 0, sectionMoves: 0, posterSpecs: 0, posterJobs: 0, textWrites: 0 };

function TimerRoot() { this.next = 1; this.timers = {}; }
TimerRoot.prototype.setTimeout = function (callback, delay) { var id = this.next; this.next += 1; this.timers[id] = { callback: callback, delay: delay }; return id; };
TimerRoot.prototype.clearTimeout = function (id) { delete this.timers[id]; };

function FakeElement(tagName, className) {
  var self = this;
  this.tagName = String(tagName || 'div').toUpperCase();
  this.className = className || '';
  this.children = [];
  this.parentNode = null;
  this.attributes = {};
  this.style = { setProperty: function (key, value) { self.style[key] = value; } };
  this.clientWidth = 1920;
  this.clientHeight = 1080;
  this.offsetWidth = 180;
  this.scrollTop = 0;
  this.textContent = '';
}
Object.defineProperty(FakeElement.prototype, 'innerHTML', { get: function () { return ''; }, set: function () { this.children = []; } });
FakeElement.prototype.appendChild = function (child) {
  var index;
  if (!child) { return child; }
  if (this.className === 'media-row') { counters.cardMoves += 1; }
  if (this.id === 'content') { counters.sectionMoves += 1; }
  if (child.parentNode) { index = child.parentNode.children.indexOf(child); if (index !== -1) { child.parentNode.children.splice(index, 1); } }
  child.parentNode = this;
  this.children.push(child);
  return child;
};
FakeElement.prototype.insertBefore = function (child, reference) {
  var childIndex;
  var referenceIndex;
  if (!reference) { return this.appendChild(child); }
  if (child === reference) { return child; }
  if (this.className === 'media-row') { counters.cardMoves += 1; }
  if (this.id === 'content') { counters.sectionMoves += 1; }
  if (child.parentNode) { childIndex = child.parentNode.children.indexOf(child); if (childIndex !== -1) { child.parentNode.children.splice(childIndex, 1); } }
  referenceIndex = this.children.indexOf(reference);
  if (referenceIndex === -1) { return this.appendChild(child); }
  child.parentNode = this;
  this.children.splice(referenceIndex, 0, child);
  return child;
};
FakeElement.prototype.removeChild = function (child) { var index = this.children.indexOf(child); if (index !== -1) { this.children.splice(index, 1); child.parentNode = null; } return child; };
FakeElement.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
FakeElement.prototype.getAttribute = function (name) { return this.attributes[name]; };
FakeElement.prototype.hasAttribute = function (name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); };
FakeElement.prototype.focus = function () {};
FakeElement.prototype.getBoundingClientRect = function () { return { top: 0, bottom: 100, width: this.offsetWidth, height: this.clientHeight }; };
FakeElement.prototype.getElementsByTagName = function (tagName) {
  var result = [];
  var expected = String(tagName).toUpperCase();
  function visit(node) { node.children.forEach(function (child) { if (child.tagName === expected) { result.push(child); } visit(child); }); }
  visit(this);
  return result;
};
FakeElement.prototype.querySelectorAll = function (selector) {
  var result = [];
  function matches(node) {
    var className;
    var attributes;
    if (selector.charAt(0) === '.') { className = selector.slice(1); return (' ' + node.className + ' ').indexOf(' ' + className + ' ') !== -1; }
    attributes = selector.match(/\[([^=\]]+)="([^"]*)"\]/g) || [];
    if (attributes.length) {
      return attributes.every(function (entry) { var parts = entry.match(/\[([^=\]]+)="([^"]*)"\]/); return node.getAttribute(parts[1]) === parts[2]; });
    }
    return false;
  }
  function visit(node) { node.children.forEach(function (child) { if (matches(child)) { result.push(child); } visit(child); }); }
  visit(this);
  return result;
};
FakeElement.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };

function FakeDocument() { this.nodes = {}; this.body = new FakeElement('body', ''); this.documentElement = new FakeElement('html', ''); }
FakeDocument.prototype.createTextNode = function (text) { var node = new FakeElement('#text', ''); node.textContent = String(text || ''); return node; };
FakeDocument.prototype.getElementById = function (id) { return this.nodes[id] || null; };
FakeDocument.prototype.register = function (id, node) { this.nodes[id] = node; node.id = id; return node; };
FakeDocument.prototype.querySelectorAll = function (selector) { var result = []; Object.keys(this.nodes).forEach(function (id) { result = result.concat(this.nodes[id].querySelectorAll(selector)); }, this); return result; };
FakeDocument.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };

function elementFactory(document) { return function (tagName, className, text) { var node = new FakeElement(tagName, className); if (text) { node.appendChild(document.createTextNode(text)); } return node; }; }
function updateText(node, value) { counters.textWrites += 1; node.innerHTML = ''; node.appendChild(new FakeElement('#text', '')); node.children[0].textContent = String(value || ''); }
function resetCounters() { counters.cardMoves = 0; counters.sectionMoves = 0; counters.posterSpecs = 0; counters.posterJobs = 0; counters.textWrites = 0; }
function snapshotCounters() { return { cardMoves: counters.cardMoves, sectionMoves: counters.sectionMoves, posterSpecs: counters.posterSpecs, posterJobs: counters.posterJobs, textWrites: counters.textWrites }; }
function item(row, column, progress) { return { ratingKey: 'r' + row + 'c' + column, title: 'Media ' + row + '-' + column, image: '/poster/' + row + '/' + column + '.jpg', progress: progress || 0 }; }
function rows(rowCount, itemCount) {
  var result = [];
  var rowIndex;
  var column;
  var entries;
  for (rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    entries = [];
    for (column = 0; column < itemCount; column += 1) { entries.push(item(rowIndex, column, column === 0 ? 20 : 0)); }
    result.push({ title: rowIndex === 0 ? 'Continue Watching' : 'Row ' + rowIndex, shape: rowIndex % 3 === 1 ? 'wide' : 'poster', items: entries });
  }
  return result;
}
function cloneRows(value) { return JSON.parse(JSON.stringify(value)); }
function createController() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  document.register('home-preview', new FakeElement('section', 'home-preview'));
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-title', new FakeElement('h1', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('home-preview-summary', new FakeElement('p', ''));
  document.register('navigation', new FakeElement('nav', ''));
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  return {
    content: content,
    controller: ShellController.create({
      modules: { HomeState: HomeState, FocusModel: FocusModel, NavigationModel: NavigationModel, NavbarWindow: NavbarWindow, CardLayout: CardLayout, MediaLabels: MediaLabels, NavigationIcon: NavigationIcon },
      document: document,
      clock: new TimerRoot(),
      navigationItems: [{ kind: 'home', title: 'Home' }],
      services: {
        posterLoader: {
          loadBatch: function (jobs) { counters.posterJobs += jobs.length; jobs.forEach(function (job) { job.target.__plexProgressiveState = job.specification.previewOnly === true ? 'preview' : 'full'; }); },
          needsLoad: function (target, previewOnly) { var state = String(target && target.__plexProgressiveState || ''); if (state === 'full') { return false; } if (previewOnly === true && state === 'preview') { return false; } return true; },
          prioritize: function () {}, cancelScope: function () {}, load: function () {}
        },
        stopTheme: function () {}
      },
      presentation: {
        element: elementFactory(document),
        updateText: updateText,
        translate: function (key) { return key; },
        fixedPosterSpecification: function (source, size, priority, scope) { counters.posterSpecs += 1; return { source: source, previewWidth: size.previewWidth, previewHeight: size.previewHeight, width: size.width, height: size.height, priority: priority, scope: scope }; },
        prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
      },
      access: { settings: function () { return { cardScale: 100 }; }, currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; } }
    })
  };
}
function timed(operation, iterations) {
  var start = process.hrtime();
  var index;
  for (index = 0; index < iterations; index += 1) { operation(index); }
  var elapsed = process.hrtime(start);
  return elapsed[0] * 1000 + elapsed[1] / 1000000;
}
function runScenario(name, initialRows, mutate, iterations) {
  var harness = createController();
  var controller = harness.controller;
  var current = cloneRows(initialRows);
  var samples = [];
  var round;
  controller.useHomeRows(current, 0, { focus: 'first' });
  resetCounters();
  mutate(current, 0);
  controller.useHomeRows(current, 0, { focus: 'preserve' });
  var deterministic = snapshotCounters();
  for (round = 0; round < 5; round += 1) {
    resetCounters();
    samples.push(timed(function (index) { mutate(current, round * iterations + index + 1); controller.useHomeRows(current, 0, { focus: 'preserve' }); }, iterations));
  }
  samples.sort(function (left, right) { return left - right; });
  controller.destroy();
  console.log(name + ': median ' + samples[2].toFixed(3) + ' ms / ' + iterations + ' reconciles' +
    ' (range ' + samples[0].toFixed(3) + '-' + samples[4].toFixed(3) + ') ' + JSON.stringify(deterministic));
}

var sourceRows = rows(Number(process.env.PLOFF_HOME_ROWS || 15), Number(process.env.PLOFF_HOME_ITEMS || 12));
var iterations = Number(process.env.PLOFF_HOME_ITERATIONS || 200);
console.log('Home reconcile benchmark: ' + sourceRows.length + ' rows, ' + sourceRows[0].items.length + ' items/row');
runScenario('unchanged', sourceRows, function () {}, iterations);
runScenario('progress-only', sourceRows, function (value, index) { value[0].items[0].progress = index % 2 ? 21 : 22; }, iterations);
runScenario('continue-reorder', sourceRows, function (value) { var last = value[0].items.pop(); value[0].items.unshift(last); }, iterations);
runScenario('recent-insert', sourceRows, function (value, index) { value[1].items.unshift({ ratingKey: 'new-' + index, title: 'New ' + index, image: '/poster/new/' + index + '.jpg' }); value[1].items.pop(); }, iterations);
