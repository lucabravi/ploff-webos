'use strict';

var assert = require('assert');
var SubtitleEditorView = require('../app/subtitle-editor-view');
function node(name) { return { id: name, className: '', textContent: '', innerHTML: '', style: {}, children: [], attributes: {}, appendChild: function (child) { this.children.push(child); }, focus: function () { this.focused = true; }, getAttribute: function (key) { return this.attributes[key] || ''; }, setAttribute: function (key, value) { this.attributes[key] = String(value); } }; }
var nodes = {};
['subtitle-preview-overlay', 'subtitle-editor', 'subtitle-editor-status', 'subtitle-editor-track', 'subtitle-editor-size', 'subtitle-editor-background', 'subtitle-editor-edge', 'subtitle-editor-render-srt', 'subtitle-editor-render-ass', 'subtitle-editor-offset', 'subtitle-editor-timeline-progress', 'subtitle-editor-current-time', 'subtitle-editor-duration'].forEach(function (id) { nodes[id] = node(id); });
var controls = [node('track'), node('size'), node('background'), node('edge'), node('render-srt'), node('render-ass'), node('offset'), node('loop'), node('timeline'), node('reset'), node('cancel'), node('apply-season'), node('apply')];
controls[0].attributes['data-subtitle-editor'] = 'track'; controls[1].attributes['data-subtitle-editor'] = 'size'; controls[2].attributes['data-subtitle-editor'] = 'background'; controls[3].attributes['data-subtitle-editor'] = 'edge'; controls[4].attributes['data-subtitle-editor'] = 'render-srt'; controls[5].attributes['data-subtitle-editor'] = 'render-ass'; controls[6].attributes['data-subtitle-editor'] = 'offset'; controls[7].attributes['data-subtitle-editor'] = 'loop'; controls[8].attributes['data-subtitle-editor'] = 'timeline'; controls[9].attributes['data-subtitle-editor'] = 'reset'; controls[10].attributes['data-subtitle-editor'] = 'cancel'; controls[11].attributes['data-subtitle-editor'] = 'apply-season'; controls[12].attributes['data-subtitle-editor'] = 'apply';
var documentRef = {
  getElementById: function (id) { return nodes[id]; }, querySelectorAll: function () { return controls; },
  createElement: function (tag) { return node(tag); }, createTextNode: function (text) { return { textContent: text }; }
};
var activeCues = [{ text: '<i>Hello</i><br>World' }];
var view = SubtitleEditorView.create({ document: documentRef, SubtitleSync: { active: function () { return activeCues; } } });
view.setOpen(true);
view.render({ status: 'Ready', track: 'Italian', size: 125, background: 'Medio', edge: 'Contorno', renderSrt: true, renderSrtValue: 'Attivo', renderAss: false, renderAssValue: 'Disattivato', offsetMs: 200, progress: 42, currentTime: '10:00', duration: '24:00', index: 6, loop: true, editing: 'offset', seasonAvailable: true, pointerActive: false });
assert.strictEqual(nodes['subtitle-editor'].className, 'subtitle-editor', 'opening the editor must expose its surface');
assert.strictEqual(nodes['subtitle-editor'].getAttribute('aria-hidden'), 'false', 'opening the editor must expose its dialog semantics');
assert.strictEqual(nodes['subtitle-editor-offset'].textContent, '+200 ms', 'subtitle offsets must use a signed readable label');
assert.strictEqual(nodes['subtitle-editor-timeline-progress'].style.width, '42%', 'preview progress must be bounded and rendered');
assert.strictEqual(nodes['subtitle-editor-current-time'].textContent, '10:00', 'the editor timeline must expose the current playback time');
assert.strictEqual(nodes['subtitle-editor-background'].textContent, 'Medio', 'the editor must render the shared subtitle background choice');
assert.strictEqual(nodes['subtitle-editor-edge'].textContent, 'Contorno', 'the editor must render the shared subtitle edge choice');
assert.strictEqual(nodes['subtitle-editor-render-srt'].textContent, 'Attivo', 'the editor must expose the SRT renderer state');
assert.strictEqual(nodes['subtitle-editor-render-ass'].textContent, 'Disattivato', 'the editor must expose the ASS renderer state');
assert.strictEqual(controls[4].attributes['aria-pressed'], 'true', 'the SRT renderer toggle must expose its checked state');
assert.strictEqual(controls[5].attributes['aria-pressed'], 'false', 'the ASS renderer toggle must expose its unchecked state');
assert.ok(controls[4].className.indexOf('is-checked') !== -1 && controls[5].className.indexOf('is-checked') === -1, 'renderer toggles must render a visible checked state');
assert.ok(controls[6].className.indexOf('is-focused') !== -1 && controls[6].className.indexOf('is-editing') !== -1, 'Offset must expose focused edit mode distinctly');
assert.strictEqual(controls[6].attributes['aria-pressed'], 'true', 'Offset edit mode must be exposed to assistive technology');
assert.ok(controls[7].className.indexOf('is-active') !== -1, 'Loop must retain its active state independently of focus');
assert.strictEqual(controls[11].disabled, false, 'season apply must be available for episodic playback');
view.render({
  status: 'ASS', track: 'Embedded ASS', size: 100, background: 'Off', edge: 'Shadow',
  renderSrt: false, renderSrtValue: 'Disabled', renderAss: true, renderAssValue: 'Enabled',
  offsetMs: 0, progress: 10, currentTime: '1:00', duration: '10:00', index: 6, loop: false,
  editing: '', seasonAvailable: true, pointerActive: false,
  capabilities: {
    track: true, size: true, background: false, edge: false, 'render-srt': false,
    'render-ass': true, offset: true, loop: true, timeline: true, reset: true,
    cancel: true, 'apply-season': true, apply: true
  }
});
assert.strictEqual(controls[1].disabled, false, 'local ASS size must remain available');
assert.strictEqual(controls[2].disabled, true, 'ASS background must be disabled because libass owns style');
assert.strictEqual(controls[3].disabled, true, 'ASS edge must be disabled because libass owns style');
assert.strictEqual(controls[4].disabled, true, 'SRT renderer control must be disabled when the media has no text tracks');
assert.strictEqual(controls[5].disabled, false, 'ASS renderer control must remain available when the media has ASS tracks');
assert.strictEqual(controls[2].attributes['aria-disabled'], 'true', 'disabled controls must expose aria-disabled');
assert.ok(controls[2].className.indexOf('is-disabled') !== -1, 'disabled subtitle editor controls must render a visible disabled state');
assert.ok(controls[6].className.indexOf('is-focused') !== -1, 'an enabled timing control must retain focus');
view.render({
  status: 'Off', track: 'Off', size: 100, background: 'Off', edge: 'Shadow',
  renderSrt: true, renderSrtValue: 'Enabled', renderAss: true, renderAssValue: 'Enabled',
  offsetMs: 0, progress: 0, currentTime: '0:00', duration: '10:00', index: 6, loop: false,
  editing: 'offset', seasonAvailable: true, pointerActive: false,
  capabilities: {
    track: true, size: false, background: false, edge: false, 'render-srt': true,
    'render-ass': true, offset: false, loop: false, timeline: false, reset: true,
    cancel: true, 'apply-season': true, apply: true
  }
});
assert.ok(controls[6].className.indexOf('is-editing') === -1,
  'a control that becomes disabled must not retain a visual editing state');
