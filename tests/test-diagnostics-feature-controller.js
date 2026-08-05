'use strict';

var assert = require('assert');
var DiagnosticsFeatureController = require('../app/coordinator/diagnostics-feature-controller');

function createFixture() {
  var calls = [];
  var captured = null;
  var open = false;
  var focus = 0;
  var destroyed = false;
  var controller = {
    enter: function () {
      open = true;
      calls.push('controller-enter');
      captured.lifecycle.open();
      return { open: true };
    },
    leave: function () {
      if (open) {
        open = false;
        calls.push('controller-leave');
        captured.lifecycle.close();
      }
      return { open: false };
    },
    refresh: function () { calls.push('refresh'); return { open: open }; },
    render: function () { calls.push('render'); },
    handleKey: function (event, direction) {
      calls.push('key:' + direction);
      if (event && (event.keyCode === 27 || event.keyCode === 461)) { controller.leave(); }
      else if (event && event.keyCode === 13) { controller.activate(); }
      return { handled: true };
    },
    setFocus: function (index) { focus = index; calls.push('focus:' + index); },
    activate: function () { calls.push('activate:' + focus); },
    capturePlayback: function () { calls.push('capture'); return captured.providers.playback(); },
    setError: function (error) { calls.push('error:' + error); return String(error || ''); },
    error: function () { return 'last-error'; },
    isOpen: function () { return open; },
    snapshot: function () { return { open: open, focus: focus }; },
    destroy: function () {
      if (destroyed) { return; }
      destroyed = true;
      if (open) {
        open = false;
        captured.lifecycle.close();
      }
      calls.push('destroy');
    }
  };
  var activeServer = { name: 'Saved server', machineIdentifier: 'machine-1', uri: 'http://server:32400' };
  var playback = {
    playback: {
      fileName: 'episode.mkv',
      fileSize: 2048,
      sourceWidth: 3840,
      sourceHeight: 2160,
      originalVideoCodec: 'hevc',
      originalContainer: 'mkv',
      videoDynamicRange: 'HDR10',
      playbackMode: 'Direct Play',
      duration: 7200000
    }
  };
  var diagnostics = {
    fallback: 'direct-stream',
    delivery: 'direct-play',
    attempts: ['direct-play', 'direct-stream'],
    position: 125,
    buffered: [{ start: 120, end: 180 }],
    state: 'playing'
  };
  var options = {
    platform: {
      root: {
        innerWidth: 1920,
        innerHeight: 1080,
        navigator: { userAgent: 'Mozilla/5.0 webOS/4.10 Chrome/53.0' }
      },
      document: {}
    },
    modules: {
      DiagnosticsController: {
        create: function (received) { captured = received; return controller; }
      },
      DiagnosticsState: {},
      DiagnosticsView: {}
    },
    presentation: {
      t: function (key) { return key === 'profile.offline' ? 'Offline profile' : key; },
      element: function () {},
      setText: function () {},
      formatFileSize: function () {},
      formatLongTime: function () {},
      formatTime: function (seconds) { return 'T' + seconds; },
      pointerActive: function () { return false; }
    },
    state: {
      appVersion: function () { return '1.0.4'; },
      config: function () { return { serverName: 'Configured server', apiBaseUrl: 'http://fallback:32400' }; },
      activeServer: function () { return activeServer; },
      serverAddresses: function (server) { return [{ kind: 'local', uri: server.uri }]; },
      authMode: function () { return 'plex'; },
      activeProfile: function () { return { title: 'Luca' }; },
      playbackCapabilities: function () {
        return { modelName: 'LG OLED', known: true, uhd: true, hdr10: true, dolbyVision: false, hdrKnown: true };
      },
      networkSnapshot: function () { return { status: 'online', lanAvailable: true }; },
      playbackSnapshot: function () { return playback; },
      playbackDiagnostics: function () { return diagnostics; }
    },
    transport: {
      loadIdentity: function () { calls.push('load-identity'); return null; }
    },
    transitions: {
      enter: function () { calls.push('surface-enter'); },
      leave: function () { calls.push('surface-leave'); }
    }
  };
  return {
    feature: DiagnosticsFeatureController.create(options),
    calls: calls,
    captured: function () { return captured; },
    controller: controller
  };
}

(function derivesDiagnosticProvidersInsideTheFeature() {
  var fixture = createFixture();
  var providers = fixture.captured().providers;
  var server = providers.server({ reachable: true, identity: { name: 'Live server', version: '1.40', machineIdentifier: 'live-1' } });
  var profile = providers.profile();
  var device = providers.device();
  var playback = providers.playback();

  assert.strictEqual(providers.appVersion(), '1.0.4');
  assert.strictEqual(server.name, 'Live server');
  assert.strictEqual(server.version, '1.40');
  assert.strictEqual(server.machineIdentifier, 'live-1');
  assert.strictEqual(server.reachable, true);
  assert.strictEqual(server.addresses[0].uri, 'http://server:32400');
  assert.deepStrictEqual(profile, { mode: 'Plex', name: 'Luca' });
  assert.strictEqual(device.modelName, 'LG OLED');
  assert.strictEqual(device.webOSVersion, '4.10');
  assert.strictEqual(device.viewport, '1920x1080');
  assert.strictEqual(providers.network().status, 'online');
  assert.strictEqual(playback.source, '3840x2160 / HEVC / MKV / HDR10');
  assert.strictEqual(playback.strategy, 'direct-stream');
  assert.strictEqual(playback.attempts.join(','), 'direct-play,direct-stream');
  assert.strictEqual(playback.buffered, 'T120-T180');
  assert.strictEqual(playback.duration, 7200);
}());

(function ownsLifecycleAndSemanticInput() {
  var fixture = createFixture();
  var feature = fixture.feature;

  feature.enter();
  assert.ok(fixture.calls.indexOf('surface-enter') !== -1, 'enter must use the explicit root transition');
  feature.focusAction(1);
  feature.handleKey({ keyCode: 13 }, '');
  feature.handleKey({ keyCode: 40 }, 'down');
  assert.ok(fixture.calls.indexOf('focus:1') !== -1 && fixture.calls.indexOf('activate:1') !== -1, 'pointer semantics must route through the composed controller');
  assert.ok(fixture.calls.indexOf('key:down') !== -1, 'keyboard input must route through the feature');

  feature.suspend();
  assert.strictEqual(fixture.calls.filter(function (entry) { return entry === 'surface-leave'; }).length, 0, 'suspend must close Diagnostics without restoring Settings');
  feature.enter();
  feature.handleKey({ keyCode: 461 }, '');
  assert.strictEqual(fixture.calls.filter(function (entry) { return entry === 'surface-leave'; }).length, 1, 'Back input must restore the originating Settings surface once');
}());

(function proxiesCaptureErrorAndIdempotentDestroy() {
  var fixture = createFixture();
  var feature = fixture.feature;
  feature.enter();
  assert.strictEqual(feature.capturePlayback().fileName, 'episode.mkv');
  assert.strictEqual(feature.setError('failure'), 'failure');
  assert.strictEqual(feature.error(), 'last-error');
  feature.destroy();
  feature.destroy();
  assert.strictEqual(fixture.calls.filter(function (entry) { return entry === 'destroy'; }).length, 1, 'destroy must dispose the composed controller once');
  assert.deepStrictEqual(feature.handleKey({ keyCode: 13 }, ''), { handled: false }, 'destroyed feature must reject input');
  assert.strictEqual(feature.enter(), false, 'destroyed feature must not reopen');
}());

console.log('Diagnostics feature controller checks passed');
