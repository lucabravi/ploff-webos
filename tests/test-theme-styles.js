'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ThemeRegistry = require('../app/theme-registry');
var BuildStyles = require('../scripts/build-styles');
var ThemeContracts = require('../scripts/check-theme-contracts');
var root = path.join(__dirname, '..');
var requiredTokens = [
  '--theme-app-background', '--theme-app-text', '--theme-scroll-track', '--theme-scroll-thumb',
  '--theme-backdrop-shade', '--theme-media-card-surface', '--theme-card-caption-surface', '--theme-corner-radius'
];

assert.strictEqual(BuildStyles.check(root), true, 'generated app/styles.css must match core plus registered theme sources');
ThemeRegistry.all().forEach(function (theme) {
  var filePath = path.join(root, 'app', 'styles', 'themes', theme.styleFile);
  var themeCss;
  var rootRule;
  assert.strictEqual(fs.existsSync(filePath), true, 'registered theme stylesheet must exist: ' + theme.id);
  themeCss = fs.readFileSync(filePath, 'utf8');
  assert.deepStrictEqual(ThemeContracts.validateThemeCss(theme, themeCss), [], 'every theme style rule must be scoped to its body theme class: ' + theme.id);
  rootRule = themeCss.match(new RegExp('body\\.visual-theme-' + theme.id + ' \\{[\\s\\S]*?\\}'));
  assert.ok(rootRule && /--detail-preference-badge-background:/.test(rootRule[0]), theme.id + ' must define a theme-specific detail preference badge surface');
  assert.ok(rootRule && /--detail-preference-badge-border:/.test(rootRule[0]), theme.id + ' must define a theme-specific detail preference badge border');
  assert.ok(rootRule && /--detail-preference-badge-text:/.test(rootRule[0]), theme.id + ' must define a theme-specific detail preference badge text color');
});
assert.ok(ThemeContracts.validateThemeCss(ThemeRegistry.get('classic'), 'body.visual-theme-classic { --theme-app-background: #000; }').some(function (error) { return error.indexOf('--theme-app-text') !== -1; }), 'theme contract must reject a registered theme that omits required semantic tokens');


['immersive', 'premiere', 'aurora', 'mahogany', 'atelier', 'nova', 'classic'].forEach(function (themeId) {
  var theme = ThemeRegistry.get(themeId);
  var css = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', theme.styleFile), 'utf8');
  var copyRule = css.match(/body\.visual-theme-[^\s]+ \.home-preview-copy \{[\s\S]*?\}/);
  var summaryRule = css.match(/body\.visual-theme-[^\s]+ \.home-preview-summary \{[\s\S]*?\}/);
  assert.ok(copyRule && /width:\s*100%/.test(copyRule[0]), themeId + ' Home hero copy must use the full available gutter width');
  assert.ok(copyRule && !/max-width:\s*(?:[0-9]+px|[0-9]+%)/.test(copyRule[0]), themeId + ' Home hero copy must not retain a narrow max-width');
  assert.ok(summaryRule && !/max-width:\s*[0-9]+px/.test(summaryRule[0]), themeId + ' Home summary must be allowed to use the full hero width');
});

