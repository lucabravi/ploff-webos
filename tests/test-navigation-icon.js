'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var NavigationIcon = require('../app/navigation-icon');

['home', 'movie', 'tv', 'anime', 'documentary', 'kids', 'music', 'folder', 'star', 'search', 'settings'].forEach(function (name) {
  var markup = NavigationIcon.svg(name);
  assert.ok(markup.indexOf('<svg') === 0, name + ' must render as inline SVG');
  assert.ok(markup.indexOf('aria-hidden="true"') !== -1, name + ' icon must remain decorative');
  assert.strictEqual(markup.indexOf('http'), -1, name + ' icon must not depend on external resources');
});
assert.strictEqual(NavigationIcon.normalize('unknown'), 'folder', 'unknown icons must fall back to the generic library icon');
assert.strictEqual(NavigationIcon.normalize('settings'), 'settings', 'fixed navigation icons must stay addressable');
assert.ok(NavigationIcon.svg('home').indexOf('M5 12l-2 0l9 -9l9 9l-2 0') !== -1, 'Home must use the Tabler home-2 outline');
assert.ok(NavigationIcon.svg('search').indexOf('M3 10a7 7 0 1 0 14 0') !== -1, 'Search must use the Tabler search outline');
assert.ok(NavigationIcon.svg('settings').indexOf('M10.325 4.317c.426 -1.756') !== -1, 'Settings must use the Tabler settings outline');
assert.ok(NavigationIcon.svg('anime').indexOf('M16 18a2 2 0 0 1 2 2') !== -1, 'Anime must use the Tabler sparkles outline');
assert.ok(NavigationIcon.svg('back').indexOf('M16 4 8 12l8 8') !== -1, 'Back must use the same chevron as lateral scrolling');
var navigationCss = fs.readFileSync(path.join(__dirname, '../app/styles/core.css'), 'utf8');
var notices = fs.readFileSync(path.join(__dirname, '../app/vendor/THIRD_PARTY_NOTICES.txt'), 'utf8');
var tablerLicense = fs.readFileSync(path.join(__dirname, '../app/vendor/tabler-icons.LICENSE.txt'), 'utf8');
assert.ok(notices.indexOf('Tabler Icons') !== -1, 'packaged third-party notices must attribute Tabler Icons');
assert.ok(tablerLicense.indexOf('MIT License') !== -1 && tablerLicense.indexOf('Paweł Kuna') !== -1, 'the packaged Tabler MIT license must retain its copyright notice');
assert.strictEqual(/\.nav-icon-home[\s\S]{0,100}fill:currentColor/.test(navigationCss), false, 'Tabler Home must not be forced into a filled icon');
assert.strictEqual(/\.nav-icon-star[\s\S]{0,100}fill:currentColor/.test(navigationCss), false, 'Tabler Star must not be forced into a filled icon');

console.log('Navigation icon checks passed');
