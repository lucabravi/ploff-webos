'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var v8 = require('v8');
var BoundedQueueCache = require('../app/coordinator/bounded-queue-cache');
var ChoiceDialogController = require('../app/coordinator/choice-dialog-controller');
var MediaInfoDialogController = require('../app/coordinator/media-info-dialog-controller');
var QueueGapController = require('../app/coordinator/queue-gap-controller');
var PlexHttp = require('../app/plex-http');
var PlayerBufferingIndicator = require('../app/player-buffering-indicator');
var ProgressiveImages = require('../app/progressive-images');
var PlaybackClock = require('../app/playback-clock');
var PlaybackQueueModel = require('../app/playback-queue-model');
var PlaybackSession = require('../app/playback-session');
var PlaybackTimeline = require('../app/playback-timeline');
var PlayerQueueController = require('../app/coordinator/player-queue-controller');
var PlayerTimelinePolicy = require('../app/player-timeline-policy');
var SubtitleEditorSession = require('../app/subtitle-editor-session');
var SubtitleRuntime = require('../app/subtitle-runtime');
var SubtitleSync = require('../app/subtitle-sync');

var DEFAULT_CYCLES = 400;
var DEFAULT_SAMPLES = 6;
var DEFAULT_MAX_GROWTH = 3 * 1024 * 1024;
var DEFAULT_MAX_SLOPE = 512 * 1024;
var DEFAULT_MAX_RETAINED = 4;

function numberSetting(name, fallback) {
  var value = Number(process.env[name]);
  return isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}


function snapshotsEnabled() {
  return String(process.env.PLOFF_MEMORY_SNAPSHOTS || '') === '1';
}

function snapshotDirectory() {
  var configured = String(process.env.PLOFF_MEMORY_SNAPSHOT_DIR || '');
  return configured || path.join(os.tmpdir(), 'ploff-memory-' + process.pid);
}

function writeSnapshot(directory, name) {
  fs.mkdirSync(directory, { recursive: true });
  return v8.writeHeapSnapshot(path.join(directory, name + '.heapsnapshot'));
}

function immediate() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

async function collect() {
  var index;
  for (index = 0; index < 5; index += 1) {
    global.gc();
    await immediate();
  }
}

function payload(seed) {
  var result = [];
  var index;
  for (index = 0; index < 96; index += 1) {
    result.push({
      id: seed + ':' + index,
      value: new Array(193).join(String((seed + index) % 10))
    });
  }
  return result;
}

function imageTarget(id) {
  return {
    id: id,
    className: '',
    src: '',
    clientWidth: 154,
    clientHeight: 224,
    removeAttribute: function (name) { if (name === 'src') { this.src = ''; } }
  };
}

function fakeImageFactory(created) {
  return function FakeImage() {
    created.push(this);
    this.src = '';
    this.onload = null;
    this.onerror = null;
  };
}

function choiceViewFactory() {
  return {
    create: function () {
      var choices = [];
      var index = 0;
      return {
        open: function (_title, nextChoices, selectedValue) {
          var cursor;
          choices = nextChoices.slice();
          index = 0;
          for (cursor = 0; cursor < choices.length; cursor += 1) {
            if (String(choices[cursor].value) === String(selectedValue)) { index = cursor; break; }
          }
        },
        close: function () { choices = []; index = 0; },
        move: function (direction) { index = Math.max(0, Math.min(choices.length - 1, index + direction)); },
        focus: function (nextIndex) { index = nextIndex; },
        selected: function () { return choices[index] || null; },
        snapshot: function () { return { index: index }; }
      };
    }
  };
}

function timerRoot() {
  var nextId = 1;
  var timers = {};
  return {
    root: {
      setTimeout: function (callback) {
        var id = nextId;
        nextId += 1;
        timers[id] = callback;
        return id;
      },
      clearTimeout: function (id) { delete timers[id]; }
    },
    pending: function () { return Object.keys(timers).length; }
  };
}


