'use strict';

var assert = require('assert');
var ProgressiveImages = require('../app/progressive-images');

assert.deepStrictEqual(ProgressiveImages.previewSize(248, 370, 96), { width: 64, height: 96 }, 'portrait previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(338, 190, 96), { width: 96, height: 54 }, 'landscape previews must preserve the final card aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(310, 124, 128), { width: 128, height: 51 }, 'episode previews must scale to the exact rendered aspect ratio');
assert.deepStrictEqual(ProgressiveImages.previewSize(300, 132, 96), { width: 96, height: 42 }, 'chapter previews must scale to the exact rendered aspect ratio');

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
      urlFor: function (source, width, height) { return source + '@' + width + 'x' + height; }
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

console.log('Progressive image checks passed');
