(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./language-flag')); }
  else { root.PloffSettingsView = factory(root.PloffLanguageFlag); }
}(this, function (LanguageFlag) {
  'use strict';

  function create(options) {
    var values = options || {};
    var state = { open: false, zone: 'list', level: 'categories', index: 0, categoryIndex: 0, categoryId: '', languageKind: '', languageIndex: 0 };

    function clamp(index, count) {
      return Math.max(0, Math.min(Math.max(0, Number(count || 0) - 1), Number(index || 0)));
    }

    function snapshot() {
      return {
        open: state.open, zone: state.zone, level: state.level, index: state.index,
        categoryIndex: state.categoryIndex, categoryId: state.categoryId,
        languageKind: state.languageKind, languageIndex: state.languageIndex
      };
    }

    function open(keepNavigationFocus) {
      state.open = true;
      state.zone = keepNavigationFocus ? 'nav' : 'list';
      state.level = 'categories';
      state.index = 0;
      state.categoryIndex = 0;
      state.categoryId = '';
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

    function openCategory(categoryId, categoryIndex) {
      state.level = 'category';
      state.categoryId = String(categoryId || '');
      state.categoryIndex = Math.max(0, Number(categoryIndex) || 0);
      state.zone = 'list';
      state.index = 0;
      return snapshot();
    }

    function closeCategory() {
      state.level = 'categories';
      state.categoryId = '';
      state.zone = 'list';
      state.index = state.categoryIndex;
      return snapshot();
    }

    function focusList(index, rowsOrCount, direction) {
      var rows = Array.isArray(rowsOrCount) ? rowsOrCount : null;
      var count = rows ? rows.length : rowsOrCount;
      var candidate = clamp(index, count);
      var step = Number(direction || 0);
      if (rows && rows[candidate] && rows[candidate].readOnly) {
        step = step || 1;
        while (candidate >= 0 && candidate < count && rows[candidate].readOnly) {
          candidate += step;
        }
        if (candidate < 0 || candidate >= count) {
          candidate = clamp(index - step, count);
          while (candidate >= 0 && candidate < count && rows[candidate].readOnly) {
            candidate -= step;
          }
        }
      }
      state.zone = 'list';
      state.index = clamp(candidate, count);
      if (state.level === 'categories') { state.categoryIndex = state.index; }
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
      var swatch = values.element('span', 'app-setting-swatch is-selected');
      swatch.style = swatch.style || {};
      swatch.style.backgroundColor = values.accentValues[selectedColor] || '';
      swatch.setAttribute('aria-hidden', 'true');
      palette.appendChild(swatch);
      container.insertBefore(palette, container.firstChild);
    }

    function stepperIndex(row) {
      var choices = row.choices || [];
      var index;
      for (index = 0; index < choices.length; index += 1) {
        if (String(choices[index].value) === String(row.currentValue)) { return index; }
        if (String(choices[index].label) === String(row.value)) { return index; }
      }
      return 0;
    }

    function numericStepperAria(row, currentIndex) {
      var choices = row.choices || [];
      var index;
      for (index = 0; index < choices.length; index += 1) {
        if (!/^[-+]?\d+(?:\.\d+)?$/.test(String(choices[index].value))) {
          return { min: 0, max: Math.max(0, choices.length - 1), now: currentIndex };
        }
      }
      return {
        min: choices.length ? choices[0].value : 0,
        max: choices.length ? choices[choices.length - 1].value : 0,
        now: choices.length ? choices[currentIndex].value : 0
      };
    }

    function renderStepper(container, row, currentIndex) {
      var choices = row.choices || [];
      var index;
      var track = values.element('span', 'app-setting-stepper-track');
      var fill = values.element('span', 'app-setting-stepper-fill');
      var marker;
      var position = choices.length > 1 ? currentIndex * 100 / (choices.length - 1) : 100;
      fill.style = fill.style || {};
      fill.style.width = position + '%';
      track.appendChild(fill);
      for (index = 0; index < choices.length; index += 1) {
        marker = values.element('span', 'app-setting-stepper-marker' + (index <= currentIndex ? ' is-active' : ''));
        marker.style = marker.style || {};
        marker.style.left = (choices.length > 1 ? index * 100 / (choices.length - 1) : 100) + '%';
        track.appendChild(marker);
      }
      container.appendChild(track);
      container.appendChild(values.element('span', 'app-setting-stepper-current', row.value));
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
      var rowElement;
      var value;
      var editor;
      var currentIndex;
      var ariaValues;
      var languageFlag;
      values.setText('app-settings-title', state.title);
      values.setText('app-settings-notice', state.notice);
      container.innerHTML = '';
      for (index = 0; index < rows.length; index += 1) {
        row = rows[index];
        if (state.level !== 'categories' && state.level !== 'category' && row.section !== section) {
          section = row.section;
          container.appendChild(values.element('div', 'app-settings-section', state.sectionLabel(section)));
        }
        if (row.subtitlePreview) {
          rowElement = values.element('div', 'subtitle-style-preview');
          rowElement.setAttribute('aria-hidden', 'true');
          value = values.element('span', 'subtitle-style-preview-text', row.previewText || '');
          rowElement.appendChild(value);
          container.appendChild(rowElement);
          continue;
        }
        rowElement = values.element(row.readOnly ? 'div' : 'button', 'app-setting-row' +
          (row.readOnly ? ' is-read-only' : '') +
          (row.versionRow ? ' is-version' : '') +
          (index === 0 && state.serverEditorOpen ? ' has-inline-editor' : ''));
        if (!row.readOnly) {
          rowElement.type = 'button';
          rowElement.setAttribute('data-setting-index', index);
        } else {
          rowElement.setAttribute('aria-readonly', 'true');
        }
        if (row.serverEditor) { rowElement.setAttribute('aria-expanded', state.serverEditorOpen ? 'true' : 'false'); }
        rowElement.appendChild(values.element('span', 'app-setting-label', row.label));
        value = values.element('span', 'app-setting-value' + (row.stepper ? ' app-setting-stepper-value' : ''), row.stepper ? '' : row.value);
        if (row.stepper && row.choices && row.choices.length) {
          currentIndex = stepperIndex(row);
          rowElement.setAttribute('role', 'slider');
          rowElement.setAttribute('aria-valuetext', row.value);
          rowElement.setAttribute('aria-orientation', 'horizontal');
          ariaValues = numericStepperAria(row, currentIndex);
          rowElement.setAttribute('aria-valuemin', ariaValues.min);
          rowElement.setAttribute('aria-valuemax', ariaValues.max);
          rowElement.setAttribute('aria-valuenow', ariaValues.now);
          renderStepper(value, row, currentIndex);
        } else if (row.palette) {
          value.className += ' app-setting-palette-value';
          renderPalette(value, state.accentColor);
        } else if (row.languageCode && LanguageFlag) {
          languageFlag = LanguageFlag.create(values.document, row.languageCode);
          if (languageFlag) { value.insertBefore(languageFlag, value.firstChild); }
        }
        rowElement.appendChild(value);
        if (row.category) { rowElement.className += ' is-category'; }
        container.appendChild(rowElement);
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

    function updateLanguageFocus() {
      var list = values.document.getElementById('language-editor-list');
      var back = values.document.getElementById('language-editor-back');
      var index;
      var row;
      if (!list || !back) { return snapshot(); }
      for (index = 0; index < list.children.length; index += 1) {
        row = list.children[index];
        row.className = String(row.className || '').replace(/\s?is-focused/g, '') + (index === state.languageIndex && !row.disabled ? ' is-focused' : '');
      }
      back.className = state.languageIndex === list.children.length ? 'is-focused' : '';
      return snapshot();
    }

    function renderLanguages(state) {
      var list = values.document.getElementById('language-editor-list');
      var languages = state.languages || [];
      var index;
      var row;
      var identity;
      var flag;
      var back = values.document.getElementById('language-editor-back');
      values.setText('language-editor-title', state.title);
      values.setText('language-editor-hint', state.hint);
      list.innerHTML = '';
      for (index = 0; index < languages.length; index += 1) {
        row = values.element('button', 'language-editor-row' +
          (languages[index].disabled ? ' is-disabled' : '') +
          (index === state.index && !languages[index].disabled ? ' is-focused' : ''));
        row.type = 'button';
        row.disabled = languages[index].disabled === true;
        row.setAttribute('data-language-index', index);
        identity = values.element('span', 'language-editor-identity');
        flag = languages[index].languageCode && LanguageFlag ? LanguageFlag.create(values.document, languages[index].languageCode) : null;
        if (flag) { identity.appendChild(flag); }
        identity.appendChild(values.element('span', '', languages[index].label));
        row.appendChild(identity);
        row.appendChild(values.element('span', 'language-editor-rank', languages[index].rank ? String(languages[index].rank) : ''));
        list.appendChild(row);
      }
      back.textContent = state.backLabel || '';
      back.setAttribute('data-language-index', languages.length);
      back.className = state.index === languages.length ? 'is-focused' : '';
      if (!values.isPointerSelectionActive()) {
        if (state.index === languages.length) { back.focus(); }
        else if (list.children[state.index]) {
          list.children[state.index].focus();
          values.keepFocusVisible(list, list.children[state.index]);
        }
      }
    }

    return {
      open: open, close: close, snapshot: snapshot,
      focusNavigation: focusNavigation, focusList: focusList, openCategory: openCategory, closeCategory: closeCategory,
      openLanguages: openLanguages, closeLanguages: closeLanguages, focusLanguage: focusLanguage,
      render: render, renderLanguages: renderLanguages, updateLanguageFocus: updateLanguageFocus, focus: focusSettings
    };
  }

  return { create: create };
}));
