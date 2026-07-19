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

console.log('Navbar window checks passed');
