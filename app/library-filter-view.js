(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryFilterView = factory(); }
}(this, function () {
  'use strict';

  function copyFilters(source, keys) {
    var value = source || {};
    var result = {};
    var index;
    for (index = 0; index < keys.length; index += 1) {
      result[keys[index]] = value[keys[index]] || '';
    }
    return result;
  }

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var keys = array(values.keys).length ? values.keys.slice() : ['watched', 'year', 'genre', 'actor', 'director', 'resolution', 'hdr'];
    var state = {
      open: false,
      filters: copyFilters(values.activeFilters, keys),
      draftFilters: copyFilters(values.activeFilters, keys),
      options: null,
      context: null,
      contextKey: '',
      pickerKey: '',
      focus: { zone: 'rows', index: 0 },
      request: null,
      requestToken: 0
    };

    function text(key, parameters) {
      return values.t ? values.t(key, parameters) : key;
    }

    function node(id) {
      return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null;
    }

    function element(tagName, className, content) {
      if (values.element) { return values.element(tagName, className, content); }
      var value = documentRef.createElement(tagName);
      value.className = className || '';
      if (content !== undefined) { value.appendChild(documentRef.createTextNode(String(content))); }
      return value;
    }

    function setText(id, value) {
      var target = node(id);
      if (!target) { return; }
      if (values.setText) { values.setText(id, value); }
      else { target.textContent = String(value || ''); }
    }

    function contextKey(context) {
      if (values.contextKey) { return String(values.contextKey(context) || ''); }
      return String(context && context.key || context || '');
    }

    function cancelRequest() {
      state.requestToken += 1;
      if (state.request && state.request.abort) { state.request.abort(); }
      state.request = null;
    }

    function activeFilterCount(filters) {
      var source = filters || state.filters;
      return keys.filter(function (key) {
        return source[key] !== undefined && source[key] !== null && source[key] !== '';
      }).length;
    }

    function choices(key) {
      if (key === 'watched') {
        return [
          { value: '', label: text('library.all') },
          { value: 'unwatched', label: text('library.unwatched') },
          { value: 'watched', label: text('library.watched') }
        ];
      }
      var source = state.options && state.options[key];
      return [{ value: '', label: text('library.filterAny') }].concat(array(source));
    }

    function filterLabel(key, value) {
      var source = state.options && array(state.options[key]);
      var index;
      if (key === 'watched') {
        return text(value === 'watched' ? 'library.watched' : (value === 'unwatched' ? 'library.unwatched' : 'library.all'));
      }
      if (!value) { return text('library.filterAny'); }
      for (index = 0; index < source.length; index += 1) {
        if (String(source[index].value) === String(value)) { return source[index].label; }
      }
      return String(value);
    }

    function renderPicker(rows) {
      var optionsForKey = choices(state.pickerKey);
      var index;
      var button;
      setText('library-filter-title', text('library.filter.' + state.pickerKey));
      setText('library-filter-hint', text('library.filterPickerHint'));
      rows.className = 'library-filter-rows library-filter-options';
      for (index = 0; index < optionsForKey.length; index += 1) {
        button = element('button', 'library-filter-option' +
          (String(optionsForKey[index].value) === String(state.draftFilters[state.pickerKey]) ? ' is-selected' : '') +
          (state.focus.zone === 'picker' && state.focus.index === index ? ' is-focused' : ''), optionsForKey[index].label);
        button.type = 'button';
        button.setAttribute('data-library-filter-option', index);
        rows.appendChild(button);
      }
    }

    function render() {
      var drawer = node('library-filter-drawer');
      var shade = node('library-filter-shade');
      var rows = node('library-filter-rows');
      var index;
      var button;
      if (!drawer || !shade || !rows) { return; }
      if (!state.open) {
        drawer.className = 'library-filter-drawer is-hidden';
        shade.className = 'library-filter-shade is-hidden';
        return;
      }
      drawer.className = 'library-filter-drawer';
      shade.className = 'library-filter-shade';
      setText('library-filter-title', text('library.advancedFilters'));
      setText('library-filter-hint', text('library.filtersHint', { library: values.libraryTitle ? values.libraryTitle(state.context) : '' }));
      setText('library-filter-reset', text('library.resetFilters'));
      setText('library-filter-cancel', text('common.cancel'));
      setText('library-filter-apply', text('common.apply'));
      setText('library-filter-count', text('library.activeFilters', { count: activeFilterCount(state.draftFilters) }));
      rows.innerHTML = '';
      rows.className = 'library-filter-rows' + (state.pickerKey ? ' library-filter-options' : '');
      if (state.pickerKey && state.options) {
        renderPicker(rows);
      } else if (!state.options) {
        rows.appendChild(element('div', 'library-filter-loading', text('library.loadingFilters')));
      } else {
        for (index = 0; index < keys.length; index += 1) {
          button = element('button', 'library-filter-row' + (state.focus.zone === 'rows' && state.focus.index === index ? ' is-focused' : ''));
          button.type = 'button';
          button.setAttribute('data-library-advanced-filter', keys[index]);
          button.appendChild(element('span', 'library-filter-row-label', text('library.filter.' + keys[index])));
          button.appendChild(element('span', 'library-filter-row-value', filterLabel(keys[index], state.draftFilters[keys[index]])));
          button.appendChild(element('span', 'library-filter-row-arrow', '\u2039  \u203a'));
          rows.appendChild(button);
        }
      }
      ['reset', 'cancel', 'apply'].forEach(function (action, actionIndex) {
        var actionButton = node('library-filter-' + action);
        if (!actionButton) { return; }
        actionButton.style.display = state.pickerKey ? 'none' : '';
        actionButton.className = (action === 'apply' ? 'is-primary' : '') +
          (state.focus.zone === 'actions' && state.focus.index === actionIndex ? ' is-focused' : '');
      });
      node('library-filter-count').style.display = state.pickerKey ? 'none' : '';
    }

    function focusTarget() {
      var selector;
      var target;
      if (!state.open || !documentRef || !documentRef.querySelectorAll) { return; }
      if (state.focus.zone === 'rows') { selector = '[data-library-advanced-filter]'; }
      else if (state.focus.zone === 'picker') { selector = '[data-library-filter-option]'; }
      else { selector = '[data-library-filter-action]'; }
      target = documentRef.querySelectorAll(selector)[state.focus.index];
      if (target && !values.isPointerSelectionActive()) {
        target.focus();
        if (state.focus.zone === 'picker' && target.scrollIntoView) { target.scrollIntoView(false); }
      }
    }

    function focus() {
      if (values.clearFocus) { values.clearFocus(); }
      render();
      focusTarget();
      return snapshot();
    }

    function loadOptions() {
      var token;
      var request;
      if (!values.loadOptions || state.options || state.request) { return; }
      token = state.requestToken + 1;
      state.requestToken = token;
      request = values.loadOptions(state.context, function (error, result) {
        if (token !== state.requestToken) { return; }
        state.request = null;
        if (!state.open) { return; }
        state.options = error ? (values.fallbackOptions ? values.fallbackOptions(error, state.context) : {}) : (result || {});
        render();
        focusTarget();
      });
      state.request = request || null;
    }

    function setActiveFilters(filters) {
      cancelRequest();
      state.open = false;
      state.filters = copyFilters(filters, keys);
      state.draftFilters = copyFilters(state.filters, keys);
      state.options = null;
      state.context = null;
      state.contextKey = '';
      state.pickerKey = '';
      state.focus = { zone: 'rows', index: 0 };
      render();
      return snapshot();
    }

    function open(context) {
      var nextContextKey = contextKey(context);
      if (nextContextKey !== state.contextKey) {
        cancelRequest();
        state.options = null;
        state.contextKey = nextContextKey;
      }
      state.context = context;
      state.draftFilters = copyFilters(state.filters, keys);
      state.open = true;
      state.pickerKey = '';
      state.focus = { zone: 'rows', index: 0 };
      render();
      loadOptions();
      focus();
      return snapshot();
    }

    function close(reason, silent) {
      if (!state.open) { return snapshot(); }
      cancelRequest();
      state.open = false;
      state.pickerKey = '';
      state.focus = { zone: 'rows', index: 0 };
      render();
      if (!silent && reason !== 'apply' && values.onCancel) { values.onCancel(); }
      if (!silent && values.onClose) { values.onClose(reason || 'back'); }
      return snapshot();
    }

    function dismiss() {
      return close('dismiss', true);
    }

    function openPicker(key) {
      var source = choices(key);
      var index;
      state.pickerKey = key;
      state.focus.zone = 'picker';
      state.focus.index = 0;
      for (index = 0; index < source.length; index += 1) {
        if (String(source[index].value) === String(state.draftFilters[key])) { state.focus.index = index; break; }
      }
      focus();
    }

    function selectPicker(index) {
      var source = choices(state.pickerKey);
      var rowIndex = keys.indexOf(state.pickerKey);
      if (!source[index]) { return; }
      state.draftFilters[state.pickerKey] = source[index].value;
      state.pickerKey = '';
      state.focus.zone = 'rows';
      state.focus.index = Math.max(0, rowIndex);
      focus();
    }

    function activateAction(action) {
      if (action === 'reset') {
        state.draftFilters = copyFilters({}, keys);
        if (values.onReset) { values.onReset(copyFilters(state.draftFilters, keys)); }
        focus();
      } else if (action === 'cancel') {
        close('cancel');
      } else if (action === 'apply') {
        state.filters = copyFilters(state.draftFilters, keys);
        state.open = false;
        state.pickerKey = '';
        cancelRequest();
        render();
        if (values.onApply) { values.onApply(copyFilters(state.filters, keys)); }
        if (values.onClose) { values.onClose('apply'); }
      }
      return snapshot();
    }

    function pointerFocus(button) {
      var key;
      if (!button || !state.open) { return snapshot(); }
      if (button.hasAttribute('data-library-advanced-filter')) {
        key = button.getAttribute('data-library-advanced-filter');
        state.focus.zone = 'rows'; state.focus.index = Math.max(0, keys.indexOf(key));
      } else if (button.hasAttribute('data-library-filter-option')) {
        state.focus.zone = 'picker'; state.focus.index = Number(button.getAttribute('data-library-filter-option')) || 0;
      } else if (button.hasAttribute('data-library-filter-action')) {
        state.focus.zone = 'actions'; state.focus.index = Math.max(0, ['reset', 'cancel', 'apply'].indexOf(button.getAttribute('data-library-filter-action')));
      } else { return snapshot(); }
      render();
      return snapshot();
    }

    function activatePointer(button) {
      var action;
      if (!button || !state.open) { return snapshot(); }
      pointerFocus(button);
      if (button.hasAttribute('data-library-advanced-filter')) { openPicker(button.getAttribute('data-library-advanced-filter')); }
      else if (button.hasAttribute('data-library-filter-option')) { selectPicker(Number(button.getAttribute('data-library-filter-option'))); }
      else if (button.hasAttribute('data-library-filter-action')) {
        action = button.getAttribute('data-library-filter-action');
        activateAction(action);
      }
      return snapshot();
    }

    function handleKeyDown(event, direction) {
      var choiceCount;
      var action;
      if (!state.open) { return false; }
      event.preventDefault();
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (state.pickerKey) {
          state.focus.index = Math.max(0, keys.indexOf(state.pickerKey));
          state.pickerKey = '';
          state.focus.zone = 'rows';
          focus();
        } else { close('back'); }
        return true;
      }
      if (state.focus.zone === 'picker') {
        choiceCount = choices(state.pickerKey).length;
        if (direction === 'up') { state.focus.index = Math.max(0, state.focus.index - 1); }
        else if (direction === 'down') { state.focus.index = Math.min(choiceCount - 1, state.focus.index + 1); }
        else if (event.keyCode === 13) { selectPicker(state.focus.index); return true; }
        focus();
        return true;
      }
      if (state.focus.zone === 'rows') {
        if (direction === 'up') { state.focus.index = Math.max(0, state.focus.index - 1); }
        else if (direction === 'down') {
          if (state.focus.index < keys.length - 1) { state.focus.index += 1; }
          else { state.focus.zone = 'actions'; state.focus.index = 2; }
        } else if (direction === 'left' || direction === 'right') {
          var source = choices(keys[state.focus.index]);
          var current = 0;
          var index;
          for (index = 0; index < source.length; index += 1) {
            if (String(source[index].value) === String(state.draftFilters[keys[state.focus.index]])) { current = index; break; }
          }
          current = (current + (direction === 'left' ? -1 : 1) + source.length) % source.length;
          state.draftFilters[keys[state.focus.index]] = source[current].value;
        } else if (event.keyCode === 13) { openPicker(keys[state.focus.index]); return true; }
        focus();
        return true;
      }
      if (direction === 'left') { state.focus.index = Math.max(0, state.focus.index - 1); }
      else if (direction === 'right') { state.focus.index = Math.min(2, state.focus.index + 1); }
      else if (direction === 'up') { state.focus.zone = 'rows'; state.focus.index = keys.length - 1; }
      else if (event.keyCode === 13) {
        action = ['reset', 'cancel', 'apply'][state.focus.index];
        activateAction(action);
        return true;
      }
      focus();
      return true;
    }

    function snapshot() {
      return {
        open: state.open,
        filters: copyFilters(state.filters, keys),
        draftFilters: copyFilters(state.draftFilters, keys),
        options: state.options,
        pickerKey: state.pickerKey,
        focus: { zone: state.focus.zone, index: state.focus.index }
      };
    }

    return {
      activatePointer: activatePointer,
      activeFilterCount: activeFilterCount,
      close: close,
      dismiss: dismiss,
      filters: function () { return copyFilters(state.filters, keys); },
      focus: focus,
      handleKeyDown: handleKeyDown,
      isOpen: function () { return state.open; },
      open: open,
      pointerFocus: pointerFocus,
      render: render,
      setActiveFilters: setActiveFilters,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