function lifecycleNode(tagName, className, text) {
  var attributes = {};
  var children = [];
  var value = {
    tagName: String(tagName || 'div').toUpperCase(),
    id: '',
    className: className || '',
    textContent: text || '',
    style: {},
    childNodes: children,
    parentNode: null,
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 416,
    offsetTop: 0,
    offsetHeight: 190,
    setAttribute: function (name, next) { attributes[name] = String(next); },
    removeAttribute: function (name) { delete attributes[name]; },
    getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : ''; },
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    appendChild: function (child) { return value.insertBefore(child, null); },
    insertBefore: function (child, reference) {
      var oldIndex;
      var index;
      if (!child) { return child; }
      if (child.parentNode) {
        oldIndex = child.parentNode.childNodes.indexOf(child);
        if (oldIndex >= 0) { child.parentNode.childNodes.splice(oldIndex, 1); }
      }
      index = reference ? children.indexOf(reference) : -1;
      if (index < 0) { children.push(child); }
      else { children.splice(index, 0, child); }
      child.parentNode = value;
      return child;
    },
    removeChild: function (child) {
      var index = children.indexOf(child);
      if (index >= 0) { children.splice(index, 1); child.parentNode = null; }
      return child;
    },
    focus: function () {},
    querySelector: function (selector) {
      var matches = value.querySelectorAll(selector);
      return matches.length ? matches[0] : null;
    },
    querySelectorAll: function (selector) {
      var result = [];
      function hasClass(candidate, name) {
        return (' ' + String(candidate && candidate.className || '') + ' ').indexOf(' ' + name + ' ') >= 0;
      }
      function matches(candidate) {
        if (!candidate) { return false; }
        if (selector.charAt(0) === '#') { return candidate.id === selector.slice(1); }
        if (selector.charAt(0) === '.') { return hasClass(candidate, selector.slice(1)); }
        return candidate.tagName.toLowerCase() === selector.toLowerCase();
      }
      function visit(candidate) {
        var index;
        if (matches(candidate)) { result.push(candidate); }
        for (index = 0; index < candidate.childNodes.length; index += 1) { visit(candidate.childNodes[index]); }
      }
      children.forEach(visit);
      return result;
    }
  };
  return value;
}

function lifecycleDocument() {
  var body = lifecycleNode('body');
  var documentElement = lifecycleNode('html');
  var player = lifecycleNode('section', 'player-view');
  var buttons = lifecycleNode('div', 'player-buttons');
  var settings = lifecycleNode('button', 'player-button');
  player.id = 'player-view';
  settings.id = 'player-settings-button';
  buttons.appendChild(settings);
  player.appendChild(buttons);
  body.appendChild(player);
  return {
    body: body,
    documentElement: documentElement,
    getElementById: function (id) { return body.id === id ? body : body.querySelector('#' + id); },
    querySelector: function (selector) { return body.querySelector(selector); },
    querySelectorAll: function (selector) { return body.querySelectorAll(selector); }
  };
}

function lifecycleIntervalRoot() {
  var nextId = 1;
  var timers = {};
  return {
    root: {
      setInterval: function (callback) {
        var id = nextId;
        nextId += 1;
        timers[id] = callback;
        return id;
      },
      clearInterval: function (id) { delete timers[id]; },
      scrollTo: function () {}
    },
    pending: function () { return Object.keys(timers).length; }
  };
}

