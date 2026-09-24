(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailEpisodeView = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function key(item) { return String(item && item.ratingKey || ''); }
  function cardKey(item) { return String(item && item.serverMachineIdentifier || '') + ':' + key(item); }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = {
      context: null, seasonIndex: 0, episodeIndex: 0,
      episodeVisibleStart: 0, episodePointerPinned: false,
      renderedWindowStart: -1, renderedWindowEnd: -1, renderedEpisodeIndex: -1,
      cardsByPosition: {}, labelsByPosition: {}, activePanLabel: null
    };

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function element(tagName, className, text) {
      if (values.element) { return values.element(tagName, className, text); }
      var result = documentRef.createElement(tagName);
      result.className = className || '';
      if (text !== undefined) { result.textContent = String(text); }
      return result;
    }
    function selectedIndex(items) {
      var index;
      for (index = 0; index < (items || []).length; index += 1) { if (items[index].selected) { return index; } }
      return 0;
    }
    function pad(value) { return Number(value) < 10 ? '0' + Number(value) : String(value); }
    function durationLabel(duration) {
      var total = Math.round(Number(duration) / 1000);
      var hours;
      var minutes;
      var seconds;
      if (!isFinite(total) || total <= 0) { return '--:--'; }
      hours = Math.floor(total / 3600);
      minutes = Math.floor((total % 3600) / 60);
      seconds = total % 60;
      return (hours > 0 ? String(hours) + ':' + pad(minutes) : pad(minutes)) + ':' + pad(seconds);
    }
    function windowRange() {
      var episodes = state.context && state.context.episodes || [];
      var start = state.episodePointerPinned ? state.episodeVisibleStart : Math.max(0, state.episodeIndex - 2);
      start = Math.min(start, Math.max(0, episodes.length - 5));
      if (state.episodeIndex < start) { start = state.episodeIndex; }
      else if (state.episodeIndex >= start + 5) { start = state.episodeIndex - 4; }
      state.episodeVisibleStart = start;
      return { start: start, end: Math.min(episodes.length, start + 5) };
    }
    function setEpisodeOverflowButton(id, visible, label) {
      var button = node(id);
      if (!button) { return; }
      button.className = String(button.className || '').replace(/\s+is-visible\b/g, '') + (visible ? ' is-visible' : '');
      button.disabled = !visible;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      button.setAttribute('aria-label', label);
    }
    function updateEpisodeOverflow(range) {
      var episodes = state.context && state.context.episodes || [];
      setEpisodeOverflowButton('episode-overflow-left', range.start > 0, values.t ? values.t('detail.scrollEpisodesLeft') : 'Scroll episodes left');
      setEpisodeOverflowButton('episode-overflow-right', range.end < episodes.length, values.t ? values.t('detail.scrollEpisodesRight') : 'Scroll episodes right');
    }
    function scrollEpisodes(direction) {
      var episodes = state.context && state.context.episodes || [];
      var nextStart = clamp(state.episodeVisibleStart + (direction < 0 ? -1 : 1), 0, Math.max(0, episodes.length - 5));
      if (nextStart === state.episodeVisibleStart) { return false; }
      state.episodePointerPinned = true;
      state.episodeVisibleStart = nextStart;
      state.episodeIndex = clamp(state.episodeIndex, nextStart, nextStart + 4);
      renderEpisodes();
      if (values.onEpisodeBrowse) { values.onEpisodeBrowse(state.episodeIndex); }
      return true;
    }
    function bindEpisodeOverflowButtons() {
      var left = node('episode-overflow-left');
      var right = node('episode-overflow-right');
      if (left && !left._detailEpisodeScrollBound) { left.onclick = function () { scrollEpisodes(-1); }; left._detailEpisodeScrollBound = true; }
      if (right && !right._detailEpisodeScrollBound) { right.onclick = function () { scrollEpisodes(1); }; right._detailEpisodeScrollBound = true; }
    }
    function bufferedRange(visibleRange) {
      var episodes = state.context && state.context.episodes || [];
      return {
        start: Math.max(0, visibleRange.start - 2),
        end: Math.min(episodes.length, visibleRange.end + 2)
      };
    }
    function snapshot() {
      return { context: state.context, seasonIndex: state.seasonIndex, episodeIndex: state.episodeIndex, window: windowRange() };
    }
    function setContext(context, preserveKeys) {
      var previous = preserveKeys || {};
      var index;
      state.context = context || null;
      state.seasonIndex = selectedIndex(context && context.seasons || []);
      state.episodeIndex = selectedIndex(context && context.episodes || []);
      state.episodePointerPinned = false;
      state.episodeVisibleStart = 0;
      if (previous.seasonKey) {
        for (index = 0; context && index < context.seasons.length; index += 1) {
          if (key(context.seasons[index]) === String(previous.seasonKey)) { state.seasonIndex = index; break; }
        }
      }
      if (previous.episodeKey) {
        for (index = 0; context && index < context.episodes.length; index += 1) {
          if (key(context.episodes[index]) === String(previous.episodeKey)) { state.episodeIndex = index; break; }
        }
      }
      render(true);
    }
    function setEpisodes(episodes, selectedKey) {
      var index;
      if (!state.context) { return; }
      state.context.episodes = episodes || [];
      state.episodeIndex = selectedIndex(state.context.episodes);
      state.episodePointerPinned = false;
      state.episodeVisibleStart = 0;
      if (selectedKey) {
        for (index = 0; index < state.context.episodes.length; index += 1) {
          if (key(state.context.episodes[index]) === String(selectedKey)) { state.episodeIndex = index; break; }
        }
      }
      renderEpisodes(true);
    }
    function setSeasonIndex(index, renderNow) {
      var seasons = state.context && state.context.seasons || [];
      state.seasonIndex = clamp(Number(index) || 0, 0, Math.max(0, seasons.length - 1));
      if (renderNow !== false) { renderSeasons(); }
      else { ensureSeasonVisible(); }
      return state.seasonIndex;
    }
    function setEpisodeIndex(index, renderNow) {
      var episodes = state.context && state.context.episodes || [];
      state.episodePointerPinned = false;
      state.episodeIndex = clamp(Number(index) || 0, 0, Math.max(0, episodes.length - 1));
      if (renderNow !== false) { renderEpisodes(); }
      return state.episodeIndex;
    }
    function currentSeason() { return state.context && state.context.seasons[state.seasonIndex] || null; }

    function seasonTabsTrack() { return node('season-tabs-track') || node('season-tabs'); }

    function setSeasonOverflowIndicator(id, visible) {
      var indicator = node(id);
      if (!indicator) { return; }
      indicator.className = String(indicator.className || '').replace(/\s+is-visible\b/g, '') + (visible ? ' is-visible' : '');
    }

    function updateSeasonOverflow() {
      var track = seasonTabsTrack();
      var clippedLeft;
      var clippedRight;
      var maximum;
      var scrollLeft;
      if (!track) { return; }
      maximum = Math.max(0, Number(track.scrollWidth || 0) - Number(track.clientWidth || 0));
      scrollLeft = Math.max(0, Number(track.scrollLeft || 0));
      clippedLeft = scrollLeft > 2;
      clippedRight = maximum - scrollLeft > 2;
      track.className = String(track.className || '').replace(/\s+is-clipped-(?:left|right)\b/g, '') + (clippedLeft ? ' is-clipped-left' : '') + (clippedRight ? ' is-clipped-right' : '');
      setSeasonOverflowIndicator('season-tabs-overflow-left', clippedLeft);
      setSeasonOverflowIndicator('season-tabs-overflow-right', clippedRight);
    }

    function refreshSeasonOverflow() { ensureSeasonVisible(); }

    function seasonTabAt(track, position) {
      var children = track && track.children || [];
      var index;
      for (index = 0; index < children.length; index += 1) {
        if (String(children[index].getAttribute && children[index].getAttribute('data-season-position') || '') === String(position)) {
          return children[index];
        }
      }
      return null;
    }

    function ensureSeasonVisible() {
      var track = seasonTabsTrack();
      var target = seasonTabAt(track, state.seasonIndex);
      var viewportWidth;
      var scrollLeft;
      var maximum;
      var targetLeft;
      var targetRight;
      var targetRect;
      var trackRect;
      var nextScroll;
      var children;
      var isLastTarget;
      if (!track || !target) { updateSeasonOverflow(); return; }
      children = track.children || [];
      isLastTarget = children.length > 0 && target === children[children.length - 1];
      viewportWidth = Number(track.clientWidth || 0);
      scrollLeft = Math.max(0, Number(track.scrollLeft || 0));
      maximum = Math.max(0, Number(track.scrollWidth || 0) - viewportWidth);
      targetLeft = Number(target.offsetLeft);
      targetRight = targetLeft + Number(target.offsetWidth);
      if (!isFinite(targetLeft) || !isFinite(targetRight) || targetRight <= targetLeft) {
        if (!target.getBoundingClientRect || !track.getBoundingClientRect) { updateSeasonOverflow(); return; }
        targetRect = target.getBoundingClientRect();
        trackRect = track.getBoundingClientRect();
        targetLeft = Number(targetRect.left) - Number(trackRect.left) + scrollLeft;
        targetRight = targetLeft + Number(targetRect.width || target.offsetWidth || 0);
      }
      if (!viewportWidth || !isFinite(targetLeft) || !isFinite(targetRight)) { updateSeasonOverflow(); return; }
      nextScroll = isLastTarget ? maximum : scrollLeft;
      if (!isLastTarget && targetLeft < scrollLeft + 6) { nextScroll = targetLeft - 10; }
      else if (!isLastTarget && targetRight > scrollLeft + viewportWidth - 6) { nextScroll = targetRight - viewportWidth + 10; }
      nextScroll = Math.max(0, Math.min(maximum, nextScroll));
      if (Number(track.scrollLeft || 0) !== nextScroll) { track.scrollLeft = nextScroll; }
      updateSeasonOverflow();
    }

    function renderSeasons() {
      var container = node('season-tabs');
      var track = seasonTabsTrack();
      var seasons = state.context && state.context.seasons || [];
      var existing = {};
      var desired = [];
      var index;
      var button;
      var identity;
      var title;
      var reorder = false;
      if (!container || !track) { return; }
      for (index = 0; index < track.children.length; index += 1) {
        button = track.children[index];
        identity = button.getAttribute && button.getAttribute('data-season-key');
        if (identity) { existing[identity] = button; }
      }
      for (index = 0; index < seasons.length; index += 1) {
        identity = key(seasons[index]) ? cardKey(seasons[index]) : 'position:' + index;
        title = values.mediaTitle ? values.mediaTitle(seasons[index]) : seasons[index].title;
        button = existing[identity];
        if (!button) {
          button = element('button', 'season-tab', title);
          button.type = 'button';
          button.setAttribute('data-season-key', identity);
          button.onclick = function () { if (values.onSeasonActivate) { values.onSeasonActivate(Number(this.getAttribute('data-season-position'))); } };
        }
        button.className = 'season-tab' + (index === state.seasonIndex ? ' is-current' : '');
        if (button.textContent !== title) { button.textContent = title; }
        button.setAttribute('data-season-position', index);
        desired.push(button);
        delete existing[identity];
      }
      Object.keys(existing).forEach(function (staleKey) { track.removeChild(existing[staleKey]); });
      for (index = 0; index < desired.length; index += 1) {
        if (track.children[index] !== desired[index]) { reorder = true; break; }
      }
      if (reorder) { desired.forEach(function (next) { track.appendChild(next); }); }
      ensureSeasonVisible();
    }
    function imageSpecification(image, source, priority, episode) {
      var size = values.ProgressiveImages.renderedSize(image, 310, 168);
      var preview = values.ProgressiveImages.previewSize(size.width, size.height, 128);
      var owner = String(episode && episode.serverMachineIdentifier || '');
      var specification = { source: source, previewWidth: preview.width, previewHeight: preview.height, width: size.width, height: size.height, priority: priority, scope: 'detail-episodes' };
      if (typeof values.sourceContext === 'function') { specification.sourceContext = values.sourceContext() || null; }
      if (owner) {
        specification.sourceOwnerMachineIdentifier = owner;
        specification.sourceIdentity = 'server:' + owner;
      }
      return specification;
    }
    function updateCard(card, episode, position, visibleRange) {
      var progress = clamp(Number(episode && episode.progress || 0), 0, 100);
      var track = card.querySelector('.episode-progress-track');
      var value = card.querySelector('.episode-progress-value');
      var duration = card.querySelector('.episode-duration-badge');
      var focused = card.className.indexOf('is-focused') !== -1;
      var current = Number(position) === state.episodeIndex;
      var buffered = visibleRange && (Number(position) < visibleRange.start || Number(position) >= visibleRange.end);
      card.className = 'episode-card' + (episode.viewed ? ' is-viewed' : '') + (current ? ' is-current' : '') + (focused ? ' is-focused' : '') + (buffered ? ' is-buffered' : '');
      if (duration) { duration.textContent = durationLabel(episode && episode.duration); }
      if (track && value) {
        track.className = 'episode-progress-track' + (progress > 0 && progress < 100 ? '' : ' is-hidden');
        value.style.width = progress + '%';
      }
    }
    function setCurrentCard(card, current) {
      if (!card) { return; }
      card.className = String(card.className || '').replace(/\s+is-current\b/g, '') + (current ? ' is-current' : '');
    }
    function renderEpisodes(refreshArtwork) {
      var container = node('episode-strip');
      var episodes = state.context && state.context.episodes || [];
      var range = windowRange();
      var preloadRange = bufferedRange(range);
      var existing = {};
      var desired = [];
      var jobs = [];
      var index;
      var episode;
      var card;
      var imageFrame;
      var image;
      var track;
      var progress;
      var label;
      var cardsByPosition = {};
      var labelsByPosition = {};
      if (!container) { return; }
      bindEpisodeOverflowButtons();
      stopTitlePan();
      Array.prototype.slice.call(container.querySelectorAll('.episode-card[data-episode-position]')).forEach(function (existingCard) {
        existing[String(existingCard.getAttribute('data-episode-key') || '')] = existingCard;
      });
      for (index = preloadRange.start; index < preloadRange.end; index += 1) {
        episode = episodes[index];
        card = existing[cardKey(episode)] || null;
        if (!card) {
          card = element('button', 'episode-card');
          card.type = 'button';
          imageFrame = element('span', 'episode-image-frame');
          image = element('img', 'episode-image'); image.alt = ''; imageFrame.appendChild(image); card.appendChild(imageFrame);
          card.appendChild(element('span', 'episode-duration-badge', durationLabel(episode.duration)));
          track = element('span', 'episode-progress-track'); progress = element('span', 'episode-progress-value'); track.appendChild(progress); card.appendChild(track);
          label = element('span', 'episode-label'); label.appendChild(element('span', 'episode-label-text')); card.appendChild(label);
          card.onclick = function () { if (values.onEpisodeActivate) { values.onEpisodeActivate(Number(this.getAttribute('data-episode-position'))); } };
          jobs.push({ target: image, specification: imageSpecification(image, episode.image, index === state.episodeIndex ? 0 : 1, episode) });
        } else if (refreshArtwork === true) {
          image = card.querySelector('.episode-image');
          if (image) { jobs.push({ target: image, specification: imageSpecification(image, episode.image, index === state.episodeIndex ? 0 : 1, episode) }); }
        }
        card.setAttribute('data-episode-position', index);
        card.setAttribute('data-episode-key', cardKey(episode));
        label = card.querySelector('.episode-label-text');
        if (label) { label.textContent = 'E' + pad(episode.index) + ' - ' + (values.mediaTitle ? values.mediaTitle(episode) : String(episode.title || '')); }
        updateCard(card, episode, index, range);
        cardsByPosition[String(index)] = card;
        labelsByPosition[String(index)] = label;
        desired.push(card);
        delete existing[cardKey(episode)];
      }
      Object.keys(existing).forEach(function (existingKey) {
        var staleCard = existing[existingKey];
        var staleImage = refreshArtwork === true && staleCard.querySelector('.episode-image');
        if (staleImage && values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(staleImage); }
        container.removeChild(staleCard);
      });
      desired.forEach(function (desiredCard) { container.appendChild(desiredCard); });
      state.renderedWindowStart = range.start;
      state.renderedWindowEnd = range.end;
      state.renderedEpisodeIndex = state.episodeIndex;
      state.cardsByPosition = cardsByPosition;
      state.labelsByPosition = labelsByPosition;
      updateEpisodeOverflow(range);
      if (values.posterLoader && jobs.length) { values.posterLoader.loadBatch(jobs); }
      markOverflowingTitles();
    }
    function refreshSelection() {
      var range = windowRange();
      var previousPosition = state.renderedEpisodeIndex;
      var card;
      if (range.start !== state.renderedWindowStart || range.end !== state.renderedWindowEnd) {
        renderEpisodes();
        return;
      }
      updateEpisodeOverflow(range);
      if (previousPosition === state.episodeIndex) { return; }
      stopTitlePan();
      card = state.cardsByPosition[String(previousPosition)] || null;
      setCurrentCard(card, false);
      card = state.cardsByPosition[String(state.episodeIndex)] || null;
      setCurrentCard(card, true);
      state.renderedEpisodeIndex = state.episodeIndex;
    }
    function render(refreshArtwork) { renderSeasons(); renderEpisodes(refreshArtwork === true); }
    function refreshPlaybackCards() {
      var cards = documentRef.querySelectorAll('.episode-card[data-episode-position]');
      var range = windowRange();
      var index;
      var position;
      for (index = 0; index < cards.length; index += 1) {
        position = Number(cards[index].getAttribute('data-episode-position'));
        if (state.context && state.context.episodes[position]) { updateCard(cards[index], state.context.episodes[position], position, range); }
      }
    }
    function reconcilePlayback(freshEpisodes) {
      var freshByKey = {};
      var index;
      var episode;
      var fresh;
      for (index = 0; index < (freshEpisodes || []).length; index += 1) { freshByKey[key(freshEpisodes[index])] = freshEpisodes[index]; }
      for (index = 0; state.context && index < state.context.episodes.length; index += 1) {
        episode = state.context.episodes[index]; fresh = freshByKey[key(episode)];
        if (!fresh) { continue; }
        episode.viewed = fresh.viewed; episode.viewOffset = fresh.viewOffset; episode.duration = fresh.duration; episode.progress = fresh.progress;
      }
      refreshPlaybackCards();
    }
    function markOverflowingTitles() {
      var labels = documentRef.querySelectorAll('.episode-label-text');
      var index;
      var label;
      var visibleWidth;
      var contentWidth;
      var distance;
      var parentWidth;
      for (index = 0; index < labels.length; index += 1) {
        label = labels[index];
        label.className = String(label.className || '').replace(/\s+is-overflowing\b/g, '');
        if (label.removeAttribute) { label.removeAttribute('data-pan-distance'); }
        if (label.style) {
          if (label.style.removeProperty) { label.style.removeProperty('--text-marquee-distance'); }
          else { label.style['--text-marquee-distance'] = ''; }
        }
        visibleWidth = Number(label.clientWidth || 0);
        parentWidth = Number(label.parentNode && label.parentNode.clientWidth || 0);
        if (!visibleWidth && parentWidth) { visibleWidth = Math.max(0, parentWidth - 20); }
        contentWidth = Number(label.scrollWidth || 0);
        if (!contentWidth && label.getBoundingClientRect) { contentWidth = Number(label.getBoundingClientRect().width || 0); }
        distance = Math.ceil(contentWidth - visibleWidth);
        if (distance > 1) {
          label.className += ' is-overflowing';
          label.setAttribute('data-pan-distance', distance);
          if (label.style) {
            if (label.style.setProperty) { label.style.setProperty('--text-marquee-distance', '-' + distance + 'px'); }
            else { label.style['--text-marquee-distance'] = '-' + distance + 'px'; }
          }
        }
      }
    }
    function stopTitlePan() {
      var label = state.activePanLabel;
      state.activePanLabel = null;
      if (label) { label.className = String(label.className || '').replace(/\s+is-pan-active\b/g, ''); }
    }
    function startTitlePan(card) {
      var label;
      var position;
      var distance;
      stopTitlePan();
      if (!card || card.className.indexOf('episode-card') === -1) { return; }
      position = String(card.getAttribute('data-episode-position') || '');
      if (state.cardsByPosition[position] !== card) { return; }
      label = state.labelsByPosition[position] || null; distance = Number(label && label.getAttribute('data-pan-distance') || 0);
      if (!distance) { return; }
      state.activePanLabel = label;
      label.className = String(label.className || '').replace(/\s+is-pan-active\b/g, '') + ' is-pan-active';
    }
    function reset() {
      stopTitlePan();
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('detail-episodes'); }
      state.context = null; state.seasonIndex = 0; state.episodeIndex = 0;
      state.episodeVisibleStart = 0; state.episodePointerPinned = false;
      state.renderedWindowStart = -1; state.renderedWindowEnd = -1; state.renderedEpisodeIndex = -1; state.cardsByPosition = {}; state.labelsByPosition = {};
      if (seasonTabsTrack()) { seasonTabsTrack().innerHTML = ''; }
      updateSeasonOverflow();
      if (node('episode-strip')) { node('episode-strip').innerHTML = ''; }
      updateEpisodeOverflow(windowRange());
    }

    return {
      snapshot: snapshot, setContext: setContext, setEpisodes: setEpisodes,
      setSeasonIndex: setSeasonIndex, setEpisodeIndex: setEpisodeIndex,
      scrollEpisodes: scrollEpisodes,
      currentSeason: currentSeason,
      refreshSeasonOverflow: refreshSeasonOverflow,
      render: render, refreshSelection: refreshSelection,
      refreshPlaybackCards: refreshPlaybackCards, reconcilePlayback: reconcilePlayback,
      cardAt: function (position) { return state.cardsByPosition[String(Number(position))] || null; },
      startTitlePan: startTitlePan, reset: reset
    };
  }

  return { create: create };
}));
