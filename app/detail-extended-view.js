(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailExtendedView = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = {
      detail: null,
      extras: [],
      extrasLoading: false,
      active: false,
      row: 'anchor',
      castIndex: 0,
      extraIndex: 0,
      castWindowStart: -1,
      castWindowEnd: -1,
      extraWindowStart: -1,
      extraWindowEnd: -1
    };

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function element(tagName, className, text) {
      var result;
      if (values.element) { return values.element(tagName, className, text); }
      result = documentRef.createElement(tagName);
      result.className = className || '';
      if (text !== undefined) { result.textContent = String(text); }
      return result;
    }
    function t(key) { return values.t ? values.t(key) : key; }
    function setText(id, text) { var target = node(id); if (target) { target.textContent = String(text || ''); } }
    function setHidden(id, hidden) {
      var target = node(id);
      if (!target) { return; }
      target.className = String(target.className || '').replace(/\s*is-hidden/g, '');
      if (hidden) { target.className += ' is-hidden'; }
    }
    function castItems() { return state.detail && state.detail.cast || []; }
    function windowRange(count, index, visibleCount) {
      var start = Math.max(0, index - 2);
      start = Math.min(start, Math.max(0, count - visibleCount));
      return { start: start, end: Math.min(count, start + visibleCount) };
    }
    function bufferedRange(range, count) {
      return { start: Math.max(0, range.start - 1), end: Math.min(count, range.end + 1) };
    }
    function imageSpecification(image, source, priority) {
      var size = values.ProgressiveImages.renderedSize(image, 220, 124);
      var preview = values.ProgressiveImages.previewSize(size.width, size.height, 96);
      return {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: size.width,
        height: size.height,
        priority: priority,
        scope: 'detail-extended'
      };
    }
    function formatDuration(duration) {
      var seconds = Math.max(0, Math.round(Number(duration || 0) / 1000));
      var minutes = Math.floor(seconds / 60);
      var remainder = seconds % 60;
      return minutes + ':' + (remainder < 10 ? '0' : '') + remainder;
    }
    function castCardClass(position, visible) {
      return 'detail-cast-card' + (visible ? '' : ' is-buffered') + (state.row === 'cast' && position === state.castIndex ? ' is-focused' : '');
    }
    function extraCardClass(position, visible) {
      return 'detail-extra-card' + (visible ? '' : ' is-buffered') + (state.row === 'extras' && position === state.extraIndex ? ' is-focused' : '');
    }
    function renderMetadata() {
      var detail = state.detail || {};
      setText('detail-extended-title', t('detail.moreDetails'));
      setText('detail-extended-genres-label', t('detail.genres'));
      setText('detail-extended-genres-value', (detail.genres || []).join(' • '));
      setText('detail-extended-directors-label', t('detail.directors'));
      setText('detail-extended-directors-value', (detail.directors || []).join(' • '));
      setText('detail-cast-title', t('detail.cast'));
      setText('detail-extras-title', t('detail.extras'));
      setHidden('detail-cast-section', !castItems().length);
    }
    function renderCast() {
      var container = node('detail-cast-strip');
      var items = castItems();
      var visible = windowRange(items.length, state.castIndex, 6);
      var buffered = bufferedRange(visible, items.length);
      var jobs = [];
      var index;
      var person;
      var card;
      var image;
      var copy;
      if (!container || !state.active) { return; }
      container.innerHTML = '';
      for (index = buffered.start; index < buffered.end; index += 1) {
        person = items[index];
        card = element('button', castCardClass(index, index >= visible.start && index < visible.end));
        card.type = 'button';
        card.setAttribute('data-cast-position', index);
        card.setAttribute('data-cast-key', person.id || person.name || String(index));
        image = element('img', 'detail-cast-image');
        image.alt = '';
        card.appendChild(image);
        copy = element('span', 'detail-cast-copy');
        copy.appendChild(element('strong', 'detail-cast-name', person.name || ''));
        copy.appendChild(element('span', 'detail-cast-role', person.role || ''));
        card.appendChild(copy);
        container.appendChild(card);
        if (person.thumb) { jobs.push({ target: image, specification: imageSpecification(image, person.thumb, index === state.castIndex ? 0 : 1) }); }
      }
      state.castWindowStart = buffered.start;
      state.castWindowEnd = buffered.end;
      if (values.posterLoader && values.posterLoader.loadBatch && jobs.length) { values.posterLoader.loadBatch(jobs); }
    }
    function refreshCastSelection() {
      var items = castItems();
      var visible = windowRange(items.length, state.castIndex, 6);
      var buffered = bufferedRange(visible, items.length);
      var cards;
      var index;
      var position;
      if (buffered.start !== state.castWindowStart || buffered.end !== state.castWindowEnd) { renderCast(); return; }
      cards = node('detail-cast-strip') ? node('detail-cast-strip').querySelectorAll('.detail-cast-card[data-cast-position]') : [];
      for (index = 0; index < cards.length; index += 1) {
        position = Number(cards[index].getAttribute('data-cast-position'));
        cards[index].className = castCardClass(position, position >= visible.start && position < visible.end);
      }
    }
    function renderExtras() {
      var container = node('detail-extras-strip');
      var items = state.extras || [];
      var visible = windowRange(items.length, state.extraIndex, 5);
      var buffered = bufferedRange(visible, items.length);
      var jobs = [];
      var index;
      var item;
      var card;
      var image;
      var copy;
      if (!container || !state.active) { return; }
      container.innerHTML = '';
      for (index = buffered.start; index < buffered.end; index += 1) {
        item = items[index];
        card = element('button', extraCardClass(index, index >= visible.start && index < visible.end));
        card.type = 'button';
        card.setAttribute('data-extra-position', index);
        card.setAttribute('data-extra-key', item.ratingKey || String(index));
        image = element('img', 'detail-extra-image');
        image.alt = '';
        card.appendChild(image);
        copy = element('span', 'detail-extra-copy');
        copy.appendChild(element('strong', 'detail-extra-title', item.title || ''));
        copy.appendChild(element('span', 'detail-extra-meta', (item.subtype || t('detail.extra')) + (item.duration ? ' • ' + formatDuration(item.duration) : '')));
        card.appendChild(copy);
        container.appendChild(card);
        if (item.image) { jobs.push({ target: image, specification: imageSpecification(image, item.image, index === state.extraIndex ? 0 : 1) }); }
      }
      state.extraWindowStart = buffered.start;
      state.extraWindowEnd = buffered.end;
      if (values.posterLoader && values.posterLoader.loadBatch && jobs.length) { values.posterLoader.loadBatch(jobs); }
    }
    function refreshExtraSelection() {
      var items = state.extras || [];
      var visible = windowRange(items.length, state.extraIndex, 5);
      var buffered = bufferedRange(visible, items.length);
      var cards;
      var index;
      var position;
      if (buffered.start !== state.extraWindowStart || buffered.end !== state.extraWindowEnd) { renderExtras(); return; }
      cards = node('detail-extras-strip') ? node('detail-extras-strip').querySelectorAll('.detail-extra-card[data-extra-position]') : [];
      for (index = 0; index < cards.length; index += 1) {
        position = Number(cards[index].getAttribute('data-extra-position'));
        cards[index].className = extraCardClass(position, position >= visible.start && position < visible.end);
      }
    }
    function setDetail(detail) {
      state.detail = detail || null;
      state.castIndex = 0;
      if (state.active) {
        if (state.row === 'anchor' && castItems().length) { state.row = 'cast'; }
        renderMetadata();
        renderCast();
      }
      return state.detail;
    }
    function setExtrasLoading(value) {
      state.extrasLoading = value === true;
      setHidden('detail-extras-section', !state.extrasLoading && !state.extras.length);
      setText('detail-extras-status', state.extrasLoading ? t('detail.extrasLoading') : '');
      return state.extrasLoading;
    }
    function setExtras(items) {
      state.extras = (items || []).slice();
      state.extrasLoading = false;
      state.extraIndex = clamp(state.extraIndex, 0, Math.max(0, state.extras.length - 1));
      setHidden('detail-extras-section', !state.extras.length);
      setText('detail-extras-status', '');
      if (!castItems().length && state.extras.length) { state.row = 'extras'; }
      if (state.active) { renderExtras(); }
      return state.extras.slice();
    }
    function enter() {
      state.active = true;
      state.castIndex = clamp(state.castIndex, 0, Math.max(0, castItems().length - 1));
      state.extraIndex = clamp(state.extraIndex, 0, Math.max(0, state.extras.length - 1));
      state.row = castItems().length ? 'cast' : (state.extras.length ? 'extras' : 'anchor');
      renderMetadata();
      renderCast();
      renderExtras();
      setExtrasLoading(state.extrasLoading);
      return snapshot();
    }
    function leave() { state.active = false; return snapshot(); }
    function atTop() { return state.row !== 'extras' || !castItems().length; }
    function select(row, index) {
      if (!state.active) { return false; }
      if (row === 'cast' && castItems().length) {
        state.row = 'cast';
        state.castIndex = clamp(Number(index) || 0, 0, castItems().length - 1);
        refreshCastSelection();
        if (state.extras.length) { refreshExtraSelection(); }
        return true;
      }
      if (row === 'extras' && state.extras.length) {
        state.row = 'extras';
        state.extraIndex = clamp(Number(index) || 0, 0, state.extras.length - 1);
        if (castItems().length) { refreshCastSelection(); }
        refreshExtraSelection();
        return true;
      }
      return false;
    }
    function selectedExtra() {
      var source;
      var result = {};
      var key;
      if (state.row !== 'extras') { return null; }
      source = state.extras[state.extraIndex];
      if (!source) { return null; }
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }
    function focusTarget() {
      var cards;
      var index;
      var position;
      if (state.row === 'cast' && node('detail-cast-strip')) {
        cards = node('detail-cast-strip').querySelectorAll('.detail-cast-card[data-cast-position]');
        for (index = 0; index < cards.length; index += 1) {
          position = Number(cards[index].getAttribute('data-cast-position'));
          if (position === state.castIndex) { return cards[index]; }
        }
      }
      if (state.row === 'extras' && node('detail-extras-strip')) {
        cards = node('detail-extras-strip').querySelectorAll('.detail-extra-card[data-extra-position]');
        for (index = 0; index < cards.length; index += 1) {
          position = Number(cards[index].getAttribute('data-extra-position'));
          if (position === state.extraIndex) { return cards[index]; }
        }
      }
      return node('detail-extended-anchor');
    }
    function navigate(direction) {
      if (state.row === 'cast') {
        if (direction === 'left' || direction === 'right') {
          state.castIndex = clamp(state.castIndex + (direction === 'left' ? -1 : 1), 0, Math.max(0, castItems().length - 1));
          refreshCastSelection();
        } else if (direction === 'down' && state.extras.length) {
          state.row = 'extras';
          refreshCastSelection();
          refreshExtraSelection();
        } else if (direction === 'up') { return { row: state.row, leave: true }; }
      } else if (state.row === 'extras') {
        if (direction === 'left' || direction === 'right') {
          state.extraIndex = clamp(state.extraIndex + (direction === 'left' ? -1 : 1), 0, Math.max(0, state.extras.length - 1));
          refreshExtraSelection();
        } else if (direction === 'up') {
          if (castItems().length) { state.row = 'cast'; refreshCastSelection(); refreshExtraSelection(); }
          else { return { row: state.row, leave: true }; }
        }
      } else if (direction === 'up') { return { row: state.row, leave: true }; }
      else if (direction === 'down' && state.extras.length) { state.row = 'extras'; refreshExtraSelection(); }
      return { row: state.row, leave: false };
    }
    function snapshot() {
      return {
        active: state.active,
        row: state.row,
        castIndex: state.castIndex,
        extraIndex: state.extraIndex,
        extrasLoading: state.extrasLoading,
        extrasCount: state.extras.length
      };
    }
    function reset() {
      state.detail = null;
      state.extras = [];
      state.extrasLoading = false;
      state.active = false;
      state.row = 'anchor';
      state.castIndex = 0;
      state.extraIndex = 0;
      state.castWindowStart = -1;
      state.castWindowEnd = -1;
      state.extraWindowStart = -1;
      state.extraWindowEnd = -1;
      if (node('detail-cast-strip')) { node('detail-cast-strip').innerHTML = ''; }
      if (node('detail-extras-strip')) { node('detail-extras-strip').innerHTML = ''; }
      setText('detail-extras-status', '');
      setHidden('detail-cast-section', true);
      setHidden('detail-extras-section', true);
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('detail-extended'); }
      return snapshot();
    }

    return {
      setDetail: setDetail,
      setExtrasLoading: setExtrasLoading,
      setExtras: setExtras,
      enter: enter,
      leave: leave,
      atTop: atTop,
      select: select,
      selectedExtra: selectedExtra,
      focusTarget: focusTarget,
      navigate: navigate,
      snapshot: snapshot,
      reset: reset
    };
  }

  return { create: create };
}));