function createRuntimeLifecycleCycle(seed, exposeWeakReference, intentionalRetainer) {
  var retained = { id: 'runtime:' + seed, values: payload(seed) };
  var weak = exposeWeakReference ? new global.WeakRef(retained) : null;
  var intervals = lifecycleIntervalRoot();
  var session = PlaybackSession.create();
  var timeline = PlaybackTimeline.create({
    PlaybackClock: PlaybackClock,
    PlayerTimelinePolicy: PlayerTimelinePolicy,
    PlexClient: {
      sendTimeline: function (_config, current, _state, _position, callback) { if (callback) { callback(null); } return current && current.payload; },
      pingTranscode: function (_config, current) { return current && current.payload; }
    },
    config: { server: 'memory' },
    root: intervals.root,
    renderProgress: function () { return retained.id; },
    updateEstimatedEnd: function () { return retained.id; }
  });
  var assDisposals = 0;
  var subtitle = SubtitleRuntime.create({
    SubtitleSync: SubtitleSync,
    SubtitleOffsetStore: { get: function () { return 0; } },
    AssSubtitleRenderer: {
      create: function (options) {
        var rendererOptions = options;
        return {
          load: function (_content, callback) { callback(null); },
          hide: function () {},
          show: function () {},
          setTime: function () { return rendererOptions && rendererOptions.videoDimensions(); },
          dispose: function () { rendererOptions = null; assDisposals += 1; }
        };
      }
    },
    root: {},
    document: {},
    videoDimensions: function () { return { width: retained.values.length, height: 1080 }; },
    subtitleRendering: function () { return { ass: true, srt: true }; },
    hideText: function () {},
    renderText: function () { return retained.id; }
  });
  var editor = SubtitleEditorSession.open({
    selectedStreamID: 'ass-' + seed,
    subtitleSize: 100,
    position: 40,
    paused: true,
    bounds: { start: 35, end: 40 },
    playbackRef: retained,
    originalOptions: { subtitleStreamID: 'ass-' + seed },
    originalLocalSubtitleState: { rendererType: 'ass', content: '[Script Info]\nTitle: Memory', streamId: 'ass-' + seed, size: 100 }
  });
  var documentRef = lifecycleDocument();
  var queueItem = { ratingKey: 'item-' + seed, type: 'movie', title: 'Memory item', image: '/memory-' + seed + '.jpg', memoryPayload: retained };
  var queue = { kind: 'container', title: 'Memory queue', items: [queueItem] };
  var queueState = { sequence: { identity: 'memory-' + seed }, drawer: { open: true, index: 0, focusReady: true, queue: queue, currentIndex: 0 } };
  var canceledScopes = [];
  var domain = {
    snapshot: function () { return queueState; },
    activeQueue: function () { return queue; },
    activeIndex: function () { return 0; },
    loadDrawerWindow: function (_options, callback) {
      callback(null, {
        total: 1,
        bounds: { total: 1, visibleStart: 0, visibleEnd: 1, retainedStart: 0, retainedEnd: 1, sdStart: 0, sdEnd: 1, finalStart: 0, finalEnd: 1 },
        items: [{ occurrenceId: 'memory:0:' + seed, absoluteIndex: 0, item: queueItem }],
        prefetchItems: []
      });
    },
    openDrawer: function () { queueState.drawer.open = true; return true; },
    closeDrawer: function () { queueState.drawer.open = false; return true; },
    moveDrawer: function (direction) { queueState.drawer.index = Math.max(0, queueState.drawer.index + Number(direction || 0)); return true; },
    pointDrawer: function (index) { queueState.drawer.index = Number(index || 0); return true; }
  };
  var queuePresentation = PlayerQueueController.create({
    root: intervals.root,
    document: documentRef,
    PlaybackQueueModel: PlaybackQueueModel,
    ProgressiveImages: ProgressiveImages,
    queueController: domain,
    detailSnapshot: function () { return { currentDetail: queueItem }; },
    playbackSnapshot: function () { return { paused: false, payload: retained }; },
    currentView: function () { return 'player'; },
    currentSettings: function () { return { uiLanguage: 'en' }; },
    pointerActive: function () { return false; },
    translate: function (key) { return key; },
    element: lifecycleNode,
    posterLoader: function () { return { load: function () {} }; },
    loadRenderedPoster: function () {},
    cancelImages: function (scope) { canceledScopes.push(scope); },
    showMessage: function () {},
    closeChapterDrawer: function () {},
    cancelAutoplay: function () {},
    showControls: function () {},
    cancelControlsTimeout: function () {},
    setControlsZone: function () {},
    animationDuration: function (delay) { return delay; }
  });
  var playback = { ratingKey: queueItem.ratingKey, transcodeSession: 'memory-session', options: { delivery: 'transcode' }, payload: retained };

  session.prepare();
  session.beginStreamSwitch('starting');
  session.markSourceReady();
  session.beginNativeSeek(8, 48);
  session.finishNativeSeek();
  session.finishStreamSwitch();
  session.markPlaying();
  timeline.anchor(40, false);
  timeline.startReporting({
    current: function () { return playback; },
    state: function () { return 'playing'; },
    position: function () { return 48; },
    duration: function () { return 100; },
    terminal: function () { return false; },
    snapshot: function () { return retained; }
  });
  timeline.startKeepalive(playback, function () { return retained && retained.id !== ''; });
  subtitle.setLocal({ rendererType: 'ass', content: '[Script Info]\nTitle: Memory', offsetMs: seed % 20, streamId: 'ass-' + seed, size: 100 });
  subtitle.loadAss({ id: 'ass-' + seed }, '[Script Info]\nTitle: Memory', function (error) { assert.ifError(error); });
  subtitle.render(null, 48, false);
  SubtitleEditorSession.update(editor, { offsetMs: seed % 2 ? -250 : 250 });
  if (seed % 2) { SubtitleEditorSession.cancel(editor, 'restoring'); }
  else { SubtitleEditorSession.commit(editor, 'applying'); }
  queuePresentation.renderDrawerState(queueState.drawer);
  queuePresentation.open();
  queuePresentation.move(1);
  queuePresentation.close(true);

  session.resetForClose(true);
  session.resetForClose(false);
  session.prepare();
  session.beginStreamSwitch('starting');
  assert.strictEqual(session.shouldRejectPlaying(), true, 'runtime memory cycle must preserve the reopen startup guard');
  session.markSourceReady();
  session.finishStreamSwitch();
  session.markPlaying();

  if (intentionalRetainer) { intentionalRetainer.push(retained); }

  queuePresentation.destroy();
  subtitle.reset();
  timeline.reset();
  session.destroy();
  assert.strictEqual(intervals.pending(), 0, 'runtime lifecycle teardown must clear Timeline intervals');
  assert.strictEqual(assDisposals, 1, 'runtime lifecycle teardown must dispose the ASS renderer exactly once');
  assert.deepStrictEqual(canceledScopes.sort(), ['playlist-queue', 'playlist-queue-prefetch'], 'runtime lifecycle teardown must release both queue artwork scopes');
  assert.strictEqual(session.destroyed(), true, 'runtime lifecycle teardown must close PlaybackSession');

  retained = null;
  session = null;
  timeline = null;
  subtitle = null;
  editor = null;
  documentRef = null;
  queueItem = null;
  queue = null;
  queueState = null;
  domain = null;
  queuePresentation = null;
  playback = null;
  intervals = null;
  return weak;
}

