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

  for (sample = 0; sample < 2; sample += 1) {
    for (cycle = 0; cycle < cycles; cycle += 1) {
      createMemoryCycle(sample * cycles + cycle, false);
    }
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

  for (sample = 0; sample < sampleCount; sample += 1) {
    for (cycle = 0; cycle < cycles; cycle += 1) {
      createMemoryCycle(2000000 + sample * cycles + cycle, false);
    }
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
  console.log('Heap samples: ' + samples.map(formatBytes).join(', '));
  console.log('Net growth: ' + formatBytes(growth) + ', slope: ' + formatBytes(slope) + ' per sample');
  if (snapshotPaths.length) { console.log('Heap snapshots: ' + snapshotPaths.join(', ')); }
}

run().catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
