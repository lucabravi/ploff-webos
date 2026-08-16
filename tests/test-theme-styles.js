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
  assert.strictEqual(fs.existsSync(filePath), true, 'registered theme stylesheet must exist: ' + theme.id);
  assert.deepStrictEqual(ThemeContracts.validateThemeCss(theme, fs.readFileSync(filePath, 'utf8')), [], 'every theme style rule must be scoped to its body theme class: ' + theme.id);
});
assert.ok(ThemeContracts.validateThemeCss(ThemeRegistry.get('classic'), 'body.visual-theme-classic { --theme-app-background: #000; }').some(function (error) { return error.indexOf('--theme-app-text') !== -1; }), 'theme contract must reject a registered theme that omits required semantic tokens');


['classic', 'immersive', 'premiere', 'nova', 'atelier'].forEach(function (themeId) {
  var theme = ThemeRegistry.get(themeId);
  var css = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', theme.styleFile), 'utf8');
  var copyRule = css.match(/body\.visual-theme-[^\s]+ \.home-preview-copy \{[\s\S]*?\}/);
  var summaryRule = css.match(/body\.visual-theme-[^\s]+ \.home-preview-summary \{[\s\S]*?\}/);
  assert.ok(copyRule && /width:\s*100%/.test(copyRule[0]), themeId + ' Home hero copy must use the full available gutter width');
  assert.ok(copyRule && !/max-width:\s*(?:[0-9]+px|[0-9]+%)/.test(copyRule[0]), themeId + ' Home hero copy must not retain a narrow max-width');
  assert.ok(summaryRule && !/max-width:\s*[0-9]+px/.test(summaryRule[0]), themeId + ' Home summary must be allowed to use the full hero width');
});

['premiere', 'nova', 'atelier'].forEach(function (themeId) {
  var theme = ThemeRegistry.get(themeId);
  var css = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', theme.styleFile), 'utf8');
  var rootRule = css.match(new RegExp('body\\.visual-theme-' + themeId + ' \\{[\\s\\S]*?\\}'));
  assert.ok(rootRule && /--accent:\s*#[0-9a-f]{3,8}/i.test(rootRule[0]), themeId + ' must override the persisted accent color with its theme accent');
  assert.ok(css.indexOf('.media-info-dialog-version-value') !== -1, themeId + ' must style the integrated media version selector');
  assert.ok(css.indexOf('.media-info-dialog-apply') !== -1, themeId + ' must style the media version apply action');
});

var premiereCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'premiere.css'), 'utf8');
var novaCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'nova.css'), 'utf8');
var atelierCss = fs.readFileSync(path.join(root, 'app', 'styles', 'themes', 'atelier.css'), 'utf8');
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
var classicIndex = generated.indexOf('/* source: styles/themes/classic.css */');
var immersiveIndex = generated.indexOf('/* source: styles/themes/immersive.css */');
var premiereIndex = generated.indexOf('/* source: styles/themes/premiere.css */');
var novaIndex = generated.indexOf('/* source: styles/themes/nova.css */');
var atelierIndex = generated.indexOf('/* source: styles/themes/atelier.css */');
assert.ok(coreIndex >= 0 && classicIndex > coreIndex && immersiveIndex > classicIndex && premiereIndex > immersiveIndex && novaIndex > premiereIndex && atelierIndex > novaIndex, 'generated CSS keeps core first and themes in registry order');

var indexHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
assert.deepStrictEqual(ThemeContracts.requiredThemeTokens(), requiredTokens, 'theme contracts publish the semantic tokens every theme must define');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder(indexHtml), [], 'theme registry and Settings schema must load before Settings in the browser runtime');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="theme-registry.js"></script><script src="settings.js"></script>'), ['Missing runtime script: settings-schema.js'], 'runtime-order guard must require the persisted Settings schema');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="settings-schema.js"></script><script src="theme-registry.js"></script><script src="settings.js"></script>'), ['theme-registry.js must load before settings-schema.js'], 'runtime-order guard must reject the Settings schema before ThemeRegistry');
assert.deepStrictEqual(ThemeContracts.validateRuntimeOrder('<script src="theme-registry.js"></script><script src="settings.js"></script><script src="settings-schema.js"></script>'), ['settings-schema.js must load before settings.js'], 'runtime-order guard must reject Settings before its schema');
var stylesheets = indexHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/g) || [];
assert.strictEqual(stylesheets.length, 1, 'runtime keeps a single stylesheet link');
assert.ok(/href=["']styles\.css\?v=dev["']/.test(stylesheets[0]), 'runtime loads only generated styles.css');

var coreCss = fs.readFileSync(path.join(root, 'app', 'styles', 'core.css'), 'utf8');
requiredTokens.forEach(function (token) {
  assert.ok(coreCss.indexOf('var(' + token) !== -1, 'core stylesheet must consume semantic theme token ' + token);
});

console.log('Theme stylesheet checks passed');