function mediaInfoViewFactory() {
  return {
    create: function () {
      var model = null;
      return {
        open: function (nextModel) { model = nextModel; return !!model; },
        close: function () { model = null; },
        scroll: function () {}
      };
    }
  };
}

function createMemoryCycle(seed, exposeWeakReference) {
  var retained = payload(seed);
  var weak = exposeWeakReference ? new global.WeakRef(retained) : null;
  var cache = BoundedQueueCache.create({ pageSize: 40, maxPages: 5, maxRecords: 200 });
  var gap = QueueGapController.create({ onState: function () { return retained.length; } });
  var choice = ChoiceDialogController.create({ document: {}, ChoiceDialogView: choiceViewFactory() });
  var closeButton = { onclick: null };
  var mediaInfo = MediaInfoDialogController.create({
    document: { getElementById: function () { return closeButton; } },
    MediaInfoView: mediaInfoViewFactory(),
    onClosed: function () { return retained.length; }
  });
  var timers = timerRoot();
  var buffering = PlayerBufferingIndicator.create({
    root: timers.root,
    isEligible: function () { return retained.length > 0; },
    position: function () { return retained.length; },
    onShow: function () { return retained.length; },
    onHide: function () { return retained.length; }
  });
  var preloads = [];
  var images = ProgressiveImages.create({
    Image: fakeImageFactory(preloads),
    previewConcurrency: 2,
    fullConcurrency: 1,
    urlFor: function (source, width, height) { return source + '@' + width + 'x' + height; }
  });
  var targets = [];
  var page;
  var index;
  var records;
  var requestRoot;
  var request;
  var aborted = false;

  for (page = 0; page < 8; page += 1) {
    records = [];
    for (index = 0; index < 40; index += 1) {
      records.push({ occurrenceId: seed + ':' + page + ':' + index, payload: retained });
    }
    cache.putPage(page * 40, records, { total: 320, generation: seed });
  }

  gap.open({
    token: 'gap:' + seed,
    target: { occurrenceId: 'item:' + seed, item: { payload: retained } }
  });
  choice.open({
    title: 'Choice ' + seed,
    choices: [{ value: 'value', label: 'Value', payload: retained }],
    selectedValue: 'value',
    apply: function () { return retained.length; },
    returnFocus: function () { return retained.length; }
  });
  mediaInfo.open({ sections: retained }, 'player');
  buffering.signal();

  for (index = 0; index < 6; index += 1) {
    targets[index] = imageTarget('image:' + seed + ':' + index);
    images.load(targets[index], {
      source: 'art:' + seed + ':' + index,
      previewWidth: 64,
      previewHeight: 96,
      width: 154,
      height: 224,
      scope: 'memory',
      priority: index,
      onPreview: function () { return retained.length; }
    });
  }
  targets[0].onload();
  targets[1].onload();

  requestRoot = {
    XMLHttpRequest: function () {
      this.open = function () {};
      this.setRequestHeader = function () {};
      this.send = function () {};
      this.abort = function () { aborted = true; };
    }
  };
  request = PlexHttp.request(requestRoot, { url: '/memory/' + seed }, function () { return retained.length; });
  request.abort();

  cache.destroy();
  gap.destroy();
  choice.destroy();
  mediaInfo.destroy();
  buffering.stop();
  images.destroy();

  assert.deepStrictEqual(cache.snapshot(), {
    residentPages: 0,
    residentRecords: 0,
    peakResidentPages: 5,
    peakResidentRecords: 200,
    descriptorCount: 0
  });
  assert.strictEqual(gap.snapshot().confirmation, null);
  assert.strictEqual(choice.snapshot().choices.length, 0);
  assert.strictEqual(closeButton.onclick, null);
  assert.strictEqual(timers.pending(), 0);
  assert.strictEqual(aborted, true);
  for (index = 0; index < targets.length; index += 1) {
    assert.strictEqual(targets[index].__plexProgressiveJob, null);
    assert.strictEqual(targets[index].onload || null, null);
    assert.strictEqual(targets[index].onerror || null, null);
  }
  for (index = 0; index < preloads.length; index += 1) {
    assert.strictEqual(preloads[index].onload, null);
    assert.strictEqual(preloads[index].onerror, null);
    assert.strictEqual(preloads[index].src, '');
  }

  retained = null;
  cache = null;
  gap = null;
  choice = null;
  mediaInfo = null;
  buffering = null;
  timers = null;
  images = null;
  targets = null;
  preloads = null;
  request = null;
  requestRoot = null;
  closeButton = null;
  return weak;
}

