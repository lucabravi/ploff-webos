'use strict';

var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var acorn = require('acorn');
var zlib = require('zlib');

var root = path.join(__dirname, '..');
var workerPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.js');
var fallbackFontPath = path.join(root, 'app', 'vendor', 'default.woff2');
var fullWorkerSourcePath = path.join(root, 'scripts', 'vendor-sources', 'subtitles-octopus-worker-legacy-4.1.0.full.js.gz');
var source = fs.readFileSync(workerPath, 'utf8');
var fullSource = zlib.gunzipSync(fs.readFileSync(fullWorkerSourcePath)).toString('utf8');
var xhrRequests = [];
var forceInvalidSyncFont = false;
var forceMissingFont = false;
var forceAsyncFontSetupFailure = false;

function nativePayload(value) {
  var startMarker = '// EMSCRIPTEN_START_ASM';
  var endMarker = '// EMSCRIPTEN_END_ASM';
  var memoryStartMarker = 'function p(q){';
  var memoryEndMarker = '}var r=new ArrayBuffer(16);';
  var start = value.indexOf(startMarker);
  var end = value.indexOf(endMarker);
  var payload;
  var memoryStart;
  var memoryEnd;
  assert.ok(start >= 0 && end > start, 'legacy worker must retain the generated Emscripten payload markers');
  payload = value.slice(start, end + endMarker.length);
  memoryStart = payload.indexOf(memoryStartMarker);
  memoryEnd = payload.indexOf(memoryEndMarker, memoryStart);
  assert.ok(memoryStart >= 0 && memoryEnd > memoryStart, 'legacy worker must retain the Emscripten static memory initializer boundary');
  return payload.slice(0, memoryStart) + 'function p(q){/* static-memory */}' +
    payload.slice(memoryEnd + 1);
}

function canvasFingerprint(message) {
  var hash = crypto.createHash('sha256');
  (message.canvases || []).forEach(function (canvas) {
    if (canvas.buffer) { hash.update(Buffer.from(new Uint8Array(canvas.buffer))); }
  });
  return hash.digest('hex');
}

