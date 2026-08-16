'use strict';

var assert = require('assert');
var DiagnosticsController = require('../app/coordinator/diagnostics-controller');
var calls = [];
var active = false;
var focus = 0;
var renderedSnapshots = [];
var aborted = false;
var identityCallback = null;
var playbackReads = 0;

var fakeView = {
  open: function () { active = true; calls.push('viewOpen'); if (fakeView.options.onOpen) { fakeView.options.onOpen(); } },
  close: function () { active = false; calls.push('viewClose'); if (fakeView.options.onClose) { fakeView.options.onClose(); } },
  destroy: function () { active = false; calls.push('destroy'); },
  isOpen: function () { return active; },
  refresh: function () { calls.push('refresh'); },
  render: function () { calls.push('render'); },
  handleKey: function (event, direction) {
    calls.push('key:' + direction + ':' + event.keyCode);
    if (event.keyCode === 461) { this.close(); }
  },
  activate: function () { calls.push('activate:' + focus); },
  closeSupportQr: function () { calls.push('closeSupportQr'); },
  setFocus: function (index) { focus = index; calls.push('focus:' + index); },
  scroll: function (direction) { calls.push('scroll:' + direction); }
};

var controller = DiagnosticsController.create({
  platform: { root: {}, document: {} },
  modules: {
    DiagnosticsState: {
      sanitizeText: function (value) {
        return String(value || '').replace(/token=[^\s]+/g, 'token=[redacted]');
      },
      playback: function (value) { return value && { state: value.state, fileName: value.fileName }; },
      snapshot: function (values) {
        var result = {
          appVersion: values.appVersion,
          server: values.server,
          profile: values.profile,
          device: values.device,
          network: values.network,
          playback: values.playback,
          error: String(values.error || '').replace(/token=[^\s]+/g, 'token=[redacted]')
        };
        renderedSnapshots.push(result);
        return result;
      }
    },
    SupportSnapshot: {
      create: function (values) { return { playback: values.playback, failurePlayback: values.failurePlayback, error: values.error, jsErrors: values.jsErrors, settings: values.settings, compatibility: values.compatibility }; }
    },
    SupportQr: {},
    DiagnosticsView: {
      create: function (options) {
        fakeView.options = options;
        return fakeView;
      }
    }
  },
  presentation: {
    t: function (key) { return key; },
    element: function () {},
    setText: function () {},
    formatFileSize: function () {},
    formatLongTime: function () {},
    pointerActive: function () { return false; }
  },
  providers: {
    appVersion: function () { return '1.0.4'; },
    server: function (identityState) {
      return { name: identityState.identity ? identityState.identity.name : 'Saved', reachable: identityState.reachable === true };
    },
    profile: function () { return { mode: 'Plex', name: 'Luca' }; },
    device: function () { return { modelName: 'LG TV', webOSVersion: '4.10' }; },
    network: function () { return { status: 'online' }; },
    settings: function () { return { version: 3, visualTheme: 'immersive' }; },
    compatibility: function () { return { schemaVersion: 3, formatRuleCount: 2 }; },
    playback: function () { playbackReads += 1; return { state: 'playing', fileName: 'episode.mkv' }; },
    jsErrors: function () { return [{ type: 'error', message: 'runtime failure' }]; },
    loadIdentity: function (callback) {
      identityCallback = callback;
      return { abort: function () { aborted = true; } };
    }
  },
  lifecycle: {
    open: function () { calls.push('open'); },
    close: function () { calls.push('close'); }
  }
});

assert.strictEqual(controller.isOpen(), false, 'diagnostics starts closed');
controller.enter();
assert.strictEqual(controller.isOpen(), true, 'enter opens diagnostics');
assert.ok(calls.indexOf('open') >= 0, 'opening routes through lifecycle callback');
assert.ok(typeof fakeView.options.getSnapshot === 'function', 'the view receives one snapshot provider');

var snapshot = fakeView.options.getSnapshot({ reachable: true, identity: { name: 'Live' } });
assert.strictEqual(snapshot.server.name, 'Live', 'identity refresh feeds the server snapshot');
assert.strictEqual(snapshot.profile.name, 'Luca', 'profile diagnostics remain independent');
assert.strictEqual(snapshot.device.modelName, 'LG TV', 'device diagnostics remain independent');
assert.strictEqual(snapshot.network.status, 'online', 'network diagnostics remain independent');
assert.strictEqual(snapshot.playback.fileName, 'episode.mkv', 'playback diagnostics remain independent');

controller.capturePlayback();
controller.setError('failure token=secret');
snapshot = controller.snapshot();
assert.strictEqual(snapshot.error, 'failure token=[redacted]', 'diagnostic errors are redacted before export');
var supportReport = fakeView.options.getSupportReport();
assert.deepStrictEqual(supportReport.jsErrors, [{ type: 'error', message: 'runtime failure' }], 'support reports must receive collected JavaScript errors');
assert.strictEqual(supportReport.settings.visualTheme, 'immersive', 'support reports must receive current settings');
assert.strictEqual(supportReport.compatibility.schemaVersion, 3, 'support reports must receive compatibility summary');

assert.deepStrictEqual(controller.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down'), { handled: true }, 'open diagnostics consume remote input');
assert.ok(calls.indexOf('key:down:40') >= 0, 'remote scrolling routes through the diagnostics view');
assert.deepStrictEqual(controller.handlePointer('focus', { target: { getAttribute: function () { return 'back'; } } }), { handled: true }, 'pointer focus is synchronized');
assert.strictEqual(focus, 2, 'the Back action owns the third diagnostics focus slot');
controller.handlePointer('activate', { target: { getAttribute: function () { return 'refresh'; } } });
assert.ok(calls.indexOf('activate:0') >= 0, 'pointer activation uses the same action path');
controller.handlePointer('activate', { target: { getAttribute: function (name) {
  return name === 'data-diagnostics-qr-action' ? 'close' : null;
} } });
assert.ok(calls.indexOf('closeSupportQr') >= 0, 'pointer activation closes the support QR dialog');

controller.leave();
assert.strictEqual(controller.isOpen(), false, 'leave closes diagnostics');
assert.ok(calls.indexOf('close') >= 0, 'closing routes through lifecycle callback');
controller.enter();
controller.destroy();
var readsAfterDestroy = playbackReads;
controller.capturePlayback();
controller.setError('late token=secret');
assert.strictEqual(playbackReads, readsAfterDestroy, 'destroyed diagnostics must not query playback providers');
assert.strictEqual(controller.error(), '', 'destroyed diagnostics must not accept late errors');
assert.strictEqual(controller.isOpen(), false, 'destroy tears down diagnostics');
assert.deepStrictEqual(controller.handleKey({ keyCode: 13 }, ''), { handled: false }, 'destroy makes input inert');
assert.strictEqual(aborted, false, 'the controller does not own an extra request outside the view');
assert.ok(identityCallback === null, 'identity requests remain initiated by the view refresh lifecycle');

console.log('Diagnostics controller checks passed');
