'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var UpNextView = require('../app/up-next-view');
var ProgressiveImages = require('../app/progressive-images');
function node() {
  return {
    className: '', textContent: '', src: '', alt: '', attributes: {}, style: {}, offsetWidth: 100,
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    removeAttribute: function (key) { delete this.attributes[key]; },
    focus: function () { this.focused = true; }
  };
}
var nodes = {};
var resolvedImages = [];
var imageRenderOrder = [];
var assignedImageSource = '';
['autoplay-prompt', 'autoplay-title', 'autoplay-series', 'autoplay-image', 'autoplay-progress', 'autoplay-play', 'autoplay-cancel', 'autoplay-countdown'].forEach(function (id) { nodes[id] = node(); });
Object.defineProperty(nodes['autoplay-image'], 'src', {
  get: function () { return assignedImageSource; },
  set: function (value) { assignedImageSource = String(value || ''); imageRenderOrder.push('assign-src'); }
});
var documentRef = {
  activeElement: null,
  getElementById: function (id) { return nodes[id]; }
};
nodes['autoplay-prompt'].contains = function () { return false; };
nodes['autoplay-image'].getBoundingClientRect = function () {
  imageRenderOrder.push('measure');
  return nodes['autoplay-prompt'].className.indexOf('is-bottom-panel') !== -1 ? { width: 164.9, height: 104.8 } : { width: 136.7, height: 184.9 };
};
var view = UpNextView.create({
  document: documentRef,
  ProgressiveImages: ProgressiveImages,
  resolveImageUrl: function (source, width, height) { imageRenderOrder.push('resolve-url'); resolvedImages.push([source, width, height]); return source + '@' + width + 'x' + height; }
});

view.render({
  visible: true,
  layout: 'bottom-panel',
  focus: 0,
  progress: 0.6,
  seconds: 6,
  total: 10,
  item: { ratingKey: 'episode-2', title: 'Episode 2', grandparentTitle: 'Example Show', imageSource: '/episode-2.jpg' }
}, { countdown: 'Starts in 6 seconds', play: 'Play now', cancel: 'Cancel' });
assert.strictEqual(nodes['autoplay-prompt'].className, 'autoplay-prompt is-bottom-panel', 'renders the selected layout');
assert.strictEqual(nodes['autoplay-title'].textContent, 'Episode 2', 'renders the next item title');
assert.strictEqual(nodes['autoplay-series'].textContent, 'Example Show', 'renders the series context');
assert.strictEqual(nodes['autoplay-image'].src, '/episode-2.jpg@164x104', 'requests the exact rendered bottom-panel image size');
assert.deepStrictEqual(resolvedImages[0], ['/episode-2.jpg', 164, 104], 'bottom-panel artwork must never request the previous 2x cover');
assert.deepStrictEqual(imageRenderOrder.slice(0, 3), ['measure', 'resolve-url', 'assign-src'], 'the exact cover URL must be resolved and assigned synchronously in the same visible render pass');
assert.strictEqual(nodes['autoplay-progress'].style.transition, 'width 6000ms linear', 'arms one continuous transition for the remaining countdown');
assert.strictEqual(nodes['autoplay-progress'].style.width, '0%', 'the continuous countdown drains toward zero');
assert.strictEqual(nodes['autoplay-play'].className, '', 'focus zero maps to the left Cancel action');
assert.strictEqual(nodes['autoplay-cancel'].className, 'is-focused', 'exposes the selected left action');
assert.strictEqual(nodes['autoplay-play'].textContent, 'Play now');
assert.strictEqual(nodes['autoplay-cancel'].textContent, 'Cancel');

view.render({
  visible: true,
  layout: 'bottom-panel',
  focus: 1,
  progress: 0.5,
  seconds: 5,
  total: 10,
  item: { ratingKey: 'episode-2', title: 'Episode 2', grandparentTitle: 'Example Show', imageSource: '/episode-2.jpg' }
}, { countdown: 'Home in 5s', play: 'Go Home', cancel: 'Stay here' });
assert.strictEqual(nodes['autoplay-progress'].style.transition, 'width 6000ms linear', 'one-second ticks must not restart the progress transition');
assert.strictEqual(nodes['autoplay-play'].className, 'is-focused', 'Play now is the default action on the right');
assert.strictEqual(nodes['autoplay-cancel'].className, '', 'Cancel loses focus when moving right');
assert.strictEqual(nodes['autoplay-countdown'].textContent, 'Home in 5s');
assert.strictEqual(nodes['autoplay-play'].textContent, 'Go Home');
assert.strictEqual(nodes['autoplay-cancel'].textContent, 'Stay here');

view.render({
  visible: true, layout: 'bottom-panel', focus: 1, progress: 0.5, seconds: 5, total: 10,
  item: { action: 'home', title: 'Home', imageUrl: 'ploff-logo.svg' }
}, { countdown: 'Home in 5s', play: 'Go Home', cancel: 'Stay here' });
assert.strictEqual(nodes['autoplay-prompt'].className, 'autoplay-prompt is-bottom-panel is-home-target', 'the terminal Home target must expose its own artwork layout');
assert.strictEqual(nodes['autoplay-image'].src, 'ploff-logo.svg', 'the terminal Home target must use the Ploff logo');

var styles = fs.readFileSync(path.join(__dirname, '../app/styles.css'), 'utf8');
assert.ok(styles.indexOf('.autoplay-prompt.is-home-target .autoplay-image { object-fit:contain; object-position:center; }') !== -1, 'the terminal Home logo must remain centered without cropping');

var html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
assert.ok(html.indexOf('id="autoplay-cancel"') < html.indexOf('id="autoplay-play"'), 'Cancel must be rendered before Play now');

view.render({
  visible: true, layout: 'corner-card', focus: 1, progress: 0.5, seconds: 5, total: 10,
  item: { ratingKey: 'episode-3', title: 'Episode 3', imageSource: '/episode-3.jpg' }
}, { countdown: 'Up next in 5s' });
assert.strictEqual(nodes['autoplay-image'].src, '/episode-3.jpg@136x184', 'requests the exact rendered corner-card image size');
assert.deepStrictEqual(resolvedImages[resolvedImages.length - 1], ['/episode-3.jpg', 136, 184], 'corner-card artwork must never request the previous 2x cover');

view.render({ visible: false }, { countdown: '' });
assert.strictEqual(nodes['autoplay-prompt'].className, 'autoplay-prompt is-hidden', 'hides the prompt without retaining focus state');
assert.strictEqual(nodes['autoplay-progress'].style.transition, 'none', 'hiding resets the countdown animation');

console.log('Up Next view checks passed');
