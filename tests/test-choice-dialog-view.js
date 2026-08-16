'use strict';

var assert = require('assert');
var ChoiceDialogView = require('../app/choice-dialog-view');
var CardLayout = require('../app/card-layout');

function node() {
  var value = {
    className: '', textContent: '', children: [], attributes: {},
    style: { setProperty: function (key, propertyValue) { this[key] = String(propertyValue); } },
    offsetHeight: 54,
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    appendChild: function (child) { this.children.push(child); },
    getElementsByTagName: function (tagName) {
      var matches = [];
      function collect(target) {
        var index;
        if (String(target.tagName || '').toLowerCase() === String(tagName || '').toLowerCase()) { matches.push(target); }
        for (index = 0; index < target.children.length; index += 1) { collect(target.children[index]); }
      }
      collect(this);
      return matches;
    },
    focus: function () { this.focused = true; }, scrollIntoView: function () {}
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () { this.children = []; }
  });
  return value;
}
var nodes = { 'choice-dialog': node(), 'choice-dialog-title': node(), 'choice-dialog-preview': node(), 'choice-dialog-list': node(), 'choice-dialog-cancel': node() };
nodes['choice-dialog-list'].clientHeight = 100;
nodes['choice-dialog-list'].scrollHeight = 300;
nodes['choice-dialog-list'].scrollTop = 0;
nodes['choice-dialog-list'].offsetTop = 420;
nodes['choice-dialog-list'].getBoundingClientRect = function () { return { top: this.offsetTop, height: this.clientHeight }; };
nodes['choice-dialog-list'].appendChild = function (child) {
  var rowTop = this.children.length * 62;
  child.offsetTop = this.offsetTop + rowTop;
  child.getBoundingClientRect = function () { return { top: nodes['choice-dialog-list'].offsetTop + rowTop - nodes['choice-dialog-list'].scrollTop, height: this.offsetHeight }; };
  this.children.push(child);
};
var realCards = [node(), node()];
realCards.forEach(function (card, index) {
  card.className = 'media-card poster' + (index ? '' : ' is-viewed');
  card.cloneNode = function () {
    var clone = node();
    var image = node();
    clone.className = card.className;
    image.tagName = 'IMG';
    image.src = 'https://example.test/poster-' + index + '?width=248&height=370';
    clone.appendChild(image);
    return clone;
  };
});
var realBackdrops = [node()];
realBackdrops[0].className = 'backdrop-image';
realBackdrops[0].src = 'https://example.test/photo?width=1280&height=720';
realBackdrops[0].cloneNode = function () {
  var clone = node();
  clone.className = realBackdrops[0].className;
  clone.src = realBackdrops[0].src;
  return clone;
};
var documentRef = {
  getElementById: function (id) { return nodes[id]; },
  createElement: function () { return node(); },
  querySelectorAll: function (selector) {
    if (selector === '.media-card.poster') { return realCards; }
    if (selector === '.backdrop-image') { return realBackdrops; }
    return [];
  }
};
var view = ChoiceDialogView.create({ document: documentRef, t: function (key) { return key === 'common.cancel' ? 'Cancel' : key; }, CardLayout: CardLayout });
view.open('Audio', [{ value: 'a', label: 'English', languageCode: 'en' }, { value: 'b', label: 'Japanese (AC3 5.1)', color: '#a66cff' }], 'b');
assert.strictEqual(view.snapshot().index, 1, 'opening the reusable picker must focus the current value');
assert.strictEqual(nodes['choice-dialog-list'].children[1].className, 'choice-dialog-option is-selected is-focused', 'the applied option must also receive the initial focus');
assert.strictEqual(nodes['choice-dialog-list'].children[1].attributes['aria-selected'], 'true', 'the applied option must expose its selected state');
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 39, 'the selected option must stay centered while the list is scrollable');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].className, 'choice-dialog-swatch', 'color choices must render a reusable swatch icon');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].style.backgroundColor, '#a66cff', 'the picker swatch must use the choice color');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[1].textContent, 'Japanese (AC3 5.1)', 'swatch choices must retain their complete text label');
view.move(-1);
assert.strictEqual(view.selected().value, 'a', 'remote navigation must move through choices');
assert.strictEqual(nodes['choice-dialog-list'].children[0].children[0].className, 'language-flag language-flag-en', 'language choices must render a shared flag before their label');
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 0, 'the first option must remain visible at the top of the list');
assert.strictEqual(nodes['choice-dialog-list'].children[0].className, 'choice-dialog-option is-focused', 'moving focus must not apply the highlighted option');
assert.strictEqual(nodes['choice-dialog-list'].children[1].className, 'choice-dialog-option is-selected', 'the applied option must remain marked while focus moves');
var pointerTarget = nodes['choice-dialog-list'].children[1];
view.focus(1);
assert.strictEqual(view.selected().value, 'b', 'pointer focus must select an option without applying it');
assert.strictEqual(nodes['choice-dialog-list'].children[1], pointerTarget, 'pointer focus must preserve the hovered DOM target until click completes');
assert.strictEqual(nodes['choice-dialog-list'].children[0].className, 'choice-dialog-option', 'pointer focus must clear the previous focus without rebuilding choices');
assert.strictEqual(pointerTarget.className, 'choice-dialog-option is-selected is-focused', 'pointer focus must update focus classes in place');
view.focus(2);
assert.strictEqual(view.selected(), null, 'the visible Cancel action must not expose an applied choice');
assert.strictEqual(nodes['choice-dialog-cancel'].className, 'is-focused', 'Cancel must participate in remote and pointer focus');
assert.strictEqual(nodes['choice-dialog-cancel'].textContent, 'Cancel', 'Cancel must be localized by the shared dialog');
view.close();
assert.ok(/is-hidden/.test(nodes['choice-dialog'].className), 'closing the picker must hide its shared dialog');
assert.strictEqual(nodes['choice-dialog'].attributes['aria-hidden'], 'true', 'closing the picker must hide it from accessibility APIs');
view.open('Settings backup', [
  { value: 'save', label: 'Save settings', status: 'matched' },
  { value: 'other', label: 'Other action', status: 'unmatched' }
], 'save');
assert.ok(/has-status/.test(nodes['choice-dialog-list'].children[0].className), 'backup status options must expose a dedicated status class');
assert.ok(/is-matched/.test(nodes['choice-dialog-list'].children[0].className), 'a matching backup must expose the matched status');
assert.strictEqual(nodes['choice-dialog-list'].children[0].children[0].className, 'choice-dialog-status is-matched', 'matching backups must render a green status marker');
assert.strictEqual(nodes['choice-dialog-list'].children[0].children[0].textContent, '\u2713', 'matching backups must render a check marker');
assert.ok(/is-unmatched/.test(nodes['choice-dialog-list'].children[1].className), 'an out-of-date backup must expose the unmatched status');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].className, 'choice-dialog-status is-unmatched', 'out-of-date backups must render a red status marker');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].textContent, '\u00d7', 'out-of-date backups must render a cross marker');
view.close();
nodes['choice-dialog-list'].clientHeight = 198;
nodes['choice-dialog-list'].scrollHeight = 446;
view.open('Poster size', [
  { value: 70, label: '70%' }, { value: 80, label: '80%' }, { value: 90, label: '90%' },
  { value: 100, label: '100%' }, { value: 110, label: '110%' }, { value: 120, label: '120%' },
  { value: 130, label: '130%' }
], 100, 'card-scale');
assert.strictEqual(nodes['choice-dialog-preview'].className, 'choice-dialog-preview is-card-scale', 'visual settings must expose their dedicated preview');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-value'], '100', 'the preview must reflect the focused value');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-source'], 'media-cards', 'card size preview must reuse rendered media cards when available');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].children.length, 1, 'card size preview must show one real media example');
assert.ok(/choice-card-preview-item/.test(nodes['choice-dialog-preview'].children[0].children[0].className), 'reused cards must receive isolated preview styling');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].style['--poster-card-width'], CardLayout.profile(100).metrics.width + 'px', 'preview must use the real card width for the selected scale');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].children[0].style.transform, 'none', 'preview must keep the real card scale');
assert.strictEqual(nodes['choice-dialog-preview'].style.height, '', 'the card preview surface must keep its fixed pane size');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].style.height, CardLayout.profile(100).metrics.height + 16 + 'px', 'only the card row must follow the selected card height');
assert.ok(/is-card-preview-list/.test(nodes['choice-dialog-list'].className), 'card preview choices must use the full-height list beside the card');
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 0, 'all card sizes must remain visible without scrolling the choices');
view.move(-1);
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-value'], '90', 'moving without applying must update the preview immediately');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].style['--poster-card-width'], CardLayout.profile(90).metrics.width + 'px', 'preview must update real card metrics while moving through scales');
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 0, 'moving through card sizes must not scroll the full-height list');
view.focus(0);
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 0, 'the first choice must stay at the top edge');
view.focus(6);
assert.strictEqual(nodes['choice-dialog-list'].scrollTop, 0, 'the last card size must remain visible without scrolling');
view.focus(3);
view.focus(7);
assert.strictEqual(view.snapshot().index, 7, 'the Cancel action must follow the scale choices');
assert.strictEqual(nodes['choice-dialog-preview'].className, 'choice-dialog-preview is-card-scale', 'the preview must remain visible while Cancel has focus');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-value'], '100', 'Cancel focus must preserve the last previewed scale');
view.close();
view.open('Artwork quality', [{ value: 70, label: '70%' }, { value: 90, label: '90%' }, { value: 100, label: '100%' }], 90, 'artwork-quality', { cardScale: 120 });
assert.strictEqual(nodes['choice-dialog-preview'].className, 'choice-dialog-preview is-artwork-quality', 'artwork quality must reuse the card preview surface');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-source'], 'media-cards', 'artwork quality must preview real media cards');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-value'], '90', 'artwork quality preview must reflect the focused value');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].style['--poster-card-width'], CardLayout.profile(120).metrics.width + 'px', 'artwork quality preview must use the configured card size');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].children[0].children[0].src, 'https://example.test/poster-0?width=268&height=400', 'artwork preview must request the focused quality at the configured card size');
view.move(-1);
assert.strictEqual(nodes['choice-dialog-preview'].children[0].children[0].children[0].src, 'https://example.test/poster-0?width=209&height=311', 'artwork preview must reload at each newly focused quality without changing card size');
view.close();
view.open('Backdrop quality', [{ value: 50, label: '50%' }, { value: 85, label: '85%' }, { value: 100, label: '100%' }], 85, 'backdrop-quality');
assert.strictEqual(nodes['choice-dialog-preview'].className, 'choice-dialog-preview is-backdrop-quality', 'backdrop quality must use its full-width preview surface');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-source'], 'backdrop', 'backdrop quality must preview an existing backdrop');
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-value'], '85', 'backdrop quality preview must reflect the focused value');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].src, 'https://example.test/photo?width=1632&height=918', 'full-screen backdrop preview must request the selected quality at the real 1080p reference size');
assert.ok(/is-backdrop-quality/.test(nodes['choice-dialog'].className), 'backdrop quality must expose its dedicated full-screen presentation');
view.close();
realBackdrops.splice(0, realBackdrops.length);
realBackdrops.push(node());
realBackdrops[0].className = 'backdrop-image is-active';
realBackdrops[0].src = '';
realBackdrops[0].cloneNode = function () {
  var clone = node();
  clone.className = realBackdrops[0].className;
  clone.src = '';
  return clone;
};
view.open('Backdrop quality', [{ value: 50, label: '50%' }, { value: 100, label: '100%' }], 100, 'backdrop-quality', {
  backdropUrl: 'https://example.test/server-sample?width=1280&height=720'
});
assert.strictEqual(nodes['choice-dialog-preview'].attributes['data-preview-source'], 'server-backdrop', 'backdrop preview must use the server sample when no rendered backdrop is available');
assert.strictEqual(nodes['choice-dialog-preview'].children[0].src, 'https://example.test/server-sample?width=1920&height=1080', 'server backdrop samples must receive the selected full-screen quality');
view.close();
view.open('Exit Ploff', [{ value: 'exit', label: 'Exit' }], 'exit', 'full-screen');
assert.ok(/is-full-screen/.test(nodes['choice-dialog'].className), 'the exit confirmation must support the full-screen shared dialog presentation');
view.close();

console.log('Choice dialog view checks passed');