['premiere', 'nova', 'atelier', 'aurora', 'mahogany'].forEach(function (themeId) {
  var theme = ThemeRegistry.get(themeId);
  var css = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', theme.styleFile), 'utf8');
  var rootRule = css.match(new RegExp('body\\.visual-theme-' + themeId + ' \\{[\\s\\S]*?\\}'));
  assert.ok(rootRule && /--accent:\s*#[0-9a-f]{3,8}/i.test(rootRule[0]), themeId + ' must override the persisted accent color with its theme accent');
  assert.ok(css.indexOf('.media-info-dialog-version-value') !== -1, themeId + ' must style the integrated media version selector');
  assert.ok(css.indexOf('.media-info-dialog-apply') !== -1, themeId + ' must style the media version apply action');
});

var premiereCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'premiere.css'), 'utf8');
var novaCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'nova.css'), 'utf8');
var auroraCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'aurora.css'), 'utf8');
var mahoganyCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'mahogany.css'), 'utf8');
var atelierCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'atelier.css'), 'utf8');
var coreCss = fs.readFileSync(path.join(root, 'app', 'styles', 'core.css'), 'utf8');
var seasonOverflowRule = coreCss.match(/\.season-tabs-overflow\s*\{[^}]*\}/);
var seasonOverflowRightRule = coreCss.match(/\.season-tabs-overflow-right\s*\{[^}]*\}/);
var seasonOverflowMaskRule = coreCss.match(/\.season-tabs-track\.is-clipped-right\s*\{[^}]*\}/);
var seasonOverflowMaskLeftRule = coreCss.match(/\.season-tabs-track\.is-clipped-left\s*\{[^}]*\}/);
var seasonOverflowMaskBothRule = coreCss.match(/\.season-tabs-track\.is-clipped-left\.is-clipped-right\s*\{[^}]*\}/);
assert.ok(/\.navigation-libraries \.nav-item\.is-focused\s*\{[^}]*box-shadow:\s*var\(--navigation-focus-shadow\)/.test(coreCss), 'clipped navigation must use a dedicated fully internal focus shadow');
[
  ['Aurora', auroraCss], ['Nova', novaCss], ['Mahogany', mahoganyCss]
].forEach(function (entry) {
  var declaration = /--navigation-focus-shadow:\s*([^;]+);/.exec(entry[1]);
  assert.ok(declaration, entry[0] + ' must define its navbar-specific focus shadow');
  assert.ok(declaration[1].split(',').every(function (shadow) { return /\binset\b/.test(shadow); }),
    entry[0] + ' navbar focus shadow must contain no externally clipped layer');
});
[
  ['premiere', premiereCss], ['aurora', auroraCss], ['mahogany', mahoganyCss], ['nova', novaCss]
].forEach(function (entry) {
  assert.ok(new RegExp('body\\.visual-theme-' + entry[0] + ' \\.navigation-libraries \\.nav-item\\.is-focused\\s*\\{[^}]*box-shadow:\\s*var\\(--navigation-focus-shadow\\)').test(entry[1]),
    entry[0] + ' must let the clipped library focus rule override its selected-tab shadow');
});
assert.ok(!/visual-theme-nova \.startup-splash-spinner/.test(novaCss), 'Nova must not override the fixed Ploff splash spinner color');
assert.ok(!/\.media-card\.is-focused[\s\S]{0,500}transform:/.test(premiereCss), 'Premiere card focus must avoid transform-driven repaints on legacy TVs');
assert.ok(!/nova-focus-line[^}]*animation/.test(novaCss) && !/nova-signal-pulse[^}]*animation/.test(novaCss), 'Nova focus surfaces must not run continuous paint animations');
assert.ok(!/\.home-preview-copy\s*\{[^}]*animation:/.test(novaCss) && !/\.home-preview-copy\s*\{[^}]*animation:/.test(atelierCss), 'special theme hero copy must not restart an entrance animation on every input');
assert.ok(/body\.visual-theme-premiere \.topbar\s*\{[^}]*overflow:\s*visible/.test(premiereCss), 'Premiere topbar must let the activity panel escape its clipped header surface');
assert.ok(/body\.visual-theme-nova \.topbar\s*\{[^}]*overflow:\s*visible/.test(novaCss), 'Nova topbar must let the activity panel escape its clipped header surface');
assert.ok(/body\.visual-theme-premiere \.detail-action\.is-focused,[\s\S]*box-shadow:\s*var\(--focus-shadow\)/.test(premiereCss), 'Premiere must preserve visible focus on detail actions');
assert.ok(/body\.visual-theme-premiere \.detail-choice\.is-focused\s*\{[\s\S]*box-shadow:\s*var\(--focus-shadow-inset\)/.test(premiereCss), 'Premiere must preserve visible focus on detail selectors');
assert.ok(/body\.visual-theme-premiere \.player-button\.is-focused,[\s\S]*box-shadow:\s*var\(--focus-shadow-inset\)/.test(premiereCss), 'Premiere must preserve visible focus on player controls');
assert.ok(/body\.visual-theme-premiere \.library-action\.is-focused\s*\{[\s\S]*box-shadow:\s*var\(--focus-shadow\)/.test(premiereCss), 'Premiere must preserve visible focus on library actions');
assert.ok(/body\.visual-theme-premiere \.library-control\.is-focused\s*\{[\s\S]*box-shadow:\s*var\(--focus-shadow\)/.test(premiereCss), 'Premiere must preserve visible focus on library controls');
assert.ok(/body\.visual-theme-nova \.detail-copy\s*\{[^}]*width:\s*68%/.test(novaCss) && /body\.visual-theme-nova \.detail-summary-button\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/.test(novaCss), 'Nova detail summary must remain inside its enlarged panel');
assert.ok(/body\.visual-theme-nova \.detail-copy\s*\{[^}]*margin-top:\s*16px/.test(novaCss), 'Nova detail copy must leave space below the season tabs');
assert.ok(/body\.visual-theme-nova \.library-control\.is-active\.is-focused\s*\{[\s\S]*background:\s*linear-gradient\(100deg,[\s\S]*color:\s*#031018/.test(novaCss), 'Nova active library controls must retain their readable active surface when focused');
assert.ok(/body\.visual-theme-atelier \.player-button\.is-focused,[\s\S]*box-shadow:\s*inset 0 0 0 5px #ffffff[\s\S]*transform:\s*none/.test(atelierCss), 'Atelier player focus must remain fully visible without lifting controls into the clipped edge');
assert.ok(/body\.visual-theme-nova \.detail-action\.is-focused,[\s\S]*box-shadow:\s*var\(--focus-shadow\)/.test(novaCss), 'Nova must preserve visible focus on detail actions');
assert.ok(/body\.visual-theme-nova \.detail-choice\.is-focused\s*\{[\s\S]*box-shadow:\s*var\(--focus-shadow-inset\)/.test(novaCss), 'Nova must preserve visible focus on detail selectors');

var generated = fs.readFileSync(path.join(root, 'app', 'styles.css'), 'utf8');
var coreIndex = generated.indexOf('/* source: styles/core.css */');
var immersiveIndex = generated.indexOf('/* source: styles/themes/immersive.css */');
var premiereIndex = generated.indexOf('/* source: styles/themes/premiere.css */');
var auroraIndex = generated.indexOf('/* source: styles/themes/aurora.css */');
var mahoganyIndex = generated.indexOf('/* source: styles/themes/mahogany.css */');
var atelierIndex = generated.indexOf('/* source: styles/themes/atelier.css */');
var novaIndex = generated.indexOf('/* source: styles/themes/nova.css */');
var classicIndex = generated.indexOf('/* source: styles/themes/classic.css */');
assert.ok(coreIndex >= 0 && immersiveIndex > coreIndex && premiereIndex > immersiveIndex && auroraIndex > premiereIndex && mahoganyIndex > auroraIndex && atelierIndex > mahoganyIndex && novaIndex > atelierIndex && classicIndex > novaIndex, 'generated CSS keeps core first and themes in registry order');

var indexHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
assert.deepStrictEqual(ThemeContracts.requiredThemeTokens(), requiredTokens, 'theme contracts publish the semantic tokens every theme must define');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder(indexHtml), [], 'theme registry and Settings schema must load before Settings in the browser runtime');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="theme-registry.js"></script><script src="settings.js"></script>'), ['Missing runtime script: settings-schema.js'], 'runtime-order guard must require the persisted Settings schema');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="settings-schema.js"></script><script src="theme-registry.js"></script><script src="settings.js"></script>'), ['theme-registry.js must load before settings-schema.js'], 'runtime-order guard must reject the Settings schema before ThemeRegistry');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="theme-registry.js"></script><script src="settings.js"></script><script src="settings-schema.js"></script>'), ['settings-schema.js must load before settings.js'], 'runtime-order guard must reject Settings before its schema');
var stylesheets = indexHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/g) || [];
assert.strictEqual(stylesheets.length, 1, 'runtime keeps a single stylesheet link');
assert.ok(/href=["']styles\.css\?v=dev["']/.test(stylesheets[0]), 'runtime loads only generated styles.css');

assert.ok(/--navigation-focus-gutter:\s*5px/.test(coreCss), 'navbar clipping must derive its physical gutter from a focus-width variable');
assert.ok(/\.navigation-libraries\s*\{[^}]*padding-right:\s*var\(--navigation-focus-gutter\)/.test(coreCss), 'the library viewport must physically reserve the configured focus gutter');
assert.ok(/\.navigation-libraries\s*\{[^}]*margin-left:\s*6px/.test(coreCss),
  'the library viewport must leave a small stable slot for the left overflow arrow');
assert.ok(seasonOverflowRule && /height:\s*52px/.test(seasonOverflowRule[0]) && /transform:\s*translateY\(-2px\)/.test(seasonOverflowRule[0]) && !/bottom:\s*0/.test(seasonOverflowRule[0]),
  'season overflow arrows must share the 52px tab alignment box');
assert.ok(seasonOverflowRightRule && /width:\s*2rem/.test(seasonOverflowRightRule[0]) && /background:\s*transparent/.test(seasonOverflowRightRule[0]),
  'the right season arrow must remain a narrow transparent overlay');
assert.ok(seasonOverflowMaskRule && /-webkit-mask-image:\s*linear-gradient/.test(seasonOverflowMaskRule[0]) && /mask-image:\s*linear-gradient/.test(seasonOverflowMaskRule[0]),
  'clipped season text must fade through a Chrome 53-compatible mask');
assert.ok(seasonOverflowMaskLeftRule && /-webkit-mask-image:\s*linear-gradient/.test(seasonOverflowMaskLeftRule[0]) && /mask-image:\s*linear-gradient/.test(seasonOverflowMaskLeftRule[0]),
  'leading clipped season text must use the mirrored Chrome 53-compatible mask');
assert.ok(seasonOverflowMaskBothRule && /-webkit-mask-image:\s*linear-gradient/.test(seasonOverflowMaskBothRule[0]) && /mask-image:\s*linear-gradient/.test(seasonOverflowMaskBothRule[0]),
  'season text clipped at both edges must preserve both mirrored fades');
assert.ok(!/\.season-tabs-overflow-right:before/.test(coreCss),
  'season overflow must not paint a black pseudo-element over the backdrop');
var navigationItemRule = coreCss.match(/\.nav-item\s*\{[^}]*\}/);
assert.ok(navigationItemRule && /font-size:\s*1\.51875rem/.test(navigationItemRule[0]),
  'navigation labels must use the compact TV-readable scale');
assert.ok(/\.nav-item-icon\s*\{[^}]*flex:\s*0 0 1\.4em[^}]*width:\s*1\.4em[^}]*height:\s*1\.4em/.test(coreCss),
  'navigation icons must scale with the tab text while keeping a square alignment box');
assert.ok(/\.nav-item-icon \.nav-icon-svg\s*\{[^}]*width:\s*1\.4em[^}]*height:\s*1\.4em/.test(coreCss),
  'library, Search, and Settings SVG icons must fill the scalable navigation icon box');
assert.ok(/\.navigation-home\.has-clipped-libraries:after\s*\{[^}]*right:\s*-2px[^}]*rotate\(-135deg\)/.test(coreCss),
  'the left Library overflow arrow must render in the Home margin rather than over clipped Library content');
assert.ok(!/navigation-left-arrow-shift/.test(coreCss),
  'left Library overflow must not depend on per-render content transforms');
var preferenceBadgeRule = coreCss.match(/\.detail-choice-source\s*\{[^}]*\}/);
assert.ok(preferenceBadgeRule && /font-size:\s*20px/.test(preferenceBadgeRule[0]), 'detail preference badges must respect the 20px LG TV minimum readable font size');
assert.ok(preferenceBadgeRule && /var\(--detail-preference-badge-background/.test(preferenceBadgeRule[0]), 'detail preference badges must consume their theme surface token');
assert.ok(preferenceBadgeRule && /var\(--detail-preference-badge-border/.test(preferenceBadgeRule[0]), 'detail preference badges must consume their theme border token');
assert.ok(preferenceBadgeRule && /var\(--detail-preference-badge-text/.test(preferenceBadgeRule[0]), 'detail preference badges must consume their theme text token');
assert.ok(/\.media-library-badge\s*\{[^}]*box-sizing:\s*border-box[^}]*max-width:\s*calc\(100% - 16px\)/.test(coreCss), 'media source badges must fit inside cards with equal left and right margins');
assert.ok(/\.media-library-badge\s*\{[^}]*box-sizing:\s*border-box[^}]*max-width:\s*calc\(100% - 16px\)/.test(coreCss), 'media source badges must fit inside cards with equal left and right margins');
requiredTokens.forEach(function (token) {
  assert.ok(coreCss.indexOf('var(' + token) !== -1, 'core stylesheet must consume semantic theme token ' + token);
});

console.log('Theme stylesheet checks passed');
