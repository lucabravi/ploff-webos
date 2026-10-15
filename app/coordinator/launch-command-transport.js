(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLaunchCommandTransport = factory(); }
}(this, function () {
  'use strict';
  function create(client, router) {
    function load(command, context, callback) {
      var route = router.routeFor({serverMachineIdentifier: command.serverMachineIdentifier}, context);
      if (!route) { callback(new Error('source unavailable')); return null; }
      if (command.type !== 'item') {
        callback(null, {ratingKey: command.ratingKey, type: command.type, containerType: command.type,
          title: command.type === 'playlist' ? 'Playlist' : 'Collection',
          containerKey: command.type === 'playlist' ? '/playlists/' + command.ratingKey + '/items' : '/library/collections/' + command.ratingKey + '/children',
          serverMachineIdentifier: command.serverMachineIdentifier});
        return null;
      }
      return client.loadMetadata(route.config, command.ratingKey, function (error, detail) {
        if (error || !detail || ['movie', 'episode', 'clip'].indexOf(detail.type) < 0 || String(detail.ratingKey) !== command.ratingKey) {
          callback(error || new Error('media unavailable')); return;
        }
        callback(null, router.decorateItem(detail, context));
      });
    }
    return {load: load};
  }
  return {create: create};
}));
