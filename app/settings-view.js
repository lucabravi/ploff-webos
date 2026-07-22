(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSettingsView = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var state = { open: false, zone: 'list', index: 0, languageKind: '', languageIndex: 0 };

    function clamp(index, count) {
      return Math.max(0, Math.min(Math.max(0, Number(count || 0) - 1), Number(index || 0)));
    }

    function snapshot() {
      return {
        open: state.open, zone: state.zone, index: state.index,
        languageKind: state.languageKind, languageIndex: state.languageIndex
      };
    }

    function open(keepNavigationFocus) {
      state.open = true;
      state.zone = keepNavigationFocus ? 'nav' : 'list';
      state.index = 0;
      state.languageKind = '';
      state.languageIndex = 0;
      return snapshot();
    }

    function close() {
      state.open = false;
      state.languageKind = '';
      state.languageIndex = 0;
      return snapshot();
    }

    function focusNavigation() { state.zone = 'nav'; return snapshot(); }

    function focusList(index, count) {
      state.zone = 'list';
      state.index = clamp(index, count);
      return snapshot();
    }

    function openLanguages(kind) {
      state.languageKind = String(kind || '');
      state.languageIndex = 0;
      return snapshot();
    }

    function closeLanguages() {
      state.languageKind = '';
      state.languageIndex = 0;
      return snapshot();
    }

    function focusLanguage(index, count) {
      state.languageIndex = clamp(index, count);
      return snapshot();
    }

    function renderPalette(container, selectedColor) {
      var palette = values.element('span', 'app-setting-palette');
      var colors = values.accentColors || [];
      var index;
      var color;
      var swatch;
      for (index = 0; index < colors.length; index += 1) {
        color = colors[index];
        swatch = values.element('span', 'app-setting-swatch' + (color === selectedColor ? ' is-selected' : ''));
        swatch.style = swatch.style || {};
        swatch.style.backgroundColor = values.accentValues[color];
        swatch.setAttribute('data-accent-color', color);
        swatch.setAttribute('aria-hidden', 'true');
        palette.appendChild(swatch);
      }
      container.insertBefore(palette, container.firstChild);
    }

    function focusSettings(state) {
      var target = state.zone === 'nav'
        ? values.navTarget(state.navIndex)
        : values.document.querySelector('[data-setting-index="' + state.index + '"]');
      values.clearFocus();
      if (!target) { return; }
      target.className += ' is-focused';
      if (!values.isPointerSelectionActive()) {
        target.focus();
        if (state.zone === 'list') {
          values.keepFocusVisible(values.document.getElementById('app-settings-list'), target);
        }
      }
    }

    function render(state) {
      var container = values.document.getElementById('app-settings-list');
      var rows = state.rows || [];
      var section = '';
      var index;
      var row;
      var button;
      var value;
      var editor;
      values.setText('app-settings-title', state.title);
      values.setText('app-settings-notice', state.notice);
      container.innerHTML = '';
      for (index = 0; index < rows.length; index += 1) {
        row = rows[index];
        if (row.section !== section) {
          section = row.section;
          container.appendChild(values.element('div', 'app-settings-section', state.sectionLabel(section)));
        }
        button = values.element('button', 'app-setting-row' +
          (index === 0 && state.serverEditorOpen ? ' has-inline-editor' : ''));
        button.type = 'button';
        button.setAttribute('data-setting-index', index);
        if (row.serverEditor) { button.setAttribute('aria-expanded', state.serverEditorOpen ? 'true' : 'false'); }
        button.appendChild(values.element('span', 'app-setting-label', row.label));
        value = values.element('span', 'app-setting-value', row.value);
        if (row.palette) {
          value.className += ' app-setting-palette-value';
          renderPalette(value, state.accentColor);
        }
        button.appendChild(value);
        container.appendChild(button);
        if (state.index === 0 && state.serverEditorOpen && index === 0) {
          editor = values.element('div', 'server-editor-inline');
          editor.id = 'server-editor';
          editor.appendChild(values.element('span', 'server-editor-hint', state.serverDiscoveryActive ? values.t('settings.scanning') : values.t('settings.serverEditorHint')));
          value = values.element('div', 'server-editor-list');
          value.id = 'server-editor-list';
          editor.appendChild(value);
          container.appendChild(editor);
        }
      }
      container.appendChild(values.element('div', 'app-settings-credit', state.credit));
      if (state.serverEditorOpen) { values.renderServerEditor(); }
      else { focusSettings(state); }
    }

    function renderLanguages(state) {
      var list = values.document.getElementById('language-editor-list');
      var languages = state.languages || [];
      var index;
      var row;
      values.setText('language-editor-title', state.title);
      values.setText('language-editor-hint', state.hint);
      list.innerHTML = '';
      for (index = 0; index < languages.length; index += 1) {
        row = values.element('button', 'language-editor-row' + (index === state.index ? ' is-focused' : ''));
        row.type = 'button';
        row.setAttribute('data-language-index', index);
        row.appendChild(values.element('span', '', languages[index].label));
        row.appendChild(values.element('span', 'language-editor-rank', languages[index].rank ? String(languages[index].rank) : ''));
        list.appendChild(row);
      }
      if (!values.isPointerSelectionActive() && list.children[state.index]) {
        list.children[state.index].focus();
        values.keepFocusVisible(list, list.children[state.index]);
      }
    }

    return {
      open: open, close: close, snapshot: snapshot,
      focusNavigation: focusNavigation, focusList: focusList,
      openLanguages: openLanguages, closeLanguages: closeLanguages, focusLanguage: focusLanguage,
      render: render, renderLanguages: renderLanguages, focus: focusSettings
    };
  }

  return { create: create };
}));
