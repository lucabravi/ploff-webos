'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'app', 'navbar-window.js');

assert.ok(fs.existsSync(modulePath), 'navbar window module must exist');

var NavbarWindow = require(modulePath);

assert.deepStrictEqual(NavbarWindow.calculate([80, 90], 200, 0, 0), {
  start: 0, end: 2, canScrollLeft: false, canScrollRight: false
}, 'all libraries must remain visible when they fit');

assert.deepStrictEqual(NavbarWindow.calculate([80, 90], 200, 1, 1), {
  start: 0, end: 2, canScrollLeft: false, canScrollRight: false
}, 'a stale scrolled start must reset when every library fits again');

assert.deepStrictEqual(NavbarWindow.calculate([100, 120, 90], 230, 2, 0), {
  start: 1, end: 3, canScrollLeft: true, canScrollRight: false
}, 'focusing a hidden library on the right must advance the window');

assert.deepStrictEqual(NavbarWindow.calculate([100, 120, 90], 210, 0, 1), {
  start: 0, end: 1, canScrollLeft: false, canScrollRight: true
}, 'focusing a hidden library on the left must rewind the window');

assert.deepStrictEqual(NavbarWindow.calculate([300, 70], 180, 0, 0), {
  start: 0, end: 1, canScrollLeft: false, canScrollRight: true
}, 'one oversized library must remain visible by itself');

assert.deepStrictEqual(NavbarWindow.calculate([], 200, 0, 0), {
  start: 0, end: 0, canScrollLeft: false, canScrollRight: false
}, 'an empty library list must produce an empty window');

assert.deepStrictEqual(NavbarWindow.calculate([80, 80, 80, 80], 170, 2, 1), {
  start: 1, end: 3, canScrollLeft: true, canScrollRight: true
}, 'the previous window start must remain stable while focus is visible');

assert.deepStrictEqual(NavbarWindow.trailingPreview([100, 180, 90], 230, {
  start: 0, end: 1, canScrollLeft: false, canScrollRight: true
}, 48), { index: 1, visibleWidth: 130, clippedWidth: 50 },
'unused navbar width must reveal and fade the next library instead of leaving an empty gap');

assert.strictEqual(NavbarWindow.trailingPreview([190, 180], 230, {
  start: 0, end: 1, canScrollLeft: false, canScrollRight: true
}, 48), null,
'a next library must not be previewed when less than the minimum useful width remains');

assert.strictEqual(NavbarWindow.trailingPreview([100, 90], 230, {
  start: 0, end: 2, canScrollLeft: false, canScrollRight: false
}, 48), null,
'a complete navbar window must not create a trailing preview');

assert.deepStrictEqual(NavbarWindow.scrolledAlignment([100, 120, 90], 230, {
  start: 1, end: 3, canScrollLeft: true, canScrollRight: false
}, 9), { start: 0, leadingClip: 89 },
'the final library must align to the right while retaining a clipped tail of the preceding tab');

assert.deepStrictEqual(NavbarWindow.scrolledAlignment([80, 80, 80, 80], 170, {
  start: 1, end: 3, canScrollLeft: true, canScrollRight: true
}, 4), { start: 0, leadingClip: 74 },
'every scrolled Library window must align right and retain a clipped preceding tab');

assert.strictEqual(NavbarWindow.scrolledAlignment([100, 120, 90], 230, {
  start: 0, end: 2, canScrollLeft: false, canScrollRight: true
}), null, 'non-terminal library windows must keep their ordinary left alignment');

assert.strictEqual(NavbarWindow.rightEdgeCorrection(1130.5625, 1137.953125, 5), 12.390625,
  'post-layout reconciliation must include both real overflow and the configured focus gutter');
assert.strictEqual(NavbarWindow.rightEdgeCorrection(1130.5625, 1120, 5), 0,
  'post-layout reconciliation must not move a library window already inside its safe edge');

assert.strictEqual(NavbarWindow.focusShadowOutset('rgb(255, 255, 255) 0px 0px 0px 5px inset'), 0,
  'inset-only focus rings must not reserve external shadow space');
assert.strictEqual(NavbarWindow.focusShadowOutset('rgb(4, 23, 19) 0px 0px 0px 2px inset, rgb(82, 236, 193) 0px 0px 0px 5px inset, rgba(66, 235, 182, 0.38) 0px 0px 22px 0px'), 33,
  'theme glow width must be derived from the computed multi-shadow value');
assert.strictEqual(NavbarWindow.focusShadowOutset('rgba(0, 0, 0, 0.5) 3px 0px 8px 2px'), 17,
  'positive horizontal offset, blur and spread must all contribute to the right outset');

console.log('Navbar window checks passed');
