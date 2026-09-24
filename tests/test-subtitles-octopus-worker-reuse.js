'use strict';

var assert = require('assert');

[false, true].forEach(function injectedWorkerIsAdoptedWithoutStartingASecondWorker(useWasm) {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var constructedWorkers = 0;
  var posted = [];
  var listeners = {};
  var terminated = 0;
  var worker = {
    addEventListener: function (name, callback) { listeners[name] = callback; },
    removeEventListener: function (name, callback) {
      if (listeners[name] === callback) { delete listeners[name]; }
    },
    postMessage: function (message) { posted.push(message); },
    terminate: function () { terminated += 1; }
  };
  function UnexpectedWorker() {
    constructedWorkers += 1;
    throw new Error('SubtitlesOctopus created a duplicate worker');
  }
  function FakeImageData(data, width, height) {
    this.data = data || new Uint8ClampedArray(width * height * 4);
    this.width = width;
    this.height = height;
  }
  var context = {
    clearRect: function () {},
    getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () {},
    putImageData: function () {},
    createImageData: function (width, height) { return new FakeImageData(null, width, height); }
  };
  function canvas() {
    return {
      width: 1280,
      height: 720,
      style: {},
      getContext: function () { return context; }
    };
  }
  var documentRef = {
    URL: 'file:///app/index.html',
    createElement: function (name) { return name === 'canvas' ? canvas() : {}; },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  var windowRef = {
    Worker: UnexpectedWorker,
    ImageData: FakeImageData,
    devicePixelRatio: 1,
    addEventListener: function () {},
    removeEventListener: function () {}
  };

  try {
    global.window = windowRef;
    global.document = documentRef;
    global.Worker = UnexpectedWorker;
    global.ImageData = FakeImageData;
    global.WebAssembly = useWasm ? originalWebAssembly : undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({
      canvas: canvas(),
      worker: worker,
      workerInitialized: true,
      workerSubContent: '[Script Info]\nTitle: warm',
      workerUrl: 'vendor/subtitles-octopus-worker.js?v=wasm-test',
      legacyWorkerUrl: 'vendor/subtitles-octopus-worker-legacy.js?v=test',
      renderMode: 'js-blend',
      subContent: '[Script Info]\nTitle: warm'
    });

    assert.strictEqual(constructedWorkers, 0, 'injected preloaded worker must replace duplicate Worker construction');
    assert.strictEqual(instance.workerUrl, useWasm ? 'vendor/subtitles-octopus-worker.js?v=wasm-test' : 'vendor/subtitles-octopus-worker-legacy.js?v=test',
      'worker URL selection must follow actual WebAssembly capability');
    assert.strictEqual(instance.worker, worker, 'SubtitlesOctopus must adopt the injected worker instance');
    assert.strictEqual(typeof listeners.message, 'function', 'adopted worker must receive the normal message listener');
    assert.strictEqual(typeof listeners.error, 'function', 'adopted worker must receive the normal error listener');
    assert.strictEqual(posted.some(function (message) { return message.target === 'worker-init'; }), false,
      'an already initialized worker must never receive a second worker-init');
    assert.strictEqual(posted.some(function (message) { return message.target === 'set-track'; }), false,
      'adopting the same warm track must not parse it a second time');
    assert.strictEqual(posted[0].target, 'canvas', 'adoption must synchronize the real renderer canvas with the warm worker');
    instance.dispose();
    assert.strictEqual(terminated, 1, 'normal renderer disposal must terminate the adopted worker exactly once');
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.Worker = originalWorker;
    global.ImageData = originalImageData;
    global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
});


(function preinitializedWorkerReplacesWarmTrackBeforeReadiness() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var posted = [];
  var listeners = { message: [], error: [] };
  function emit(name, event) {
    listeners[name].slice().forEach(function (callback) { callback(event); });
  }
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function (name, callback) {
      var index = listeners[name].indexOf(callback);
      if (index !== -1) { listeners[name].splice(index, 1); }
    },
    postMessage: function (message) { posted.push(message); },
    terminate: function () {}
  };
  function FakeImageData(data, width, height) {
    this.data = data || new Uint8ClampedArray(width * height * 4);
    this.width = width;
    this.height = height;
  }
  var context = {
    clearRect: function () {},
    getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () {},
    putImageData: function () {},
    createImageData: function (width, height) { return new FakeImageData(null, width, height); }
  };
  var targetCanvas = { width: 1280, height: 720, style: {}, getContext: function () { return context; } };
  var documentRef = {
    URL: 'file:///app/index.html',
    createElement: function () { return { width: 1, height: 1, style: {}, getContext: function () { return context; } }; },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  var windowRef = {
    Worker: function () { throw new Error('duplicate worker'); },
    ImageData: FakeImageData,
    devicePixelRatio: 1,
    requestAnimationFrame: function (callback) { callback(); },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  try {
    global.window = windowRef;
    global.document = documentRef;
    global.Worker = windowRef.Worker;
    global.ImageData = FakeImageData;
    global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var ready = 0;
    var timing = [];
    var instance = new SubtitlesOctopus({
      canvas: targetCanvas,
      worker: worker,
      workerInitialized: true,
      workerSubContent: '[Script Info]\nTitle: warm',
      renderMode: 'js-blend',
      subContent: '[Script Info]\nTitle: real',
      onReady: function () { ready += 1; },
      onTiming: function (phase) { timing.push(phase); }
    });
    assert.deepStrictEqual(posted.map(function (message) { return message.target; }), ['canvas', 'set-track'],
      'adoption must resize first and queue the requested real track without reinitializing libass');
    assert.strictEqual(ready, 1, 'preinitialized worker adoption must start the renderer readiness probe immediately');
    emit('message', { data: { target: 'ploff-ass-timing', phase: 'set-track-end' } });
    assert.deepStrictEqual(timing, ['set-track-end'],
      'dedicated Ploff timing messages from the adopted worker must reach the renderer timing hook without free-form detail');
    emit('message', { data: { target: 'canvas', op: 'renderCanvas', time: 1, canvases: [] } });
    assert.strictEqual(instance.lastRenderTime, 0, 'warm frames arriving during adoption must remain suppressed');
    instance.getEvents(function () {}, function () {});
    emit('message', { data: { target: 'get-events', events: [] } });
    emit('message', { data: { target: 'canvas', op: 'renderCanvas', time: 2, canvases: [] } });
    assert.strictEqual(instance.lastRenderTime, 0, 'worker readiness alone must not expose prepared frames before the first real playback clock');
    instance.setWorkerFrameSuppressed(false);
    emit('message', { data: { target: 'canvas', op: 'renderCanvas', time: 3, canvases: [] } });
    assert.strictEqual(instance.lastRenderTime, 3, 'canvas frames may render after the explicit playback frame gate is released');
    instance.dispose();
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.Worker = originalWorker;
    global.ImageData = originalImageData;
    global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());


(function suppressingFramesInvalidatesAlreadyQueuedAnimationFrames() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var listeners = { message: [], error: [] };
  var rafCallbacks = [];
  var clears = 0;
  var draws = 0;
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function () {},
    postMessage: function () {},
    terminate: function () {}
  };
  function emit(message) { listeners.message.slice().forEach(function (callback) { callback({ data: message }); }); }
  function FakeImageData(data, width, height) { this.data = data || new Uint8ClampedArray(width * height * 4); this.width = width; this.height = height; }
  var context = {
    clearRect: function () { clears += 1; },
    getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () { draws += 1; },
    putImageData: function () {},
    createImageData: function (width, height) { return new FakeImageData(null, width, height); }
  };
  function canvas() { return { width: 1280, height: 720, style: {}, getContext: function () { return context; } }; }
  var documentRef = {
    URL: 'file:///app/index.html',
    createElement: function () { return canvas(); },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  var windowRef = {
    Worker: function () { throw new Error('duplicate worker'); }, ImageData: FakeImageData, devicePixelRatio: 1,
    requestAnimationFrame: function (callback) { rafCallbacks.push(callback); return rafCallbacks.length; },
    addEventListener: function () {}, removeEventListener: function () {}
  };
  try {
    global.window = windowRef; global.document = documentRef; global.Worker = windowRef.Worker;
    global.ImageData = FakeImageData; global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({ canvas: canvas(), worker: worker, workerInitialized: true, subContent: '[Script Info]\nTitle: warm' });
    assert.strictEqual(typeof instance.setWorkerFrameSuppressed, 'function', 'Ploff wrapper must expose an explicit worker-frame gate');
    instance.setWorkerFrameSuppressed(false);
    clears = 0; draws = 0;
    emit({ target: 'canvas', op: 'renderCanvas', time: 10, canvases: [] });
    assert.strictEqual(rafCallbacks.length, 1, 'an accepted worker frame must schedule a canvas draw');
    instance.setWorkerFrameSuppressed(true);
    rafCallbacks.shift()();
    assert.strictEqual(clears, 0, 'a RAF queued before suppression must not clear or repaint the canvas afterwards');
    assert.strictEqual(draws, 0, 'a RAF queued before suppression must not draw stale subtitle bitmaps afterwards');
    instance.dispose();
  } finally {
    global.window = originalWindow; global.document = originalDocument; global.Worker = originalWorker;
    global.ImageData = originalImageData; global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());

(function firstRealClockUsesAWorkerBarrierBeforeFramesAreReleased() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var posted = [];
  var listeners = { message: [], error: [] };
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function (name, callback) { var i = listeners[name].indexOf(callback); if (i !== -1) { listeners[name].splice(i, 1); } },
    postMessage: function (message) { posted.push(message); },
    terminate: function () {}
  };
  function emit(message) { listeners.message.slice().forEach(function (callback) { callback({ data: message }); }); }
  function FakeImageData(data, width, height) { this.data = data || new Uint8ClampedArray(width * height * 4); this.width = width; this.height = height; }
  var context = {
    clearRect: function () {}, getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () {}, putImageData: function () {}, createImageData: function (width, height) { return new FakeImageData(null, width, height); }
  };
  function canvas() { return { width: 1280, height: 720, style: {}, getContext: function () { return context; } }; }
  var documentRef = { URL: 'file:///app/index.html', createElement: function () { return canvas(); }, addEventListener: function () {}, removeEventListener: function () {} };
  var windowRef = { Worker: function () {}, ImageData: FakeImageData, devicePixelRatio: 1, requestAnimationFrame: function (callback) { callback(); }, addEventListener: function () {}, removeEventListener: function () {} };
  try {
    global.window = windowRef; global.document = documentRef; global.Worker = windowRef.Worker;
    global.ImageData = FakeImageData; global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({ canvas: canvas(), worker: worker, workerInitialized: true, subContent: '[Script Info]\nTitle: real' });
    posted.length = 0;
    assert.strictEqual(typeof instance.releaseWorkerFramesAt, 'function', 'Ploff wrapper must expose atomic first-clock frame release');
    instance.releaseWorkerFramesAt(42.5, false);
    assert.deepStrictEqual(posted.map(function (message) { return message.target; }), ['video', 'ploff-frame-barrier'],
      'first-clock release must synchronize the worker while frames remain suppressed, then queue a barrier');
    assert.strictEqual(posted[0].currentTime, 42.5);
    assert.strictEqual(posted[0].isPaused, true, 'barrier synchronization must freeze the worker at the requested real clock');
    assert.strictEqual(instance.suppressWorkerFrames, true, 'frames must remain suppressed until the worker acknowledges the barrier');
    emit({ target: 'ploff-frame-barrier' });
    assert.strictEqual(instance.suppressWorkerFrames, false, 'barrier acknowledgement may release worker frames');
    assert.strictEqual(posted[posted.length - 1].target, 'video');
    assert.strictEqual(posted[posted.length - 1].currentTime, 42.5);
    assert.strictEqual(posted[posted.length - 1].isPaused, false, 'first accepted render must use the actual playback paused state and media clock');
    instance.dispose();
  } finally {
    global.window = originalWindow; global.document = originalDocument; global.Worker = originalWorker;
    global.ImageData = originalImageData; global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());


(function disposingDuringFirstClockBarrierPreventsLateFrameRelease() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var listeners = { message: [], error: [] };
  var posted = [];
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function (name, callback) { var i = listeners[name].indexOf(callback); if (i !== -1) { listeners[name].splice(i, 1); } },
    postMessage: function (message) { posted.push(message); },
    terminate: function () {}
  };
  function emit(message) { listeners.message.slice().forEach(function (callback) { callback({ data: message }); }); }
  function FakeImageData(data, width, height) { this.data = data || new Uint8ClampedArray(width * height * 4); this.width = width; this.height = height; }
  var context = { clearRect: function () {}, getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; }, drawImage: function () {}, putImageData: function () {}, createImageData: function (w, h) { return new FakeImageData(null, w, h); } };
  function canvas() { return { width: 1280, height: 720, style: {}, getContext: function () { return context; } }; }
  var documentRef = { URL: 'file:///app/index.html', createElement: function () { return canvas(); }, addEventListener: function () {}, removeEventListener: function () {} };
  var windowRef = { Worker: function () {}, ImageData: FakeImageData, devicePixelRatio: 1, requestAnimationFrame: function (callback) { callback(); }, addEventListener: function () {}, removeEventListener: function () {} };
  try {
    global.window = windowRef; global.document = documentRef; global.Worker = windowRef.Worker; global.ImageData = FakeImageData; global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({ canvas: canvas(), worker: worker, workerInitialized: true, subContent: '[Script Info]\nTitle: real' });
    posted.length = 0;
    instance.releaseWorkerFramesAt(9.5, true);
    assert.strictEqual(instance.frameReleasePending, true);
    instance.dispose();
    assert.strictEqual(instance.frameReleasePending, false, 'disposing must cancel a pending first-frame release barrier');
    assert.doesNotThrow(function () { emit({ target: 'ploff-frame-barrier' }); },
      'a late barrier acknowledgement after disposal must not post another video command through a released worker');
  } finally {
    global.window = originalWindow; global.document = originalDocument; global.Worker = originalWorker; global.ImageData = originalImageData; global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());

(function monotonicPresentationRejectsBackwardFramesUntilExplicitDiscontinuity() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var listeners = { message: [], error: [] };
  var posted = [];
  var rafCallbacks = [];
  var timing = [];
  var clears = 0;
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function () {},
    postMessage: function (message) { posted.push(message); },
    terminate: function () {}
  };
  function emit(message) { listeners.message.slice().forEach(function (callback) { callback({ data: message }); }); }
  function FakeImageData(data, width, height) { this.data = data || new Uint8ClampedArray(width * height * 4); this.width = width; this.height = height; }
  var context = {
    clearRect: function () { clears += 1; },
    getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () {}, putImageData: function () {},
    createImageData: function (w, h) { return new FakeImageData(null, w, h); }
  };
  function canvas() { return { width: 1280, height: 720, style: {}, getContext: function () { return context; } }; }
  var documentRef = { URL: 'file:///app/index.html', createElement: function () { return canvas(); }, addEventListener: function () {}, removeEventListener: function () {} };
  var windowRef = {
    Worker: function () {}, ImageData: FakeImageData, devicePixelRatio: 1,
    requestAnimationFrame: function (callback) { rafCallbacks.push(callback); return rafCallbacks.length; },
    addEventListener: function () {}, removeEventListener: function () {}
  };
  try {
    global.window = windowRef; global.document = documentRef; global.Worker = windowRef.Worker;
    global.ImageData = FakeImageData; global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({
      canvas: canvas(), worker: worker, workerInitialized: true, subContent: '[Script Info]\nTitle: real',
      onSyncTiming: function (stage, sample) { timing.push({ stage: stage, sample: sample }); }
    });
    instance.setWorkerFrameSuppressed(false);
    assert.strictEqual(typeof instance.markDiscontinuity, 'function',
      'Ploff wrapper must expose an explicit timeline-discontinuity reset for monotonic ASS presentation');
    clears = 0;
    emit({ target: 'canvas', op: 'renderCanvas', time: 10, mediaTime: 604.724, boundaryIndex: 8,
      validFrom: 604.72, validUntil: 605.1, playbackEpoch: 0, trackAnimated: false, canvases: [] });
    rafCallbacks.shift()();
    assert.strictEqual(clears, 1, 'the forward boundary frame must be presented');
    emit({ target: 'canvas', op: 'renderCanvas', time: 11, mediaTime: 604.642, boundaryIndex: 7,
      validFrom: 602, validUntil: 604.72, playbackEpoch: 0, trackAnimated: false, canvases: [] });
    assert.strictEqual(rafCallbacks.length, 0,
      'normal playback must reject a frame that regresses behind an already presented ASS boundary');
    assert.strictEqual(clears, 1, 'a rejected backward frame must not touch the canvas');
    assert.strictEqual(timing[timing.length - 1].stage, 'frame-rejected',
      'rejected backward frames must remain visible in bounded ASS diagnostics');
    assert.strictEqual(timing[timing.length - 1].sample.reason, 'backward-time',
      'diagnostics must identify a normal-playback media-time regression without exposing subtitle text');

    instance.setIsPaused(false, 610);
    emit({ target: 'canvas', op: 'renderCanvas', time: 11.5, mediaTime: 604.9, boundaryIndex: 8,
      validFrom: 604.72, validUntil: 605.1, playbackEpoch: 0, trackAnimated: false, canvases: [] });
    assert.strictEqual(rafCallbacks.length, 0,
      'a static ASS frame whose libass validity interval has already expired must never be queued for presentation');
    assert.strictEqual(timing[timing.length - 1].sample.reason, 'expired-window',
      'diagnostics must identify a cold render that finished after its real libass event interval expired');
    instance.markDiscontinuity(604.9);
    assert.strictEqual(clears, 1,
      'a committed seek inside the last presented static validity window must keep its bitmap visible');
    instance.markDiscontinuity(500);
    assert.strictEqual(posted[posted.length - 1].target, 'ploff-discontinuity',
      'explicit seek reset must also invalidate queued worker state');
    assert.strictEqual(clears, 2,
      'explicit seek outside the last presented static validity window must clear its stale bitmap immediately');
    emit({ target: 'canvas', op: 'renderCanvas', time: 12, mediaTime: 500, boundaryIndex: 2,
      validFrom: 499, validUntil: 501, playbackEpoch: 2, trackAnimated: false, canvases: [] });
    rafCallbacks.shift()();
    assert.strictEqual(clears, 3,
      'after an explicit discontinuity an earlier ASS boundary must become valid again');
    instance.markDiscontinuity(500.5);
    assert.strictEqual(clears, 3,
      'repeated committed seeks inside the current static state must not introduce a canvas blink');
    instance.markDiscontinuity(501);
    assert.strictEqual(clears, 4,
      'validUntil is exclusive, so a forward seek to the exact end of the displayed state must clear it immediately');
    instance.dispose();
  } finally {
    global.window = originalWindow; global.document = originalDocument; global.Worker = originalWorker;
    global.ImageData = originalImageData; global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());


(function preparedStaticFramesAreDeferredBoundedAndInvalidated() {
  var originalWindow = global.window;
  var originalDocument = global.document;
  var originalWorker = global.Worker;
  var originalImageData = global.ImageData;
  var originalWebAssembly = global.WebAssembly;
  var originalDateNow = Date.now;
  var originalSetTimeout = global.setTimeout;
  var originalClearTimeout = global.clearTimeout;
  var listeners = { message: [], error: [] };
  var posted = [];
  var rafCallbacks = [];
  var timerCallbacks = {};
  var nextTimer = 1;
  var now = 1000;
  var clears = 0;
  var timing = [];
  var worker = {
    addEventListener: function (name, callback) { listeners[name].push(callback); },
    removeEventListener: function () {},
    postMessage: function (message) { posted.push(message); },
    terminate: function () {}
  };
  function emit(message) { listeners.message.slice().forEach(function (callback) { callback({ data: message }); }); }
  function FakeImageData(data, width, height) { this.data = data || new Uint8ClampedArray(width * height * 4); this.width = width; this.height = height; }
  var context = {
    clearRect: function () { clears += 1; },
    getImageData: function () { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; },
    drawImage: function () {}, putImageData: function () {},
    createImageData: function (w, h) { return new FakeImageData(null, w, h); }
  };
  function canvas() { return { width: 1280, height: 720, style: {}, getContext: function () { return context; } }; }
  function setTimeoutFake(callback) { var id = nextTimer++; timerCallbacks[id] = callback; return id; }
  function clearTimeoutFake(id) { delete timerCallbacks[id]; }
  function runTimers() { var ids = Object.keys(timerCallbacks); ids.forEach(function (id) { var callback = timerCallbacks[id]; delete timerCallbacks[id]; callback(); }); }
  function frame(time, boundaryIndex, validFrom, validUntil, byteLength) {
    var canvases = byteLength ? [{ x: 0, y: 0, w: Math.max(1, byteLength / 4), h: 1, buffer: new ArrayBuffer(byteLength) }] : [];
    return { target: 'canvas', op: 'renderCanvas', time: time, mediaTime: validFrom + 0.001,
      boundaryIndex: boundaryIndex, validFrom: validFrom, validUntil: validUntil,
      playbackEpoch: 0, renderGeneration: 0, trackAnimated: false, prepared: true, canvases: canvases };
  }
  var documentRef = { URL: 'file:///app/index.html', createElement: function () { return canvas(); }, addEventListener: function () {}, removeEventListener: function () {} };
  var windowRef = {
    Worker: function () {}, ImageData: FakeImageData, devicePixelRatio: 1,
    requestAnimationFrame: function (callback) { rafCallbacks.push(callback); return rafCallbacks.length; },
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
    addEventListener: function () {}, removeEventListener: function () {}
  };
  try {
    Date.now = function () { return now; };
    global.setTimeout = setTimeoutFake;
    global.clearTimeout = clearTimeoutFake;
    global.window = windowRef; global.document = documentRef; global.Worker = windowRef.Worker;
    global.ImageData = FakeImageData; global.WebAssembly = undefined;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
    var SubtitlesOctopus = require('../app/vendor/subtitles-octopus');
    var instance = new SubtitlesOctopus({
      canvas: canvas(), worker: worker, workerInitialized: true, subContent: '[Script Info]\nTitle: real',
      onSyncTiming: function (stage, sample) { timing.push({ stage: stage, sample: sample }); }
    });
    instance.setWorkerFrameSuppressed(false);
    posted.length = 0;
    clears = 0;
    instance.setIsPaused(false, 708.5);
    emit(frame(10, 309, 708.56, 710.53, 16));
    assert.strictEqual(rafCallbacks.length, 0,
      'a static frame that arrives before validFrom must be retained instead of rendered early');
    assert.strictEqual(instance.preparedFrames.length, 1,
      'future-window must become a prepared queue entry instead of a rejection');
    assert.strictEqual(timing.some(function (entry) { return entry.stage === 'frame-rejected' && entry.sample.reason === 'future-window'; }), false,
      'future-window must no longer be reported as a rejected frame');
    now += 70;
    runTimers();
    assert.strictEqual(rafCallbacks.length, 1,
      'prepared frame deadline wakeup must schedule presentation once media time enters the validity window');
    rafCallbacks.shift()();
    assert.strictEqual(clears, 1, 'prepared frame must draw exactly once after validFrom');
    assert.strictEqual(instance.lastPresentedBoundaryIndex, 309,
      'prepared presentation must commit the real boundary monotonically');
    assert.strictEqual(instance.preparedFrames.length, 0, 'presented prepared frame must leave the retained queue');
    assert.ok(posted.some(function (message) { return message.target === 'ploff-prepared-state'; }),
      'main thread must report bounded prepared queue state to the worker');

    instance.setIsPaused(false, 709);
    emit(frame(10.5, 309.5, 710, 710.5, 16));
    assert.strictEqual(instance.preparedFrames.length, 1,
      'future prepared state must be retained before testing near-boundary timer jitter');
    now += 999.5;
    instance.drainPreparedFrames(now);
    assert.strictEqual(Object.keys(timerCallbacks).length, 1,
      'prepared drain must keep a wakeup armed when it lands less than one millisecond before validFrom');
    instance.clearPreparedFrames('near-boundary-reset');

    instance.setIsPaused(false, 711);
    emit(frame(11, 310, 711.05, 712, 16));
    now += 60;
    runTimers();
    assert.strictEqual(rafCallbacks.length, 1,
      'prepared boundary must have one pending RAF before a real frame supersedes it');
    var preparedStateMessagesBeforeSupersede = posted.filter(function (message) {
      return message.target === 'ploff-prepared-state';
    }).length;
    emit({ target: 'canvas', op: 'renderCanvas', time: 12, mediaTime: 711.061, boundaryIndex: 310,
      validFrom: 711.05, validUntil: 712, playbackEpoch: 0, renderGeneration: instance.renderGeneration,
      trackAnimated: false, prepared: false, canvases: [] });
    assert.strictEqual(instance.preparedFrames.length, 0,
      'a real frame for the same boundary must remove the pending prepared copy');
    assert.strictEqual(posted.filter(function (message) {
      return message.target === 'ploff-prepared-state';
    }).length, preparedStateMessagesBeforeSupersede + 1,
      'superseding a prepared frame must notify the worker about the freed queue slot before RAF presentation');
    assert.strictEqual(rafCallbacks.length, 2,
      'the superseding real frame must own a separate latest-wins RAF');
    var clearsBeforeSupersededRaf = clears;
    rafCallbacks.shift()();
    assert.strictEqual(clears, clearsBeforeSupersededRaf,
      'a prepared RAF whose exact queue entry was superseded must not draw stale pixels');
    rafCallbacks.shift()();
    assert.strictEqual(clears, clearsBeforeSupersededRaf + 1,
      'only the superseding real frame may draw the boundary');

    instance.setIsPaused(false, 720);
    emit(frame(19.1, 319, 720.2, 720.3, 0));
    emit(frame(20, 320, 721, 722, 1024 * 1024));
    emit(frame(20.1, 320.5, 722, 722.1, 0));
    emit(frame(21, 321, 722, 723, 1024 * 1024));
    emit(frame(21.1, 321.5, 723, 723.1, 0));
    emit(frame(22, 322, 723, 724, 1024 * 1024));
    emit(frame(22.1, 322.5, 724, 724.1, 0));
    emit(frame(23, 323, 724, 725, 1024 * 1024));
    emit(frame(23.1, 323.5, 725, 725.1, 0));
    emit(frame(24, 324, 725, 726, 1024 * 1024));
    emit(frame(24.1, 324.5, 726, 726.1, 0));
    emit(frame(25, 325, 726, 727, 1024 * 1024));
    assert.strictEqual(instance.preparedFrames.length, 11,
      'zero-byte prepared states must remain queued without consuming one of the five RGBA slots');
    assert.strictEqual(instance.preparedFrames.filter(function (entry) { return entry._ploffPreparedBytes > 0; }).length, 5,
      'prepared queue must retain at most five memory-bearing future states');
    assert.deepStrictEqual(instance.preparedFrames.filter(function (entry) { return entry._ploffPreparedBytes === 0; }).map(function (entry) { return entry.boundaryIndex; }),
      [319, 320.5, 321.5, 322.5, 323.5, 324.5], 'all zero-byte boundary states must survive depth enforcement');
    assert.ok(instance.preparedBytes <= 16 * 1024 * 1024, 'prepared retained bytes must stay inside the 16 MiB budget');
    var latestPreparedState = posted.filter(function (message) { return message.target === 'ploff-prepared-state'; }).slice(-1)[0];
    assert.deepStrictEqual(latestPreparedState.boundaryIndices, [319, 320, 320.5, 321, 321.5, 322, 322.5, 323, 323.5, 324, 324.5],
      'worker must learn every retained prepared boundary, including free empty states');
    assert.deepStrictEqual(latestPreparedState.costlyBoundaryIndices, [320, 321, 322, 323, 324],
      'worker must receive a separate quota list containing only the five memory-bearing prepared states');

    instance.clearPreparedFrames('test-budget-reset');
    emit(frame(24, 324, 725, 726, 8 * 1024 * 1024));
    emit(frame(25, 325, 726, 727, 8 * 1024 * 1024));
    emit(frame(26, 326, 727, 728, 8 * 1024 * 1024));
    assert.strictEqual(instance.preparedFrames.length, 2,
      'prepared byte budget must evict the farthest future state even before the depth limit is reached');
    assert.strictEqual(instance.preparedBytes, 16 * 1024 * 1024,
      'prepared byte accounting must remain exact after budget eviction');
    assert.deepStrictEqual(instance.preparedFrames.map(function (entry) { return entry.boundaryIndex; }), [324, 325],
      'budget eviction must preserve the nearest prepared states first');

    var beforeGeneration = instance.renderGeneration;
    instance.setStyle({ FontSize: 40 }, 0);
    assert.strictEqual(instance.renderGeneration, beforeGeneration + 1,
      'pixel-affecting style changes must advance renderGeneration');
    assert.strictEqual(instance.preparedFrames.length, 0,
      'renderGeneration changes must invalidate all prepared pixel buffers');
    assert.ok(posted.some(function (message) { return message.target === 'ploff-render-generation' && message.renderGeneration === instance.renderGeneration; }),
      'renderGeneration invalidation must be propagated to the worker');
    var rejectedBeforeOldGeneration = timing.filter(function (entry) {
      return entry.stage === 'frame-rejected' && entry.sample.reason === 'generation';
    }).length;
    emit({ target: 'canvas', op: 'renderCanvas', time: 29, mediaTime: 730.001, boundaryIndex: 329,
      validFrom: 730, validUntil: 731, playbackEpoch: 0, renderGeneration: beforeGeneration,
      trackAnimated: false, prepared: true, canvases: [] });
    assert.strictEqual(instance.preparedFrames.length, 0,
      'a late prepared frame from the previous renderGeneration must never enter the retained queue');
    assert.strictEqual(timing.filter(function (entry) {
      return entry.stage === 'frame-rejected' && entry.sample.reason === 'generation';
    }).length, rejectedBeforeOldGeneration + 1,
      'late previous-generation frames must be diagnosed as generation rejections');

    instance.setIsPaused(false, 730);
    emit({ target: 'canvas', op: 'renderCanvas', time: 30, mediaTime: 731.001, boundaryIndex: 330,
      validFrom: 731, validUntil: 732, playbackEpoch: 0, renderGeneration: instance.renderGeneration,
      trackAnimated: false, prepared: true, canvases: [] });
    assert.strictEqual(instance.preparedFrames.length, 1);
    instance.markDiscontinuity(500);
    assert.strictEqual(instance.preparedFrames.length, 0, 'explicit seek epoch must invalidate prepared future states');
    assert.strictEqual(instance.renderGeneration, beforeGeneration + 1,
      'timeline discontinuity must not masquerade as a visual render-generation change');

    instance.setRate(2);
    assert.ok(posted.some(function (message) { return message.target === 'video' && message.rate === 2 && message.sentAt === now; }),
      'rate-change worker packet must carry the exact main-thread anchor time');
    instance.setIsPaused(false, 740);
    var rateClockAt = now;
    now += 500;
    assert.strictEqual(instance.syncExpectedTime(now), 741,
      'prepared-frame media clock must advance according to playbackRate between native clock samples');

    instance.setRate(1);
    instance.setIsPaused(false, 750);
    now += 500;
    assert.strictEqual(instance.syncExpectedTime(now), 750.5,
      'old playbackRate must advance the clock until the exact rate-change instant');
    instance.setRate(2);
    now += 500;
    assert.strictEqual(instance.syncExpectedTime(now), 751.5,
      'rate changes must re-anchor the media clock instead of applying the new rate retroactively');
    now = rateClockAt + 1500;
    instance.dispose();
  } finally {
    Date.now = originalDateNow;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.window = originalWindow; global.document = originalDocument; global.Worker = originalWorker;
    global.ImageData = originalImageData; global.WebAssembly = originalWebAssembly;
    delete require.cache[require.resolve('../app/vendor/subtitles-octopus')];
  }
}());

console.log('JavascriptSubtitlesOctopus preloaded worker reuse checks passed');
