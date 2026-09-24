'use strict';

var assert = require('assert');
var ProgressiveImages = require('../app/progressive-images');

assert.deepStrictEqual(ProgressiveImages.previewSize(248, 370, 96), { width: 64, height: 96 }, 'portrait previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(338, 190, 96), { width: 96, height: 54 }, 'landscape previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(310, 124, 128), { width: 128, height: 51 }, 'episode previews must scale to the exact rendered aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(300, 132, 96), { width: 96, height: 42 }, 'chapter previews must scale to the exact rendered aspect ratio');
assert.deepStrictEqual(ProgressiveImages.renderedSize({ getBoundingClientRect: function () { return { width: 248.9, height: 370.8 }; } }, 100, 100), { width: 248, height: 370 }, 'full image requests must never exceed fractional rendered CSS dimensions');
assert.deepStrictEqual(ProgressiveImages.renderedSize({ clientWidth: 164.9, clientHeight: 104.4 }, 100, 100), { width: 164, height: 104 }, 'client-size fallback must also round down to the visible image box');
assert.strictEqual(ProgressiveImages.supportedArtworkQuality(70), 70, 'artwork quality must preserve the approved minimum step');
assert.strictEqual(ProgressiveImages.supportedBackdropQuality(100), 100, 'backdrop quality must preserve the approved maximum step');
assert.strictEqual(ProgressiveImages.supportedArtworkQuality(90), 90, 'supported artwork quality must be preserved');
assert.strictEqual(ProgressiveImages.supportedArtworkQuality(50), 70, 'artwork quality below the new range must clamp to the nearest supported step');
assert.strictEqual(ProgressiveImages.supportedBackdropQuality(50), 50, 'supported backdrop quality must preserve the minimum step');
assert.deepStrictEqual(ProgressiveImages.qualitySize(248, 370, 85), { width: 211, height: 315 }, 'quality must scale Plex request dimensions without changing rendered geometry');
assert.deepStrictEqual(ProgressiveImages.qualitySize(1920, 1080, 50), { width: 960, height: 540 }, 'backdrop request dimensions must support the lowest quality step');
assert.strictEqual(ProgressiveImages.qualityForScope({ artworkQuality: 80, backdropQuality: 100 }, 'library'), 80, 'normal artwork scopes must use artwork quality');
assert.strictEqual(ProgressiveImages.qualityForScope({ artworkQuality: 80, backdropQuality: 100 }, 'backdrop'), 100, 'the global backdrop must use backdrop quality');
assert.strictEqual(ProgressiveImages.qualityForScope({ artworkQuality: 80, backdropQuality: 70 }, 'up-next-backdrop'), 70, 'derived backdrop scopes must use backdrop quality');

function imageTarget(name) {
  var value = '';
  var target = { name: name, className: 'poster-image', starts: [] };
  Object.defineProperty(target, 'src', {
    get: function () { return value; },
    set: function (next) { value = next; target.starts.push(next); }
  });
  target.removeAttribute = function (attribute) {
    if (attribute === 'src') { value = ''; }
  };
  return target;
}

function harness(options) {
  var preloads = [];
  function FakeImage() {
    var value = '';
    var image = this;
    image.starts = [];
    Object.defineProperty(image, 'src', {
      get: function () { return value; },
      set: function (next) { value = next; image.starts.push(next); }
    });
    preloads.push(image);
  }
  return {
    preloads: preloads,
    loader: ProgressiveImages.create({
      Image: FakeImage,
      clock: options && options.clock,
      previewConcurrency: options && options.previewConcurrency || 4,
      fullConcurrency: options && options.fullConcurrency || 2,
      isAttached: function (target) { return target.attached !== false; },
      urlFor: options && options.urlFor || function (source, width, height) { return source + '@' + width + 'x' + height; },
      sourceContextIdentity: options && options.sourceContextIdentity
    })
  };
}

function fakeClock() {
  var nextId = 1;
  var timers = {};
  return {
    setTimeout: function (callback, delay) {
      var id = nextId;
      nextId += 1;
      timers[id] = { callback: callback, delay: delay };
      return id;
    },
    clearTimeout: function (id) { delete timers[id]; },
    pending: function () { return Object.keys(timers).map(function (id) { return { id: Number(id), delay: timers[id].delay }; }); },
    run: function (id) {
      var timer = timers[id];
      if (!timer) { return false; }
      delete timers[id];
      timer.callback();
      return true;
    }
  };
}

function load(loader, target, source, priority, scope) {
  loader.load(target, {
    source: source,
    previewWidth: 64,
    previewHeight: 96,
    width: 154,
    height: 224,
    priority: priority,
    scope: scope || 'home'
  });
}

var progressive = harness();
var poster = imageTarget('poster');
var previewNotified = 0;
progressive.loader.load(poster, {
  source: 'one', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 1, scope: 'home',
  onPreview: function (target) { previewNotified += target === poster ? 1 : 0; }
});
assert.strictEqual(poster.src, 'one@64x96', 'the preview must become visible before full artwork starts');
poster.onload();
assert.ok(/is-loaded/.test(poster.className) && /is-preview/.test(poster.className), 'a loaded preview must be visibly marked');
assert.strictEqual(previewNotified, 1, 'consumers must be notified when a progressive preview becomes visible');
assert.strictEqual(progressive.preloads.length, 1, 'full artwork must preload asynchronously after the preview');
assert.strictEqual(progressive.preloads[0].src, 'one@154x224', 'the full request must use rendered poster dimensions');
assert.strictEqual(poster.src, 'one@64x96', 'the visible preview must remain until full artwork is complete');
progressive.preloads[0].onload();
assert.strictEqual(poster.src, 'one@154x224', 'completed full artwork must replace the preview');
assert.ok(/is-full/.test(poster.className) && !/is-preview/.test(poster.className), 'the final image must leave preview state');
assert.strictEqual(poster.__plexProgressiveJob, null, 'completed artwork must release its job and callback graph from the live card');
var recreatedPoster = imageTarget('recreated-poster');
load(progressive.loader, recreatedPoster, 'one', 1);
assert.strictEqual(recreatedPoster.src, 'one@154x224', 'recreated cards must reuse a known full image URL without flashing a preview');
assert.ok(/is-full/.test(recreatedPoster.className) && !/is-preview/.test(recreatedPoster.className), 'reused artwork must immediately enter full-image state');
assert.strictEqual(progressive.preloads.length, 1, 'reusing known artwork must not create another preload job');
var cachedBackdrop = imageTarget('cached-backdrop');
var cachedBackdropActivated = 0;
progressive.loader.load(cachedBackdrop, {
  source: 'one', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'backdrop',
  onPreview: function (target) { cachedBackdropActivated += target === cachedBackdrop ? 1 : 0; }
});
assert.strictEqual(cachedBackdropActivated, 1, 'a cached full backdrop must still notify its consumer so the new layer can become active');
var recreatedPreview = imageTarget('recreated-preview');
progressive.loader.load(recreatedPreview, {
  source: 'one', previewWidth: 64, previewHeight: 96, width: 220, height: 310, priority: 1, scope: 'library'
});
assert.strictEqual(recreatedPreview.src, 'one@64x96', 'a known SD preview must become available synchronously for a newly sized image');
assert.ok(/is-preview/.test(recreatedPreview.className), 'synchronously reused SD artwork must enter preview state without a blank frame');

(function knownFullReuseFailureBecomesRetryableAfterRouteRotation() {
  var route = 'route-a';
  var routed = harness({
    urlFor: function (source, width, height) { return route + ':' + source + '@' + width + 'x' + height; }
  });
  var first = imageTarget('known-full-first');
  load(routed.loader, first, 'known-full-route', 0);
  first.onload();
  routed.preloads[0].onload();
  var reused = imageTarget('known-full-reused');
  load(routed.loader, reused, 'known-full-route', 0);
  assert.strictEqual(reused.src, 'route-a:known-full-route@154x224', 'a known full URL must still be reused without a preview flash');
  assert.strictEqual(typeof reused.onerror, 'function', 'known full reuse must observe a browser/cache failure instead of assuming the URL can never fail again');
  route = 'route-b';
  reused.onerror();
  assert.strictEqual(reused.src, 'route-b:known-full-route@64x96', 'a failed cached full assignment must immediately retry through the currently selected PMS route');
  assert.strictEqual(routed.loader.needsLoad(reused, false), false, 'the bounded retry must become active instead of leaving a visible card idle');
}());

(function knownPreviewReuseFailureBecomesRetryable() {
  var routed = harness();
  var first = imageTarget('known-preview-first');
  routed.loader.load(first, {
    source: 'known-preview-route', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'home', previewOnly: true
  });
  first.onload();
  var reused = imageTarget('known-preview-reused');
  routed.loader.load(reused, {
    source: 'known-preview-route', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'home', previewOnly: true
  });
  assert.strictEqual(reused.src, 'known-preview-route@64x96', 'a known preview URL must still be reused immediately');
  assert.strictEqual(typeof reused.onerror, 'function', 'known preview reuse must observe cache/network failure');
  reused.onerror();
  assert.strictEqual(routed.loader.needsLoad(reused, true), false, 'a failed known-preview assignment must immediately enter its bounded retry');
  assert.deepStrictEqual(reused.starts, ['known-preview-route@64x96', 'known-preview-route@64x96'],
    'a failed cached preview must immediately issue one fresh preview request');
  reused.onerror();
  assert.strictEqual(reused.__plexProgressiveJob, null, 'a failed retry must settle instead of creating an unbounded retry loop');
  assert.strictEqual(reused.starts.length, 2, 'a cached-assignment failure may trigger at most one immediate retry');
}());

(function knownAssignmentFailureWaitsForDetachedCardToBeRenderedAgain() {
  var routed = harness();
  var first = imageTarget('known-detached-first');
  routed.loader.load(first, {
    source: 'known-detached-route', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library', previewOnly: true
  });
  first.onload();
  var detached = imageTarget('known-detached-reused');
  routed.loader.load(detached, {
    source: 'known-detached-route', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library', previewOnly: true
  });
  detached.attached = false;
  detached.onerror();
  assert.strictEqual(detached.starts.length, 1, 'a detached cached card must not start retry work before it is visible again');
  assert.strictEqual(routed.loader.needsLoad(detached, true), true, 'the detached card must remain eligible for normal loading when rendered again');
}());

(function activePrefetchJobTransfersToTheForegroundScope() {
  var scoped = harness();
  var target = imageTarget('promoted-prefetch');
  scoped.loader.load(target, {
    source: 'promoted', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 4, scope: 'library-tab-prefetch-catalog', previewOnly: true, preemptible: true
  });
  var job = target.__plexProgressiveJob;
  scoped.loader.load(target, {
    source: 'promoted', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 0, scope: 'library', previewOnly: false
  });
  assert.strictEqual(job.scope, 'library', 'reusing a warm-tab image job must transfer cancellation ownership to the active library');
  scoped.loader.cancelScope('library-tab-prefetch-catalog');
  assert.strictEqual(target.__plexProgressiveJob, job, 'cancelling the old prefetch scope must not cancel its promoted foreground job');
  scoped.loader.cancelScope('library');
  assert.strictEqual(target.__plexProgressiveJob, null, 'the current foreground scope must still own and cancel its image work');
}());

var duplicate = harness();
var duplicatePoster = imageTarget('duplicate');
load(duplicate.loader, duplicatePoster, 'same', 2);
load(duplicate.loader, duplicatePoster, 'same', 0);
assert.deepStrictEqual(duplicatePoster.starts, ['same@64x96'], 'rerendering the same active poster must not restart its preview request');

var resized = harness();
var resizedPoster = imageTarget('resized');
load(resized.loader, resizedPoster, 'resized', 1);
resizedPoster.onload();
resized.preloads[0].onload();
resized.loader.load(resizedPoster, {
  source: 'resized',
  previewWidth: 64,
  previewHeight: 96,
  width: 220,
  height: 310,
  priority: 1,
  scope: 'search'
});
assert.strictEqual(resized.preloads.length, 2, 'the same poster must request a new full image when its rendered dimensions change');
assert.strictEqual(resized.preloads[1].src, 'resized@220x310', 'the replacement full image must match the new rendered dimensions');
assert.strictEqual(resizedPoster.src, 'resized@154x224', 'the current full image must remain visible while its resized replacement loads');

(function artworkContextChangeMustReloadTheSamePath() {
  var contexts = [];
  var contextual = harness({ urlFor: function (source, width, height, _scope, specification) {
    var context = specification && specification.sourceContext || {};
    var identity = context.serverMachineIdentifier || 'primary';
    return source + '@' + identity + '-' + width + 'x' + height;
  }});
  var target = imageTarget('contextual');
  contextual.loader.load(target, {
    source: 'shared-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home',
    sourceContext: { serverMachineIdentifier: 'external' }
  });
  target.onload();
  contextual.preloads[0].onload();
  contexts.push(target.src);
  contextual.loader.load(target, {
    source: 'shared-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home',
    sourceContext: { serverMachineIdentifier: 'primary' }
  });
  target.onload();
  assert.strictEqual(contextual.preloads.length, 2, 'changing the artwork server must create a new full request even when the Plex path is identical');
  assert.strictEqual(contextual.preloads[1].src, 'shared-art@primary-154x224', 'the replacement request must use the new server context');
  contextual.preloads[1].onload();
  contexts.push(target.src);
  assert.deepStrictEqual(contexts, ['shared-art@external-154x224', 'shared-art@primary-154x224'], 'the target must end on the artwork belonging to the new server');
}());


(function progressiveArtworkIdentityUsesInjectedSourceIdentity() {
  var identities = [];
  var contextual = harness({
    sourceContextIdentity: function (context) {
      var identity = 'server:' + String(context && context.serverMachineIdentifier || '');
      identities.push(identity);
      return identity;
    },
    urlFor: function (source, width, height) { return source + '@' + width + 'x' + height; }
  });
  var target = imageTarget('identity-callback');
  contextual.loader.load(target, {
    source: 'same-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home',
    sourceContext: { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-one.example', token: 'one' }
  });
  contextual.loader.load(target, {
    source: 'same-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home',
    sourceContext: { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-two.example', token: 'two' }
  });
  assert.ok(identities.length > 0, 'progressive artwork comparisons must delegate source identity to the injected router callback');
  assert.strictEqual(identities[0], 'server:server-a');
}());

var fallback = harness();
var fallbackPoster = imageTarget('fallback');
load(fallback.loader, fallbackPoster, 'fallback', 1);
fallbackPoster.onload();
fallback.preloads[0].onerror();
assert.strictEqual(fallbackPoster.src, 'fallback@64x96', 'a failed full request must retain the usable preview');
assert.ok(/is-preview/.test(fallbackPoster.className), 'full-image failure must not hide the preview');

(function failedFullArtworkRetriesWithBoundedBackoff() {
  var clock = fakeClock();
  var retry = harness({ clock: clock, previewConcurrency: 1, fullConcurrency: 1 });
  var retryPoster = imageTarget('retry');
  var pending;
  load(retry.loader, retryPoster, 'retry', 0);
  retryPoster.onload();
  retry.preloads[0].onerror();
  assert.strictEqual(retryPoster.src, 'retry@64x96', 'a failed full request must keep the visible preview during retry backoff');
  assert.deepStrictEqual(clock.pending().map(function (timer) { return timer.delay; }), [250], 'the first full retry must be delayed instead of blocking the current frame');
  assert.strictEqual(retry.preloads.length, 1, 'a failed full request must not retry synchronously');
  pending = clock.pending()[0];
  clock.run(pending.id);
  assert.strictEqual(retry.preloads.length, 2, 'the first retry must start after its bounded delay');
  retry.preloads[1].onerror();
  assert.deepStrictEqual(clock.pending().map(function (timer) { return timer.delay; }), [750], 'the second retry must use a longer bounded backoff');
  pending = clock.pending()[0];
  clock.run(pending.id);
  assert.strictEqual(retry.preloads.length, 3, 'the second retry must still reuse the same live card');
  retry.preloads[2].onerror();
  assert.strictEqual(clock.pending().length, 0, 'full artwork retries must stop after the configured bounded attempts');
  assert.strictEqual(retryPoster.src, 'retry@64x96', 'exhausted retries must leave the usable preview visible');
  assert.ok(/is-preview/.test(retryPoster.className), 'exhausted retries must preserve preview state');
}());

(function cancellingAFailedFullArtworkStopsItsPendingRetry() {
  var clock = fakeClock();
  var cancelled = harness({ clock: clock, previewConcurrency: 1, fullConcurrency: 1 });
  var cancelledPoster = imageTarget('cancelled-retry');
  load(cancelled.loader, cancelledPoster, 'cancelled-retry', 0, 'library');
  cancelledPoster.onload();
  cancelled.preloads[0].onerror();
  assert.strictEqual(clock.pending().length, 1, 'a failed full request must expose one pending retry before cancellation');
  cancelled.loader.cancelScope('library');
  assert.strictEqual(clock.pending().length, 0, 'leaving a view must cancel its pending full-artwork retry');
  assert.strictEqual(cancelled.preloads.length, 1, 'a cancelled retry must not resurrect a stale card');
}());

(function failedPreviewRetriesWithBoundedBackoff() {
  var clock = fakeClock();
  var retry = harness({ clock: clock, previewConcurrency: 1, fullConcurrency: 1 });
  var retryPoster = imageTarget('retry-preview');
  retry.loader.load(retryPoster, {
    source: 'external-cover', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 1, scope: 'library', previewOnly: true,
    sourceContext: { serverMachineIdentifier: 'external-pms' },
    sourceIdentity: 'external-pms'
  });
  retryPoster.onerror();
  assert.strictEqual(retryPoster.src, '', 'a failed preview must not leave a broken-image glyph in the card');
  assert.deepStrictEqual(clock.pending().map(function (timer) { return timer.delay; }), [250], 'the first preview retry must use the bounded backoff');
  assert.strictEqual(retryPoster.__plexProgressiveJob.phase, 'retry-preview', 'the same live card job must own the delayed retry');
  clock.run(clock.pending()[0].id);
  assert.deepStrictEqual(retryPoster.starts, ['external-cover@64x96', 'external-cover@64x96'], 'the same SD artwork must retry in-place');
  retryPoster.onload();
  assert.strictEqual(retryPoster.__plexProgressiveState, 'preview', 'a successful retry must restore the visible preview state');
  assert.strictEqual(retry.preloads.length, 0, 'preview-only offscreen work must not start an HD request');
}());

(function failedPreviewRetryIsCancelledWhenCardLeavesItsView() {
  var clock = fakeClock();
  var retry = harness({ clock: clock, previewConcurrency: 1, fullConcurrency: 1 });
  var retryPoster = imageTarget('cancelled-preview-retry');
  retry.loader.load(retryPoster, {
    source: 'external-cover', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 1, scope: 'library', previewOnly: true
  });
  retryPoster.onerror();
  assert.strictEqual(clock.pending().length, 1, 'a failed preview must have one delayed retry while the card remains in its view');
  retry.loader.cancelScope('library');
  assert.strictEqual(clock.pending().length, 0, 'leaving the library must cancel its pending preview retry');
  assert.strictEqual(retryPoster.__plexProgressiveJob, null, 'cancelling the view must release the stale card job');
}());

var priority = harness({ previewConcurrency: 2, fullConcurrency: 1 });
var first = imageTarget('first');
var second = imageTarget('second');
var third = imageTarget('third');
var focused = imageTarget('focused');
load(priority.loader, first, 'first', 2);
load(priority.loader, second, 'second', 2);
load(priority.loader, third, 'third', 2);
load(priority.loader, focused, 'focused', 0);
assert.strictEqual(third.src, '', 'preview concurrency must keep excess work queued');
assert.strictEqual(focused.src, '', 'focused work may queue while active requests finish');
first.onload();
assert.strictEqual(focused.src, 'focused@64x96', 'focused previews must jump ahead of background work');
assert.strictEqual(third.src, '', 'background work must remain behind focused previews');


(function rapidNavigationDefersOnlyNewFullArtworkUntilIdle() {
  var clock = fakeClock();
  var deferred = harness({ previewConcurrency: 2, fullConcurrency: 1, clock: clock });
  var first = imageTarget('deferred-first');
  var second = imageTarget('deferred-second');
  assert.strictEqual(typeof deferred.loader.deferFullLoads, 'function', 'progressive loader must expose an idle deferral port for navigation hot paths');
  deferred.loader.deferFullLoads(120);
  load(deferred.loader, first, 'deferred-first', 1, 'library');
  assert.strictEqual(first.src, 'deferred-first@64x96', 'rapid navigation must never delay visible preview artwork');
  first.onload();
  assert.strictEqual(deferred.preloads.length, 0, 'full-resolution decode work must stay queued during rapid navigation');
  assert.deepStrictEqual(clock.pending().map(function (timer) { return timer.delay; }), [120], 'full artwork must resume after one bounded idle window');

  deferred.loader.deferFullLoads(120);
  assert.strictEqual(clock.pending().length, 1, 'repeated navigation must reset rather than accumulate idle timers');
  for (var repeat = 0; repeat < 200; repeat += 1) { deferred.loader.deferFullLoads(120); }
  assert.strictEqual(clock.pending().length, 1, 'key-repeat stress must retain exactly one full-artwork idle timer');
  load(deferred.loader, second, 'deferred-second', 0, 'library');
  second.onload();
  assert.strictEqual(deferred.preloads.length, 0, 'even focused full artwork stays deferred while key-repeat remains active');
  clock.run(clock.pending()[0].id);
  assert.strictEqual(deferred.preloads.length, 1, 'idle completion must resume queued full artwork');
  assert.strictEqual(deferred.preloads[0].src, 'deferred-second@154x224', 'idle resume must preserve priority and exact final dimensions');
  deferred.preloads[0].onload();
  assert.strictEqual(second.src, 'deferred-second@154x224', 'idle-deferred artwork must still reach the exact full-quality URL');
}());

(function rapidNavigationNeverCancelsAnAlreadyActiveFullLoad() {
  var clock = fakeClock();
  var deferred = harness({ previewConcurrency: 2, fullConcurrency: 1, clock: clock });
  var active = imageTarget('active-full');
  var queued = imageTarget('queued-full');
  load(deferred.loader, active, 'active-full', 1, 'library');
  active.onload();
  assert.strictEqual(deferred.preloads.length, 1, 'first full load starts before navigation is deferred');
  deferred.loader.deferFullLoads(120);
  load(deferred.loader, queued, 'queued-full', 0, 'library');
  queued.onload();
  deferred.preloads[0].onload();
  assert.strictEqual(active.src, 'active-full@154x224', 'an already active full-resolution job must finish normally during navigation');
  assert.strictEqual(deferred.preloads.length, 1, 'completing an active full job must not start another while navigation is active');
  clock.run(clock.pending()[0].id);
  assert.strictEqual(deferred.preloads.length, 2, 'queued full artwork must resume after the idle window');
  assert.strictEqual(deferred.preloads[1].src, 'queued-full@154x224', 'resumed work must retain exact full-resolution dimensions');
}());

(function recycledTargetDropsDeferredFullArtworkFromPreviousMedia() {
  var clock = fakeClock();
  var deferred = harness({ previewConcurrency: 2, fullConcurrency: 1, clock: clock });
  var recycled = imageTarget('recycled-deferred');
  deferred.loader.deferFullLoads(120);
  load(deferred.loader, recycled, 'old-media', 0, 'search');
  recycled.onload();
  assert.strictEqual(deferred.preloads.length, 0, 'the old media full image must remain queued during the navigation idle window');
  load(deferred.loader, recycled, 'new-media', 0, 'search');
  assert.strictEqual(recycled.src, 'new-media@64x96', 'recycling a card during deferral must immediately bind the new preview source');
  recycled.onload();
  clock.run(clock.pending()[0].id);
  assert.strictEqual(deferred.preloads.length, 1, 'idle resume must start only the current recycled-card full request');
  assert.strictEqual(deferred.preloads[0].src, 'new-media@154x224', 'deferred full artwork from the previous media must never resume on a recycled target');
}());

var batch = harness({ previewConcurrency: 2, fullConcurrency: 1 });
var batchBackground = imageTarget('batch-background');
var batchFocused = imageTarget('batch-focused');
var batchVisible = imageTarget('batch-visible');
batch.loader.loadBatch([
  { target: batchBackground, specification: { source: 'batch-background', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 2, scope: 'library' } },
  { target: batchFocused, specification: { source: 'batch-focused', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'library' } },
  { target: batchVisible, specification: { source: 'batch-visible', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 1, scope: 'library' } }
]);
assert.strictEqual(batchFocused.src, 'batch-focused@64x96', 'batch loading must reserve the first preview slot for focus');
assert.strictEqual(batchVisible.src, 'batch-visible@64x96', 'batch loading must fill remaining slots with visible artwork');
assert.strictEqual(batchBackground.src, '', 'batch loading must leave buffered artwork queued');

(function batchPreviewCompletionDoesNotWaitForFullResolutionArtwork() {
  var previewBatch = harness({ previewConcurrency: 3, fullConcurrency: 1 });
  var first = imageTarget('preview-batch-first');
  var second = imageTarget('preview-batch-second');
  var third = imageTarget('preview-batch-third');
  var settled = 0;
  previewBatch.loader.loadBatch([
    { target: first, specification: { source: 'preview-batch-first', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home' } },
    { target: second, specification: { source: 'preview-batch-second', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home' } },
    { target: third, specification: { source: 'preview-batch-third', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home' } }
  ], function () { settled += 1; });
  first.onload();
  second.onload();
  assert.strictEqual(settled, 0, 'Home SD batch must remain pending until every preview has settled');
  third.onload();
  assert.strictEqual(settled, 1, 'Home SD batch must settle as soon as the final preview completes');
  assert.strictEqual(previewBatch.preloads.length, 1, 'full-resolution artwork must remain independently in flight when the SD batch settles');
}());

(function batchPreviewCompletionWaitsForSynchronousCachedEntriesAndPendingEntries() {
  var previewBatch = harness({ previewConcurrency: 2, fullConcurrency: 1 });
  var cached = imageTarget('preview-batch-cached');
  var pending = imageTarget('preview-batch-pending');
  var settled = 0;
  cached.__plexProgressiveSource = 'preview-batch-cached';
  cached.__plexProgressiveState = 'preview';
  cached.__plexProgressivePreviewUrl = 'preview-batch-cached@64x96';
  previewBatch.loader.loadBatch([
    { target: cached, specification: { source: 'preview-batch-cached', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home', previewOnly: true } },
    { target: pending, specification: { source: 'preview-batch-pending', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home' } }
  ], function () { settled += 1; });
  assert.strictEqual(settled, 0, 'a synchronously cached SD preview must not settle the whole batch before later entries are registered');
  pending.onload();
  assert.strictEqual(settled, 1, 'the SD batch must settle once both cached and asynchronous preview entries are complete');
}());

var fullPriority = harness({ previewConcurrency: 3, fullConcurrency: 1 });
var fullA = imageTarget('full-a');
var fullB = imageTarget('full-b');
var fullC = imageTarget('full-c');
load(fullPriority.loader, fullA, 'full-a', 2);
load(fullPriority.loader, fullB, 'full-b', 2);
load(fullPriority.loader, fullC, 'full-c', 2);
fullA.onload();
fullB.onload();
fullC.onload();
assert.strictEqual(fullPriority.preloads[0].src, 'full-a@154x224', 'only one full image may start at the configured limit');
fullPriority.loader.prioritize(fullC);
fullPriority.preloads[0].onload();
assert.strictEqual(fullPriority.preloads[1].src, 'full-c@154x224', 'focus changes must reprioritize queued full artwork');

(function foregroundPreviewPreemptsBackgroundPreview() {
  var shared = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var background = imageTarget('background-preview');
  var foreground = imageTarget('foreground-preview');
  shared.loader.load(background, {
    source: 'background-preview', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-continue', previewOnly: true, preemptible: true
  });
  shared.loader.load(foreground, {
    source: 'foreground-preview', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 0, scope: 'library'
  });
  assert.strictEqual(foreground.src, 'foreground-preview@64x96',
    'foreground artwork must preempt an active lower-priority background preview');
  assert.strictEqual(background.src, '',
    'preempted background artwork must release its active request for a later retry');
  foreground.onload();
  assert.strictEqual(background.src, '',
    'preempted background artwork must remain queued while foreground HD is loading');
  shared.preloads[0].onload();
  assert.strictEqual(background.src, 'background-preview@64x96',
    'preempted background artwork must resume when foreground artwork is complete');
}());

(function speculativeArtworkWaitsForVisibleArtworkAndUsesOneSlot() {
  var shared = harness({ previewConcurrency: 4, fullConcurrency: 2 });
  var visible = imageTarget('visible-artwork');
  var first = imageTarget('first-speculative-artwork');
  var second = imageTarget('second-speculative-artwork');
  load(shared.loader, visible, 'visible-artwork', 1, 'library');
  shared.loader.load(first, {
    source: 'first-speculative-artwork', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-recent', previewOnly: true, preemptible: true
  });
  shared.loader.load(second, {
    source: 'second-speculative-artwork', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-recent', previewOnly: true, preemptible: true
  });
  assert.strictEqual(first.src, '', 'speculative previews must wait while visible artwork is loading');
  visible.onload();
  assert.strictEqual(shared.preloads.length, 1, 'visible HD artwork must begin before speculative previews');
  assert.strictEqual(first.src, '', 'speculative previews must also wait for visible HD artwork to finish');
  shared.preloads[0].onload();
  assert.strictEqual(first.src, 'first-speculative-artwork@64x96', 'speculative previews must resume after visible HD artwork settles');
  assert.strictEqual(second.src, '', 'only one speculative preview may run at a time despite spare foreground slots');
  first.onload();
  assert.strictEqual(second.src, 'second-speculative-artwork@64x96', 'the next speculative preview must start when the background slot is released');
}());

(function foregroundArtworkCanStartWhileOneSpeculativePreviewIsActive() {
  var shared = harness({ previewConcurrency: 4, fullConcurrency: 2 });
  var background = imageTarget('active-speculative-artwork');
  var nextBackground = imageTarget('queued-speculative-artwork');
  var foreground = imageTarget('new-visible-artwork');
  shared.loader.load(background, {
    source: 'active-speculative-artwork', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-recent', previewOnly: true, preemptible: true
  });
  shared.loader.load(nextBackground, {
    source: 'queued-speculative-artwork', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-recent', previewOnly: true, preemptible: true
  });
  load(shared.loader, foreground, 'new-visible-artwork', 0, 'library');
  assert.strictEqual(foreground.src, 'new-visible-artwork@64x96', 'a newly visible preview must retain foreground capacity');
  background.onload();
  assert.strictEqual(nextBackground.src, '', 'a second speculative preview must wait while newly visible artwork is active');
  foreground.onload();
  assert.strictEqual(nextBackground.src, '', 'speculative work must also wait for the new visible HD request');
  shared.preloads[0].onload();
  assert.strictEqual(nextBackground.src, 'queued-speculative-artwork@64x96', 'speculative work must resume when the new foreground request settles');
}());

(function speculativeArtworkWaitsThroughVisibleFullRetry() {
  var clock = fakeClock();
  var shared = harness({ clock: clock, previewConcurrency: 4, fullConcurrency: 2 });
  var visible = imageTarget('retrying-visible-artwork');
  var background = imageTarget('waiting-speculative-artwork');
  load(shared.loader, visible, 'retrying-visible-artwork', 1, 'library');
  visible.onload();
  shared.preloads[0].onerror();
  shared.loader.load(background, {
    source: 'waiting-speculative-artwork', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-recent', previewOnly: true, preemptible: true
  });
  assert.strictEqual(background.src, '', 'speculative work must wait while a visible HD retry is pending');
  clock.run(clock.pending()[0].id);
  shared.preloads[1].onload();
  assert.strictEqual(background.src, 'waiting-speculative-artwork@64x96', 'speculative work must resume after the visible retry succeeds');
}());

(function failedBackgroundRestartDoesNotPauseTheArtworkQueue() {
  var backgroundRoutes = 0;
  var settled = null;
  var shared = harness({ previewConcurrency: 1, fullConcurrency: 1, urlFor: function (source, width, height) {
    if (source === 'background-restart') {
      backgroundRoutes += 1;
      if (backgroundRoutes === 3) { throw new Error('Temporary background route failure'); }
    }
    return source + '@' + width + 'x' + height;
  }});
  var background = imageTarget('background-restart');
  var foreground = imageTarget('foreground-after-restart-failure');
  var next = imageTarget('next-after-restart-failure');
  shared.loader.load(background, {
    source: 'background-restart', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library-tab-prefetch-continue', previewOnly: true, preemptible: true,
    onPreviewSettled: function (success) { settled = success; }
  });
  shared.loader.load(foreground, {
    source: 'foreground-after-restart-failure', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 0, scope: 'library'
  });
  assert.strictEqual(settled, false, 'a failed background restart must settle its preview listener');
  assert.strictEqual(foreground.src, 'foreground-after-restart-failure@64x96',
    'a failed background restart must not prevent the foreground preview');
  foreground.onload();
  shared.loader.load(next, {
    source: 'next-after-restart-failure', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 0, scope: 'library'
  });
  assert.strictEqual(next.src, 'next-after-restart-failure@64x96',
    'subsequent artwork must still advance after a synchronous restart failure');
}());

var stale = harness({ previewConcurrency: 1, fullConcurrency: 1 });
var stalePoster = imageTarget('stale');
load(stale.loader, stalePoster, 'old', 1, 'search');
var oldLoad = stalePoster.onload;
stale.loader.cancelScope('search');
oldLoad();
assert.strictEqual(stale.preloads.length, 0, 'cancelled views must not start full artwork from stale preview callbacks');
assert.ok(!/is-loaded/.test(stalePoster.className), 'cancelled previews must not update detached view state');
assert.strictEqual(stalePoster.src, '', 'cancelling an incomplete preview must clear its source so the same URL can be retried');
load(stale.loader, stalePoster, 'old', 0, 'search');
assert.deepStrictEqual(stalePoster.starts, ['old@64x96', 'old@64x96'], 'an interrupted preview must restart the same URL instead of remaining stuck');

var cancelledFull = harness({ previewConcurrency: 1, fullConcurrency: 1 });
var cancelledFullPoster = imageTarget('cancelled-full');
load(cancelledFull.loader, cancelledFullPoster, 'cancelled-full', 1, 'library');
cancelledFullPoster.onload();
assert.strictEqual(cancelledFull.preloads[0].src, 'cancelled-full@154x224', 'the full request must be active before cancellation');
cancelledFull.loader.cancelScope('library');
assert.strictEqual(cancelledFull.preloads[0].src, '', 'cancelling a scope must abort its active full-image download');
assert.strictEqual(cancelledFull.loader.needsLoad(cancelledFullPoster, false), true,
  'a cancelled HD upgrade must remain eligible for recovery while its preview is visible');
assert.strictEqual(cancelledFull.loader.needsLoad(cancelledFullPoster, true), false,
  'a retained preview already satisfies preview-only artwork');

var detached = harness();
var detachedPoster = imageTarget('detached');
load(detached.loader, detachedPoster, 'detached', 1);
detachedPoster.attached = false;
detachedPoster.onload();
assert.strictEqual(detached.preloads.length, 0, 'detached cards must not start unnecessary full-image downloads');
assert.strictEqual(detachedPoster.src, 'detached@64x96', 'detached cards must not be repainted by completed background work');

var missing = harness();
var missingPoster = imageTarget('missing');
load(missing.loader, missingPoster, 'old-artwork', 1, 'search');
missingPoster.onload();
missing.preloads[0].onload();
load(missing.loader, missingPoster, '', 1, 'search');
assert.strictEqual(missingPoster.src, '', 'recycling a card for media without artwork must clear the previous poster');
assert.ok(!/is-loaded|is-preview|is-full/.test(missingPoster.className), 'media without artwork must not retain the previous poster state');

var queuedReplacement = harness({ previewConcurrency: 1, fullConcurrency: 1 });
var busyPoster = imageTarget('busy');
var replacementPoster = imageTarget('replacement');
load(queuedReplacement.loader, replacementPoster, 'old-artwork', 1, 'search');
replacementPoster.onload();
queuedReplacement.preloads[0].onload();
load(queuedReplacement.loader, busyPoster, 'busy-artwork', 1, 'search');
load(queuedReplacement.loader, replacementPoster, 'new-artwork', 1, 'search');
assert.strictEqual(replacementPoster.src, '', 'a recycled card must hide old artwork while its replacement preview is queued');
busyPoster.onload();
assert.strictEqual(replacementPoster.src, 'new-artwork@64x96', 'the queued replacement must paint only its new artwork');

var destroyedLoader = harness({ previewConcurrency: 1, fullConcurrency: 1 });
var destroyedPreview = imageTarget('destroyed-preview');
var destroyedQueued = imageTarget('destroyed-queued');
load(destroyedLoader.loader, destroyedPreview, 'destroyed-active', 0, 'home');
load(destroyedLoader.loader, destroyedQueued, 'destroyed-queued', 1, 'library');
var latePreview = destroyedPreview.onload;
destroyedLoader.loader.destroy();
assert.strictEqual(destroyedPreview.__plexProgressiveJob, null, 'destroy must release an active artwork job from its live card');
assert.strictEqual(destroyedQueued.__plexProgressiveJob, null, 'destroy must release a queued artwork job from its live card');
assert.strictEqual(typeof destroyedQueued.onload, 'undefined', 'destroy must not promote queued previews while cancelling active work');
assert.strictEqual(destroyedPreview.src, '', 'destroy must clear incomplete visible previews');
assert.strictEqual(destroyedQueued.src, '', 'destroy must clear queued image work');
latePreview();
assert.strictEqual(destroyedLoader.preloads.length, 0, 'late callbacks after destroy must not start full downloads');
assert.strictEqual(destroyedLoader.loader.load(imageTarget('ignored'), { source: 'ignored' }), null, 'destroyed loaders must reject new work');
destroyedLoader.loader.destroy();


(function imageScopesReachUrlConstruction() {
  var calls = [];
  var scoped = harness({
    urlFor: function (source, width, height, scope) {
      calls.push([source, width, height, scope]);
      return source + '@' + width + 'x' + height;
    }
  });
  var target = imageTarget('scoped');
  scoped.loader.load(target, { source: 'scoped', previewWidth: 64, previewHeight: 36, width: 640, height: 360, priority: 0, scope: 'up-next-backdrop' });
  assert.deepStrictEqual(calls, [
    ['scoped', 640, 360, 'up-next-backdrop'],
    ['scoped', 64, 36, 'up-next-backdrop']
  ], 'preview and full URL construction must receive the semantic image scope');
}());

(function posterUrlsAreConstructedOncePerJob() {
  var urlCalls = 0;
  var measured = harness({
    urlFor: function (source, width, height) {
      urlCalls += 1;
      return source + '@' + width + 'x' + height;
    }
  });
  var measuredPoster = imageTarget('measured');
  load(measured.loader, measuredPoster, 'measured', 1);
  measuredPoster.onload();
  measured.preloads[0].onload();
  assert.strictEqual(urlCalls, 2, 'one image job must construct its preview and full URLs only once');
}());

(function cancellingAllArtworkDoesNotPromoteQueuedRequests() {
  var cancelled = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var active = imageTarget('cancel-all-active');
  var queued = imageTarget('cancel-all-queued');
  load(cancelled.loader, active, 'cancel-all-active', 0);
  load(cancelled.loader, queued, 'cancel-all-queued', 1);
  cancelled.loader.cancelAll();
  assert.deepStrictEqual(queued.starts, [], 'bulk cancellation must not briefly start queued artwork that is being cancelled');
}());


(function individualArtworkLoadsDoNotResortWholeQueues() {
  var originalSort = Array.prototype.sort;
  var sortCalls = 0;
  var ordered = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var index;
  Array.prototype.sort = function (compareValues) {
    sortCalls += 1;
    return originalSort.call(this, compareValues);
  };
  try {
    for (index = 0; index < 20; index += 1) {
      load(ordered.loader, imageTarget('ordered-' + index), 'ordered-' + index, index % 3);
    }
  } finally {
    Array.prototype.sort = originalSort;
  }
  ordered.loader.cancelAll();
  assert.strictEqual(sortCalls, 0, 'individual image jobs must enter priority order without sorting the complete queues');
}());


(function previewOnlyArtworkPromotesWithoutRestartingPreview() {
  var tiered = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var tieredPoster = imageTarget('tiered-preview');
  tiered.loader.load(tieredPoster, {
    source: 'tiered', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library', previewOnly: true
  });
  assert.strictEqual(tieredPoster.src, 'tiered@64x96', 'preview-only artwork must start its SD request normally');
  tieredPoster.onload();
  assert.strictEqual(tiered.preloads.length, 0, 'preview-only artwork must not start a full-image download');
  assert.strictEqual(tieredPoster.__plexProgressiveJob, null, 'completed preview-only artwork must release its job graph');
  var startsBeforePromotion = tieredPoster.starts.length;
  tiered.loader.prioritize(tieredPoster, 1);
  assert.strictEqual(tieredPoster.starts.length, startsBeforePromotion, 'promoting a completed preview must not restart or repaint the SD image');
  assert.strictEqual(tiered.preloads.length, 1, 'promoting a completed preview must start exactly one full-image request');
  assert.strictEqual(tiered.preloads[0].src, 'tiered@154x224', 'promoted artwork must retain the exact rendered full dimensions');
}());

(function previewOnlyPromotionPreservesPlexOwnerContext() {
  var routed = harness({ previewConcurrency: 1, fullConcurrency: 1, urlFor: function (source, width, height, _scope, specification) {
    var context = specification && specification.sourceContext || {};
    var owner = String(specification && specification.sourceOwnerMachineIdentifier || '');
    return source + '@' + owner + '@' + String(context.token || 'primary-token') + '@' + width + 'x' + height;
  }});
  var target = imageTarget('secondary-home-recent');
  routed.loader.load(target, {
    source: 'recent-cover', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'home', previewOnly: true,
    sourceContext: { serverMachineIdentifier: 'luca-nuc', token: 'luca-token' },
    sourceOwnerMachineIdentifier: 'luca-nuc', sourceIdentity: 'server:luca-nuc'
  });
  target.onload();
  assert.strictEqual(routed.preloads.length, 0, 'lazy Recently Added artwork must remain preview-only before it is near focus');
  routed.loader.prioritize(target, 1);
  assert.strictEqual(routed.preloads.length, 1, 'prioritizing a lazy Recently Added card must promote it to full artwork');
  assert.strictEqual(routed.preloads[0].src, 'recent-cover@luca-nuc@luca-token@154x224',
    'preview-to-full promotion must retain the owning PMS context instead of falling back to the selected primary server');
}());

(function activePreviewOnlyArtworkCanBePromoted() {
  var tiered = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var target = imageTarget('active-tiered-preview');
  tiered.loader.load(target, {
    source: 'active-tiered', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'library', previewOnly: true
  });
  tiered.loader.prioritize(target, 1);
  target.onload();
  assert.strictEqual(tiered.preloads.length, 1, 'promoting an active preview-only job must continue directly to full artwork');
  assert.deepStrictEqual(target.starts, ['active-tiered@64x96'], 'active promotion must not duplicate the preview request');
}());

(function failedPreviewOnlyArtworkCanRecoverWhenItBecomesImportant() {
  var tiered = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var target = imageTarget('failed-tiered-preview');
  tiered.loader.load(target, {
    source: 'failed-tiered', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'home', previewOnly: true
  });
  assert.strictEqual(target.src, 'failed-tiered@64x96', 'preview-only artwork must attempt its initial preview');
  target.onerror();
  assert.strictEqual(target.__plexProgressiveJob, null, 'a failed preview-only request must release its completed job');
  tiered.loader.prioritize(target, 0);
  assert.deepStrictEqual(target.starts, ['failed-tiered@64x96', 'failed-tiered@64x96'],
    'promoting a failed preview-only card must retry its preview instead of leaving the card blank');
  target.onload();
  assert.strictEqual(tiered.preloads.length, 1, 'a recovered focused preview must continue to full-resolution artwork');
  assert.strictEqual(tiered.preloads[0].src, 'failed-tiered@154x224', 'recovery must preserve the exact final artwork dimensions');
}());

(function unavailableArtworkRouteStaysRetryableWithoutStartingAnEmptyUrl() {
  var available = false;
  var routed = harness({
    previewConcurrency: 1,
    fullConcurrency: 1,
    urlFor: function (source, width, height) { return available ? source + '@' + width + 'x' + height : ''; }
  });
  var target = imageTarget('temporarily-unrouteable');
  routed.loader.load(target, {
    source: 'remote-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 3, scope: 'home', previewOnly: true, sourceIdentity: 'server:remote'
  });
  assert.deepStrictEqual(target.starts, [], 'an unavailable owner route must not assign an empty image URL');
  assert.strictEqual(target.__plexProgressiveJob, null, 'unrouteable artwork must not consume a progressive loader slot');
  available = true;
  routed.loader.prioritize(target, 0);
  assert.deepStrictEqual(target.starts, ['remote-art@64x96'], 'focus promotion must retry artwork after its owner route becomes available');
  target.onload();
  assert.strictEqual(routed.preloads[0].src, 'remote-art@154x224', 'recovered routed artwork must continue to full quality');
}());

(function unavailableRoutePreservesLoadedArtworkButKeepsAQualityUpgradeRetryable() {
  var available = true;
  var routed = harness({
    previewConcurrency: 1,
    fullConcurrency: 1,
    urlFor: function (source, width, height) { return available ? source + '@' + width + 'x' + height : ''; }
  });
  var target = imageTarget('route-during-quality-change');
  routed.loader.load(target, {
    source: 'quality-art', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 0, scope: 'library', sourceIdentity: 'server:quality'
  });
  target.onload();
  routed.preloads[0].onload();
  assert.strictEqual(target.src, 'quality-art@154x224', 'the initial full artwork must be visible before the route interruption');
  available = false;
  routed.loader.load(target, {
    source: 'quality-art', previewWidth: 64, previewHeight: 96, width: 220, height: 310,
    priority: 0, scope: 'library', sourceIdentity: 'server:quality'
  });
  assert.strictEqual(target.src, 'quality-art@154x224', 'a temporary route loss must preserve the already usable artwork');
  available = true;
  routed.loader.prioritize(target, 0);
  assert.strictEqual(routed.preloads.length, 2, 'the preserved fallback must remain eligible for the deferred quality upgrade');
  assert.strictEqual(routed.preloads[1].src, 'quality-art@220x310', 'route recovery must upgrade directly to the requested full dimensions');
}());

(function unavailableBackdropPrefetchFailsFastWithoutStartingAnEmptyUrl() {
  var callbacks = [];
  var routed = harness({ urlFor: function () { return ''; } });
  assert.strictEqual(routed.loader.prefetch({ source: 'remote-backdrop', width: 1920, height: 1080, scope: 'backdrop' }, function (success) {
    callbacks.push(success);
  }), false, 'an unavailable backdrop route must reject speculative prefetch immediately');
  assert.strictEqual(routed.preloads.length, 0, 'an unavailable backdrop route must not allocate an Image request for an empty URL');
  assert.deepStrictEqual(callbacks, [false], 'unavailable speculative artwork must report failure once');
}());

(function individualArtworkCancellationReleasesDetachedWork() {
  var cancellable = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var target = imageTarget('individual-cancel');
  load(cancellable.loader, target, 'individual-cancel', 2, 'library');
  var lateLoad = target.onload;
  cancellable.loader.cancel(target);
  assert.strictEqual(target.__plexProgressiveJob, null, 'individual cancellation must release the job from its card');
  assert.strictEqual(target.src, '', 'individual cancellation must clear an incomplete preview');
  lateLoad();
  assert.strictEqual(cancellable.preloads.length, 0, 'late preview completion after individual cancellation must not start full artwork');
}());

(function speculativeBackdropPrefetchWaitsForForegroundIdleAndWarmsFullUrl() {
  var speculative = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var foreground = imageTarget('foreground-before-prefetch');
  var backdrop = imageTarget('prefetched-backdrop');
  var callbacks = [];
  load(speculative.loader, foreground, 'foreground', 0, 'home');
  assert.strictEqual(typeof speculative.loader.prefetch, 'function', 'progressive loader must expose a speculative prefetch port');
  speculative.loader.prefetch({ source: 'neighbor', width: 1920, height: 1080, scope: 'backdrop' }, function (loaded) { callbacks.push(loaded); });
  assert.strictEqual(speculative.preloads.length, 0, 'speculative backdrop work must not start while a foreground preview is active');
  foreground.onload();
  assert.strictEqual(speculative.preloads.length, 1, 'foreground full artwork must retain priority over speculative backdrop work');
  assert.strictEqual(speculative.preloads[0].src, 'foreground@154x224', 'foreground full artwork must start before prefetch');
  speculative.preloads[0].onload();
  assert.strictEqual(speculative.preloads.length, 2, 'speculative backdrop may start only after foreground queues and active work are idle');
  assert.strictEqual(speculative.preloads[1].src, 'neighbor@1920x1080', 'speculative backdrop must warm the exact final backdrop URL');
  speculative.preloads[1].onload();
  assert.deepStrictEqual(callbacks, [true], 'successful speculative prefetch must notify its scheduler once');
  speculative.loader.load(backdrop, {
    source: 'neighbor', previewWidth: 320, previewHeight: 180, width: 1920, height: 1080,
    priority: 0, scope: 'backdrop'
  });
  assert.strictEqual(backdrop.src, 'neighbor@1920x1080', 'foreground backdrop must reuse the prefetched full URL without starting a preview');
  assert.strictEqual(speculative.preloads.length, 2, 'reusing a prefetched backdrop must not create another network/decode job');
}());

(function foregroundWorkCancelsActiveSpeculativeBackdrop() {
  var speculative = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var foreground = imageTarget('foreground-cancels-prefetch');
  var callbacks = [];
  speculative.loader.prefetch({ source: 'stale-neighbor', width: 1920, height: 1080, scope: 'backdrop' }, function (loaded) { callbacks.push(loaded); });
  assert.strictEqual(speculative.preloads.length, 1, 'idle speculative backdrop must start immediately');
  assert.strictEqual(speculative.preloads[0].src, 'stale-neighbor@1920x1080', 'speculative request must use final backdrop dimensions');
  load(speculative.loader, foreground, 'urgent', 0, 'home');
  assert.strictEqual(speculative.preloads[0].src, '', 'new foreground artwork must abort an active speculative request');
  assert.deepStrictEqual(callbacks, [false], 'aborted speculative work must notify the scheduler as unsuccessful');
  assert.strictEqual(foreground.src, 'urgent@64x96', 'foreground preview must start immediately after speculative cancellation');
}());

(function speculativeBackdropRequestsStaySingleAndLatestPendingWins() {
  var speculative = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var blocker = imageTarget('prefetch-blocker');
  load(speculative.loader, blocker, 'blocker', 0, 'home');
  speculative.loader.prefetch({ source: 'old-neighbor', width: 1920, height: 1080, scope: 'backdrop' });
  speculative.loader.prefetch({ source: 'new-neighbor', width: 1920, height: 1080, scope: 'backdrop' });
  blocker.onload();
  speculative.preloads[0].onload();
  assert.strictEqual(speculative.preloads.length, 2, 'only one speculative request may start after foreground becomes idle');
  assert.strictEqual(speculative.preloads[1].src, 'new-neighbor@1920x1080', 'the latest pending speculative candidate must replace stale pending work');
}());

(function unchangedArtworkKeepsSpeculativeWorkAlive() {
  var speculative = harness();
  var poster = imageTarget('stable');
  load(speculative.loader, poster, 'stable', 0);
  poster.onload();
  speculative.preloads[0].onload();
  speculative.loader.prefetch({ source: 'next', width: 1920, height: 1080, scope: 'backdrop' });
  load(speculative.loader, poster, 'stable', 0);
  assert.strictEqual(speculative.preloads[1].src, 'next@1920x1080', 'unchanged loaded artwork must not abort adjacent backdrop prefetch');
  assert.strictEqual(typeof speculative.preloads[1].onload, 'function');
  speculative.loader.destroy();
}());

(function cancelPrefetchStopsPendingAndActiveSpeculativeWork() {
  var speculative = harness({ previewConcurrency: 1, fullConcurrency: 1 });
  var blocker = imageTarget('cancel-prefetch-blocker');
  load(speculative.loader, blocker, 'blocker-cancel', 0, 'home');
  speculative.loader.prefetch({ source: 'pending-neighbor', width: 1920, height: 1080, scope: 'backdrop' });
  assert.strictEqual(typeof speculative.loader.cancelPrefetch, 'function', 'progressive loader must expose speculative cancellation for navigation churn');
  speculative.loader.cancelPrefetch();
  blocker.onload();
  speculative.preloads[0].onload();
  assert.strictEqual(speculative.preloads.length, 1, 'cancelled pending speculative work must never start after foreground becomes idle');
  speculative.loader.prefetch({ source: 'active-neighbor', width: 1920, height: 1080, scope: 'backdrop' });
  assert.strictEqual(speculative.preloads.length, 2, 'idle speculative work starts once requested');
  speculative.loader.cancelPrefetch();
  assert.strictEqual(speculative.preloads[1].src, '', 'cancelling navigation prefetch must abort active speculative network/decode work');
}());


(function homeStartupPressureKeepsVisibleArtworkFastAndDefersOnlyBackgroundHomeWork() {
  var pressured = harness({ previewConcurrency: 4, fullConcurrency: 2 });
  var visible = imageTarget('visible-home');
  var near = imageTarget('near-home');
  var far = imageTarget('far-home');
  var library = imageTarget('library-outside-home');
  assert.strictEqual(typeof pressured.loader.setHomePressure, 'function', 'progressive artwork must expose scoped Home startup pressure');
  pressured.loader.setHomePressure(true);
  pressured.loader.loadBatch([
    { target: visible, specification: { source: 'visible', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 0, scope: 'home' } },
    { target: near, specification: { source: 'near', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 1, scope: 'home' } },
    { target: far, specification: { source: 'far', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 2, scope: 'home' } },
    { target: library, specification: { source: 'library', previewWidth: 64, previewHeight: 96, width: 154, height: 224, priority: 2, scope: 'library' } }
  ]);
  assert.strictEqual(visible.src, 'visible@64x96', 'visible Home preview must start immediately under startup pressure');
  assert.strictEqual(near.src, 'near@64x96', 'nearby Home preview may use spare preview capacity under startup pressure');
  assert.strictEqual(far.src, '', 'far Home preview must stay queued while heavy startup work is active');
  assert.strictEqual(library.src, 'library@64x96', 'Home startup pressure must not throttle artwork owned by another surface');
  visible.onload();
  near.onload();
  library.onload();
  assert.strictEqual(pressured.preloads.some(function (image) { return image.src === 'visible@154x224'; }), true,
    'visible Home full-resolution artwork must start immediately under startup pressure');
  assert.strictEqual(pressured.preloads.some(function (image) { return image.src === 'near@154x224'; }), false,
    'nearby non-visible Home full-resolution artwork must yield while startup pressure is active');
  assert.strictEqual(pressured.preloads.some(function (image) { return image.src === 'library@154x224'; }), true,
    'non-Home full-resolution work must retain normal scheduling');
  pressured.loader.setHomePressure(false);
  assert.strictEqual(far.src, 'far@64x96', 'releasing startup pressure must immediately resume aggressive far-Home preview loading');
  var visibleFull = pressured.preloads.filter(function (image) { return image.src === 'visible@154x224'; })[0];
  visibleFull.onload();
  assert.strictEqual(pressured.preloads.some(function (image) { return image.src === 'near@154x224'; }), true,
    'releasing startup pressure must resume queued nearby Home full-resolution artwork');
}());


(function deferredHomePreviewCanBePromotedWithoutStartingFullArtwork() {
  var promoted = harness({ previewConcurrency: 2, fullConcurrency: 1 });
  var far = imageTarget('promoted-far-home');
  var settled = 0;
  promoted.loader.setHomePressure(true);
  promoted.loader.load(far, {
    source: 'promoted-far', previewWidth: 64, previewHeight: 96, width: 154, height: 224,
    priority: 2, scope: 'home', previewOnly: true
  });
  assert.strictEqual(far.src, '', 'far Home SD artwork must remain deferred while startup pressure is active');
  assert.strictEqual(typeof promoted.loader.prioritizePreview, 'function', 'progressive artwork must expose preview-only promotion for the startup chain');
  promoted.loader.prioritizePreview(far, 1, function () { settled += 1; });
  assert.strictEqual(far.src, 'promoted-far@64x96', 'startup chain preview promotion must start the deferred SD artwork under Home pressure');
  far.onload();
  assert.strictEqual(settled, 1, 'preview-only promotion must publish completion when the SD artwork settles');
  assert.strictEqual(promoted.preloads.length, 0, 'preview-only promotion must not start HD artwork while startup pressure remains active');
}());

console.log('Progressive image checks passed');
