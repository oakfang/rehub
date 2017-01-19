const Peer = require('simple-peer');
const uuid = require('uuid');

const getOptions = ({
  peerSpec=null,
  actions=[],
  signaling='ws://localhost:3000',
  room='default',
}={}) => ({
  peerSpec,
  actions,
  signaling,
  room,
});

const getSignalingServer = signaling => {
  if (typeof signaling === 'string') {
    return new WebSocket(signaling);
  }
  return signaling;
};

function start(server, room, {
  peerSpec,
  onServerConnection,
  onPeerData,
  onPeerClose,
  onPeerOpen,
  onServerSignal,
}={}) {
  const signal = (type, origin, target, data) => server.send(JSON.stringify({
    type,
    room,
    origin,
    target,
    data,
  }));
  const pid = uuid();
  const peers = new Map();
  const getPeer = (id, initiator) => {
    const peer = new Peer(Object.assign({
      initiator,
    }, peerSpec || {}));
    peer.on('signal', data => signal('SIGNAL', pid, id, data));
    peer.on('data', data => onPeerData && onPeerData(id, JSON.parse(data), peer));
    peer.once('close', () => {
      peers.delete(id);
      onPeerClose && onPeerClose(id, peer);
    });
    peer.once('connect', () => {
      onPeerOpen && onPeerOpen(id, peer);
    });
    return peer;
  };
  if (!server.on) {
    server.on = (etype, cb) => server.addEventListener(etype, e => cb(e.data));
  }
  server.on('open', () => {
    signal('UP', pid, null, true);
    onServerConnection && onServerConnection();
  });
  server.on('message', msg => {
    const { type, origin, target, data } = JSON.parse(msg);
    onServerSignal && onServerSignal(type, origin, target, data);
    if (origin === pid) return;
    switch (type) {
      case 'UP': {
        if (!peers.has(origin)) {
          peers.set(origin, getPeer(origin, data));
          if (data) {
            signal('UP', pid, origin, false);
          }
        }
        return;
      }
      case 'SIGNAL': {
        if (target !== pid) return;
        if (!peers.has(origin)) {
          peers.set(origin, getPeer(origin));
        }
        peers.get(origin).signal(data);
        return;
      }
    }
  });
  return {
    get peerId() {
      return pid;
    },
    send(id, data) {
      peers.get(id).send(JSON.stringify(data));
    },
    broadcast(data) {
      for (const peer of peers.values()) {
        peer.send(JSON.stringify(data));
      }
    },
  };
}

const rehub = options => {
  const { peerSpec, actions, signaling, room } = getOptions(options);
  const whitelist = new Set(actions);
  const server = getSignalingServer(signaling);
  return store => {
    const com = start(server, room, {
      onServerConnection() { store.dispatch({ type: '@@REHUB/CONNECTED', payload: { id: com.peerId }}) },
      onPeerOpen(id) { store.dispatch({ type: '@@REHUB/PEER_OPEN', payload: { id } }) },
      onPeerClose(id) { store.dispatch({ type: '@@REHUB/PEER_CLOSE', payload: { id } }) },
      onPeerData(id, action) {
        if (whitelist.has(action.type)) {
          store.dispatch(Object.assign(action, { peer: id }));
        }
      },
    });
    return next => action => {
      if (whitelist.has(action.type) && !action.peer) {
        if (action.targets) {
          action.targets.forEach(t => com.send(t, action));
        } else {
          com.broadcast(action);
        }
      }
      next(action);
    };
  };
};

rehub.$ = start;
module.exports = rehub;