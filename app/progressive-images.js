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

  function normalizeRetryDelays(value) {
    var source = Object.prototype.toString.call(value) === '[object Array]' ? value : [250, 750];
    var result = [];
    var index;
    var delay;
    for (index = 0; index < source.length; index += 1) {
      delay = Number(source[index]);
      if (isFinite(delay) && delay > 0) { result.push(Math.round(delay)); }
    }
    return result.length ? result : [250, 750];
  }

  function create(options) {
    var settings = options || {};
    var ImageConstructor = settings.Image;
    var clock = settings.clock || {};
    var previewLimit = Math.max(1, Number(settings.previewConcurrency || 4));
    var fullLimit = Math.max(1, Number(settings.fullConcurrency || 2));
    var fullRetryDelays = normalizeRetryDelays(settings.fullRetryDelays);
    var fullRetryLimit = settings.fullRetryLimit === undefined
      ? fullRetryDelays.length
      : Math.max(0, Number(settings.fullRetryLimit) || 0);
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
    var fullLoadsDeferred = false;
    var fullDeferTimer = null;
    var homePressure = false;
    var pendingPrefetch = null;
    var activePrefetch = null;
    var destroyed = false;

    function sourceContextIdentity(context) {
      if (typeof settings.sourceContextIdentity === 'function') { return String(settings.sourceContextIdentity(context) || ''); }
      context = context || {};
      return String(context.serverMachineIdentifier || context.sourceId || '');
    }

    function specificationIdentity(specification) {
      specification = specification || {};
      if (specification.sourceIdentity !== undefined && specification.sourceIdentity !== null) { return String(specification.sourceIdentity); }
      return sourceContextIdentity(specification.sourceContext);
    }

    function runtimeSettings() {
      return typeof settings.runtimeSettings === 'function' ? (settings.runtimeSettings() || {}) : {};
    }

    function dataSaverEnabled() {
      return runtimeSettings().artworkDataSaver === true;
    }

    function activePreviewLimit() {
      var limit = dataSaverEnabled() ? Math.min(previewLimit, 2) : previewLimit;
      return limit;
    }

    function activeFullLimit() {
      return dataSaverEnabled() ? Math.min(fullLimit, 1) : fullLimit;
    }

    function allowedByHomePressure(job, phase) {
      if (!homePressure || !job || job.scope !== 'home') { return true; }
      return job.priority <= (phase === 'full' ? 0 : 1);
    }

    function takeQueuedJob(queue, phase) {
      var index;
      var job;
      for (index = 0; index < queue.length; index += 1) {
        job = queue[index];
        if (!current(job)) { queue.splice(index, 1); index -= 1; continue; }
        if (allowedByHomePressure(job, phase)) { queue.splice(index, 1); return job; }
      }
      return null;
    }

    function requestSize(width, height) {
      return {
        width: Math.max(1, Math.round(Math.max(1, Number(width || 1)))),
        height: Math.max(1, Math.round(Math.max(1, Number(height || 1))))
      };
    }

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

    function forgetKnownUrl(cache, order, url) {
      var index;
      if (!url || !cache[url]) { return; }
      delete cache[url];
      index = order.indexOf(url);
      if (index !== -1) { order.splice(index, 1); }
    }

    function watchKnownAssignment(target, source, state, url, onPreview) {
      var urlProperty = state === 'full' ? '__plexProgressiveFullUrl' : '__plexProgressivePreviewUrl';
      function cleanup() {
        if (target.onload === onLoad) { target.onload = null; }
        if (target.onerror === onError) { target.onerror = null; }
      }
      function onLoad() { cleanup(); }
      function onError() {
        var specification;
        var retrySpecification;
        var key;
        var job;
        cleanup();
        if (target.__plexProgressiveSource !== source || target.__plexProgressiveState !== state || target[urlProperty] !== url) { return; }
        if (state === 'full') { forgetKnownUrl(knownFullUrls, knownFullUrlOrder, url); }
        else { forgetKnownUrl(knownPreviewUrls, knownPreviewUrlOrder, url); }
        target.__plexProgressiveState = '';
        target[urlProperty] = '';
        removeClass(target, 'is-' + state);
        removeClass(target, 'is-loaded');
        if (target.removeAttribute) { target.removeAttribute('src'); }
        else { target.src = ''; }
        job = target.__plexProgressiveJob;
        if (job) { cancelJob(job); }
        specification = target.__plexProgressiveSpecification;
        if (!specification || Number(specification.knownAssignmentRetries || 0) >= 1 ||
            settings.isAttached && !settings.isAttached(target)) { return; }
        retrySpecification = {};
        for (key in specification) {
          if (Object.prototype.hasOwnProperty.call(specification, key)) {
            retrySpecification[key] = specification[key];
          }
        }
        retrySpecification.knownAssignmentRetries = 1;
        if (typeof onPreview === 'function') { retrySpecification.onPreview = onPreview; }
        load(target, retrySpecification);
      }
      target.onload = onLoad;
      target.onerror = onError;
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

    function callPreviewSettled(callback, success, target) {
      if (typeof callback !== 'function') { return; }
      try { callback(success === true, target || null); }
      catch (callbackError) {}
    }

    function addPreviewSettledCallback(job, callback) {
      if (!job || typeof callback !== 'function') { return; }
      if (job.previewSettled) {
        callPreviewSettled(callback, job.previewSucceeded, job.target);
        return;
      }
      job.previewSettledCallbacks.push(callback);
    }

    function settlePreview(job, success) {
      var callbacks;
      var index;
      if (!job || job.previewSettled) { return; }
      job.previewSettled = true;
      job.previewSucceeded = success === true;
      callbacks = job.previewSettledCallbacks.slice();
      job.previewSettledCallbacks = [];
      for (index = 0; index < callbacks.length; index += 1) {
        callPreviewSettled(callbacks[index], job.previewSucceeded, job.target);
      }
    }

    function releaseJob(job) {
      var target = job && job.target;
      if (!job) { return; }
      if (target && target.__plexProgressiveJob === job) { target.__plexProgressiveJob = null; }
      job.target = null;
      job.onPreview = null;
      job.previewSettledCallbacks = [];
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

    function retryDelay(retryCount) {
      return fullRetryDelays[Math.min(Math.max(0, retryCount - 1), fullRetryDelays.length - 1)];
    }

    function clearRetryTimer(job) {
      if (!job || job.retryTimer === null || !clock.clearTimeout) { return; }
      clock.clearTimeout(job.retryTimer);
      job.retryTimer = null;
    }

    function finishRetryJob(job) {
      if (!job) { return; }
      clearRetryTimer(job);
      job.phase = 'done';
      removeJob(job);
      releaseJob(job);
      pump();
    }

    function scheduleFullRetry(job) {
      var target = job && job.target;
      var delay;
      if (!current(job) || !target || !attached(job) ||
          target.__plexProgressiveSource !== job.source ||
          target.__plexProgressiveState !== 'preview' ||
          job.retryCount >= fullRetryLimit || !clock.setTimeout) {
        return false;
      }
      job.retryCount += 1;
      delay = retryDelay(job.retryCount);
      job.phase = 'retry-full';
      job.retryTimer = clock.setTimeout(function () {
        job.retryTimer = null;
        if (!current(job) || !attached(job) ||
            target.__plexProgressiveSource !== job.source ||
            target.__plexProgressiveState !== 'preview') {
          finishRetryJob(job);
          return;
        }
        job.phase = 'queued-full';
        insertQueuedJob(fullQueue, job);
        pump();
      }, delay);
      return true;
    }

    function schedulePreviewRetry(job) {
      var target = job && job.target;
      var delay;
      if (!current(job) || !target || !attached(job) ||
          target.__plexProgressiveSource !== job.source ||
          job.previewRetryCount >= fullRetryLimit || !clock.setTimeout) {
        return false;
      }
      job.previewRetryCount += 1;
      delay = retryDelay(job.previewRetryCount);
      job.phase = 'retry-preview';
      job.retryTimer = clock.setTimeout(function () {
        job.retryTimer = null;
        if (!current(job) || !attached(job) || target.__plexProgressiveSource !== job.source) {
          finishRetryJob(job);
          return;
        }
        job.phase = 'queued-preview';
        insertQueuedJob(previewQueue, job);
        pump();
      }, delay);
      return true;
    }

    function previewUrl(job) {
      return job.previewUrl;
    }

    function pumpFull() {
      var job;
      if (fullLoadsDeferred) { return; }
      while (activeFull < activeFullLimit() && fullQueue.length) {
        job = takeQueuedJob(fullQueue, 'full');
        if (!job) { break; }
        startFull(job);
      }
    }

    function foregroundBusy() {
      return activePreview > 0 || activeFull > 0 || previewQueue.length > 0 || fullQueue.length > 0 || fullLoadsDeferred;
    }

    function notifyPrefetch(job, success) {
      var callback = job && job.callback;
      if (job) { job.callback = null; }
      if (callback) {
        try { callback(success === true); }
        catch (callbackError) {}
      }
    }

    function finishPrefetch(job, success) {
      var image;
      if (!job || job.finished) { return; }
      job.finished = true;
      image = job.image;
      job.image = null;
      if (image) { image.onload = null; image.onerror = null; }
      if (activePrefetch === job) { activePrefetch = null; }
      if (success && !destroyed) { rememberFullUrl(job.url); }
      notifyPrefetch(job, success && !destroyed);
      pump();
    }

    function cancelPrefetch() {
      var pending = pendingPrefetch;
      var active = activePrefetch;
      pendingPrefetch = null;
      if (pending) { notifyPrefetch(pending, false); }
      if (!active) { return; }
      if (active.image) {
        active.image.onload = null;
        active.image.onerror = null;
        try { active.image.src = ''; }
        catch (abortError) {}
      }
      finishPrefetch(active, false);
    }

    function pumpPrefetch() {
      var job;
      var image;
      if (destroyed || activePrefetch || !pendingPrefetch || foregroundBusy()) { return; }
      job = pendingPrefetch;
      pendingPrefetch = null;
      if (knownFullUrls[job.url]) {
        notifyPrefetch(job, true);
        return;
      }
      image = new ImageConstructor();
      job.image = image;
      activePrefetch = job;
      image.onload = function () { finishPrefetch(job, true); };
      image.onerror = function () { finishPrefetch(job, false); };
      try { image.src = job.url; }
      catch (error) { finishPrefetch(job, false); }
    }

    function foregroundArtworkBusy() {
      var index;
      if (activePreview || activeFull || fullLoadsDeferred) { return true; }
      for (index = 0; index < fullQueue.length; index += 1) {
        if (current(fullQueue[index]) && allowedByHomePressure(fullQueue[index], 'full')) { return true; }
      }
      for (index = 0; index < jobs.length; index += 1) {
        if (!jobs[index].preemptible && jobs[index].priority <= 2 &&
            (jobs[index].phase === 'retry-preview' || jobs[index].phase === 'retry-full')) { return true; }
      }
      return false;
    }

    function pumpPreview() {
      var job;
      while (previewQueue.length) {
        job = takeQueuedJob(previewQueue, 'preview');
        if (!job) { break; }
        if (job.preemptible && foregroundArtworkBusy()) {
          insertQueuedJob(previewQueue, job);
          break;
        }
        if (activePreview >= activePreviewLimit() && !preemptBackgroundPreview(job)) {
          insertQueuedJob(previewQueue, job);
          break;
        }
        startPreview(job);
      }
    }

    function canPreemptPreview(job, foregroundJob) {
      return !!job && job.preemptible === true && job.priority > foregroundJob.priority;
    }

    function preemptBackgroundPreview(foregroundJob) {
      var index;
      var candidate = null;
      var target;
      var specification;
      var callbacks;
      var callbackIndex;
      var replacement;
      var wasPaused;
      var specificationSource;
      var key;
      for (index = 0; index < jobs.length; index += 1) {
        if (jobs[index].phase !== 'loading-preview' || !canPreemptPreview(jobs[index], foregroundJob)) { continue; }
        if (!candidate || jobs[index].priority > candidate.priority) { candidate = jobs[index]; }
      }
      if (!candidate) { return false; }
      target = candidate.target;
      specificationSource = target.__plexProgressiveSpecification || {};
      specification = {};
      for (key in specificationSource) {
        if (Object.prototype.hasOwnProperty.call(specificationSource, key)) {
          specification[key] = specificationSource[key];
        }
      }
      specification.priority = candidate.priority;
      specification.scope = candidate.scope;
      specification.previewOnly = candidate.previewOnly;
      if (candidate.onPreview) { specification.onPreview = candidate.onPreview; }
      callbacks = candidate.previewSettledCallbacks.slice();
      candidate.previewSettledCallbacks = [];
      wasPaused = pumpPaused;
      pumpPaused = true;
      try {
        cancelJob(candidate);
        try { replacement = load(target, specification); }
        catch (_reloadError) { replacement = null; }
        if (replacement) {
          for (callbackIndex = 0; callbackIndex < callbacks.length; callbackIndex += 1) {
            addPreviewSettledCallback(replacement, callbacks[callbackIndex]);
          }
        } else {
          for (callbackIndex = 0; callbackIndex < callbacks.length; callbackIndex += 1) {
            callPreviewSettled(callbacks[callbackIndex], false, target);
          }
        }
      } finally {
        pumpPaused = wasPaused;
      }
      return true;
    }

    function pump() {
      if (pumpPaused || destroyed) { return; }
      pumpPreview();
      pumpFull();
      pumpPrefetch();
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
          } else {
            target.__plexProgressiveState = '';
            target.__plexProgressivePreviewUrl = '';
            removeClass(target, 'is-loaded');
            removeClass(target, 'is-preview');
            removeClass(target, 'is-full');
            if (target.removeAttribute) { target.removeAttribute('src'); }
            else { target.src = ''; }
            if (schedulePreviewRetry(job)) {
              pump();
              return;
            }
          }
          settlePreview(job, success);
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
        var scheduledRetry;
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
        scheduledRetry = !success && scheduleFullRetry(job);
        if (scheduledRetry) {
          pump();
          return;
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
      clearRetryTimer(job);
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
      else { settlePreview(job, false); removeJob(job); }
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
      var fullRequestSize;
      var previewRequestSize;
      var requestedPriority;
      var requestedPreviewOnly;
      var previous;
      var previousSpecification;
      var contextChanged;
      var job;
      var storedSpecification;
      requestedPreviewOnly = spec.previewOnly === true;
      if (destroyed || !target || !ImageConstructor || !settings.urlFor) {
        callPreviewSettled(spec.onPreviewSettled, false, target);
        return null;
      }
      previous = target.__plexProgressiveJob;
      previousSpecification = target.__plexProgressiveSpecification;
      contextChanged = target.__plexProgressiveSource === source && previousSpecification &&
        specificationIdentity(previousSpecification) !== specificationIdentity(spec);
      if (!source) {
        cancelJob(previous);
        clearTarget(target);
        callPreviewSettled(spec.onPreviewSettled, false, target);
        return null;
      }
      fullRequestSize = requestSize(width, height);
      previewRequestSize = requestSize(previewWidth, previewHeight);
      requestedFullUrl = settings.urlFor(source, fullRequestSize.width, fullRequestSize.height, String(spec.scope || 'default'), spec);
      requestedPreviewUrl = settings.urlFor(source, previewRequestSize.width, previewRequestSize.height, String(spec.scope || 'default'), spec);
      storedSpecification = {
        source: source,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        width: width,
        height: height,
        priority: Math.max(0, Number(spec.priority || 0)),
        scope: String(spec.scope || 'default'),
        previewOnly: requestedPreviewOnly,
        sourceContext: spec.sourceContext || null,
        sourceOwnerMachineIdentifier: String(spec.sourceOwnerMachineIdentifier || ''),
        sourceIdentity: specificationIdentity(spec),
        knownAssignmentRetries: Math.max(0, Number(spec.knownAssignmentRetries || 0)),
        preemptible: spec.preemptible === true
      };
      target.__plexProgressiveSpecification = storedSpecification;
      if (!requestedFullUrl || !requestedPreviewUrl) {
        cancelPrefetch();
        cancelJob(previous);
        if (target.__plexProgressiveSource !== source || contextChanged) {
          clearTarget(target);
        } else if (target.__plexProgressiveState === 'full') {
          target.__plexProgressiveState = 'preview';
        } else if (target.__plexProgressiveState === 'loading-preview') {
          target.__plexProgressiveState = '';
          target.__plexProgressivePreviewUrl = '';
        }
        target.__plexProgressiveSpecification = storedSpecification;
        target.__plexProgressiveSource = source;
        callPreviewSettled(spec.onPreviewSettled, false, target);
        return null;
      }
      if (target.__plexProgressiveSource === source && target.__plexProgressiveState === 'full' && target.__plexProgressiveFullUrl === requestedFullUrl) {
        callPreviewSettled(spec.onPreviewSettled, true, target);
        return previous || null;
      }
      if (requestedPreviewOnly && target.__plexProgressiveSource === source &&
          (target.__plexProgressiveState === 'full' ||
           target.__plexProgressiveState === 'preview' && target.__plexProgressivePreviewUrl === requestedPreviewUrl)) {
        callPreviewSettled(spec.onPreviewSettled, true, target);
        return previous || null;
      }
      if (target.__plexProgressiveSource === source && previous && !previous.cancelled && previous.phase !== 'done' && fullUrl(previous) === requestedFullUrl) {
        addPreviewSettledCallback(previous, spec.onPreviewSettled);
        requestedPriority = Math.max(0, Number(spec.priority || 0));
        if (!requestedPreviewOnly) { previous.previewOnly = false; }
        previous.scope = String(spec.scope || 'default');
        previous.preemptible = spec.preemptible === true;
        if (requestedPriority < previous.priority) {
          previous.priority = requestedPriority;
          reorderQueuedJob(previous);
          pump();
        }
        return previous;
      }
      cancelPrefetch();
      cancelJob(previous);
      if (target.__plexProgressiveSource !== source || contextChanged) {
        clearTarget(target);
        target.__plexProgressiveSpecification = storedSpecification;
      }
      if (knownFullUrls[requestedFullUrl]) {
        target.__plexProgressiveJob = null;
        target.__plexProgressiveSource = source;
        target.__plexProgressiveFullUrl = requestedFullUrl;
        target.__plexProgressiveState = 'full';
        watchKnownAssignment(target, source, 'full', requestedFullUrl, spec.onPreview);
        target.src = requestedFullUrl;
        addClass(target, 'is-loaded');
        addClass(target, 'is-full');
        removeClass(target, 'is-preview');
        if (typeof spec.onPreview === 'function') {
          try { spec.onPreview(target); }
          catch (knownFullCallbackError) {}
        }
        callPreviewSettled(spec.onPreviewSettled, true, target);
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
        previewSettledCallbacks: [],
        previewSettled: false,
        previewSucceeded: false,
        sequence: sequence += 1,
        phase: 'queued-preview',
        cancelled: false,
        previewOnly: requestedPreviewOnly,
        preemptible: spec.preemptible === true,
        retryCount: 0,
        previewRetryCount: 0,
        retryTimer: null
      };
      addPreviewSettledCallback(job, spec.onPreviewSettled);
      target.__plexProgressiveJob = job;
      target.__plexProgressiveSource = source;
      jobs.push(job);
      if (target.__plexProgressiveState === 'preview' || target.__plexProgressiveState === 'full') {
        settlePreview(job, true);
        if (job.previewOnly) {
          job.phase = 'done';
          removeJob(job);
          releaseJob(job);
          pump();
        } else { queueFull(job); }
      } else if (knownPreviewUrls[previewUrl(job)]) {
        target.__plexProgressiveState = 'preview';
        target.__plexProgressivePreviewUrl = previewUrl(job);
        watchKnownAssignment(target, source, 'preview', previewUrl(job), job.onPreview);
        target.src = previewUrl(job);
        addClass(target, 'is-loaded');
        addClass(target, 'is-preview');
        removeClass(target, 'is-full');
        if (job.onPreview) {
          try { job.onPreview(target); }
          catch (previewCallbackError) {}
        }
        settlePreview(job, true);
        if (job.previewOnly) {
          job.phase = 'done';
          removeJob(job);
          releaseJob(job);
          pump();
        } else { queueFull(job); }
      } else { insertQueuedJob(previewQueue, job); pump(); }
      return job;
    }

    function prefetch(specification, callback) {
      var spec = specification || {};
      var source = String(spec.source || '');
      var width = Math.max(1, Number(spec.width || 1));
      var height = Math.max(1, Number(spec.height || 1));
      var scope = String(spec.scope || 'backdrop');
      var url;
      if (destroyed || !source || !ImageConstructor || !settings.urlFor) {
        if (callback) { callback(false); }
        return false;
      }
      url = settings.urlFor(source, width, height, scope, spec);
      cancelPrefetch();
      if (!url) {
        if (callback) { callback(false); }
        return false;
      }
      if (knownFullUrls[url]) {
        if (callback) { callback(true); }
        return true;
      }
      pendingPrefetch = { url: url, callback: typeof callback === 'function' ? callback : null, image: null, finished: false };
      pumpPrefetch();
      return true;
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
      if (!specification || target.__plexProgressiveState === 'full') { return; }
      load(target, {
        source: specification.source,
        previewWidth: specification.previewWidth,
        previewHeight: specification.previewHeight,
        width: specification.width,
        height: specification.height,
        priority: nextPriority,
        scope: specification.scope,
        previewOnly: false,
        sourceContext: specification.sourceContext || null,
        sourceOwnerMachineIdentifier: String(specification.sourceOwnerMachineIdentifier || ''),
        sourceIdentity: specification.sourceIdentity,
        preemptible: specification.preemptible === true
      });
    }

    function prioritizePreview(target, priority, callback) {
      var job = target && target.__plexProgressiveJob;
      var specification = target && target.__plexProgressiveSpecification;
      var nextPriority = Math.max(0, Number(priority === undefined ? 0 : priority));
      if (!target) { callPreviewSettled(callback, false, target); return false; }
      if (target.__plexProgressiveState === 'full' || target.__plexProgressiveState === 'preview') {
        callPreviewSettled(callback, true, target);
        return true;
      }
      if (specification && nextPriority < specification.priority) { specification.priority = nextPriority; }
      if (current(job)) {
        addPreviewSettledCallback(job, callback);
        if (nextPriority < job.priority) {
          job.priority = nextPriority;
          reorderQueuedJob(job);
        }
        pump();
        return true;
      }
      if (!specification) { callPreviewSettled(callback, false, target); return false; }
      load(target, {
        source: specification.source,
        previewWidth: specification.previewWidth,
        previewHeight: specification.previewHeight,
        width: specification.width,
        height: specification.height,
        priority: nextPriority,
        scope: specification.scope,
        previewOnly: specification.previewOnly === true,
        sourceContext: specification.sourceContext || null,
        sourceOwnerMachineIdentifier: String(specification.sourceOwnerMachineIdentifier || ''),
        sourceIdentity: specification.sourceIdentity,
        preemptible: specification.preemptible === true,
        onPreviewSettled: callback
      });
      return true;
    }

    function deferFullLoads(delay) {
      var timeout = Math.max(0, Number(delay || 0));
      if (destroyed || !timeout || !clock.setTimeout || !clock.clearTimeout) { return false; }
      fullLoadsDeferred = true;
      if (fullDeferTimer !== null) { clock.clearTimeout(fullDeferTimer); }
      fullDeferTimer = clock.setTimeout(function () {
        fullDeferTimer = null;
        fullLoadsDeferred = false;
        pump();
      }, timeout);
      return true;
    }

    function setHomePressure(active) {
      var next = active === true;
      if (destroyed || homePressure === next) { return homePressure; }
      homePressure = next;
      pump();
      return homePressure;
    }

    function needsLoad(target, previewOnly) {
      var job = target && target.__plexProgressiveJob;
      var state = String(target && target.__plexProgressiveState || '');
      if (current(job)) { return false; }
      if (state === 'full') { return false; }
      if (previewOnly === true && state === 'preview') { return false; }
      return true;
    }

    function cancel(target) {
      cancelJob(target && target.__plexProgressiveJob);
    }

    function loadBatch(entries, onPreviewSettled) {
      var batch;
      var index;
      var wasPaused;
      var pending = 0;
      var completed = false;
      function settleOne() {
        pending = Math.max(0, pending - 1);
        if (!completed && pending === 0) {
          completed = true;
          callPreviewSettled(onPreviewSettled, true, null);
        }
      }
      if (destroyed) { return; }
      batch = Object.prototype.toString.call(entries) === '[object Array]' ? entries.slice() : [];
      batch.sort(function (left, right) {
        return Number(left && left.specification && left.specification.priority || 0) - Number(right && right.specification && right.specification.priority || 0);
      });
      for (index = 0; index < batch.length; index += 1) {
        if (batch[index]) { pending += 1; }
      }
      wasPaused = pumpPaused;
      pumpPaused = true;
      try {
        for (index = 0; index < batch.length; index += 1) {
          if (batch[index]) {
            batch[index].specification = batch[index].specification || {};
            batch[index].specification.onPreviewSettled = settleOne;
            load(batch[index].target, batch[index].specification);
          }
        }
      } finally {
        pumpPaused = wasPaused;
      }
      if (!pending && !completed) {
        completed = true;
        callPreviewSettled(onPreviewSettled, true, null);
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
      cancelPrefetch();
      cancelMatching(function () { return true; });
      previewQueue = [];
      fullQueue = [];
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      if (fullDeferTimer !== null && clock.clearTimeout) { clock.clearTimeout(fullDeferTimer); }
      fullDeferTimer = null;
      fullLoadsDeferred = false;
      homePressure = false;
      cancelAll();
      knownPreviewUrls = {};
      knownPreviewUrlOrder = [];
      knownFullUrls = {};
      knownFullUrlOrder = [];
      pendingPrefetch = null;
      activePrefetch = null;
    }

    return {
      cancel: cancel,
      cancelAll: cancelAll,
      cancelPrefetch: cancelPrefetch,
      cancelScope: cancelScope,
      deferFullLoads: deferFullLoads,
      destroy: destroy,
      load: load,
      loadBatch: loadBatch,
      needsLoad: needsLoad,
      prefetch: prefetch,
      prioritize: prioritize,
      prioritizePreview: prioritizePreview,
      setHomePressure: setHomePressure
    };
  }

  return {
    create: create,
    previewSize: previewSize,
    qualityForScope: qualityForScope,
    qualitySize: qualitySize,
    renderedSize: renderedSize,
    supportedArtworkQuality: supportedArtworkQuality,
    supportedBackdropQuality: supportedBackdropQuality
  };
}));
