'use strict';

var PRIMARY_URI = 'http://127.0.0.1:8098/mock/primary';

function seedOfflineSession(page) {
  return page.addInitScript(function (primaryUri) {
    localStorage.setItem('ploff.servers.v1', JSON.stringify({
      version: 1,
      activeUri: primaryUri,
      servers: [{
        name: 'Ploff Test PMS',
        uri: primaryUri,
        machineIdentifier: 'fixture-primary',
        version: '1.43.3',
        source: 'probe'
      }]
    }));
    localStorage.setItem('ploff.auth.v1', JSON.stringify({
      version: 1,
      setupComplete: true,
      mode: 'offline',
      ownerToken: '',
      activeProfileId: '',
      profiles: []
    }));
    localStorage.removeItem('ploff.setup.v1');
  }, PRIMARY_URI);
}

module.exports = {
  PRIMARY_URI: PRIMARY_URI,
  seedOfflineSession: seedOfflineSession
};
