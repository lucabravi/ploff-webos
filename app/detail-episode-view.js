(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailEpisodeView = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function key(item) { return String(item && item.ratingKey || ''); }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { context: null, seasonIndex: 0, episodeIndex: 0, panTimers: [], panToken: 0 };

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
    function windowRange() {
      var episodes = state.context && state.context.episodes || [];
      var start = Math.max(0, state.episodeIndex - 2);
      start = Math.min(start, Math.max(0, episodes.length - 5));
      return { start: start, end: Math.min(episodes.length, start + 5) };
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
      render();
    }
    function setEpisodes(episodes, selectedKey) {
      var index;
      if (!state.context) { return; }
      state.context.episodes = episodes || [];
      state.episodeIndex = selectedIndex(state.context.episodes);
      if (selectedKey) {
        for (index = 0; index < state.context.episodes.length; index += 1) {
          if (key(state.context.episodes[index]) === String(selectedKey)) { state.episodeIndex = index; break; }
        }
      }
      renderEpisodes();
    }
    function setSeasonIndex(index, renderNow) {
      var seasons = state.context && state.context.seasons || [];
      state.seasonIndex = clamp(Number(index) || 0, 0, Math.max(0, seasons.length - 1));
      if (renderNow !== false) { renderSeasons(); }
      return state.seasonIndex;
    }
    function setEpisodeIndex(index, renderNow) {
      var episodes = state.context && state.context.episodes || [];
      state.episodeIndex = clamp(Number(index) || 0, 0, Math.max(0, episodes.length - 1));
      if (renderNow !== false) { renderEpisodes(); }
      return state.episodeIndex;
    }
    function currentSeason() { return state.context && state.context.seasons[state.seasonIndex] || null; }
    function currentEpisode() { return state.context && state.context.episodes[state.episodeIndex] || null; }

    function renderSeasons() {
      var container = node('season-tabs');
      var seasons = state.context && state.context.seasons || [];
      var index;
      var button;
      if (!container) { return; }
      container.innerHTML = '';
      for (index = 0; index < seasons.length; index += 1) {
        button = element('button', 'season-tab' + (index === state.seasonIndex ? ' is-current' : ''), seasons[index].title);
        button.type = 'button';
        button.setAttribute('data-season-position', index);
        button.onclick = function () { if (values.onSeasonActivate) { values.onSeasonActivate(Number(this.getAttribute('data-season-position'))); } };
        container.appendChild(button);
      }
    }
    function imageSpecification(image, source, priority) {
      var rect = image && image.getBoundingClientRect ? image.getBoundingClientRect() : null;
      var width = Math.ceil(rect && rect.width ? rect.width : (image.clientWidth || 310));
      var height = Math.ceil(rect && rect.height ? rect.height : (image.clientHeight || 124));
      var preview = values.ProgressiveImages.previewSize(width, height, 128);
      return { source: source, previewWidth: preview.width, previewHeight: preview.height, width: width, height: height, priority: priority, scope: 'detail' };
    }
    function updateCard(card, episode) {
      var progress = clamp(Number(episode && episode.progress || 0), 0, 100);
      var track = card.querySelector('.episode-progress-track');
      var value = card.querySelector('.episode-progress-value');
      var focused = card.className.indexOf('is-focused') !== -1;
      var current = card.className.indexOf('is-current') !== -1;
      card.className = 'episode-card' + (episode.viewed ? ' is-viewed' : '') + (current ? ' is-current' : '') + (focused ? ' is-focused' : '');
      if (track && value) {
        track.className = 'episode-progress-track' + (!episode.viewed && progress > 0 ? '' : ' is-hidden');
        value.style.width = progress + '%';
      }
    }
    function renderEpisodes() {
      var container = node('episode-strip');
      var episodes = state.context && state.context.episodes || [];
      var range = windowRange();
      var jobs = [];
      var index;
      var episode;
      var card;
      var image;
      var track;
      var progress;
      var label;
      if (!container) { return; }
      stopTitlePan();
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('detail-episodes'); }
      container.innerHTML = '';
      for (index = range.start; index < range.end; index += 1) {
        episode = episodes[index];
        card = element('button', 'episode-card' + (episode.viewed ? ' is-viewed' : '') + (index === state.episodeIndex ? ' is-current' : ''));
        card.type = 'button';
        card.setAttribute('data-episode-position', index);
        image = element('img', 'episode-image'); image.alt = ''; card.appendChild(image);
        track = element('span', 'episode-progress-track'); progress = element('span', 'episode-progress-value'); track.appendChild(progress); card.appendChild(track);
        label = element('span', 'episode-label'); label.appendChild(element('span', 'episode-label-text', 'E' + pad(episode.index) + ' - ' + episode.title)); card.appendChild(label);
        card.onclick = function () { if (values.onEpisodeActivate) { values.onEpisodeActivate(Number(this.getAttribute('data-episode-position'))); } };
        container.appendChild(card);
        updateCard(card, episode);
        jobs.push({ target: image, specification: imageSpecification(image, episode.image, index === state.episodeIndex ? 0 : 1) });
      }
      if (values.posterLoader) { values.posterLoader.loadBatch(jobs); }
      markOverflowingTitles();
    }
    function render() { renderSeasons(); renderEpisodes(); }
    function refreshPlaybackCards() {
      var cards = documentRef.querySelectorAll('.episode-card[data-episode-position]');
      var index;
      var position;
      for (index = 0; index < cards.length; index += 1) {
        position = Number(cards[index].getAttribute('data-episode-position'));
        if (state.context && state.context.episodes[position]) { updateCard(cards[index], state.context.episodes[position]); }
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
      var distance;
      for (index = 0; index < labels.length; index += 1) {
        label = labels[index];
        distance = Math.ceil(label.getBoundingClientRect().width - (label.parentNode.clientWidth - 20));
        if (distance > 1) { label.className += ' is-overflowing'; label.setAttribute('data-pan-distance', distance); }
      }
    }
    function stopTitlePan() {
      var labels = documentRef.querySelectorAll('.episode-label-text');
      var index;
      state.panToken += 1;
      while (state.panTimers.length) { values.root.clearTimeout(state.panTimers.pop()); }
      for (index = 0; index < labels.length; index += 1) { labels[index].style.transition = 'none'; labels[index].style.transform = 'translateX(0)'; }
    }
    function startTitlePan(card) {
      var label;
      var distance;
      var duration;
      var token;
      stopTitlePan();
      if (!card || card.className.indexOf('episode-card') === -1) { return; }
      label = card.querySelector('.episode-label-text'); distance = Number(label && label.getAttribute('data-pan-distance') || 0);
      if (!distance) { return; }
      duration = Math.max(2200, Math.min(5000, distance * 32)); token = state.panToken;
      function cycle() {
        state.panTimers.push(values.root.setTimeout(function () { if (token === state.panToken) { label.style.transition = 'transform ' + duration + 'ms linear'; label.style.transform = 'translateX(-' + distance + 'px)'; } }, 800));
        state.panTimers.push(values.root.setTimeout(function () { if (token === state.panToken) { label.style.transform = 'translateX(0)'; } }, duration + 1500));
        state.panTimers.push(values.root.setTimeout(function () { if (token === state.panToken) { cycle(); } }, duration * 2 + 2300));
      }
      cycle();
    }
    function reset() {
      stopTitlePan();
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('detail-episodes'); }
      state.context = null; state.seasonIndex = 0; state.episodeIndex = 0;
      if (node('season-tabs')) { node('season-tabs').innerHTML = ''; }
      if (node('episode-strip')) { node('episode-strip').innerHTML = ''; }
    }

    return {
      snapshot: snapshot, setContext: setContext, setEpisodes: setEpisodes,
      setSeasonIndex: setSeasonIndex, setEpisodeIndex: setEpisodeIndex,
      currentSeason: currentSeason, currentEpisode: currentEpisode,
      render: render, renderSeasons: renderSeasons, renderEpisodes: renderEpisodes,
      refreshPlaybackCards: refreshPlaybackCards, reconcilePlayback: reconcilePlayback,
      startTitlePan: startTitlePan, stopTitlePan: stopTitlePan, reset: reset
    };
  }

  return { create: create };
}));