function filePathFromUrl(url) {
  var value = String(url || '').replace(/[?#].*$/, '');
  if (/^file:\/\//.test(value)) { return decodeURIComponent(value.replace(/^file:\/\//, '')); }
  if (path.isAbsolute(value)) { return value; }
  return path.join(path.dirname(workerPath), value);
}

function FakeXHR() {
  this.method = 'GET';
  this.url = '';
  this.async = true;
  this.status = 0;
  this.responseType = '';
  this.response = null;
  this.responseText = '';
  this.onload = null;
  this.onerror = null;
  this.headers = {};
}
FakeXHR.prototype.open = function (method, url, async) {
  if (forceAsyncFontSetupFailure && async !== false && String(url || '').indexOf('default.woff2') !== -1) {
    throw new Error('forced async fallback setup failure');
  }
  this.method = method;
  this.url = url;
  this.async = async !== false;
};
FakeXHR.prototype.overrideMimeType = function () {};
FakeXHR.prototype.setRequestHeader = function () {};
FakeXHR.prototype.getResponseHeader = function (name) {
  return this.headers[String(name).toLowerCase()] || null;
};
FakeXHR.prototype.send = function () {
  var self = this;
  xhrRequests.push({ url: String(this.url || ''), async: this.async });
  function load() {
    var filePath;
    var data;
    try {
      filePath = filePathFromUrl(self.url);
      if (forceMissingFont && String(self.url || '').indexOf('default.woff2') !== -1) {
        throw new Error('forced missing fallback font');
      }
      data = fs.readFileSync(filePath);
      if (forceInvalidSyncFont && !self.async && String(self.url || '').indexOf('default.woff2') !== -1) {
        data = Buffer.from('not-a-woff2-font');
      }
      self.status = 200;
      self.headers['content-length'] = String(data.length);
      self.headers['accept-ranges'] = 'bytes';
      if (self.responseType === 'arraybuffer') {
        self.response = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      } else {
        self.responseText = data.toString('utf8');
        self.response = self.responseText;
      }
      if (self.onload) { self.onload(); }
    } catch (error) {
      self.status = 404;
      if (self.onerror) { self.onerror(error); return; }
      throw error;
    }
  }
  if (this.async) { setImmediate(load); }
  else { load(); }
};

function runLegacyRenderContract(options) {
  var settings = options || {};
  var replacementClock = settings.replacementClock === undefined ? 1 : Number(settings.replacementClock);
  xhrRequests = [];
  forceInvalidSyncFont = !!settings.forceInvalidSyncFont;
  forceMissingFont = !!settings.forceMissingFont;
  forceAsyncFontSetupFailure = !!settings.forceAsyncFontSetupFailure;
  return new Promise(function (resolve, reject) {
    var canvasMessage = null;
    var replacementCanvasMessage = null;
    var lookaheadCanvasMessages = [];
    var lookaheadPreparedIndices = [];
    var lookaheadCostlyIndices = [];
    var lookaheadRequested = false;
    var replacementRequested = false;
    var frameBarrierRequested = false;
    var frameBarrierReady = false;
    var firstStyles = null;
    var resizedStyles = null;
    var eventsReady = false;
    var trackReplaced = false;
    var requestedInitialStyles = false;
    var requestedResizedStyles = false;
    var requestedFontSize = null;
    var sentVideo = false;
    var replacementClockSent = false;
    var nullCommittedBoundaryObserved = 'unset';
    var attempts = 0;
    var probeTimer;
    var timingMessages = [];
    var sandbox = {
      console: { log: function () {}, debug: function () {}, info: function () {}, warn: function () {}, error: function () {} },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      setImmediate: setImmediate,
      clearImmediate: clearImmediate,
      Date: Date,
      Math: Math,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,
      JSON: JSON,
      Int8Array: Int8Array,
      Uint8Array: Uint8Array,
      Uint8ClampedArray: Uint8ClampedArray,
      Int16Array: Int16Array,
      Uint16Array: Uint16Array,
      Int32Array: Int32Array,
      Uint32Array: Uint32Array,
      Float32Array: Float32Array,
      Float64Array: Float64Array,
      ArrayBuffer: ArrayBuffer,
      DataView: DataView,
      TextDecoder: global.TextDecoder,
      performance: { now: function () { return Date.now(); }, timing: {} },
      XMLHttpRequest: FakeXHR,
      navigator: { userAgent: 'Mozilla/5.0 Chrome/53.0.2785.34' },
      location: { href: 'file://' + workerPath + '?assTiming=1' },
      importScripts: function () {},
      dump: function () {}
    };
    var ass = '[Script Info]\n' +
      'ScriptType: v4.00+\n' +
      'PlayResX: 1280\n' +
      'PlayResY: 720\n' +
      '[V4+ Styles]\n' +
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1\n' +
      '[Events]\n' +
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      'Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,Ploff legacy render test\n';
    var warmupAss = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n' +
      '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: Default,Arial,18,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1\n' +
      '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    var replacementAss = settings.replacementAss || ('[Script Info]\n' +
      'ScriptType: v4.00+\n' +
      'PlayResX: 1280\n' +
      'PlayResY: 720\n' +
      '[V4+ Styles]\n' +
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: Default,Definitely Missing Font,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,1,8,10,10,40,1\n' +
      '[Events]\n' +
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      'Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{\\bord3}Replacement track\\Nuses packaged fallback font\n' +
      'Dialogue: 0,0:00:10.00,0:00:20.00,Default,,0,0,0,,Second prepared state\n' +
      'Dialogue: 0,0:00:20.00,0:00:30.00,Default,,0,0,0,,Third prepared state\n' +
      'Dialogue: 0,0:00:30.00,0:00:40.00,Default,,0,0,0,,Fourth prepared state\n' +
      'Dialogue: 0,0:00:40.00,0:00:50.00,Default,,0,0,0,,Fifth prepared state\n' +
      'Dialogue: 0,0:00:50.00,0:01:00.00,Default,,0,0,0,,Sixth prepared state\n');

    function fail(error) {
      clearInterval(probeTimer);
      reject(error);
    }
    function send(data) {
      sandbox.onmessage({ data: data });
    }
    function maybeComplete() {
      var bytes;
      if (settings.expectFontFailure) { return; }
      if (!canvasMessage || !firstStyles || !resizedStyles) { return; }
      if (!replacementRequested) {
        replacementRequested = true;
        setImmediate(function () { send({ target: 'set-track', content: replacementAss }); });
        return;
      }
      if (!replacementCanvasMessage) { return; }
      if (settings.stopAfterReplacementFrame) {
        clearInterval(probeTimer);
        try {
          assert.ok(Math.abs(Number(replacementCanvasMessage.mediaTime) - replacementClock) < 0.5,
            'normal replacement-track render must use the live playback clock when no lookahead override is present');
          resolve();
        } catch (error) { reject(error); }
        return;
      }
      if (!lookaheadRequested) {
        lookaheadRequested = true;
        send({ target: 'video', currentTime: 1, isPaused: false, sentAt: Date.now() });
        send({ target: 'ploff-prepared-state', playbackEpoch: 0, renderGeneration: 0, committedBoundaryIndex: 1, boundaryIndices: [], preparedBytes: 0 });
        return;
      }
      if (lookaheadCanvasMessages.length < 5) { return; }
      if (!frameBarrierRequested) {
        frameBarrierRequested = true;
        send({ target: 'ploff-frame-barrier' });
        return;
      }
      if (!frameBarrierReady) { return; }
      clearInterval(probeTimer);
      bytes = canvasMessage.canvases.reduce(function (total, canvas) {
        return total + (canvas.buffer ? canvas.buffer.byteLength : 0);
      }, 0);
      try {
        assert.ok(firstStyles[0] && Number(firstStyles[0].FontSize) > 0, 'legacy worker must expose the active ASS style font size');
        assert.strictEqual(Number(resizedStyles[0].FontSize), requestedFontSize, 'legacy worker must still apply Ploff subtitle-size changes');
        assert.strictEqual(canvasMessage.op, 'renderCanvas', 'Ploff legacy worker must stay on the js-blend canvas path');
        assert.ok(canvasMessage.canvases.length > 0, 'legacy worker must render at least one subtitle bitmap');
        assert.ok(bytes > 0, 'legacy worker must render non-empty subtitle pixels');
        assert.ok(replacementCanvasMessage.canvases.length > 0,
          'content-based set-track must render a replacement ASS track on the existing worker');
        assert.strictEqual(replacementCanvasMessage.trackAnimated, false,
          'plain ASS replacement must use static event-driven scheduling');
        assert.strictEqual(Number(replacementCanvasMessage.effectiveTargetFps), 0,
          'static ASS replacement must not keep a fixed-fps render loop');
        assert.ok(Number(replacementCanvasMessage.boundaryIndex) >= 1,
          'static diagnostic frames must expose their libass boundary state');
        assert.strictEqual(Number(replacementCanvasMessage.playbackEpoch), 0,
          'normal playback must remain in the initial presentation epoch');
        assert.deepStrictEqual(lookaheadCanvasMessages.map(function (message) { return Number(message.boundaryIndex); }), [2, 3, 4, 5, 6],
          'static worker must fill exactly the next five future boundary states in order');
        assert.strictEqual(lookaheadCanvasMessages.every(function (message) { return message.prepared === true; }), true,
          'all lookahead queue frames must be explicitly marked prepared');
        assert.strictEqual(lookaheadCanvasMessages.every(function (message) { return Number(message.renderGeneration) === 0; }), true,
          'prepared frames must carry the active visual generation');
        assert.strictEqual(nullCommittedBoundaryObserved, null,
          'null committed boundary from main thread must mean no presentation commit, not boundary zero');
        assert.strictEqual(Number(sandbox.PloffAssStaticRenderedBoundaryIndex), 1,
          'speculative lookahead must not advance the committed playback boundary');
        sandbox.PloffAssCancelLookahead();
        if (sandbox.rafId) { clearTimeout(sandbox.rafId); sandbox.rafId = 0; }
        sandbox.PloffAssStaticBoundaries = [0, 10, 20, 30, 40, 50, 60, 70];
        sandbox.PloffAssStaticRenderedBoundaryIndex = 1;
        sandbox.PloffAssPreparedBoundaryIndices = [2, 3, 4, 5, 6];
        sandbox.PloffAssPreparedCostlyBoundaryIndices = [3, 5, 7, 8];
        sandbox.PloffAssLookaheadAttempted = {};
        sandbox.lastCurrentTime = 1;
        sandbox.lastCurrentTimeReceivedAt = Date.now();
        sandbox.PloffAssClockReceived = true;
        sandbox._isPaused = false;
        var freeStateLookaheadStarted = Number(sandbox.PloffAssLookaheadStarted || 0);
        assert.strictEqual(sandbox.PloffAssMaybeLookahead(), true,
          'worker must scan beyond any number of prepared empty states while fewer than five costly states are retained');
        assert.strictEqual(Number(sandbox.PloffAssLookaheadStarted || 0), freeStateLookaheadStarted + 1,
          'free prepared states must not consume the costly lookahead quota');
        if (sandbox.rafId) { clearTimeout(sandbox.rafId); sandbox.rafId = 0; }
        sandbox.PloffAssCancelLookahead();
        sandbox.lastCurrentTime = 10.1;
        sandbox.lastCurrentTimeReceivedAt = Date.now();
        sandbox.PloffAssClockReceived = true;
        sandbox.PloffAssPreparedBoundaryIndices = [2, 3, 4, 5, 6, 7, 8, 9];
        sandbox.PloffAssPreparedCostlyBoundaryIndices = [3, 5, 7, 8, 9];
        var fullQueueLookaheadStarted = Number(sandbox.PloffAssLookaheadStarted || 0);
        assert.strictEqual(sandbox.PloffAssMaybeLookahead(), false,
          'worker must not prerender a sixth memory-bearing state while all five costly slots are occupied');
        assert.strictEqual(Number(sandbox.PloffAssLookaheadStarted || 0), fullQueueLookaheadStarted,
          'full prepared queue must not consume a speculative libass render attempt');
        var rateChangedAt = Date.now();
        sandbox.lastCurrentTime = 100;
        sandbox.lastCurrentTimeReceivedAt = rateChangedAt - 1000;
        sandbox.rate = 1;
        send({ target: 'video', rate: 2, sentAt: rateChangedAt });
        var rateAnchoredTime = Number(sandbox.getCurrentTime());
        assert.ok(rateAnchoredTime >= 100.8 && rateAnchoredTime <= 101.2,
          'worker rate change must preserve elapsed media time at the old rate instead of applying the new rate retroactively');
        assert.strictEqual(Number(sandbox.rate), 2,
          'worker rate change must still apply the requested new playback rate after re-anchoring');
        assert.notStrictEqual(canvasFingerprint(replacementCanvasMessage), canvasFingerprint(canvasMessage),
          'replacement ASS content must produce a new rendered subtitle bitmap');
        ['static-memory-start', 'static-memory-end', 'runtime-init-start', 'libass-runtime-ready', 'warm-track-ready', 'runtime-init-end', 'worker-ready', 'set-track-start', 'set-track-end', 'first-render-message'].forEach(function (phase) {
          assert.notStrictEqual(timingMessages.indexOf(phase), -1, 'diagnostic worker must emit ' + phase);
        });
        assert.ok(timingMessages.indexOf('runtime-init-start') < timingMessages.indexOf('libass-runtime-ready'),
          'libass readiness must be reported after runtime initialization begins');
        assert.ok(timingMessages.indexOf('libass-runtime-ready') < timingMessages.indexOf('warm-track-ready'),
          'warm track readiness must be reported only after libass is initialized');
        assert.ok(timingMessages.indexOf('warm-track-ready') < timingMessages.indexOf('runtime-init-end'),
          'runtime initialization must end only after the warm track is installed');
        var fontRequests = xhrRequests.filter(function (request) {
          return request.url.indexOf('default.woff2') !== -1;
        });
        assert.ok(fontRequests.length >= 1, 'packaged fallback font must be requested');
        assert.strictEqual(fontRequests[0].async, false,
          'packaged fallback font must first be read synchronously before libass initialization');
        assert.ok(timingMessages.indexOf('font-loaded') >= 0, 'packaged fallback font must report loaded');
        if (settings.forceInvalidSyncFont) {
          assert.ok(fontRequests.length >= 2, 'invalid synchronous font data must trigger the asynchronous compatibility fallback');
          assert.strictEqual(fontRequests[1].async, true,
            'font compatibility fallback must retain createPreloadedFile asynchronous loading');
          assert.notStrictEqual(timingMessages.indexOf('font-sync-error'), -1,
            'invalid synchronous font data must report the compatibility fallback');
        } else {
          assert.strictEqual(fontRequests.length, 1,
            'valid packaged fallback font must not perform a second asynchronous request');
          assert.ok(timingMessages.indexOf('font-loaded') < timingMessages.indexOf('prerun-end'),
            'packaged fallback font must be present before preRun completes');
        }
        send({ target: 'ploff-discontinuity', currentTime: 0.5, playbackEpoch: 1, sentAt: Date.now() });
        assert.strictEqual(sandbox.PloffAssPlaybackEpoch, 1,
          'explicit timeline discontinuity must advance the worker presentation epoch');
        assert.strictEqual(sandbox.PloffAssStaticRenderedBoundaryIndex, null,
          'explicit timeline discontinuity must invalidate the monotonic static boundary cursor');
        send({ target: 'destroy' });
        resolve();
      } catch (error) { fail(error); }
    }

    sandbox.self = sandbox;
    sandbox.global = sandbox;
    sandbox.postMessage = function (message) {
      if (!message) { return; }
      if (message.target === 'ploff-ass-timing') {
        assert.deepStrictEqual(Object.keys(message).sort(), ['phase', 'target'],
          'worker timing packets must expose only the bounded phase name');
        timingMessages.push(message.phase);
        if (settings.expectFontFailure && message.phase === 'runtime-init-end') {
          clearInterval(probeTimer);
          assert.notStrictEqual(timingMessages.indexOf('font-sync-error'), -1,
            'missing packaged font must report synchronous load failure');
          assert.notStrictEqual(timingMessages.indexOf('font-error'), -1,
            'missing packaged font must report compatibility fallback failure');
          resolve();
          return;
        }
      } else if (message.target === 'get-events') {
        if (!trackReplaced) {
          trackReplaced = true;
          setImmediate(function () { send({ target: 'set-track', content: ass }); });
        } else {
          eventsReady = true;
        }
      } else if (message.target === 'ploff-frame-barrier') {
        frameBarrierReady = true;
      } else if (message.target === 'get-styles') {
        if (!firstStyles) {
          firstStyles = message.styles;
          requestedFontSize = Number(firstStyles[0].FontSize) + 7;
          send({ target: 'set-style', style: { FontSize: requestedFontSize }, index: 0 });
          requestedResizedStyles = true;
          send({ target: 'get-styles' });
        } else if (requestedResizedStyles && !resizedStyles) {
          resizedStyles = message.styles;
        }
      } else if (message.target === 'canvas' && message.op === 'renderCanvas') {
        if (message.prepared === true) {
          lookaheadCanvasMessages.push(message);
          lookaheadPreparedIndices.push(Number(message.boundaryIndex));
          if (message.canvases && message.canvases.length) { lookaheadCostlyIndices.push(Number(message.boundaryIndex)); }
          send({ target: 'ploff-prepared-state', playbackEpoch: 0, renderGeneration: 0, committedBoundaryIndex: 1,
            boundaryIndices: lookaheadPreparedIndices.slice(), costlyBoundaryIndices: lookaheadCostlyIndices.slice(), preparedBytes: 0 });
        } else if (message.canvases && message.canvases.length) {
          if (replacementRequested) { replacementCanvasMessage = message; }
          else { canvasMessage = message; }
        }
      }
      maybeComplete();
    };

    vm.createContext(sandbox);
    try {
      vm.runInContext(source, sandbox, { filename: workerPath });
      send({
        target: 'worker-init',
        width: 1280,
        height: 720,
        currentScript: 'file://' + workerPath,
        preMain: true,
        renderMode: 'js-blend',
        subContent: warmupAss,
        fonts: [],
        availableFonts: [],
        fallbackFont: 'file://' + fallbackFontPath,
        lazyFileLoading: false,
        debug: false,
        targetFps: 24,
        libassMemoryLimit: 0,
        libassGlyphLimit: 0,
        dropAllAnimations: false
      });
    } catch (error) {
      fail(error);
      return;
    }

    probeTimer = setInterval(function () {
      attempts += 1;
      if (attempts > 200) {
        fail(new Error('legacy worker rendering contract timed out'));
        return;
      }
      try {
        if (!eventsReady) { send({ target: 'get-events' }); }
        else if (!requestedInitialStyles) {
          requestedInitialStyles = true;
          send({ target: 'get-styles' });
        } else if (resizedStyles && !sentVideo) {
          send({ target: 'ploff-prepared-state', playbackEpoch: 0, renderGeneration: 0, committedBoundaryIndex: null, boundaryIndices: [], preparedBytes: 0 });
          nullCommittedBoundaryObserved = sandbox.PloffAssStaticRenderedBoundaryIndex;
          sentVideo = true;
          send({ target: 'video', currentTime: 1, isPaused: true, sentAt: Date.now() });
        } else if (replacementRequested && !replacementCanvasMessage && !replacementClockSent) {
          replacementClockSent = true;
          send({ target: 'video', currentTime: replacementClock, isPaused: true, sentAt: Date.now() });
        }
      } catch (error) {
        // Before Emscripten finishes main(), normal worker messages can be buffered or rejected.
      }
    }, 25);
  });
}

runLegacyRenderContract().then(function () {
  return runLegacyRenderContract({
    replacementClock: 901,
    stopAfterReplacementFrame: true,
    replacementAss: '[Script Info]\n' +
      'ScriptType: v4.00+\n' +
      'PlayResX: 1280\n' +
      'PlayResY: 720\n' +
      '[V4+ Styles]\n' +
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1\n' +
      '[Events]\n' +
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      'Dialogue: 0,0:15:00.00,0:15:10.00,Default,,0,0,0,,High timestamp replacement track\n'
  });
}).then(function () {
  return runLegacyRenderContract({ forceInvalidSyncFont: true });
}).then(function () {
  return runLegacyRenderContract({ forceMissingFont: true, expectFontFailure: true });
}).then(function () {
  return runLegacyRenderContract({ forceInvalidSyncFont: true, forceAsyncFontSetupFailure: true, expectFontFailure: true });
}).then(function () {
  acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
  assert.strictEqual(nativePayload(source), nativePayload(fullSource),
    'Ploff slimming must not alter the generated libass/FreeType/fontconfig Emscripten payload');
    assert.ok(source.indexOf('PloffAssPreparedBoundaryIndices') !== -1,
    'static legacy worker must track main-thread prepared boundary states separately from committed playback');
  assert.ok(source.indexOf('PloffAssScheduleLookahead') !== -1,
    'static legacy worker must schedule opportunistic lookahead work outside the real boundary callback');
  assert.ok(source.indexOf('prepared:ploffPreparedFrame') !== -1,
    'worker canvas packets must distinguish speculative prepared frames from real-clock renders');
  assert.ok(source.indexOf('renderGeneration:self.PloffAssRenderGeneration') !== -1,
    'worker frames must be stamped with the visual render generation');
  assert.ok(source.indexOf('if(!ploffPreparedFrame)') !== -1,
    'lookahead rendering must not advance the committed static boundary cursor');
assert.ok(source.length < 3230000,
    'Ploff-specific legacy worker must stay below 3.23 MB after removing unused generic paths');
  assert.strictEqual(source.indexOf('function BrotliDecodeClosure'), -1,
    'manual Brotli subtitle decoding is unused because Ploff always sends ASS as subContent');
  assert.strictEqual(source.indexOf('self.lossyRender=function'), -1,
    'lossy ImageBitmap rendering must not ship in the Chrome 53 js-blend-only worker');
  assert.strictEqual(source.indexOf('self.blendRender=function'), -1,
    'wasm-blend rendering must not ship in the Chrome 53 js-blend-only worker');
  assert.strictEqual(source.indexOf('case"set-track-by-url"'), -1,
    'URL subtitle loading must not ship when Ploff always replaces tracks from local ASS content');
  assert.strictEqual(source.indexOf('case"create-event"'), -1,
    'advanced ASS event editing must not ship in the renderer-only worker');
  assert.strictEqual(source.indexOf('case"runBenchmark"'), -1,
    'upstream benchmark commands must not ship in the production TV worker');
  assert.notStrictEqual(source.indexOf('self.render=function'), -1,
    'js-blend renderer must remain present');
  assert.notStrictEqual(source.indexOf('case"set-track"'), -1,
    'content-based track replacement must remain present');
  assert.notStrictEqual(source.indexOf('case"get-events"'), -1,
    'runtime readiness probe must remain present');
  assert.notStrictEqual(source.indexOf('case"ploff-frame-barrier"'), -1,
    'first-real-frame synchronization barrier must remain present');
  assert.notStrictEqual(source.indexOf('case"ploff-discontinuity"'), -1,
    'explicit timeline discontinuities must reset worker monotonic presentation state');
  assert.notStrictEqual(source.indexOf('PloffAssStaticBoundaries'), -1,
    'static ASS tracks must retain libass event boundaries for event-driven rendering');
  assert.notStrictEqual(source.indexOf('case"get-styles"'), -1,
    'subtitle size style inspection must remain present');
  assert.notStrictEqual(source.indexOf('case"set-style"'), -1,
    'subtitle size style mutation must remain present');
  assert.notStrictEqual(source.indexOf('PloffAssTimingMark'), -1,
    'diagnostic legacy worker must expose its opt-in timing marker');
  assert.notStrictEqual(source.indexOf('static-memory-start'), -1,
    'diagnostic legacy worker must expose static memory timing');
  assert.notStrictEqual(source.indexOf('runtime-init-start'), -1,
    'diagnostic legacy worker must expose runtime initialization timing');
  assert.notStrictEqual(source.indexOf('worker-ready'), -1,
    'diagnostic legacy worker must expose worker readiness timing');
  console.log('Ploff-specific ASS legacy worker profile checks passed');
}).catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