assert.strictEqual(controls[6].attributes['aria-pressed'], 'false',
  'a disabled timing control must not remain exposed as actively edited');
view.renderOverlay([], 1000, 0, 125);
assert.strictEqual(nodes['subtitle-preview-overlay'].children[0].children[0].textContent, 'Hello', 'subtitle preview must strip embedded markup');
assert.strictEqual(nodes['subtitle-preview-overlay'].style.fontSize, '53px', 'subtitle preview must apply the selected size');
activeCues = [{ text: 'Top cue', alignment: 8 }];
view.renderOverlay([], 1000, 0, 100);
assert.ok(nodes['subtitle-preview-overlay'].className.indexOf('srt-align-top') !== -1, 'ASS alignment 8 must move SRT subtitles to the top');
assert.ok(nodes['subtitle-preview-overlay'].className.indexOf('srt-align-center') !== -1, 'ASS alignment 8 must keep SRT subtitles centered');
assert.strictEqual(nodes['subtitle-preview-overlay'].children[1].children[0].textContent, 'Top cue', 'normalized SRT text must be rendered without the ASS tag');
view.setOpen(false);
assert.strictEqual(nodes['subtitle-editor'].getAttribute('aria-hidden'), 'true', 'closing the editor must hide its dialog semantics');

console.log('Subtitle editor view checks passed');
