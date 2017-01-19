const WebSocket = require('ws');

function getServer(config, onMessage) {
  const wss = new WebSocket.Server(config);
  const ids = new Map();
  const broadcast = data => wss.clients
                               .filter(({ readyState }) =>
                                  readyState === WebSocket.OPEN)
                               .forEach(client => client.send(data));
  wss.on('connection', ws => ws.on('message', msg => {
    const { origin, target, type, data } = JSON.parse(msg);
    onMessage && onMessage({ origin, target, type, data });
    if (!ids.has(origin)) ids.set(origin, ws);
    if (!target) return broadcast(msg);
    return ids.get(target).send(msg);
  }));
  return wss;
}

if (!module.parent) getServer({ port: 3000 });
module.exports = getServer;