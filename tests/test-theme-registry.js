'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ThemeRegistry = require('../app/theme-registry');
var Settings = require('../app/settings');

var themes = ThemeRegistry.all();
assert.deepStrictEqual(ThemeRegistry.ids(), ['immersive', 'premiere', 'aurora', 'mahogany', 'atelier', 'nova', 'classic'], 'theme IDs come from one registry in the user-facing order');
assert.strictEqual(ThemeRegistry.defaultId(), 'immersive', 'Immersive remains the default visual theme');
assert.deepStrictEqual(ThemeRegistry.classNames(), ['visual-theme-immersive', 'visual-theme-premiere', 'visual-theme-aurora', 'visual-theme-mahogany', 'visual-theme-atelier', 'visual-theme-nova', 'visual-theme-classic'], 'theme body classes come from the registry order');
assert.strictEqual(ThemeRegistry.get('classic').labelKey, 'settings.themeClassic', 'Classic label metadata is registered');
assert.strictEqual(ThemeRegistry.get('immersive').labelKey, 'settings.themeImmersive', 'Immersive label metadata is registered');
assert.strictEqual(ThemeRegistry.get('premiere').labelKey, 'settings.themePremiere', 'Premiere label metadata is registered');
assert.strictEqual(ThemeRegistry.get('nova').labelKey, 'settings.themeNova', 'Nova label metadata is registered');
assert.strictEqual(ThemeRegistry.get('atelier').labelKey, 'settings.themeAtelier', 'Atelier label metadata is registered');
assert.strictEqual(ThemeRegistry.get('aurora').labelKey, 'settings.themeAurora', 'Aurora label metadata is registered');
assert.strictEqual(ThemeRegistry.get('mahogany').labelKey, 'settings.themeMahogany', 'Mahogany label metadata is registered');
assert.strictEqual(ThemeRegistry.get('classic').supportsAccentColor, true, 'Simple theme must expose user accent customization');
assert.strictEqual(ThemeRegistry.get('immersive').supportsAccentColor, true, 'Immersive theme must expose user accent customization');
assert.strictEqual(ThemeRegistry.get('premiere').supportsAccentColor, false, 'Premiere must own its accent palette');
assert.strictEqual(ThemeRegistry.get('nova').supportsAccentColor, false, 'Nova must own its accent palette');
assert.strictEqual(ThemeRegistry.get('atelier').supportsAccentColor, false, 'Atelier must own its accent palette');
assert.strictEqual(ThemeRegistry.get('aurora').supportsAccentColor, false, 'Aurora must own its accent palette');
assert.strictEqual(ThemeRegistry.get('mahogany').supportsAccentColor, false, 'Mahogany must own its accent palette');
assert.strictEqual(themes.length, 7, 'seven visual themes are registered');
assert.strictEqual(Settings.validate({ visualTheme: 'classic' }).visualTheme, 'classic', 'registered Classic theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'immersive' }).visualTheme, 'immersive', 'registered Immersive theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'premiere' }).visualTheme, 'premiere', 'registered Premiere theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'nova' }).visualTheme, 'nova', 'registered Nova theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'atelier' }).visualTheme, 'atelier', 'registered Atelier theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'aurora' }).visualTheme, 'aurora', 'registered Aurora theme remains valid');
assert.strictEqual(Settings.validate({ visualTheme: 'mahogany' }).visualTheme, 'mahogany', 'registered Mahogany theme remains valid');
assert.strictEqual(Settings.visualThemeDefinition('classic').className, 'visual-theme-classic', 'Settings exposes registry metadata');
assert.strictEqual(Settings.visualThemeDefinition('unknown').id, 'immersive', 'unknown theme metadata falls back to the default theme');

var controllerSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'settings-controller.js'), 'utf8');
assert.strictEqual(/value\s*===\s*['"]immersive['"]/.test(controllerSource), false, 'settings controller must not branch on a concrete theme ID');
assert.strictEqual(/visual-theme-\(\?:classic\|immersive\|premiere\|nova\|atelier\|aurora\|mahogany\)/.test(controllerSource), false, 'settings controller must not hardcode removable theme classes');

console.log('Theme registry checks passed');
