'use strict';

var assert = require('assert');
var ProgressiveImages = require('../app/progressive-images');

assert.deepStrictEqual(ProgressiveImages.previewSize(248, 370, 96), { width: 64, height: 96 }, 'portrait previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(338, 190, 96), { width: 96, height: 54 }, 'landscape previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(310, 124, 128), { width: 128, height: 51 }, 'episode previews must scale to the exact rendered aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(300, 132, 96), { width: 96, height: 42 }, 'chapter previews must scale to the exact rendered aspect ratio');
assert.deepStrictEqual(ProgressiveImages.renderedSize({ getBoundingClientRect: function () { return { width: 248.9, height: 370.8 }; } }, 100, 100), { width: 248, height: 370 }, 'full image requests must never exceed fractional rendered CSS dimensions');
assert.deepStrictEqual(ProgressiveImages.renderedSize({ clientWidth: 164.9, clientHeight: 104.4 }, 100, 100), { width: 164, height: 104 }, 'client-size fallback must also round down to the visible image box');
assert.deepStrictEqual(ProgressiveImages.ARTWORK_QUALITY_STEPS, [70, 80, 85, 90, 100], 'artwork quality must use the approved high-resolution scale');
assert.deepStrictEqual(ProgressiveImages.BACKDROP_QUALITY_STEPS, [50, 60, 70, 85, 100], 'backdrop quality must use its independent wider scale');
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
      previewConcurrency: options && options.previewConcurrency || 4,
      fullConcurrency: options && options.fullConcurrency || 2,
      isAttached: function (target) { return target.attached !== false; },
      urlFor: options && options.urlFor || function (source, width, height) { return source + '@' + width + 'x' + height; }
    })
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

var fallback = harness();
var fallbackPoster = imageTarget('fallback');
load(fallback.loader, fallbackPoster, 'fallback', 1);
fallbackPoster.onload();
fallback.preloads[0].onerror();
assert.strictEqual(fallbackPoster.src, 'fallback@64x96', 'a failed full request must retain the usable preview');
assert.ok(/is-preview/.test(fallbackPoster.className), 'full-image failure must not hide the preview');

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

console.log('Progressive image checks passed');
