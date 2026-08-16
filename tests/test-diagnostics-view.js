'use strict';

var assert = require('assert');
var DiagnosticsView = require('../app/diagnostics-view');

function node() {
  return {
    children: [],
    className: '',
    clientHeight: 200,
    scrollHeight: 800,
    scrollTop: 0,
    textContent: '',
    appendChild: function (child) { this.children.push(child); },
    setAttribute: function (name, value) { this.attributes = this.attributes || {}; this.attributes[name] = value; },
    focus: function () { this.focused = true; }
  };
}

var nodes = {
  'diagnostics-view': node(),
  'diagnostics-content': node(),
  'diagnostics-title': node(),
  'diagnostics-notice': node(),
  'diagnostics-refresh': node(),
  'diagnostics-export': node(),
  'diagnostics-qr-dialog': node(),
  'diagnostics-qr-title': node(),
  'diagnostics-qr-notice': node(),
  'diagnostics-qr-canvas': node(),
  'diagnostics-qr-fallback': node(),
  'diagnostics-report-text': node(),
  'diagnostics-qr-close': node(),
  'diagnostics-back': node()
};
var actions = [nodes['diagnostics-refresh'], nodes['diagnostics-export'], nodes['diagnostics-back']];
var interval = null;
var clearedIntervals = [];
var requests = [];
var opened = 0;
var closed = 0;
var rendered = 0;
var qrRendered = 0;
var documentStub = {
  getElementById: function (id) { return nodes[id]; },
  querySelectorAll: function () { return actions; }
};
var rootStub = {
  clearInterval: function (value) { clearedIntervals.push(value); },
  setInterval: function (callback, delay) { interval = { callback: callback, delay: delay }; return interval; }
};
var view = DiagnosticsView.create({
  document: documentStub,
  root: rootStub,
  t: function (key) { return key; },
  element: function (tagName, className, text) {
    var value = node();
    value.tagName = tagName;
    value.className = className;
    value.textContent = text || '';
    return value;
  },
  setText: function (id, text) { nodes[id].textContent = text; },
  formatFileSize: function (value) { return String(value) + ' B'; },
  formatLongTime: function (value) { return 'T' + value; },
  getSnapshot: function (identityState) {
    rendered += 1;
    return {
      appVersion: '1.0.0',
      server: { name: identityState.identity && identityState.identity.name || 'Server', version: '', machineIdentifier: '', reachable: identityState.reachable, addresses: [] },
      profile: { mode: 'Offline', name: 'Offline profile' },
      device: { modelName: 'TV', webOSVersion: '1', viewport: '1920x1080', known: true, uhd: false, hdr10: false },
      network: { status: 'local-only', lanAvailable: true, internetAvailable: false, connectionType: 'wired', localAddress: '192.168.1.20' },
      playback: null,
      error: identityState.error
    };
  },
  loadIdentity: function (callback) {
    var request = { aborted: false, abort: function () { this.aborted = true; } };
    requests.push({ callback: callback, request: request });
    return request;
  },
  getSupportReport: function () { return { mailto: 'mailto:?body=support', body: 'safe report text' }; },
  SupportQr: {
    create: function (value) { assert.strictEqual(value, 'mailto:?body=support'); return { modules: [[true]], size: 1, version: 1 }; },
    render: function () { qrRendered += 1; return true; }
  },
  isPointerSelectionActive: function () { return false; },
  onOpen: function () { opened += 1; },
  onClose: function () { closed += 1; }
});

view.open();
assert.strictEqual(view.isOpen(), true, 'opening must activate the diagnostics controller');
assert.strictEqual(opened, 1, 'opening must notify the application transition');
assert.strictEqual(nodes['diagnostics-view'].className, 'diagnostics-view', 'opening must reveal the diagnostics surface');
assert.strictEqual(interval.delay, 2000, 'opening must poll local playback data every two seconds');
assert.strictEqual(requests.length, 1, 'opening must request the local PMS identity once');
assert.strictEqual(actions[0].className, 'is-focused', 'opening must focus Refresh first');
assert.ok(
  nodes['diagnostics-content'].children.some(function (column) {
    return /diagnostics-column/.test(column.className) && column.children.some(function (section) {
      return section.children.some(function (child) { return child.textContent === 'diagnostics.network'; });
    });
  }),
  'diagnostics must render a dedicated network section'
);
assert.strictEqual(nodes['diagnostics-content'].children.length, 2, 'diagnostics sections must render in two independent columns');

nodes['diagnostics-content'].scrollTop = 90;
view.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.ok(nodes['diagnostics-content'].scrollTop > 90, 'Down must scroll long diagnostics content');

view.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(actions[1].className, 'is-focused', 'Right must move focus to Export');
view.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(actions[2].className, 'is-focused', 'Right must move focus from Export to Back');
view.handleKey({ keyCode: 37, preventDefault: function () {} }, 'left');
assert.strictEqual(actions[1].className, 'is-focused', 'Left must move focus from Back to Export');