async function heapUsed() {
  await collect();
  return process.memoryUsage().heapUsed;
}

function regressionSlope(samples) {
  var count = samples.length;
  var sumX = 0;
  var sumY = 0;
  var sumXY = 0;
  var sumXX = 0;
  var index;
  var denominator;
  for (index = 0; index < count; index += 1) {
    sumX += index;
    sumY += samples[index];
    sumXY += index * samples[index];
    sumXX += index * index;
  }
  denominator = count * sumXX - sumX * sumX;
  return denominator ? (count * sumXY - sumX * sumY) / denominator : 0;
}

function formatBytes(value) {
  return (value / 1024 / 1024).toFixed(2) + ' MiB';
}

async function run() {
  var cycles = numberSetting('PLOFF_MEMORY_CYCLES', DEFAULT_CYCLES);
  var sampleCount = numberSetting('PLOFF_MEMORY_SAMPLES', DEFAULT_SAMPLES);
  var maxGrowth = numberSetting('PLOFF_MEMORY_MAX_GROWTH_BYTES', DEFAULT_MAX_GROWTH);
  var maxSlope = numberSetting('PLOFF_MEMORY_MAX_SLOPE_BYTES', DEFAULT_MAX_SLOPE);
  var maxRetained = numberSetting('PLOFF_MEMORY_MAX_RETAINED', DEFAULT_MAX_RETAINED);
  var weakReferences = [];
  var runtimeWeakReferences = [];
  var intentionalRuntimeRetention = [];
  var runtimeRetainedCount = 0;
  var samples = [];
  var sample;
  var cycle;
  var first;
  var last;
  var growth;
  var slope;
  var retainedCount;
  var snapshotDir = snapshotsEnabled() ? snapshotDirectory() : '';
  var snapshotPaths = [];

  if (typeof global.gc !== 'function') {
    throw new Error('Run with node --expose-gc or npm run test:memory');
  }
  if (typeof global.WeakRef !== 'function') {
    throw new Error('WeakRef support is required for the pre-release memory test');
  }

  runtimeWeakReferences.push(createRuntimeLifecycleCycle(900000, true, intentionalRuntimeRetention));
  await collect();
  assert.ok(runtimeWeakReferences[0].deref(), 'runtime WeakRef harness must detect an intentionally retained lifecycle payload');
  intentionalRuntimeRetention = [];
  runtimeWeakReferences = [];
  await collect();

  for (sample = 0; sample < 2; sample += 1) {
    for (cycle = 0; cycle < cycles; cycle += 1) {
      createMemoryCycle(sample * cycles + cycle, false);
    }
    createRuntimeLifecycleCycle(950000 + sample, false);
    await collect();
  }

  if (snapshotDir) {
    await collect();
    snapshotPaths.push(writeSnapshot(snapshotDir, 'before'));
    await collect();
  }

  for (cycle = 0; cycle < Math.min(cycles, 200); cycle += 1) {
    weakReferences.push(createMemoryCycle(1000000 + cycle, true));
  }
  await collect();
  retainedCount = weakReferences.reduce(function (count, reference) {
    return count + (reference.deref() ? 1 : 0);
  }, 0);
  assert.ok(retainedCount <= maxRetained, 'destroyed lifecycle payloads retained: ' + retainedCount + ' > ' + maxRetained);
  weakReferences = [];

  for (cycle = 0; cycle < Math.min(cycles, 100); cycle += 1) {
    runtimeWeakReferences.push(createRuntimeLifecycleCycle(1500000 + cycle, true));
  }
  await collect();
  runtimeRetainedCount = runtimeWeakReferences.reduce(function (count, reference) {
    return count + (reference.deref() ? 1 : 0);
  }, 0);
  assert.ok(runtimeRetainedCount <= maxRetained, 'destroyed runtime lifecycle payloads retained: ' + runtimeRetainedCount + ' > ' + maxRetained);
  runtimeWeakReferences = [];

  for (sample = 0; sample < sampleCount; sample += 1) {
    for (cycle = 0; cycle < cycles; cycle += 1) {
      createMemoryCycle(2000000 + sample * cycles + cycle, false);
    }
    createRuntimeLifecycleCycle(2500000 + sample, false);
    samples.push(await heapUsed());
  }

  first = samples[0];
  last = samples[samples.length - 1];
  growth = last - first;
  slope = regressionSlope(samples);

  assert.ok(growth <= maxGrowth, 'heap growth exceeded limit: ' + formatBytes(growth) + ' > ' + formatBytes(maxGrowth));
  assert.ok(slope <= maxSlope, 'heap slope exceeded limit: ' + formatBytes(slope) + ' per sample > ' + formatBytes(maxSlope));

  if (snapshotDir) {
    await collect();
    snapshotPaths.push(writeSnapshot(snapshotDir, 'after'));
  }

  console.log('Pre-release memory lifecycle checks passed');
  console.log('Cycles per sample: ' + cycles + ', samples: ' + sampleCount);
  console.log('Weakly retained payloads: ' + retainedCount + '/' + Math.min(cycles, 200));
  console.log('Weakly retained runtime payloads: ' + runtimeRetainedCount + '/' + Math.min(cycles, 100));
  console.log('Heap samples: ' + samples.map(formatBytes).join(', '));
  console.log('Net growth: ' + formatBytes(growth) + ', slope: ' + formatBytes(slope) + ' per sample');
  if (snapshotPaths.length) { console.log('Heap snapshots: ' + snapshotPaths.join(', ')); }
}

run().catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
