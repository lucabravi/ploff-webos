(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffProgressiveImages = factory();
  }
}(this, function () {
  'use strict';

  function addClass(target, name) {
    var pattern = new RegExp('(^|\\s)' + name + '(?=\\s|$)');
    if (!pattern.test(target.className)) { target.className += ' ' + name; }
  }

  function removeClass(target, name) {
    target.className = target.className.replace(new RegExp('(^|\\s)' + name + '(?=\\s|$)', 'g'), ' ').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
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

    function current(job) {
      return !!job && !job.cancelled && job.target.__plexProgressiveJob === job;
    }

    function attached(job) {
      return !settings.isAttached || settings.isAttached(job.target);
    }

    function compare(left, right) {
      if (left.priority !== right.priority) { return left.priority - right.priority; }
      return left.sequence - right.sequence;
    }

    function sortQueues() {
      previewQueue.sort(compare);
      fullQueue.sort(compare);
    }

    function removeJob(job) {
      var index = jobs.indexOf(job);
      if (index !== -1) { jobs.splice(index, 1); }
    }

    function clearTarget(target) {
      removeClass(target, 'is-loaded');
      removeClass(target, 'is-preview');
      removeClass(target, 'is-full');
      target.__plexProgressiveJob = null;
      target.__plexProgressiveSource = '';
      target.__plexProgressiveState = '';
      target.__plexProgressiveFullUrl = '';
      if (target.removeAttribute) { target.removeAttribute('src'); }
      else { target.src = ''; }
    }

    function fullUrl(job) {
      return settings.urlFor(job.source, job.width, job.height);
    }

    function previewUrl(job) {
      return settings.urlFor(job.source, job.previewWidth, job.previewHeight);
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
      sortQueues();
      pumpPreview();
      pumpFull();
    }

    function queueFull(job) {
      if (!current(job)) { removeJob(job); return; }
      job.phase = 'queued-full';
      fullQueue.push(job);
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
            target.__plexProgressiveState = 'preview';
            addClass(target, 'is-loaded');
            addClass(target, 'is-preview');
            removeClass(target, 'is-full');
            if (job.onPreview) {
              try { job.onPreview(target); }
              catch (callbackError) {}
            }
          }
          queueFull(job);
        } else {
          removeJob(job);
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
          job.target.src = url;
          job.target.__plexProgressiveFullUrl = url;
          job.target.__plexProgressiveState = 'full';
          addClass(job.target, 'is-loaded');
          addClass(job.target, 'is-full');
          removeClass(job.target, 'is-preview');
        }
        job.phase = 'done';
        removeJob(job);
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
      if (!job || job.cancelled) { return; }
      job.cancelled = true;
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
    }

    function load(target, specification) {
      var spec = specification || {};
      var source = String(spec.source || '');
      var previewWidth = Math.max(1, Number(spec.previewWidth || 64));
      var previewHeight = Math.max(1, Number(spec.previewHeight || 96));
      var width = Math.max(1, Number(spec.width || 154));
      var height = Math.max(1, Number(spec.height || 224));
      var requestedFullUrl;
      var previous;
      var job;
      if (!target || !ImageConstructor || !settings.urlFor) { return null; }
      previous = target.__plexProgressiveJob;
      if (!source) {
        cancelJob(previous);
        clearTarget(target);
        return null;
      }
      requestedFullUrl = settings.urlFor(source, width, height);
      if (target.__plexProgressiveSource === source && target.__plexProgressiveState === 'full' && target.__plexProgressiveFullUrl === requestedFullUrl) {
        return previous || null;
      }
      if (target.__plexProgressiveSource === source && previous && !previous.cancelled && previous.phase !== 'done' && fullUrl(previous) === requestedFullUrl) {
        previous.priority = Math.min(previous.priority, Math.max(0, Number(spec.priority || 0)));
        sortQueues();
        pump();
        return previous;
      }
      cancelJob(previous);
      if (target.__plexProgressiveSource !== source) {
        clearTarget(target);
      }
      job = {
        target: target,
        source: source,
        previewWidth: previewWidth,
        previewHeight: previewHeight,
        width: width,
        height: height,
        priority: Math.max(0, Number(spec.priority || 0)),
        scope: String(spec.scope || 'default'),
        onPreview: typeof spec.onPreview === 'function' ? spec.onPreview : null,
        sequence: sequence += 1,
        phase: 'queued-preview',
        cancelled: false
      };
      target.__plexProgressiveJob = job;
      target.__plexProgressiveSource = source;
      jobs.push(job);
      if (target.__plexProgressiveState === 'preview' || target.__plexProgressiveState === 'full') { queueFull(job); }
      else { previewQueue.push(job); pump(); }
      return job;
    }

    function prioritize(target) {
      var job = target && target.__plexProgressiveJob;
      if (!current(job)) { return; }
      job.priority = 0;
      sortQueues();
      pump();
    }

    function loadBatch(entries) {
      var batch = Object.prototype.toString.call(entries) === '[object Array]' ? entries.slice() : [];
      batch.sort(function (left, right) {
        return Number(left && left.specification && left.specification.priority || 0) - Number(right && right.specification && right.specification.priority || 0);
      });
      batch.forEach(function (entry) {
        if (entry) { load(entry.target, entry.specification); }
      });
    }

    function cancelScope(scope) {
      jobs.slice().forEach(function (job) {
        if (job.scope === scope) { cancelJob(job); }
      });
      pump();
    }

    return {
      cancelScope: cancelScope,
      load: load,
      loadBatch: loadBatch,
      prioritize: prioritize
    };
  }

  return { create: create, previewSize: previewSize };
}));
