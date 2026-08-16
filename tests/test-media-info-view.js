'use strict';

var assert = require('assert');
var MediaInfoView = require('../app/media-info-view');

function node(id) {
  return {
    id: id, className: 'is-hidden', textContent: '', innerHTML: '', scrollTop: 40, scrollHeight: 600, clientHeight: 200, children: [], disabled: false,
    appendChild: function (child) { this.children.push(child); },
    removeChild: function (child) { this.children.splice(this.children.indexOf(child), 1); },
    attributes: {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getAttribute: function (key) { return this.attributes[key] || ''; },
    focus: function () { this.focused = true; },
    get firstChild() { return this.children[0]; }
  };
}
var nodes = {};
[
  'media-info-dialog', 'media-info-dialog-title', 'media-info-dialog-content', 'media-info-dialog-hint', 'media-info-dialog-close',
  'media-info-dialog-version-browser', 'media-info-dialog-version-prev', 'media-info-dialog-version-value', 'media-info-dialog-version-next',
  'media-info-dialog-version-count', 'media-info-dialog-version-state', 'media-info-dialog-apply'
].forEach(function (id) { nodes[id] = node(id); });
var view = MediaInfoView.create({
  document: {
    getElementById: function (id) { return nodes[id]; },
    createElement: function (tagName) { return { tagName: tagName, className: '', textContent: '', children: [], appendChild: function (child) { this.children.push(child); } }; }
  },
  t: function (key) { return key; }
});

assert.strictEqual(view.open({ sections: [
  { title: 'File', column: 'left', rows: [{ label: 'Name', value: 'Movie.mkv' }] },
  { title: 'Video', column: 'left', rows: [{ label: 'Codec', value: 'HEVC' }] },
  { title: 'Audio', column: 'right', rows: [{ label: 'Track', value: 'Italiano' }] },
  { title: 'Subtitles', column: 'right', rows: [{ label: 'Track', value: 'English' }] }
] }), true, 'the media dialog must open with a model');
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog', 'opening must make the dialog visible');
assert.strictEqual(nodes['media-info-dialog-close'].textContent, 'common.close', 'the media dialog must expose the shared localized Close command');
assert.strictEqual(nodes['media-info-dialog'].getAttribute('aria-hidden'), 'false', 'opening must expose dialog semantics');
assert.strictEqual(nodes['media-info-dialog-content'].children.length, 2, 'the dialog must render independent technical columns');
assert.strictEqual(nodes['media-info-dialog-content'].children[0].className, 'media-info-dialog-column media-info-dialog-column-left', 'file and video sections must stack in the left column');
assert.strictEqual(nodes['media-info-dialog-content'].children[1].className, 'media-info-dialog-column media-info-dialog-column-right', 'audio and subtitle sections must stack in the right column');
assert.strictEqual(nodes['media-info-dialog-content'].children[0].children.length, 2, 'the left technical column must retain its own section stack');
assert.strictEqual(nodes['media-info-dialog-content'].children[1].children.length, 2, 'the right technical column must retain its own section stack');
view.scroll(1);
assert.ok(nodes['media-info-dialog-content'].scrollTop > 40, 'the dialog must support remote scrolling');
view.close();
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog is-hidden', 'closing must restore the hidden state');
assert.strictEqual(nodes['media-info-dialog'].getAttribute('aria-hidden'), 'true', 'closing must hide dialog semantics');

assert.strictEqual(view.openVersions({
  model: { sections: [
    { title: 'File', column: 'left', rows: [{ label: 'Name', value: 'Version-2.mkv' }] },
    { title: 'Audio', column: 'right', rows: [{ label: 'Track', value: 'Italiano' }] }
  ] },
  label: '1080p · HEVC', index: 1, count: 3, active: false, canCycle: true, showApply: true, focus: 'selector'
}), true, 'the shared media dialog must support a version-browser mode');
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog is-version-browser', 'version browsing must expose a dedicated dialog layout state');
assert.strictEqual(nodes['media-info-dialog-version-browser'].className, 'media-info-dialog-version-browser', 'the version selector must become visible');
assert.strictEqual(nodes['media-info-dialog-version-value'].textContent, '1080p · HEVC', 'the selector must show the previewed version label');
assert.strictEqual(nodes['media-info-dialog-version-count'].textContent, '2 / 3', 'the selector must expose the preview position');
assert.strictEqual(nodes['media-info-dialog-version-state'].textContent, 'mediaDetails.preview', 'non-selected versions must be identified as previews');
assert.strictEqual(nodes['media-info-dialog-close'].textContent, 'common.cancel', 'version browsing must expose Cancel rather than a generic Close');
assert.strictEqual(nodes['media-info-dialog-apply'].textContent, 'mediaDetails.useVersion', 'multi-version browsing must expose an explicit apply action');
assert.strictEqual(nodes['media-info-dialog-apply'].className.indexOf('is-hidden'), -1, 'the apply action must be visible when another version can be selected');
assert.strictEqual(nodes['media-info-dialog-version-value'].focused, true, 'the version selector must own initial D-pad focus');

view.updateVersions({
  model: { sections: [{ title: 'File', column: 'left', rows: [{ label: 'Name', value: 'Version-1.mkv' }] }] },
  label: 'Automatic · 4K', index: 0, count: 3, active: true, canCycle: true, showApply: true, focus: 'content'
});
assert.strictEqual(nodes['media-info-dialog-version-state'].textContent, 'mediaDetails.active', 'the selected choice must be identified as active');
assert.strictEqual(nodes['media-info-dialog-content'].scrollTop, 0, 'changing version preview must reset technical details to the top');
assert.ok(nodes['media-info-dialog-content'].className.indexOf('is-focused') !== -1, 'content scrolling must expose a visible logical focus state');
nodes['media-info-dialog-content'].scrollTop = 400;
assert.strictEqual(view.scroll(1), false, 'scrolling at the bottom must report the boundary to the controller');
assert.strictEqual(view.scroll(-1), true, 'scrolling away from a boundary must report actual movement');

view.updateVersions({
  model: { sections: [] }, label: '1080p', index: 0, count: 1, active: true, canCycle: false, showApply: false, focus: 'cancel'
});
assert.ok(nodes['media-info-dialog-version-prev'].className.indexOf('is-hidden') !== -1 && nodes['media-info-dialog-version-next'].className.indexOf('is-hidden') !== -1, 'single-file media must not show meaningless carousel arrows');
assert.ok(nodes['media-info-dialog-apply'].className.indexOf('is-hidden') !== -1, 'single-file media must not expose a fake apply action');
assert.strictEqual(nodes['media-info-dialog-close'].focused, true, 'Cancel must remain reachable with the D-pad in single-file mode');

console.log('Media info view checks passed');
