'use strict';

var assert = require('assert');
var View;
var ProgressiveImages = require('../app/progressive-images');

try {
  View = require('../app/queue-gap-view');
} catch (error) {
  View = null;
}

assert.ok(View, 'the queue gap view module must exist');

function node() {
  return {
    className: '', textContent: '', src: '', alt: '', attributes: {},
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    removeAttribute: function (name) { delete this.attributes[name]; if (name === 'src') { this.src = ''; } },
    focus: function () { this.focused = true; },
    blur: function () { this.blurred = true; }
  };
}

var nodes = {};
[
  'queue-gap-dialog', 'queue-gap-title', 'queue-gap-body', 'queue-gap-image',
  'queue-gap-target-title', 'queue-gap-target-meta', 'queue-gap-stay', 'queue-gap-continue'
].forEach(function (id) { nodes[id] = node(); });
var textWrites = 0;
[
  'queue-gap-title', 'queue-gap-body', 'queue-gap-target-title',
  'queue-gap-target-meta', 'queue-gap-stay', 'queue-gap-continue'
].forEach(function (id) {
  var value = '';
  Object.defineProperty(nodes[id], 'textContent', {
    configurable: true,
    get: function () { return value; },
    set: function (next) { value = String(next || ''); textWrites += 1; }
  });
});
nodes['queue-gap-dialog'].contains = function () { return false; };
nodes['queue-gap-image'].getBoundingClientRect = function () { return { width: 142.9, height: 213.8 }; };
var imageSource = '';
var imageWrites = 0;
Object.defineProperty(nodes['queue-gap-image'], 'src', {
  configurable: true,
  get: function () { return imageSource; },
  set: function (value) { imageSource = String(value || ''); imageWrites += 1; }
});
var resolutions = [];
var documentRef = {
  activeElement: null,
  getElementById: function (id) { return nodes[id]; }
};
var view = View.create({
  document: documentRef,
  ProgressiveImages: ProgressiveImages,
  resolveImageUrl: function (source, width, height) {
    resolutions.push([source, width, height]);
    return source + '@' + width + 'x' + height;
  }
});

view.render({
  open: true,
  focus: 0,
  confirmation: {
    token: 'gap-1',
    targetOccurrenceId: 'series:s4:e3:episode-43',
    title: 'Return',
    artwork: '/return.jpg',
    targetSeasonNumber: 4,
    targetEpisodeNumber: 3
  }
}, {
  title: 'Incomplete sequence',
  body: 'Some intermediate content is unavailable.',
  targetMeta: 'S04 E03',
  stay: 'Stay here',
  proceed: 'Continue'
});

assert.strictEqual(nodes['queue-gap-dialog'].className, 'queue-gap-dialog is-open');
assert.strictEqual(nodes['queue-gap-dialog'].attributes['aria-hidden'], 'false');
assert.strictEqual(nodes['queue-gap-dialog'].attributes['data-confirmation-token'], 'gap-1');
assert.strictEqual(nodes['queue-gap-dialog'].attributes['data-target-occurrence'], 'series:s4:e3:episode-43');
assert.strictEqual(nodes['queue-gap-title'].textContent, 'Incomplete sequence');
assert.strictEqual(nodes['queue-gap-body'].textContent, 'Some intermediate content is unavailable.');
assert.strictEqual(nodes['queue-gap-target-title'].textContent, 'Return');
assert.strictEqual(nodes['queue-gap-target-meta'].textContent, 'S04 E03');
assert.deepStrictEqual(resolutions, [['/return.jpg', 142, 213]], 'gap artwork must use no more pixels than its rendered box');
assert.strictEqual(nodes['queue-gap-image'].src, '/return.jpg@142x213');
assert.strictEqual(nodes['queue-gap-stay'].className, 'is-focused');
assert.strictEqual(nodes['queue-gap-continue'].className, '');
textWrites = 0;

view.render({
  open: true,
  focus: 1,
  confirmation: {
    token: 'gap-1',
    targetOccurrenceId: 'series:s4:e3:episode-43',
    title: 'Return',
    artwork: '/return.jpg',
    targetSeasonNumber: 4,
    targetEpisodeNumber: 3
  }
}, {
  title: 'Incomplete sequence', body: 'Some intermediate content is unavailable.', targetMeta: 'S04 E03', stay: 'Stay here', proceed: 'Continue'
});
assert.strictEqual(imageWrites, 1,
  'moving modal focus must not reassign identical artwork');
assert.strictEqual(textWrites, 0,
  'moving modal focus must not rewrite unchanged labels');
assert.strictEqual(nodes['queue-gap-continue'].className, 'is-focused');

view.render({ open: false }, {});
assert.strictEqual(nodes['queue-gap-image'].src, '',
  'closing the modal must release its hidden artwork immediately');

view.render({
  open: true,
  focus: 1,
  confirmation: {
    token: 'gap-1',
    targetOccurrenceId: 'series:s4:e3:episode-43',
    title: 'Return',
    artwork: '',
    targetSeasonNumber: 4,
    targetEpisodeNumber: 3
  }
}, {
  title: 'Incomplete sequence', body: 'Body', targetMeta: 'S04 E03', stay: 'Stay here', proceed: 'Continue'
});
assert.strictEqual(nodes['queue-gap-image'].src, '', 'missing artwork must restore the neutral placeholder');
assert.strictEqual(nodes['queue-gap-stay'].className, '');
assert.strictEqual(nodes['queue-gap-continue'].className, 'is-focused');

view.render({ open: false }, {});
assert.strictEqual(nodes['queue-gap-dialog'].className, 'queue-gap-dialog is-hidden');
assert.strictEqual(nodes['queue-gap-dialog'].attributes['aria-hidden'], 'true');
assert.strictEqual(nodes['queue-gap-dialog'].attributes['data-confirmation-token'], undefined);
assert.strictEqual(nodes['queue-gap-stay'].className, '');
assert.strictEqual(nodes['queue-gap-continue'].className, '');

console.log('Queue gap view checks passed');
