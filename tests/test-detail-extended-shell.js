'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
var styles = fs.readFileSync(path.join(root, 'app', 'styles', 'core.css'), 'utf8');
var application = fs.readFileSync(path.join(root, 'app', 'coordinator', 'application-controller.js'), 'utf8');

assert.ok(/detail-extended-view\.js\?v=dev[\s\S]*app\.js\?v=dev/.test(html), 'the lazy extended-detail view must load before the generated application bundle');
assert.ok(/id="detail-view"[\s\S]*id="detail-snap-track"[\s\S]*id="detail-primary-pane"[\s\S]*id="episode-strip"[\s\S]*id="detail-more-indicator"[\s\S]*id="detail-extended-pane"/.test(html), 'detail markup must keep the existing primary content and add one lower snap viewport');
[
  'detail-extended-anchor', 'detail-extended-title', 'detail-extended-genres-label', 'detail-extended-genres-value',
  'detail-extended-directors-label', 'detail-extended-directors-value', 'detail-cast-title', 'detail-cast-strip',
  'detail-extras-title', 'detail-extras-status', 'detail-extras-strip'
].forEach(function (id) {
  assert.ok(html.indexOf('id="' + id + '"') !== -1, id + ' must exist in the lower detail viewport');
});
assert.ok(/\.detail-snap-track\s*\{[^}]*height:\s*200%[^}]*transform:\s*translate(?:3d)?\([^}]*0/.test(styles), 'detail must use one fixed two-viewport snap track rather than browser scrolling');
assert.ok(/\.detail-view\.is-extended \.detail-snap-track\s*\{[^}]*transform:\s*translate(?:Y|3d)\([^}]*-50%/.test(styles), 'extended detail must snap the track down by exactly one viewport');
assert.ok(/\.detail-extended-pane\s*\{[^}]*overflow:\s*hidden/.test(styles), 'the lower detail viewport must remain bounded and must not become a scrolling page');
assert.ok(/\.detail-extra-card\.is-focused:after\s*\{[^}]*position:\s*absolute[^}]*border:\s*5px solid var\(--focus-color/.test(styles), 'focused extras must paint the focus ring above their opaque artwork instead of hiding the top edge behind the image');
assert.ok(/\.detail-more-indicator/.test(styles), 'the primary viewport must show a subtle affordance that more content exists below');
assert.ok(/\.episode-strip\s*\{[^}]*bottom:\s*4%[^}]*height:\s*230px/.test(styles), 'the episode strip must grow upward by 44px while keeping its bottom anchor');
assert.ok(/\.episode-card\s*\{[^}]*height:\s*212px/.test(styles), 'episode cards must retain the 44px caption below a 168px artwork');
assert.ok(/\.episode-image\s*\{[^}]*height:\s*168px/.test(styles), 'episode artwork must recover the 44px previously reserved from the image');
assert.ok(/\.episode-duration-badge\s*\{[^}]*top:\s*134px/.test(styles), 'episode duration must sit 6px above the artwork bottom edge');
assert.ok(/\.episode-progress-track\s*\{[^}]*top:\s*168px/.test(styles), 'episode progress must sit immediately below the 168px artwork and consume the first 6px of caption space');
assert.ok(/PloffDetailExtendedView/.test(application) && /DetailExtendedView:\s*DetailExtendedView/.test(application), 'the application composition root must inject the extended-detail view into the Detail feature');
assert.ok(/requestStandalonePlayback:\s*function\s*\(request\)\s*\{[^}]*requestPlayer\('standalone', request\)/.test(application), 'the application composition root must route playable extras through the Player standalone path');

console.log('Detail extended shell checks passed');