view.setFocus(0);
assert.strictEqual(actions[0].className, 'is-focused', 'pointer selection must be able to synchronize the focused diagnostics action');

view.handleKey({ keyCode: 37, preventDefault: function () {} }, 'left');
view.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(requests.length, 2, 'OK on Refresh must start a fresh identity request');
assert.strictEqual(requests[0].request.aborted, true, 'refresh must abort the previous identity request');
var renderedBeforeStaleRefresh = rendered;
requests[0].callback(null, { name: 'Old server' });
assert.strictEqual(rendered, renderedBeforeStaleRefresh, 'an older request must not overwrite a newer diagnostics refresh');

view.setFocus(1);
view.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(nodes['diagnostics-qr-dialog'].className, 'diagnostics-qr-dialog', 'Export must open the support QR dialog');
assert.strictEqual(nodes['diagnostics-report-text'].textContent, 'safe report text', 'Export must expose the privacy-safe text report even when QR rendering succeeds');
assert.strictEqual(qrRendered, 1, 'Export must render one QR for the current support report');
nodes['diagnostics-qr-close'].onclick();
assert.strictEqual(nodes['diagnostics-qr-dialog'].className, 'diagnostics-qr-dialog is-hidden', 'the QR close button must close the dialog');
view.setFocus(1);
view.handleKey({ keyCode: 13, preventDefault: function () {} });
view.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(nodes['diagnostics-qr-dialog'].className, 'diagnostics-qr-dialog is-hidden', 'Back must close the support QR dialog first');

view.close();
assert.strictEqual(view.isOpen(), false, 'closing must deactivate the diagnostics controller');
assert.strictEqual(closed, 1, 'closing must notify the application transition');
assert.strictEqual(nodes['diagnostics-view'].className, 'diagnostics-view is-hidden', 'closing must hide the diagnostics surface');
assert.strictEqual(requests[1].request.aborted, true, 'closing must abort the active identity request');
assert.ok(clearedIntervals.length >= 1, 'closing must clear diagnostics polling');

requests[1].callback(null, { name: 'Stale server' });
assert.strictEqual(rendered, 1, 'stale identity callbacks after close must not render diagnostics again');

var synchronousNames = [];
var synchronousView = DiagnosticsView.create({
  document: documentStub,
  root: rootStub,
  t: function (key) { return key; },
  element: function (tagName, className, text) {
    var value = node();
    value.tagName = tagName;
    value.className = className;
    value.textContent = text || '';
    return value;
  },
  setText: function () {},
  formatFileSize: function (value) { return String(value); },
  formatLongTime: function (value) { return String(value); },
  getSnapshot: function (identityState) {
    synchronousNames.push(identityState.identity && identityState.identity.name || 'none');
    return {
      appVersion: '1.0.0',
      server: { name: synchronousNames[synchronousNames.length - 1], version: '', machineIdentifier: '', reachable: identityState.reachable, addresses: [] },
      profile: { mode: 'Offline', name: 'Offline profile' },
      device: { modelName: 'TV', webOSVersion: '1', viewport: '1920x1080', known: true, uhd: false, hdr10: false },
      playback: null,
      error: identityState.error
    };
  },
  loadIdentity: function (callback) {
    callback(null, { name: 'Immediate server' });
    return { abort: function () {} };
  },
  isPointerSelectionActive: function () { return false; }
});
synchronousView.open();
assert.strictEqual(synchronousNames[synchronousNames.length - 1], 'Immediate server', 'a synchronous identity callback must update diagnostics before refresh returns');

var offlineRenders = 0;
var offlineView = DiagnosticsView.create({
  document: documentStub,
  root: rootStub,
  t: function (key) { return key; },
  element: function (tagName, className, text) { var value = node(); value.tagName = tagName; value.className = className; value.textContent = text || ''; return value; },
  setText: function () {},
  formatFileSize: function (value) { return String(value); },
  formatLongTime: function (value) { return String(value); },
  getSnapshot: function (identityState) {
    offlineRenders += 1;
    return {
      appVersion: '1.0.0',
      server: { name: 'Server', version: '', machineIdentifier: '', reachable: identityState.reachable, addresses: [] },
      profile: { mode: 'Offline', name: 'Offline profile' },
      device: { modelName: 'TV', webOSVersion: '1', viewport: '1920x1080', known: true, uhd: false, hdr10: false },
      playback: null,
      error: identityState.error
    };
  },
  isPointerSelectionActive: function () { return false; }
});
offlineView.open();
assert.ok(offlineRenders >= 2, 'diagnostics without a configured identity adapter must still render an unreachable server state');

console.log('Diagnostics view checks passed');
