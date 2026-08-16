(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./language-flag')); }
  else { root.PloffChoiceDialogView = factory(root.PloffLanguageFlag); }
}(this, function (LanguageFlag) {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var CardLayout = values.CardLayout;
    var state = { open: false, index: 0, selectedIndex: -1, previewIndex: -1, title: '', choices: [], variant: '', previewOptions: {} };
    function node(id) { return documentRef.getElementById(id); }
    function snapshot() { return { open: state.open, index: state.index, title: state.title, choices: state.choices.slice(), variant: state.variant }; }
    function isCardPreviewVariant() { return state.variant === 'card-scale' || state.variant === 'artwork-quality'; }
    function setStyle(target, property, value) {
      if (!target || !target.style) { return; }
      if (typeof target.style.setProperty === 'function') { target.style.setProperty(property, String(value)); }
      else { target.style[property] = String(value); }
    }
    function centerFocusedOption(list, target) {
      var listRect;
      var targetRect;
      var viewportHeight;
      var targetHeight;
      var targetTop;
      var maxScroll;
      var nextScroll;
      if (!list || !target) { return; }
      listRect = list.getBoundingClientRect ? list.getBoundingClientRect() : null;
      targetRect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
      viewportHeight = Number(listRect && listRect.height || list.clientHeight || 0);
      targetHeight = Number(targetRect && targetRect.height || target.offsetHeight || 0);
      targetTop = targetRect && listRect
        ? Number(targetRect.top || 0) - Number(listRect.top || 0) + Number(list.scrollTop || 0)
        : Number(target.offsetTop || 0);
      if (viewportHeight > 0 && targetHeight > 0) {
        maxScroll = Math.max(0, Number(list.scrollHeight || 0) - viewportHeight);
        nextScroll = targetTop - Math.max(0, (viewportHeight - targetHeight) / 2);
        list.scrollTop = Math.max(0, Math.min(maxScroll, nextScroll));
      } else if (target.scrollIntoView) {
        target.scrollIntoView(false);
      }
    }
    function createPreviewCard(source) {
      var card = source && typeof source.cloneNode === 'function' ? source.cloneNode(true) : null;
      if (!card) { return null; }
      card.className = 'media-card poster choice-card-preview-item';
      card.setAttribute('aria-hidden', 'true');
      card.tabIndex = -1;
      if (card.removeAttribute) {
        card.removeAttribute('data-row-index');
        card.removeAttribute('data-column');
        card.removeAttribute('data-media-key');
      }
      setStyle(card, 'pointer-events', 'none');
      return card;
    }
    function createPreviewBackdrop(source) {
      var sourceUrl = source && ((source.getAttribute && source.getAttribute('src')) || source.currentSrc || source.src || '');
      var image = sourceUrl && typeof source.cloneNode === 'function' ? source.cloneNode(true) : null;
      if (!image) { return null; }
      image.className = 'choice-backdrop-preview';
      image.setAttribute('aria-hidden', 'true');
      image.tabIndex = -1;
      setStyle(image, 'pointer-events', 'none');
      return image;
    }
    function replaceQueryParameter(source, name, value) {
      var pattern = new RegExp('([?&])' + name + '=[^&]*', 'i');
      if (pattern.test(source)) { return source.replace(pattern, '$1' + name + '=' + value); }
      return source + (source.indexOf('?') === -1 ? '?' : '&') + name + '=' + value;
    }
    function qualitySource(source, width, height, quality) {
      var value = String(source || '');
      var factor = Math.max(1, Number(quality || 100)) / 100;
      if (!value || /^data:/i.test(value)) { return value; }
      return replaceQueryParameter(replaceQueryParameter(value, 'width', Math.round(width * factor)), 'height', Math.round(height * factor));
    }
    function setImageQuality(target, width, height, quality) {
      var images = target && target.getElementsByTagName ? target.getElementsByTagName('img') : [];
      var index;
      var source;
      for (index = 0; index < images.length; index += 1) {
        source = images[index].src || (images[index].getAttribute && images[index].getAttribute('src')) || '';
        if (source) { images[index].src = qualitySource(source, width, height, quality); }
      }
    }
    function buildPreviewContent(preview) {
      var row;
      var cards = documentRef.querySelectorAll ? documentRef.querySelectorAll('.media-card.poster') : [];
      var count = Math.min(1, cards ? cards.length : 0);
      var card;
      var index;
      var backdrops;
      if (state.variant === 'backdrop-quality') {
        backdrops = documentRef.querySelectorAll ? documentRef.querySelectorAll('.backdrop-image.is-active') : [];
        if (!backdrops || !backdrops.length) { backdrops = documentRef.querySelectorAll ? documentRef.querySelectorAll('.backdrop-image') : []; }
        card = backdrops && backdrops.length ? createPreviewBackdrop(backdrops[0]) : null;
        if (!card && state.previewOptions.backdropUrl) {
          card = documentRef.createElement('img');
          card.className = 'choice-backdrop-preview';
          card.src = state.previewOptions.backdropUrl;
          card.setAttribute('aria-hidden', 'true');
          card.tabIndex = -1;
          setStyle(card, 'pointer-events', 'none');
          preview.appendChild(card);
          preview.setAttribute('data-preview-source', 'server-backdrop');
          return;
        }
        if (card) {
          preview.appendChild(card);
          preview.setAttribute('data-preview-source', 'backdrop');
        } else {
          card = documentRef.createElement('span');
          card.className = 'choice-backdrop-preview-placeholder';
          card.setAttribute('aria-hidden', 'true');
          preview.appendChild(card);
          preview.setAttribute('data-preview-source', 'fallback');
        }
        return;
      }
      row = documentRef.createElement('span');
      row.className = 'choice-card-preview-row';
      row.setAttribute('aria-hidden', 'true');
      for (index = 0; index < count; index += 1) {
        card = createPreviewCard(cards[index]);
        if (card) { row.appendChild(card); }
      }
      if (!row.children.length) {
        for (index = 0; index < 1; index += 1) {
          card = documentRef.createElement('span');
          card.className = 'choice-card-preview-placeholder';
          card.setAttribute('aria-hidden', 'true');
          row.appendChild(card);
        }
        preview.setAttribute('data-preview-source', 'fallback');
      } else {
        preview.setAttribute('data-preview-source', 'media-cards');
      }
      preview.appendChild(row);
    }
    function applyCardProfile(preview, selected, quality) {
      var profile;
      var row;
      var cards;
      var index;
      if (!CardLayout || typeof CardLayout.profile !== 'function' || !selected) { return; }
      profile = CardLayout.profile(state.variant === 'card-scale' ? Number(selected.value) : state.previewOptions.cardScale);
      row = preview.children[0];
      if (!row) { return; }
      setStyle(preview, 'height', '');
      setStyle(row, 'height', (profile.metrics.height + 16) + 'px');
      setStyle(row, '--poster-card-width', profile.metrics.width + 'px');
      setStyle(row, '--poster-card-height', profile.metrics.height + 'px');
      setStyle(row, '--poster-image-height', profile.metrics.imageHeight + 'px');
      setStyle(row, '--poster-caption-height', profile.metrics.captionHeight + 'px');
      setStyle(row, '--poster-card-gap', profile.posterGap + 'px');
      setStyle(row, '--poster-title-font', profile.titleFont + 'px');
      setStyle(row, '--poster-meta-font', profile.metaFont + 'px');
      cards = row.children;
      for (index = 0; index < cards.length; index += 1) {
        setStyle(cards[index], 'transform', 'none');
        setStyle(cards[index], 'transform-origin', 'bottom center');
      }
      if (quality !== undefined) { setImageQuality(row, profile.metrics.width, profile.metrics.imageHeight, quality); }
    }
    function applyBackdropProfile(preview, selected) {
      var image = preview.children[0];
      var source;
      if (!image || !selected) { return; }
      source = image.src || (image.getAttribute && image.getAttribute('src')) || '';
      if (source) { image.src = qualitySource(source, 1920, 1080, selected.value); }
      preview.setAttribute('data-preview-quality', String(selected.value));
    }
    function setFocused(target, focused) {
      var className;
      if (!target) { return; }
      className = (' ' + target.className + ' ').replace(/\sis-focused\s/g, ' ').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
      target.className = className + (focused ? (className ? ' ' : '') + 'is-focused' : '');
    }
    function appendStatus(target, choice) {
      var status = String(choice && choice.status || '');
      var marker;
      if (status !== 'matched' && status !== 'unmatched') { return; }
      marker = documentRef.createElement('span');
      marker.className = 'choice-dialog-status is-' + status;
      marker.textContent = status === 'matched' ? '\u2713' : '\u00d7';
      marker.setAttribute('aria-hidden', 'true');
      target.appendChild(marker);
    }
    function updateFocus() {
      var list = node('choice-dialog-list');
      var index;
      for (index = 0; index < list.children.length; index += 1) {
        setFocused(list.children[index], index === state.index);
      }
      setFocused(node('choice-dialog-cancel'), state.index === state.choices.length);
      if (isCardPreviewVariant()) { list.scrollTop = 0; }
      else if (state.index < state.choices.length) { centerFocusedOption(list, list.children[state.index]); }
      updatePreview();
    }
    function updatePreview() {
      var preview = node('choice-dialog-preview');
      var selected;
      if (!preview) { return; }
      if (state.index >= 0 && state.index < state.choices.length) { state.previewIndex = state.index; }
      selected = state.choices[state.previewIndex] || state.choices[state.selectedIndex] || state.choices[0] || null;
      if ((state.variant !== 'card-scale' && state.variant !== 'artwork-quality' && state.variant !== 'backdrop-quality') || !selected) {
        preview.className = 'choice-dialog-preview is-hidden';
        return;
      }
      preview.className = 'choice-dialog-preview is-' + state.variant;
      preview.setAttribute('data-preview-value', String(selected.value));
      if (!preview.children.length) { buildPreviewContent(preview); }
      if (state.variant === 'backdrop-quality') { applyBackdropProfile(preview, selected); }
      else { applyCardProfile(preview, selected, state.variant === 'artwork-quality' ? selected.value : undefined); }
    }
    function render() {
      var list = node('choice-dialog-list');
      var button;
      var swatch;
      var flag;
      var label;
      var status;
      var index;
      var cancel = node('choice-dialog-cancel');
      var dialog = node('choice-dialog');
      node('choice-dialog-title').textContent = state.title;
      list.setAttribute('role', 'listbox');
      list.className = 'choice-dialog-list' + (isCardPreviewVariant() ? ' is-card-preview-list' : '');
      if (isCardPreviewVariant()) { list.scrollTop = 0; }
      list.innerHTML = '';
      for (index = 0; index < state.choices.length; index += 1) {
        button = documentRef.createElement('button');
        button.type = 'button';
        status = String(state.choices[index] && state.choices[index].status || '');
        button.className = 'choice-dialog-option' +
          (index === state.selectedIndex ? ' is-selected' : '') +
          (index === state.index ? ' is-focused' : '') +
          (status === 'matched' || status === 'unmatched' ? ' has-status is-' + status : '');
        button.setAttribute('data-choice-index', index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === state.selectedIndex ? 'true' : 'false');
        if (state.choices[index].color) {
          swatch = documentRef.createElement('span');
          swatch.className = 'choice-dialog-swatch';
          swatch.style = swatch.style || {};
          swatch.style.backgroundColor = state.choices[index].color;
          swatch.setAttribute('aria-hidden', 'true');
          label = documentRef.createElement('span');
          label.className = 'choice-dialog-label';
          label.textContent = state.choices[index].label;
          button.appendChild(swatch);
          button.appendChild(label);
        } else if (state.choices[index].languageCode && LanguageFlag) {
          flag = LanguageFlag.create(documentRef, state.choices[index].languageCode);
          label = documentRef.createElement('span');
          label.className = 'choice-dialog-label';
          label.textContent = state.choices[index].label;
          if (flag) { button.appendChild(flag); }
          button.appendChild(label);
        } else {
          button.textContent = state.choices[index].label;
        }
        appendStatus(button, state.choices[index]);
        list.appendChild(button);
      }
      cancel.textContent = values.t ? values.t('common.cancel') : 'Cancel';
      cancel.setAttribute('data-choice-index', state.choices.length);
      cancel.className = state.index === state.choices.length ? 'is-focused' : '';
      dialog.className = state.open ? 'choice-dialog' + (state.variant ? ' is-' + state.variant : '') : 'choice-dialog is-hidden';
      dialog.setAttribute('aria-hidden', state.open ? 'false' : 'true');
      updatePreview();
      button = state.index === state.choices.length ? cancel : list.children[state.index];
      if (button) {
        button.focus();
        if (button !== cancel && !isCardPreviewVariant()) { centerFocusedOption(list, button); }
      }
    }
    function open(title, choices, selectedValue, variant, previewOptions) {
      var index;
      state.open = true;
      state.title = String(title || '');
      state.choices = (choices || []).slice();
      state.variant = String(variant || '');
      state.previewOptions = previewOptions || {};
      state.index = 0;
      state.selectedIndex = -1;
      state.previewIndex = -1;
      for (index = 0; index < state.choices.length; index += 1) {
        if (String(state.choices[index].value) === String(selectedValue)) {
          state.index = index;
          state.selectedIndex = index;
          state.previewIndex = index;
          break;
        }
      }
      if (state.previewIndex < 0 && state.choices.length) { state.previewIndex = 0; }
      render();
      return snapshot();
    }
    function close() {
      var preview = node('choice-dialog-preview');
      state.open = false;
      state.variant = '';
      state.previewIndex = -1;
      state.previewOptions = {};
      node('choice-dialog').className = 'choice-dialog is-hidden';
      node('choice-dialog').setAttribute('aria-hidden', 'true');
      if (preview) {
        preview.className = 'choice-dialog-preview is-hidden';
        preview.innerHTML = '';
      }
    }
    function move(direction) {
      if (!state.open || !state.choices.length) { return snapshot(); }
      state.index = Math.max(0, Math.min(state.choices.length, state.index + direction));
      render();
      return snapshot();
    }
    function focus(index) {
      if (!state.open || index < 0 || index > state.choices.length) { return snapshot(); }
      state.index = index;
      updateFocus();
      return snapshot();
    }
    function selected() { return state.choices[state.index] || null; }
    return { open: open, close: close, move: move, focus: focus, selected: selected, snapshot: snapshot };
  }
  return { create: create };
}));
