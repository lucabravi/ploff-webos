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
  'detail-extended-directors-row', 'detail-extended-directors-label', 'detail-extended-directors-value', 'detail-cast-title', 'detail-cast-strip',
  'detail-cast-overflow-left', 'detail-cast-overflow-right',
  'detail-extras-title', 'detail-extras-status', 'detail-extras-strip', 'detail-extras-overflow-left', 'detail-extras-overflow-right',
  'episode-overflow-left', 'episode-overflow-right'
].forEach(function (id) {
  assert.ok(html.indexOf('id="' + id + '"') !== -1, id + ' must exist in the lower detail viewport');
});
assert.ok(/\.detail-snap-track\s*\{[^}]*height:\s*200%[^}]*transform:\s*translate(?:3d)?\([^}]*0/.test(styles), 'detail must use one fixed two-viewport snap track rather than browser scrolling');
assert.ok(/\.detail-view\.is-extended \.detail-snap-track\s*\{[^}]*transform:\s*translate(?:Y|3d)\([^}]*-50%/.test(styles), 'extended detail must snap the track down by exactly one viewport');
assert.ok(/\.detail-view\.is-snap-restoring \.detail-snap-track\s*\{[^}]*transition:\s*none/.test(styles), 'returning from playback must restore the selected detail viewport without animating from the top');
assert.ok(/\.detail-row-overflow-button\.is-visible\s*\{[^}]*display:\s*flex/.test(styles), 'row scrolling arrows must appear only when their direction has more items');
assert.ok(/\.detail-arrow-button\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;[^}]*border-radius:\s*var\(--theme-corner-radius\)/.test(styles), 'Back and all detail-row arrows must share one theme-rounded square style');
assert.ok(/class="detail-back detail-arrow-button"/.test(html) && (html.match(/class="detail-row-overflow-button detail-arrow-button/g) || []).length === 6, 'Back and every row arrow must use the shared arrow style');
assert.ok(/id="detail-back"[\s\S]*?M16 4 8 12l8 8[\s\S]*?<\/button>/.test(html), 'detail Back must use the same left chevron as row scrolling');
assert.ok(/id="app-settings-back" class="app-settings-back detail-arrow-button is-hidden"/.test(html), 'Settings Back must use the same shared arrow style');
assert.ok(/\.detail-arrow-button:hover[^}]*box-shadow:\s*inset 0 0 0 4px #fff/.test(styles), 'hover ring must match the 4px episode focus ring');
assert.ok(/\.detail-arrow-button\.is-focused[^}]*box-shadow:\s*inset 0 0 0 4px #fff/.test(styles), 'remote focus must stay visible without a resting arrow border');
assert.ok(/\.detail-heading\s*\{[^}]*position:\s*relative/.test(styles) && /\.detail-back\s*\{[^}]*left:\s*-70px/.test(styles), 'Back must sit outside the shared left content edge without offsetting the title');
assert.ok(/\.app-settings-heading\s*\{[^}]*position:\s*relative/.test(styles) && /\.app-settings-back\s*\{[^}]*position:\s*absolute;[^}]*left:\s*-70px/.test(styles), 'Settings Back must sit outside the submenu title alignment');
assert.ok(/\.detail-summary-button\s*\{[^}]*padding:\s*8px 38px 8px 0/.test(styles), 'synopsis text must share the title and actions left edge');
assert.ok(/\.season-tab\s*\{[^}]*border-radius:\s*var\(--theme-corner-radius\)/.test(styles), 'season buttons must use the shared corner radius');
assert.ok(/detail-cast-overflow-left[\s\S]*<svg class="detail-row-overflow-icon"[\s\S]*detail-cast-overflow-right[\s\S]*<svg class="detail-row-overflow-icon"/.test(html), 'cast overflow controls must use centered, theme-neutral vector chevrons');
assert.ok(/\.detail-cast-overflow-left, \.detail-extras-overflow-left\s*\{[^}]*left:\s*0/.test(styles) && /\.detail-cast-overflow-right, \.detail-extras-overflow-right\s*\{[^}]*right:\s*8px/.test(styles), 'cast and extra arrows must share measured symmetric spacing');
assert.ok(/\.detail-summary-button\s*\{[^}]*border-radius:\s*var\(--theme-corner-radius\)/.test(styles), 'the synopsis control must use the active theme corner radius');
assert.ok(/\.detail-extended-pane\s*\{[^}]*overflow:\s*hidden/.test(styles), 'the lower detail viewport must remain bounded and must not become a scrolling page');
assert.ok(/\.detail-extended-metadata-row\.is-hidden,[\s\S]*?\.detail-extended-section\.is-hidden\s*\{\s*display:\s*none\s*;\s*\}/.test(styles), 'empty directors metadata and extras sections must remain hidden despite their flex layout rules');
assert.ok(/\.detail-cast-card\.is-focused:after,[\s\S]*?\.detail-extra-card\.is-focused:after\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*1[^}]*border:\s*4px solid #fff/.test(styles), 'focused cast and extras must paint a shared white focus ring above their artwork');
assert.ok(/\.detail-more-indicator/.test(styles), 'the primary viewport must show a subtle affordance that more content exists below');
assert.ok(/\.episode-viewport\s*\{[^}]*bottom:\s*4%[^}]*height:\s*230px/.test(styles), 'the episode viewport must grow upward by 44px while keeping its bottom anchor');
assert.ok(/\.episode-overflow-left\s*\{[^}]*left:\s*-60px/.test(styles) && /\.episode-overflow-right\s*\{[^}]*right:\s*-60px/.test(styles), 'episode arrows must use mirrored offsets outside their shared viewport');
assert.ok(/\.episode-card\s*\{[^}]*height:\s*212px/.test(styles), 'episode cards must retain the 44px caption below a 168px artwork');
assert.ok(/\.episode-image\s*\{[^}]*height:\s*168px/.test(styles), 'episode artwork must recover the 44px previously reserved from the image');
assert.ok(/\.episode-duration-badge\s*\{[^}]*top:\s*134px/.test(styles), 'episode duration must sit 6px above the artwork bottom edge');
assert.ok(/\.episode-progress-track\s*\{[^}]*top:\s*168px/.test(styles), 'episode progress must sit immediately below the 168px artwork and consume the first 6px of caption space');
assert.ok(/PloffDetailExtendedView/.test(application) && /DetailExtendedView:\s*DetailExtendedView/.test(application), 'the application composition root must inject the extended-detail view into the Detail feature');
assert.ok(/requestStandalonePlayback:\s*function\s*\(request\)\s*\{[^}]*requestPlayer\('standalone', request\)/.test(application), 'the application composition root must route playable extras through the Player standalone path');

console.log('Detail extended shell checks passed');
