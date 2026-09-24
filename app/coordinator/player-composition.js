(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerComposition = factory(); }
}(this, function () {
  'use strict';

  // Read deferred globals only when code readiness has been established. Core
  // supplies live feature ports and the already-warmed application ASS pool.
  function create(root, ports) {
    if (!root.PloffPlayerFeatureController || typeof root.PloffPlayerFeatureController.create !== 'function') {
      throw new Error('PlayerComposition requires PlayerFeatureController');
    }
    return root.PloffPlayerFeatureController.create({
      platform: ports.platform,
      modules: {
        PlaybackController: root.PloffPlaybackController,
        PlaybackQueueController: root.PloffPlaybackQueueController,
        PlayerQueueController: root.PloffPlayerQueueController,
        InputCommandRouter: root.PloffInputCommandRouter,
        PlayerSubtitleEditorController: root.PloffPlayerSubtitleEditorController,
        QueueSequenceContract: root.PloffQueueSequenceContract,
        BoundedQueueCache: root.PloffBoundedQueueCache,
        SeriesQueueProvider: root.PloffSeriesQueueProvider,
        PlexContainerQueueProvider: root.PloffPlexContainerQueueProvider,
        QueueGapController: root.PloffQueueGapController,
        QueueGapView: root.PloffQueueGapView,
        PlayerControlsController: root.PloffPlayerControlsController,
        PlaybackQueueModel: root.PloffPlaybackQueueModel,
        PlayerControlsState: root.PloffPlayerControlsState,
        PlayerControlsView: root.PloffPlayerControlsView,
        PlayerChaptersView: root.PloffPlayerChaptersView,
        PlayerBufferingIndicator: root.PloffPlayerBufferingIndicator,
        ChapterState: root.PloffChapterState,
        SkipMarkerState: root.PloffSkipMarkerState,
        PlaybackClock: root.PloffPlaybackClock,
        PlaybackRecovery: root.PloffPlaybackRecovery,
        NativeVideoDriver: root.PloffNativeVideoDriver,
        PlaybackReposition: root.PloffPlaybackReposition,
        PlaybackSession: root.PloffPlaybackSession,
        PlaybackOperation: root.PloffPlaybackOperation,
        PlaybackTimeline: root.PloffPlaybackTimeline,
        SubtitleRuntime: root.PloffSubtitleRuntime,
        PlaybackStrategy: root.PloffPlaybackStrategy,
        PlayerSeekController: root.PloffPlayerSeekController,
        PlayerTimelinePolicy: root.PloffPlayerTimelinePolicy,
        ResumeChoice: root.PloffResumeChoice,
        SubtitleSync: root.PloffSubtitleSync,
        SubtitleEditorSession: root.PloffSubtitleEditorSession,
        SubtitleEditorView: root.PloffSubtitleEditorView,
        SubtitleOffsetStore: root.PloffSubtitleOffsetStore,
        SubtitleSeriesOffset: root.PloffSubtitleSeriesOffset,
        AssSubtitleRenderer: ports.assRendererPool,
        SubtitleStyleDialog: root.PloffSubtitleStyleDialog,
        Settings: root.PloffSettings,
        VersionSelection: root.PloffVersionSelection,
        MediaInfo: root.PloffMediaInfo,
        MediaProfile: root.PloffMediaProfile,
        MediaChoiceModel: root.PloffMediaChoiceModel,
        ProgressiveImages: root.PloffProgressiveImages,
        UpNextState: root.PloffUpNextState,
        UpNextTiming: root.PloffUpNextTiming,
        UpNextView: root.PloffUpNextView
      },
      data: ports.data,
      shell: ports.shell,
      detail: ports.detail,
      library: ports.library,
      dialogs: ports.dialogs,
      settings: ports.settings,
      diagnostics: ports.diagnostics,
      state: ports.state
    });
  }

  return { create: create };
}));
