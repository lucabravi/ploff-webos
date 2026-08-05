(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffProgressiveImages = factory();
  }
}(this, function () {
  'use strict';

  var ARTWORK_QUALITY_STEPS = [70, 80, 85, 90, 100];
  var BACKDROP_QUALITY_STEPS = [50, 60, 70, 85, 100];
  var QUALITY_STEPS = [50, 60, 70, 80, 85, 90, 100];

  function qualityFromSteps(value, steps, fallback) {
    var quality = Number(value);
    var nearest = fallback;
    var distance = Infinity;
    var index;
    var currentDistance;
    if (!isFinite(quality)) { return fallback; }
    for (index = 0; index < steps.length; index += 1) {
      currentDistance = Math.abs(steps[index] - quality);
      if (currentDistance < distance) {
        nearest = steps[index];
        distance = currentDistance;
      }
    }
    return nearest;
  }

  function supportedQuality(value) {
    return qualityFromSteps(value, QUALITY_STEPS, 90);
  }

  function supportedArtworkQuality(value) {
    return qualityFromSteps(value, ARTWORK_QUALITY_STEPS, 90);
  }

  function supportedBackdropQuality(value) {
    return qualityFromSteps(value, BACKDROP_QUALITY_STEPS, 85);
  }

  function qualitySize(width, height, quality) {
    var factor = supportedQuality(quality) / 100;
    return {
      width: Math.max(1, Math.round(Math.max(1, Number(width || 1)) * factor)),
      height: Math.max(1, Math.round(Math.max(1, Number(height || 1)) * factor))
    };
  }

  function isBackdropScope(scope) {
    var value = String(scope || '');
    return value === 'backdrop' || /-backdrop$/.test(value);
  }

  function qualityForScope(settings, scope) {
    var values = settings || {};
    return isBackdropScope(scope)
      ? supportedBackdropQuality(values.backdropQuality)
      : supportedArtworkQuality(values.artworkQuality);
  }

  function addClass(target, name) {
    var pattern = new RegExp('(^|\\s)' + name + '(?=\\s|$)');
    if (!pattern.test(target.className)) { target.className += ' ' + name; }
  }

  function removeClass(target, name) {
    target.className = target.className.replace(new RegExp('(^|\\s)' + name + '(?=\\s|$)', 'g'), ' ').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  }

  function renderedSize(target, fallbackWidth, fallbackHeight) {
    var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    var width = rect && rect.width ? rect.width : (target && target.clientWidth || fallbackWidth || 1);
    var height = rect && rect.height ? rect.height : (target && target.clientHeight || fallbackHeight || 1);
    return {
      width: Math.max(1, Math.floor(Number(width) || 1)),
      height: Math.max(1, Math.floor(Number(height) || 1))
    };
  }

  function previewSize(width, height, maximumEdge) {
    var sourceWidth = Math.max(1, Number(width || 1));
    var sourceHeight = Math.max(1, Number(height || 1));
    var limit = Math.max(1, Number(maximumEdge || 96));
    var scale = limit / Math.max(sourceWidth, sourceHeight);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale))
    };
  }

  function create(options) {
    var settings = options || {};
    var ImageConstructor = settings.Image;
    var previewLimit = Math.max(1, Number(settings.previewConcurrency || 4));
    var fullLimit = Math.max(1, Number(settings.fullConcurrency || 2));
    var previewQueue = [];
    var fullQueue = [];
    var activePreview = 0;
    var activeFull = 0;
    var sequence = 0;
    var jobs = [];
    var knownPreviewUrls = {};
    var knownPreviewUrlOrder = [];
    var knownFullUrls = {};
    var knownFullUrlOrder = [];
    var knownFullUrlLimit = Math.max(1, Number(settings.knownFullUrlLimit || 1000));
    var pumpPaused = false;
    var destroyed = false;

    function rememberFullUrl(url) {
      var index;
      var expired;
      if (knownFullUrls[url]) {
        index = knownFullUrlOrder.indexOf(url);
        if (index !== -1) { knownFullUrlOrder.splice(index, 1); }
      }
      knownFullUrls[url] = true;
      knownFullUrlOrder.push(url);
      while (knownFullUrlOrder.length > knownFullUrlLimit) {
        expired = knownFullUrlOrder.shift();
        delete knownFullUrls[expired];
      }
    }

    function rememberPreviewUrl(url) {
      var expired;
      if (knownPreviewUrls[url]) { return; }
      knownPreviewUrls[url] = true;
      knownPreviewUrlOrder.push(url);
      while (knownPreviewUrlOrder.length > knownFullUrlLimit) {
        expired = knownPreviewUrlOrder.shift();
        delete knownPreviewUrls[expired];
      }
    }

    function current(job) {
      return !destroyed && !!job && !job.cancelled && job.target.__plexProgressiveJob === job;
    }

    function attached(job) {
      return !settings.isAttached || settings.isAttached(job.target);
    }

    function compare(left, right) {
      if (left.priority !== right.priority) { return left.priority - right.priority; }
      return left.sequence - right.sequence;
    }

    function insertQueuedJob(queue, job) {
      var low = 0;
      var high = queue.length;
      var middle;
      while (low < high) {
        middle = Math.floor((low + high) / 2);
        if (compare(job, queue[middle]) < 0) { high = middle; }
        else { low = middle + 1; }
      }
      queue.splice(low, 0, job);
    }

    function queuedJobArray(job) {
      if (job && job.phase === 'queued-preview') { return previewQueue; }
      if (job && job.phase === 'queued-full') { return fullQueue; }
      return null;
    }

    function removeQueuedJob(job) {
      var queue = queuedJobArray(job);
      var index = queue ? queue.indexOf(job) : -1;
      if (index !== -1) { queue.splice(index, 1); }
    }

    function reorderQueuedJob(job) {
      var queue = queuedJobArray(job);
      if (!queue) { return; }
      removeQueuedJob(job);
      insertQueuedJob(queue, job);
    }

    function removeJob(job) {
      var index = jobs.indexOf(job);
      if (index !== -1) { jobs.splice(index, 1); }
    }

    function releaseJob(job) {
      var target = job && job.target;
      if (!job) { return; }
      if (target && target.__plexProgressiveJob === job) { target.__plexProgressiveJob = null; }
      job.target = null;
      job.onPreview = null;
      job.preload = null;
      job.finishPreview = null;
      job.finishFull = null;
    }

    function clearTarget(target) {
      removeClass(target, 'is-loaded');
      removeClass(target, 'is-preview');
      removeClass(target, 'is-full');
      target.__plexProgressiveJob = null;
      target.__plexProgressiveSource = '';
      target.__plexProgressiveState = '';
      target.__plexProgressiveFullUrl = '';
      target.__plexProgressivePreviewUrl = '';
      target.__plexProgressiveSpecification = null;
      if (target.removeAttribute) { target.removeAttribute('src'); }
      else { target.src = ''; }
    }

    function fullUrl(job) {
      return job.fullUrl;
    }

    function previewUrl(job) {
      return job.previewUrl;
    }

    function pumpFull() {
      var job;
      while (activeFull < fullLimit && fullQueue.length) {
        job = fullQueue.shift();
        if (current(job)) { startFull(job); }
      }
    }

    function pumpPreview() {
      var job;
      while (activePreview < previewLimit && previewQueue.length) {
        job = previewQueue.shift();
        if (current(job)) { startPreview(job); }
      }
    }

    function pump() {
      if (pumpPaused || destroyed) { return; }
      pumpPreview();
      pumpFull();
    }

    function queueFull(job) {
      if (!current(job)) { removeJob(job); releaseJob(job); return; }
      job.phase = 'queued-full';
      insertQueuedJob(fullQueue, job);
      pump();
    }

    function startPreview(job) {
      var finished = false;
      var target = job.target;
      function finish(success) {
        if (finished) { return; }
        finished = true;
        job.finishPreview = null;
        if (target.onload === onLoad) { target.onload = null; }
        if (target.onerror === onError) { target.onerror = null; }
        activePreview = Math.max(0, activePreview - 1);
        if (current(job)) {
          if (success) {
            rememberPreviewUrl(previewUrl(job));
            target.__plexProgressiveState = 'preview';
            target.__plexProgressivePreviewUrl = previewUrl(job);
            addClass(target, 'is-loaded');
            addClass(target, 'is-preview');
            removeClass(target, 'is-full');
            if (job.onPreview) {
              try { job.onPreview(target); }
              catch (callbackError) {}
            }
          }
          if (job.previewOnly) {
            job.phase = 'done';
            removeJob(job);
            releaseJob(job);
            pump();
          } else { queueFull(job); }
        } else {
          removeJob(job);
          releaseJob(job);
          pump();
        }
      }
      function onLoad() { finish(true); }
      function onError() { finish(false); }
      activePreview += 1;
      job.phase = 'loading-preview';
      job.finishPreview = finish;
      target.__plexProgressiveState = 'loading-preview';
      target.onload = onLoad;
      target.onerror = onError;
      try { target.src = previewUrl(job); }
      catch (error) { finish(false); }
    }

    function startFull(job) {
      var finished = false;
      var preload;
      var url = fullUrl(job);
      if (!attached(job)) {
        job.phase = 'done';
        removeJob(job);
        releaseJob(job);
        pump();
        return;
      }
      preload = new ImageConstructor();
      function finish(success) {
        if (finished) { return; }
        finished = true;
        job.finishFull = null;
        job.preload = null;
        preload.onload = null;
        preload.onerror = null;
        activeFull = Math.max(0, activeFull - 1);
        if (success && current(job) && attached(job)) {
          rememberFullUrl(url);
          job.target.src = url;
          job.target.__plexProgressiveFullUrl = url;
          job.target.__plexProgressiveState = 'full';
          addClass(job.target, 'is-loaded');
          addClass(job.target, 'is-full');
          removeClass(job.target, 'is-preview');
        }
        job.phase = 'done';
        removeJob(job);
        releaseJob(job);
        pump();
      }
      activeFull += 1;
      job.phase = 'loading-full';
      job.preload = preload;
      job.finishFull = finish;
      preload.onload = function () { finish(true); };
      preload.onerror = function () { finish(false); };
      try { preload.src = url; }
      catch (error) { finish(false); }
    }

    function cancelJob(job) {
      var clearIncompleteTarget;
      var target;
      if (!job || job.cancelled) { return; }
      target = job.target;
      clearIncompleteTarget = job.phase === 'queued-preview' || job.phase === 'loading-preview';
      removeQueuedJob(job);
      job.cancelled = true;
      if (clearIncompleteTarget && target && target.__plexProgressiveJob === job) { clearTarget(target); }
      if (job.finishPreview) { job.finishPreview(false); }
      else if (job.finishFull) {
        if (job.preload) {
          job.preload.onload = null;
          job.preload.onerror = null;
          try { job.preload.src = ''; }
          catch (abortError) {}
        }
        job.finishFull(false);
      }
      else { removeJob(job); }
      releaseJob(job);
    }

    function load(target, specification) {
      var spec = specification || {};
      var source = String(spec.source || '');
      var previewWidth = Math.max(1, Number(spec.previewWidth || 64));
      var previewHeight = Math.max(1, Number(spec.previewHeight || 96));
      var width = Math.max(1, Number(spec.width || 154));
      var height = Math.max(1, Number(spec.height || 224));
      var requestedFullUrl;
      var requestedPreviewUrl;
      var requestedPriority;
      var requestedPreviewOnly;
      var previous;
      var job;
      var storedSpecification;
      requestedPreviewOnly = spec.previewOnly === true;
      if (destroyed || !target || !ImageConstructor || !settings.urlFor) { return null; }
      previous = target.__plexProgressiveJob;
      if (!source) {
        cancelJob(previous);
        clearTarget(target);
        return null;
      }
      requestedFullUrl = settings.urlFor(source, width, height, String(spec.scope || 'default'));
      requestedPreviewUrl = settings.urlFor(source, previewWidth, previewHeight, String(spec.scope || 'default'));
      storedSpecification = {
        source: source,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        width: width,
        height: height,
        priority: Math.max(0, Number(spec.priority || 0)),
        scope: String(spec.scope || 'default'),
        previewOnly: requestedPreviewOnly
      };
      target.__plexProgressiveSpecification = storedSpecification;
      if (target.__plexProgressiveSource === source && target.__plexProgressiveState === 'full' && target.__plexProgressiveFullUrl === requestedFullUrl) {
        return previous || null;
      }
      if (requestedPreviewOnly && target.__plexProgressiveSource === source &&
          (target.__plexProgressiveState === 'full' ||
           target.__plexProgressiveState === 'preview' && target.__plexProgressivePreviewUrl === requestedPreviewUrl)) {
        return previous || null;
      }
      if (target.__plexProgressiveSource === source && previous && !previous.cancelled && previous.phase !== 'done' && fullUrl(previous) === requestedFullUrl) {
        requestedPriority = Math.max(0, Number(spec.priority || 0));
        if (!requestedPreviewOnly) { previous.previewOnly = false; }
        if (requestedPriority < previous.priority) {
          previous.priority = requestedPriority;
          reorderQueuedJob(previous);
          pump();
        }
        return previous;
      }
      cancelJob(previous);
      if (target.__plexProgressiveSource !== source) {
        clearTarget(target);
        target.__plexProgressiveSpecification = storedSpecification;
      }
      if (knownFullUrls[requestedFullUrl]) {
        target.__plexProgressiveJob = null;
        target.__plexProgressiveSource = source;
        target.__plexProgressiveFullUrl = requestedFullUrl;
        target.__plexProgressiveState = 'full';
        target.src = requestedFullUrl;
        addClass(target, 'is-loaded');
        addClass(target, 'is-full');
        removeClass(target, 'is-preview');
        if (typeof spec.onPreview === 'function') {
          try { spec.onPreview(target); }
          catch (knownFullCallbackError) {}
        }
        return null;
      }
      job = {
        target: target,
        source: source,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        width: width,
        height: height,
        previewUrl: requestedPreviewUrl,
        fullUrl: requestedFullUrl,
        priority: Math.max(0, Number(spec.priority || 0)),
        scope: String(spec.scope || 'default'),
        onPreview: typeof spec.onPreview === 'function' ? spec.onPreview : null,
        sequence: sequence += 1,
        phase: 'queued-preview',
        cancelled: false,
        previewOnly: requestedPreviewOnly
      };
      target.__plexProgressiveJob = job;
      target.__plexProgressiveSource = source;
      jobs.push(job);
      if (target.__plexProgressiveState === 'preview' || target.__plexProgressiveState === 'full') {
        if (job.previewOnly) {
          job.phase = 'done';
          removeJob(job);
          releaseJob(job);
          pump();
        } else { queueFull(job); }
      } else if (knownPreviewUrls[previewUrl(job)]) {
        target.src = previewUrl(job);
        target.__plexProgressiveState = 'preview';
        target.__plexProgressivePreviewUrl = previewUrl(job);
        addClass(target, 'is-loaded');
        addClass(target, 'is-preview');
        removeClass(target, 'is-full');
        if (job.onPreview) {
          try { job.onPreview(target); }
          catch (previewCallbackError) {}
        }
        if (job.previewOnly) {
          job.phase = 'done';
          removeJob(job);
          releaseJob(job);
          pump();
        } else { queueFull(job); }
      } else { insertQueuedJob(previewQueue, job); pump(); }
      return job;
    }

    function prioritize(target, priority) {
      var job = target && target.__plexProgressiveJob;
      var specification = target && target.__plexProgressiveSpecification;
      var nextPriority = Math.max(0, Number(priority === undefined ? 0 : priority));
      if (specification && nextPriority < specification.priority) { specification.priority = nextPriority; }
      if (current(job)) {
        job.previewOnly = false;
        if (nextPriority < job.priority) {
          job.priority = nextPriority;
          reorderQueuedJob(job);
        }
        pump();
        return;
      }
      if (!specification || target.__plexProgressiveState !== 'preview') { return; }
      load(target, {
        source: specification.source,
        previewWidth: specification.previewWidth,
        previewHeight: specification.previewHeight,
        width: specification.width,
        height: specification.height,
        priority: nextPriority,
        scope: specification.scope,
        previewOnly: false
      });
    }

    function cancel(target) {
      cancelJob(target && target.__plexProgressiveJob);
    }

    function loadBatch(entries) {
      var batch;
      var index;
      var wasPaused;
      if (destroyed) { return; }
      batch = Object.prototype.toString.call(entries) === '[object Array]' ? entries.slice() : [];
      batch.sort(function (left, right) {
        return Number(left && left.specification && left.specification.priority || 0) - Number(right && right.specification && right.specification.priority || 0);
      });
      wasPaused = pumpPaused;
      pumpPaused = true;
      try {
        for (index = 0; index < batch.length; index += 1) {
          if (batch[index]) { load(batch[index].target, batch[index].specification); }
        }
      } finally {
        pumpPaused = wasPaused;
      }
      pump();
    }

    function cancelMatching(matches) {
      var pending = jobs.slice();
      var index;
      var wasPaused = pumpPaused;
      pumpPaused = true;
      try {
        for (index = 0; index < pending.length; index += 1) {
          if (matches(pending[index])) { cancelJob(pending[index]); }
        }
      } finally {
        pumpPaused = wasPaused;
      }
      pump();
    }

    function cancelScope(scope) {
      cancelMatching(function (job) { return job.scope === scope; });
    }

    function cancelAll() {
      cancelMatching(function () { return true; });
      previewQueue = [];
      fullQueue = [];
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelAll();
      knownPreviewUrls = {};
      knownPreviewUrlOrder = [];
      knownFullUrls = {};
      knownFullUrlOrder = [];
    }

    return {
      cancel: cancel,
      cancelAll: cancelAll,
      cancelScope: cancelScope,
      destroy: destroy,
      load: load,
      loadBatch: loadBatch,
      prioritize: prioritize
    };
  }

  return {
    ARTWORK_QUALITY_STEPS: ARTWORK_QUALITY_STEPS.slice(),
    BACKDROP_QUALITY_STEPS: BACKDROP_QUALITY_STEPS.slice(),
    QUALITY_STEPS: QUALITY_STEPS.slice(),
    create: create,
    isBackdropScope: isBackdropScope,
    previewSize: previewSize,
    qualityForScope: qualityForScope,
    qualitySize: qualitySize,
    renderedSize: renderedSize,
    supportedArtworkQuality: supportedArtworkQuality,
    supportedBackdropQuality: supportedBackdropQuality,
    supportedQuality: supportedQuality
  };
}));
