const WebSocket = require('ws');

function getServer(config, onMessage) {
  const wss = new WebSocket.Server(config);
  const rooms = {};
  const broadcast = data => wss.clients
                               .filter(({ readyState }) =>
                                  readyState === WebSocket.OPEN)
                               .forEach(client => client.send(data));
  wss.on('connection', ws => ws.on('message', msg => {
    const { room, origin, target, type, data } = JSON.parse(msg);
    onMessage && onMessage({ room, origin, target, type, data });
    if (!rooms[room]) rooms[room] = new Map();
    const ids = rooms[room];
    if (!ids.has(origin)) ids.set(origin, ws);
    if (!target) return broadcast(msg);
    return ids.get(target).send(msg);
  }));
  return wss;
}

if (!module.parent) getServer({ port: 3000 });
module.exports = getServer;