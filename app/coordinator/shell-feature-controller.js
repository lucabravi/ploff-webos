(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffShellFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var data = values.data || {};
    var statePort = values.state || {};
    var presentation = values.presentation || {};
    var presentationServices = values.presentationServices || {};
    var transitions = values.transitions || {};
    var root = platform.root || {};
    var document = platform.document;
    var storage = platform.storage || root.localStorage;
    var ShellController = modules.ShellController;
    var HomeState = modules.HomeState;
    var NavigationModel = modules.NavigationModel;
    var ProgressiveImages = modules.ProgressiveImages;
    var BackgroundAudio = modules.BackgroundAudio;
    var ViewState = modules.ViewState;
    var PlexClient = data.PlexClient;
    var config = data.config || {};
    var destroyed = false;
    var started = false;
    var clockTimer = null;
    var resizeTimer = null;
    var navigationHoldTimer = null;
    var navigationHoldTriggered = false;
    var navigationReorderMode = false;
    var navigationReorderReady = false;
    var navigationReorderOriginalItems = null;
    var activeViewState = null;
    var homeRefreshVisualActive = false;
    var serverActivityVisualState = 'idle';
    var serverActivityVisualTarget = 'idle';
    var serverActivityTransitionTimer = null;
    var api = null;
    var posterLoader;
    var backgroundAudio;
    var navigationPreviewScheduler;
    var controller;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }

    function settings() { return call(statePort.settings) || {}; }
    function activeProfile() { return call(statePort.activeProfile) || null; }
    function authMode() { return String(call(statePort.authMode) || authState().mode || 'offline'); }
    function setupComplete() {
      var value = call(statePort.setupComplete);
      return value === undefined ? authState().setupComplete === true : value === true;
    }
    function authState() {
      return call(statePort.authState) || {
        mode: String(call(statePort.authMode) || 'offline'),
        setupComplete: call(statePort.setupComplete) === true
      };
    }
    function currentView() { return String(call(statePort.currentView) || 'home'); }
    function focusState() { return controller.focusState(); }
    function focusSnapshot() {
      var current = focusState() || {};
      return {
        area: current.area === 'nav' ? 'nav' : 'media',
        navIndex: Math.max(0, Number(current.navIndex) || 0),
        rowIndex: Math.max(0, Number(current.rowIndex) || 0),
        column: Math.max(0, Number(current.column) || 0)
      };
    }
    function navigationItems() { return controller.navigationItems(); }
    function rows() { return controller.rows(); }

    function updateWatched(ratingKey, watched) {
      var currentRows = rows();
      var rowIndex;
      var itemIndex;
      var item;
      for (rowIndex = 0; rowIndex < currentRows.length; rowIndex += 1) {
        for (itemIndex = 0; itemIndex < (currentRows[rowIndex].items || []).length; itemIndex += 1) {
          item = currentRows[rowIndex].items[itemIndex];
          if (String(item.ratingKey || '') === String(ratingKey || '')) {
            item.viewed = watched;
            item.viewOffset = 0;
            item.progress = 0;
          }
        }
      }
      return controller.refreshHome();
    }

    function t(key, parameters) {
      return call(presentationServices.t, key, parameters);
    }

    function loadHome(callback) {
      if (typeof data.loadHome === 'function') { return data.loadHome(callback); }
      if (!PlexClient || typeof PlexClient.loadHome !== 'function') { call(callback, new Error('Home transport unavailable'), []); return null; }
      return PlexClient.loadHome(config, function (error, nextRows) {
        (nextRows || []).forEach(function (row) { if (row.recommendation) { row.title = t('home.recommended'); } });
        call(callback, error, nextRows || []);
      });
    }

    function loadThemeMetadata(ratingKey, callback) {
      if (typeof data.loadThemeMetadata === 'function') { return data.loadThemeMetadata(ratingKey, callback); }
      if (!PlexClient || typeof PlexClient.loadMetadata !== 'function') { call(callback, new Error('Theme metadata unavailable')); return null; }
      return PlexClient.loadMetadata(config, ratingKey, callback);
    }

    function element(tagName, className, text) {
      return call(presentationServices.element, tagName, className, text);
    }

    function updateNodeText(node, value) {
      call(presentationServices.updateText, node, value);
    }

    function setText(id, value) { call(presentationServices.setText, id, value); }

    function progressivePosterSpecification(source, width, height, priority, scope) {
      var preview = ProgressiveImages.previewSize(width, height, 96);
      return {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: width,
        height: height,
        priority: priority,
        scope: scope
      };
    }

    function qualityAdjustedSize(width, height, scope) {
      var current = settings();
      var quality;
      if (!ProgressiveImages || !ProgressiveImages.qualitySize || !ProgressiveImages.qualityForScope) {
        return { width: width, height: height };
      }
      quality = ProgressiveImages.qualityForScope(current, scope);
      return ProgressiveImages.qualitySize(width, height, quality);
    }

    function renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight) {
      var size = ProgressiveImages.renderedSize(image, fallbackWidth || 154, fallbackHeight || 224);
      return progressivePosterSpecification(source, size.width, size.height, priority, scope);
    }

    function fixedPosterSpecification(source, size, priority, scope) {
      var dimensions = size || {};
      var width = Math.max(1, Number(dimensions.width) || 1);
      var height = Math.max(1, Number(dimensions.height) || 1);
      var preview = dimensions.previewWidth && dimensions.previewHeight
        ? dimensions
        : ProgressiveImages.previewSize(width, height, 96);
      return {
        source: source,
        previewWidth: Math.max(1, Number(preview.previewWidth || preview.width) || 1),
        previewHeight: Math.max(1, Number(preview.previewHeight || preview.height) || 1),
        width: width,
        height: height,
        priority: priority,
        scope: scope
      };
    }

    function loadRenderedPoster(image, source, priority, scope, fallbackWidth, fallbackHeight) {
      if (posterLoader && posterLoader.load) {
        posterLoader.load(image, renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight));
      }
    }

    function prioritizePoster(card) {
      var images = card && card.getElementsByTagName ? card.getElementsByTagName('img') : [];
      if (images.length && posterLoader && posterLoader.prioritize) { posterLoader.prioritize(images[0]); }
    }

    function cancelImages(scope) {
      if (destroyed) { return false; }
      if (posterLoader && posterLoader.cancelScope) { posterLoader.cancelScope(scope); }
      return true;
    }

    function updateViewStateFocus() {
      var buttons = document && document.querySelectorAll ? document.querySelectorAll('#view-state-actions button') : [];
      var index;
      if (!activeViewState || !buttons.length) { return; }
      activeViewState.index = Math.max(0, Math.min(buttons.length - 1, activeViewState.index));
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = index === activeViewState.index ? 'is-focused' : '';
      }
      if (buttons[activeViewState.index].focus) { buttons[activeViewState.index].focus(); }
    }

    function hideViewState() {
      var section = document && document.getElementById ? document.getElementById('view-state') : null;
      var actions = document && document.getElementById ? document.getElementById('view-state-actions') : null;
      var index;
      if (actions && actions.children) {
        for (index = 0; index < actions.children.length; index += 1) { actions.children[index].onclick = null; }
      }
      if (section) { section.className = 'view-state is-hidden'; }
      activeViewState = null;
    }

    function executeViewStateAction(action) {
      var current = activeViewState;
      var callback;
      if (!current) { return; }
      callback = action === 'retry' ? current.retry : current.back;
      hideViewState();
      call(callback);
    }

    function showViewState(kind, scope, retryAction, backAction) {
      var model;
      var actions;
      var section;
      if (destroyed || !ViewState || !document) { return false; }
      model = ViewState.model(kind, scope);
      actions = document.getElementById('view-state-actions');
      section = document.getElementById('view-state');
      activeViewState = { model: model, index: 0, retry: retryAction || null, back: backAction || null };
      setText('view-state-title', t(model.titleKey));
      setText('view-state-message', t(model.messageKey));
      if (actions) {
        actions.innerHTML = '';
        model.actions.forEach(function (action) {
          var button = element('button', '', t('state.' + action));
          if (!button) { return; }
          button.type = 'button';
          button.setAttribute('data-view-state-action', action);
          button.onclick = function () { executeViewStateAction(action); };
          actions.appendChild(button);
        });
      }
      if (section) { section.className = 'view-state' + (kind === 'loading' ? ' is-loading' : ''); }
      updateViewStateFocus();
      return true;
    }

    function handleViewStateKey(event, direction) {
      var actions;
      var action;
      var keyCode = Number(event && event.keyCode || 0);
      if (!activeViewState) { return false; }
      actions = activeViewState.model.actions;
      if ((keyCode === 27 || keyCode === 461) && activeViewState.back) { executeViewStateAction('back'); return true; }
      if (!actions.length) { return true; }
      if (direction === 'left' || direction === 'right') {
        activeViewState.index = ViewState.focusIndex(activeViewState.index, actions.length, direction === 'left' ? -1 : 1);
        updateViewStateFocus();
      } else if (keyCode === 13) {
        action = actions[activeViewState.index];
        executeViewStateAction(action);
      } else if (keyCode === 27 || keyCode === 461) {
        executeViewStateAction('back');
      }
      return true;
    }

    function viewStateOpen() { return !!activeViewState; }

    function activeProfileTitle() {
      var profile = activeProfile();
      return authMode() === 'plex' && profile ? String(profile.title || '') : t('settings.localNoAuth');
    }

    function renderActiveProfile() {
      var profile = activeProfile();
      var button = document && document.getElementById ? document.getElementById('active-profile') : null;
      var avatar = document && document.getElementById ? document.getElementById('active-profile-avatar') : null;
      var initial = document && document.getElementById ? document.getElementById('active-profile-initial') : null;
      if (destroyed || !button || !avatar || !initial) { return false; }
      call(statePort.publishActiveProfile, profile);
      if (authMode() !== 'plex' && setupComplete()) {
        button.className = 'active-profile is-offline';
        button.disabled = false;
        setText('active-profile-name', t('profile.offline'));
        avatar.style.display = 'none';
        if (avatar.removeAttribute) { avatar.removeAttribute('src'); }
        initial.style.display = 'none';
        button.setAttribute('data-nav-index', navigationItems().length + 1);
        return true;
      }
      if (!profile) {
        button.className = 'active-profile is-hidden';
        button.disabled = true;
        if (button.removeAttribute) { button.removeAttribute('data-nav-index'); }
        return true;
      }
      button.className = 'active-profile';
      button.disabled = false;
      button.setAttribute('data-nav-index', navigationItems().length + 1);
      setText('active-profile-name', profile.title);
      setText('active-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
      avatar.style.display = profile.thumb ? 'block' : 'none';
      avatar.src = profile.thumb || '';
      avatar.onerror = function () {
        if (destroyed) { return; }
        avatar.style.display = 'none';
        initial.style.display = 'flex';
      };
      initial.style.display = profile.thumb ? 'none' : 'flex';
      return true;
    }

    function serverActivities() {
      var activities = call(statePort.serverActivities);
      return Object.prototype.toString.call(activities) === '[object Array]' ? activities : [];
    }

    function networkSnapshot() { return call(statePort.networkSnapshot) || {}; }

    function serverActivityDesiredVisualState(homeRefreshing, activities) {
      if (activities.length) { return 'active'; }
      return homeRefreshing ? 'home-refreshing' : 'idle';
    }

    function activityAnimationDuration(milliseconds) {
      var duration = call(presentation.animationDuration, milliseconds);
      return isFinite(Number(duration)) ? Math.max(0, Number(duration)) : milliseconds;
    }

    function clearServerActivityTransition() {
      if (serverActivityTransitionTimer !== null && root.clearTimeout) { root.clearTimeout(serverActivityTransitionTimer); }
      serverActivityTransitionTimer = null;
    }

    function updateServerActivityVisualState(target) {
      serverActivityVisualTarget = target;
      if (target === 'idle') {
        if (serverActivityVisualState === 'idle' || serverActivityVisualState === 'stopping') { return serverActivityVisualState; }
        clearServerActivityTransition();
        serverActivityVisualState = 'stopping';
        if (!root.setTimeout) { serverActivityVisualState = 'idle'; return serverActivityVisualState; }
        serverActivityTransitionTimer = root.setTimeout(function () {
          serverActivityTransitionTimer = null;
          if (destroyed || serverActivityVisualTarget !== 'idle' || serverActivityVisualState !== 'stopping') { return; }
          serverActivityVisualState = 'idle';
          renderServerActivities();
        }, activityAnimationDuration(900));
        return serverActivityVisualState;
      }
      if (serverActivityVisualState === 'idle' || serverActivityVisualState === 'stopping') {
        clearServerActivityTransition();
        serverActivityVisualState = 'starting';
        if (!root.setTimeout) { serverActivityVisualState = target; return serverActivityVisualState; }
        serverActivityTransitionTimer = root.setTimeout(function () {
          serverActivityTransitionTimer = null;
          if (destroyed || serverActivityVisualState !== 'starting') { return; }
          serverActivityVisualState = serverActivityVisualTarget === 'idle' ? 'idle' : serverActivityVisualTarget;
          renderServerActivities();
        }, activityAnimationDuration(520));
      } else if (serverActivityVisualState === 'active' || serverActivityVisualState === 'home-refreshing') {
        serverActivityVisualState = target;
      }
      return serverActivityVisualState;
    }

    function renderActivityProgress(row, activity) {
      var progress = element('span', 'activity-progress');
      var value = element('span', 'activity-progress-value');
      if (!progress || !value) { return; }
      value.style.width = Math.max(0, Math.min(100, Number(activity.progress) || 0)) + '%';
      progress.appendChild(value);
      row.appendChild(progress);
    }

    function renderServerActivities() {
      var activities = serverActivities();
      var button = document && document.getElementById ? document.getElementById('server-activity') : null;
      var panel = document && document.getElementById ? document.getElementById('server-activity-panel') : null;
      var focused;
      var index;
      var activity;
      var row;
      var network = networkSnapshot();
      var networkLabel = call(presentation.networkStatusLabel, network) || '';
      var title = activities.length ? (activities[0].title || t('activity.working')) : '';
      var desiredVisualState = serverActivityDesiredVisualState(homeRefreshVisualActive && !activities.length, activities);
      var visualState;
      if (destroyed || !button || !panel) { return false; }
      focused = String(button.className || '').indexOf('is-focused') !== -1;
      visualState = updateServerActivityVisualState(desiredVisualState);
      if (activities.length > 1) { title += ' ' + t('activity.more', { count: activities.length - 1 }); }
      button.className = 'server-activity ' + String(call(presentation.networkStatusClass, network) || '') + ' is-' + visualState +
        (desiredVisualState === 'home-refreshing' ? ' is-home-refreshing-source' : '') + (focused ? ' is-focused' : '');
      button.setAttribute('data-nav-index', navigationItems().length);
      button.setAttribute('aria-label', t('activity.label') + ': ' + networkLabel + (title ? ' \u00b7 ' + title : ''));
      button.setAttribute('aria-busy', desiredVisualState === 'idle' ? 'false' : 'true');
      button.setAttribute('title', t('activity.label') + ': ' + networkLabel);
      setText('server-activity-title', title);
      call(presentation.onActivityTitle, title, desiredVisualState);
      panel.innerHTML = '';
      panel.appendChild(element('div', 'activity-network-status', t('settings.networkStatus') + ': ' + networkLabel));
      if (!activities.length) {
        panel.appendChild(element('div', 'activity-empty', t('activity.idle')));
        return true;
      }
      for (index = 0; index < activities.length; index += 1) {
        activity = activities[index];
        row = element('div', 'activity-row');
        row.appendChild(element('span', 'activity-heading', activity.title || t('activity.working')));
        if (activity.subtitle) { row.appendChild(element('span', 'activity-subtitle', activity.subtitle)); }
        if (activity.progress >= 0) { renderActivityProgress(row, activity); }
        panel.appendChild(row);
      }
      return true;
    }

    function showHomeSurface() {
      var content = document && document.getElementById ? document.getElementById('content') : null;
      if (content) { content.style.display = 'block'; }
      return !!content;
    }

    function hideHomeSurface() {
      var content = document && document.getElementById ? document.getElementById('content') : null;
      clearNavigationSurfaceAnimation();
      if (content) { content.style.display = 'none'; }
      return !!content;
    }

    function clearHomeSurface() {
      var content = document && document.getElementById ? document.getElementById('content') : null;
      if (content) { content.innerHTML = ''; }
      return !!content;
    }

    function prepareServerSwitch() {
      var body = document && document.body;
      showHomeSurface();
      if (body && String(body.className || '').indexOf('is-booting') === -1) { body.className = String(body.className || '') + ' is-booting'; }
    }

    function translateStaticUi() {
      var navigation = document && document.getElementById ? document.getElementById('navigation') : null;
      setText('startup-splash-label', t('startup.loading'));
      if (navigation) { navigation.setAttribute('aria-label', t('nav.main')); }
      call(presentation.translateDetail);
      call(presentation.translateLibrary);
      call(presentation.translatePlayer);
    }

    function setHomeRefreshVisualActive(active) {
      active = active === true;
      if (homeRefreshVisualActive === active) { return; }
      homeRefreshVisualActive = active;
      renderServerActivities();
    }

    function passiveHomeState(messageKey) {
      var focus = focusState();
      if (focus.area !== 'nav') { return false; }
      hideViewState();
      controller.showMessage(t(messageKey));
      controller.updateFocus();
      return true;
    }

    function useHomeRows(nextRows, navIndex, homeOptions) {
      return controller.useHomeRows(nextRows, navIndex, homeOptions || {});
    }

    function refreshHome() {
      if (destroyed) { return false; }
      if (currentView() === 'home' && !rows().length && !passiveHomeState('state.homeLoading')) {
        showViewState('loading', 'home', null, null);
      }
      controller.refreshHome();
      return true;
    }

    function enterHome(homeOptions) {
      var focusMode;
      var baseFocus;
      var selectedHomeKey;
      var focus;
      var content;
      homeOptions = homeOptions || {};
      focusMode = homeOptions.focus || 'preserve';
      call(statePort.setView, 'home');
      focus = focusState();
      focus.navIndex = 0;
      controller.renderNavigation();
      if (rows().length) { hideViewState(); }
      showHomeSurface();
      call(presentation.hideNonHomeViews);
      if (rows().length) {
        if (controller.isHomeDirty()) {
          useHomeRows(rows(), 0, { focus: focusMode, selectionKey: controller.selectionKey() });
        } else {
          baseFocus = focusMode === 'nav'
            ? { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 }
            : (focusMode === 'first'
              ? { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }
              : { area: 'media', navIndex: 0, rowIndex: focus.rowIndex || 0, column: focus.column || 0 });
          selectedHomeKey = focusMode === 'preserve' ? controller.selectionKey() : '';
          controller.setFocus(HomeState.restoreFocus(rows(), baseFocus, selectedHomeKey));
          if (focusMode === 'first' || (selectedHomeKey && HomeState.selectionKey(rows(), focusState()) !== selectedHomeKey)) {
            content = document && document.getElementById ? document.getElementById('content') : null;
            if (content) { content.scrollTop = 0; }
          }
          controller.updateFocus();
        }
      }
      controller.scheduleHomePolling();
      if (homeOptions.refresh !== false) { refreshHome(); }
      return focusState();
    }

    function handleHomeEmpty() {
      if (currentView() === 'home' && !passiveHomeState('state.homeEmpty')) {
        showViewState('empty', 'home', null, presentation.openSetup);
      }
    }

    function onHomeResult(error, nextRows, changed, initial) {
      var focusMode;
      if (destroyed) { return; }
      if (error) {
        if (currentView() === 'home' && !rows().length) {
          controller.completeStartup();
          if (!passiveHomeState('state.homeError')) { showViewState('error', 'home', refreshHome, presentation.openSetup); }
        }
        return;
      }
      if (!changed) {
        if (currentView() === 'home' && rows().length) { hideViewState(); }
        return;
      }
      if (currentView() === 'home') {
        focusMode = focusState().area === 'nav' ? 'nav' : (initial ? 'first' : 'preserve');
        useHomeRows(nextRows, 0, { focus: focusMode, selectionKey: controller.selectionKey() });
      } else {
        controller.setRows(nextRows);
        controller.markHomeDirty();
      }
    }

    function renderNavigation() { controller.renderNavigation(); }
    function navigationFocusCount() { return controller.navigationFocusCount(); }
    function isActivityNavIndex(index) { return controller.isActivityNavIndex(index); }
    function isProfileNavIndex(index) { return controller.isProfileNavIndex(index); }
    function selectorForNavIndex(index) { return controller.selectorForNavIndex(index); }
    function applyNavigationVisibility(items) { return controller.applyNavigationVisibility(items); }

    function navigationSurfaceIds(view) {
      var ids = {
        home: ['content'],
        search: [],
        library: ['library-subnav', 'library-grid-content'],
        watchlist: ['watchlist-grid-content'],
        settings: ['app-settings-view']
      };
      return ids[String(view || '')] || [];
    }

    function appendNavigationChildren(surfaces, id) {
      var container = document && document.getElementById ? document.getElementById(id) : null;
      var children = container && container.children;
      var index;
      if (!children) { return; }
      for (index = 0; index < children.length; index += 1) { surfaces.push(children[index]); }
    }

    function clearNavigationChildren(id) {
      var container = document && document.getElementById ? document.getElementById(id) : null;
      var children = container && container.children;
      var index;
      if (!children) { return; }
      for (index = 0; index < children.length; index += 1) {
        children[index].className = String(children[index].className || '').replace(/\s*is-navigation-entering/g, '');
      }
    }

    function navigationSurfaces(view) {
      var ids = navigationSurfaceIds(view);
      var surfaces = [];
      var index;
      var surface;
      for (index = 0; index < ids.length; index += 1) {
        surface = document && document.getElementById ? document.getElementById(ids[index]) : null;
        if (surface) { surfaces.push(surface); }
      }
      if (String(view || '') === 'library') { appendNavigationChildren(surfaces, 'library-recommended'); }
      if (String(view || '') === 'search') { appendNavigationChildren(surfaces, 'search-results'); }
      return surfaces;
    }

    function clearNavigationSurfaceAnimation() {
      var ids = ['content', 'search-results', 'library-subnav', 'library-recommended', 'library-grid-content', 'watchlist-grid-content', 'app-settings-view'];
      var index;
      var surface;
      for (index = 0; index < ids.length; index += 1) {
        surface = document && document.getElementById ? document.getElementById(ids[index]) : null;
        if (surface) { surface.className = String(surface.className || '').replace(/\s*is-navigation-entering/g, ''); }
      }
      clearNavigationChildren('library-recommended');
      clearNavigationChildren('search-results');
    }

    function animateSurfaces(surfaces) {
      var index;
      if (!surfaces.length) { return false; }
      clearNavigationSurfaceAnimation();
      if (settings().interfaceAnimations === false) { return false; }
      surfaces[0].offsetWidth;
      for (index = 0; index < surfaces.length; index += 1) {
        surfaces[index].className = String(surfaces[index].className || '').replace(/\s*is-navigation-entering/g, '') + ' is-navigation-entering';
      }
      return true;
    }

    function animateNavigationSurface(view) {
      if (String(view || '') === 'home') {
        clearNavigationSurfaceAnimation();
        return false;
      }
      return animateSurfaces(navigationSurfaces(view));
    }
    function animateLibrarySurface() { return animateSurfaces(navigationSurfaces('library')); }

    function navigationSnapshot(currentFocus) {
      var focus = currentFocus || focusState() || {};
      return {
        holdActive: navigationHoldTimer !== null,
        holdTriggered: navigationHoldTriggered,
        reorderMode: navigationReorderMode,
        reorderReady: navigationReorderReady,
        index: Math.max(0, Number(focus.navIndex) || 0),
        count: navigationFocusCount()
      };
    }

    function cancelNavigationPreview() {
      if (navigationPreviewScheduler && navigationPreviewScheduler.cancel) { navigationPreviewScheduler.cancel(); }
    }

    function focusCurrentNavigation() { call(transitions.focusNavigationForCurrentView); }

    function showNavigationView(index, keepNavigationFocus) {
      var targetIndex = Number(index);
      var item = navigationItems()[targetIndex];
      cancelNavigationPreview();
      if (!item) { return false; }
      if (item.kind === 'watchlist' && call(statePort.watchlistAvailable) !== true) {
        controller.showMessage(t('watchlist.unavailable'));
        controller.renderNavigation();
        return false;
      }
      focusState().navIndex = targetIndex;
      if (call(transitions.navigationMatches, item) === true) {
        controller.renderNavigation();
        if (keepNavigationFocus) { focusCurrentNavigation(); }
        else { enterActiveNavigation(); }
        return true;
      }
      call(transitions.commitNavigationView, item, targetIndex, keepNavigationFocus === true);
      if (currentView() !== 'library') { animateNavigationSurface(currentView()); }
      return true;
    }

    function showNavigationPreview(index) {
      if (destroyed || Number(index) !== focusState().navIndex || call(statePort.navigationHasFocus) !== true || Number(index) >= navigationItems().length) { return false; }
      return showNavigationView(index, true);
    }

    function scheduleNavigationPreview(index) {
      if (destroyed || navigationReorderMode || Number(index) >= navigationItems().length) {
        cancelNavigationPreview();
        return false;
      }
      navigationPreviewScheduler.schedule(Number(index));
      return true;
    }

    function startNavigationHold(index) {
      var item = navigationItems()[Number(index)];
      if (destroyed || navigationHoldTimer !== null || navigationReorderMode) { return false; }
      navigationHoldTriggered = false;
      if (call(statePort.navigationHasFocus) !== true || !item || item.kind !== 'library') { return false; }
      navigationHoldTimer = root.setTimeout(function () {
        navigationHoldTimer = null;
        if (destroyed) { return; }
        navigationHoldTriggered = true;
        navigationReorderMode = true;
        navigationReorderReady = false;
        navigationReorderOriginalItems = navigationItems().slice();
        cancelNavigationPreview();
        controller.renderNavigation();
        focusCurrentNavigation();
      }, 800);
      return true;
    }

    function cancelNavigationHold() {
      if (navigationHoldTimer !== null && root.clearTimeout) { root.clearTimeout(navigationHoldTimer); }
      navigationHoldTimer = null;
    }

    function moveReorderedLibrary(direction) {
      var moved;
      if (!navigationReorderMode) { return focusState().navIndex; }
      moved = NavigationModel.moveLibrary(navigationItems(), focusState().navIndex, direction);
      controller.setNavigationItems(moved.items);
      focusState().navIndex = moved.index;
      controller.renderNavigation();
      focusCurrentNavigation();
      return moved.index;
    }

    function markReorderReady() {
      navigationReorderReady = true;
      navigationHoldTriggered = false;
    }

    function finishReorder(save) {
      if (!navigationReorderMode) { return false; }
      if (save) {
        NavigationModel.save(storage, NavigationModel.libraryKeys(navigationItems()));
      } else if (navigationReorderOriginalItems) {
        controller.setNavigationItems(navigationReorderOriginalItems);
      }
      navigationReorderMode = false;
      navigationReorderReady = false;
      navigationReorderOriginalItems = null;
      controller.renderNavigation();
      focusCurrentNavigation();
      return true;
    }

    function enterActiveNavigation() {
      var item;
      var index = focusState().navIndex;
      cancelNavigationPreview();
      if (isProfileNavIndex(index)) { call(transitions.openProfileManager); return true; }
      if (isActivityNavIndex(index)) { call(transitions.focusActivity); return true; }
      item = navigationItems()[index];
      if (!item) { return false; }
      if (call(transitions.navigationMatches, item) !== true) { return showNavigationView(index, false); }
      call(transitions.enterNavigationContent, item, index);
      return true;
    }

    function scheduleBackdrop(item, expectedView) {
      if (expectedView === 'detail') { controller.scheduleDetailBackdrop(item); }
      else if (expectedView === 'search') { controller.scheduleSearchBackdrop(item); }
      else { controller.requestBackdrop(item); }
    }

    function onNetworkPresentation() {
      if (destroyed) { return; }
      controller.renderNavigation();
      renderServerActivities();
      call(presentation.refreshSettings);
      call(presentation.refreshDiagnostics);
    }

    function onVisibilityChange() {
      if (destroyed) { return; }
      if (document && document.hidden) { controller.stopHomePolling(); }
      else { controller.scheduleHomePolling(); }
    }

    function onResize() {
      if (destroyed) { return; }
      if (resizeTimer !== null && root.clearTimeout) { root.clearTimeout(resizeTimer); }
      resizeTimer = root.setTimeout(function () {
        resizeTimer = null;
        if (destroyed) { return; }
        controller.renderNavigation();
        call(presentation.onResizeCurrentView);
      }, 100);
    }

    function start() {
      if (destroyed || started) { return false; }
      started = true;
      controller.applyCardScale();
      translateStaticUi();
      controller.renderNavigation();
      controller.updateClock();
      if (root.setInterval) { clockTimer = root.setInterval(function () { if (!destroyed) { controller.updateClock(); } }, 30000); }
      return true;
    }


    function destroyOne(value) {
      if (value && typeof value.destroy === 'function') { value.destroy(); }
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelNavigationHold();
      cancelNavigationPreview();
      clearNavigationSurfaceAnimation();
      if (resizeTimer !== null && root.clearTimeout) { root.clearTimeout(resizeTimer); }
      resizeTimer = null;
      clearServerActivityTransition();
      if (clockTimer !== null && root.clearInterval) { root.clearInterval(clockTimer); }
      clockTimer = null;
      hideViewState();
      destroyOne(controller);
      destroyOne(posterLoader);
      if (backgroundAudio && backgroundAudio.stop) { backgroundAudio.stop(); }
      destroyOne(backgroundAudio);
      navigationReorderOriginalItems = null;
      navigationReorderMode = false;
      navigationReorderReady = false;
      navigationHoldTriggered = false;
    }

    if (!ShellController || typeof ShellController.create !== 'function') { throw new Error('ShellFeatureController requires ShellController'); }
    if (!presentationServices || typeof presentationServices.t !== 'function' || typeof presentationServices.element !== 'function' ||
        typeof presentationServices.setText !== 'function' || typeof presentationServices.updateText !== 'function') {
      throw new Error('ShellFeatureController requires presentation services');
    }
    if (!ProgressiveImages || typeof ProgressiveImages.create !== 'function') { throw new Error('ShellFeatureController requires ProgressiveImages'); }
    if (!BackgroundAudio || typeof BackgroundAudio.create !== 'function') { throw new Error('ShellFeatureController requires BackgroundAudio'); }
    if (!NavigationModel || typeof NavigationModel.createPreviewScheduler !== 'function') { throw new Error('ShellFeatureController requires NavigationModel'); }

    posterLoader = ProgressiveImages.create({
      Image: root.Image,
      previewConcurrency: 6,
      fullConcurrency: 3,
      isAttached: function (target) { return !!(document && document.body && document.body.contains && document.body.contains(target)); },
      urlFor: function (source, width, height, scope) {
        var size = qualityAdjustedSize(width, height, scope);
        return data.PlexClient && data.PlexClient.posterUrl ? data.PlexClient.posterUrl(data.config || {}, source, size.width, size.height) : source;
      }
    });
    backgroundAudio = BackgroundAudio.create(document && document.getElementById ? document.getElementById('theme-audio') : null, root);
    navigationPreviewScheduler = NavigationModel.createPreviewScheduler(root, 250, showNavigationPreview);

    controller = ShellController.create({
      modules: {
        HomeState: modules.HomeState,
        FocusModel: modules.FocusModel,
        NavigationModel: modules.NavigationModel,
        NavbarWindow: modules.NavbarWindow,
        CardLayout: modules.CardLayout,
        MediaLabels: modules.MediaLabels
      },
      root: root,
      clock: root,
      document: document,
      navigationItems: data.initialNavigationItems || [],
      rows: data.initialRows || [],
      initialFocus: data.initialFocus || { area: 'media', navIndex: 0, rowIndex: 0, column: 0 },
      services: {
        loadHome: loadHome,
        loadThemeMetadata: loadThemeMetadata,
        posterLoader: posterLoader,
        playTheme: function (item, themeOptions) { if (backgroundAudio && backgroundAudio.schedule) { backgroundAudio.schedule(item, themeOptions); } },
        stopTheme: function () { if (backgroundAudio && backgroundAudio.stop) { backgroundAudio.stop(); } }
      },
      presentation: {
        element: element,
        updateText: updateNodeText,
        translate: t,
        renderedPosterSpecification: renderedPosterSpecification,
        fixedPosterSpecification: fixedPosterSpecification,
        prioritizePoster: prioritizePoster,
        renderActiveProfile: renderActiveProfile,
        renderServerActivities: renderServerActivities,
        setHomeLoading: setHomeRefreshVisualActive
      },
      access: {
        settings: settings,
        authState: authState,
        activeProfileVisible: statePort.activeProfileVisible,
        currentView: currentView,
        pointerSelectionActive: statePort.pointerSelectionActive,
        navigationHasFocus: statePort.navigationHasFocus,
        navigationReorderMode: function () { return navigationReorderMode; },
        watchlistAvailable: statePort.watchlistAvailable,
        themeIdentity: statePort.themeIdentity
      },
      actions: {
        activateHome: transitions.activateHome,
        activateNavigationSelection: enterActiveNavigation,
        hideViewState: hideViewState,
        onHomeEmpty: handleHomeEmpty,
        playHomeItem: transitions.playHomeItem,
        requestExit: transitions.requestExit,
        scheduleAdjacentLibraryPrefetch: function () { call(transitions.scheduleAdjacentLibraryPrefetch, focusState().navIndex, navigationItems()); },
        onHomeReady: transitions.onHomeReady,
        scheduleNavigationPreview: scheduleNavigationPreview,
        startNavHold: startNavigationHold
      },
      home: {
        interval: 10000,
        canRefresh: statePort.homeCanRefresh || function () { return false; },
        onResult: onHomeResult
      }
    });

    api = {
      activeBackdropSource: function () { return controller.activeBackdropSource(); },
      activeProfileTitle: activeProfileTitle,
      applyCardScale: function () { return controller.applyCardScale(); },
      applyNavigationVisibility: applyNavigationVisibility,
      animateLibrarySurface: animateLibrarySurface,
      cancelImages: cancelImages,
      cancelNavigationHold: cancelNavigationHold,
      cardMetrics: function () { return controller.cardMetrics(); },
      cardProfile: function () { return controller.cardProfile(); },
      clearBackdrop: function () { return controller.clearBackdrop(); },
      clearHome: function () { return controller.clearHome(); },
      clearHomeSurface: clearHomeSurface,
      clearLogicalFocus: function () { return controller.clearLogicalFocus(); },
      completeStartup: function () { return controller.completeStartup(); },
      destroy: destroy,
      enterActiveNavigation: enterActiveNavigation,
      enterHome: enterHome,
      finishReorder: finishReorder,
      focusHomeStart: function () { return controller.focusHomeStart(); },
      focusState: focusSnapshot,
      handleHomeKey: function (event, direction) { return controller.handleHomeKey(event, direction); },
      handleViewStateKey: handleViewStateKey,
      hideHomeSurface: hideHomeSurface,
      hideViewState: hideViewState,
      isHomeLoading: function () { return controller.isHomeLoading(); },
      loadRenderedPoster: loadRenderedPoster,
      markHomeDirty: function () { return controller.markHomeDirty(); },
      markReorderReady: markReorderReady,
      moveReorderedLibrary: moveReorderedLibrary,
      navigationFocusCount: navigationFocusCount,
      navigationItems: navigationItems,
      navigationSnapshot: navigationSnapshot,
      onNetworkPresentation: onNetworkPresentation,
      onResize: onResize,
      onVisibilityChange: onVisibilityChange,
      posterLoader: function () { return posterLoader; },
      prepareServerSwitch: prepareServerSwitch,
      prioritizePoster: prioritizePoster,
      refreshHome: refreshHome,
      renderActiveProfile: renderActiveProfile,
      renderNavigation: renderNavigation,
      renderServerActivities: renderServerActivities,
      renderRows: function () { return controller.renderRows(); },
      renderedPosterSpecification: renderedPosterSpecification,
      fixedPosterSpecification: fixedPosterSpecification,
      resetHome: function () { return controller.resetHome(); },
      rows: rows,
      scheduleBackdrop: scheduleBackdrop,
      scheduleDetailBackdrop: function (item) { return controller.scheduleDetailBackdrop(item); },
      scheduleHomePolling: function () { return controller.scheduleHomePolling(); },
      scheduleNavigationPreview: scheduleNavigationPreview,
      scheduleSearchBackdrop: function (item) { return controller.scheduleSearchBackdrop(item); },
      scheduleTheme: function (item) { return controller.scheduleTheme(item); },
      selectorForNavIndex: selectorForNavIndex,
      setFocus: function (next) { return controller.setFocus(next); },
      showHomeSurface: showHomeSurface,
      showMessage: function (text) { return controller.showMessage(text); },
      showViewState: showViewState,
      start: start,
      startNavigationHold: startNavigationHold,
      stopHomePolling: function () { return controller.stopHomePolling(); },
      stopTheme: function () { if (backgroundAudio && backgroundAudio.stop) { backgroundAudio.stop(); } },
      translateStaticUi: translateStaticUi,
      updateFocus: function () { return controller.updateFocus(); },
      updateWatched: updateWatched,
      viewStateOpen: viewStateOpen
    };

    return api;
  }

  return { create: create };
}));
