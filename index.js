'use strict';

var Peer = require('simple-peer');
var uuid = require('uuid');

var getOptions = function getOptions() {
  var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      _ref$peerSpec = _ref.peerSpec,
      peerSpec = _ref$peerSpec === undefined ? null : _ref$peerSpec,
      _ref$actions = _ref.actions,
      actions = _ref$actions === undefined ? [] : _ref$actions,
      _ref$signaling = _ref.signaling,
      signaling = _ref$signaling === undefined ? 'ws://localhost:3000' : _ref$signaling;

  return {
    peerSpec: peerSpec,
    actions: actions,
    signaling: signaling
  };
};

var getSignalingServer = function getSignalingServer(signaling) {
  if (typeof signaling === 'string') {
    return new WebSocket(signaling);
  }
  return signaling;
};

function start(server) {
  var _ref2 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
      peerSpec = _ref2.peerSpec,
      onServerConnection = _ref2.onServerConnection,
      onPeerData = _ref2.onPeerData,
      onPeerClose = _ref2.onPeerClose,
      onPeerOpen = _ref2.onPeerOpen,
      onServerSignal = _ref2.onServerSignal;

  var signal = function signal(type, origin, target, data) {
    return server.send(JSON.stringify({
      type: type,
      origin: origin,
      target: target,
      data: data
    }));
  };
  var pid = uuid();
  var peers = new Map();
  var getPeer = function getPeer(id, initiator) {
    var peer = new Peer(Object.assign({
      initiator: initiator
    }, peerSpec || {}));
    peer.on('signal', function (data) {
      return signal('SIGNAL', pid, id, data);
    });
    peer.on('data', function (data) {
      return onPeerData && onPeerData(id, JSON.parse(data), peer);
    });
    peer.once('close', function () {
      peers.delete(id);
      onPeerClose && onPeerClose(id, peer);
    });
    peer.once('connect', function () {
      onPeerOpen && onPeerOpen(id, peer);
    });
    return peer;
  };
  if (!server.on) {
    server.on = function (etype, cb) {
      return server.addEventListener(etype, function (e) {
        return cb(e.data);
      });
    };
  }
  server.on('open', function () {
    signal('UP', pid, null, true);
    onServerConnection && onServerConnection();
  });
  server.on('message', function (msg) {
    var _JSON$parse = JSON.parse(msg),
        type = _JSON$parse.type,
        origin = _JSON$parse.origin,
        target = _JSON$parse.target,
        data = _JSON$parse.data;

    onServerSignal && onServerSignal(type, origin, target, data);
    if (origin === pid) return;
    switch (type) {
      case 'UP':
        {
          if (!peers.has(origin)) {
            peers.set(origin, getPeer(origin, data));
            if (data) {
              signal('UP', pid, origin, false);
            }
          }
          return;
        }
      case 'SIGNAL':
        {
          if (target !== pid) return;
          if (!peers.has(origin)) {
            peers.set(origin, getPeer(origin));
          }
          peers.get(origin).signal(data);
          return;
        }
    }
  });
  return { peers: peers, pid: pid };
}

var rehub = function rehub(options) {
  var _getOptions = getOptions(options),
      peerSpec = _getOptions.peerSpec,
      actions = _getOptions.actions,
      signaling = _getOptions.signaling;

  var whitelist = new Set(actions);
  var server = getSignalingServer(signaling);
  return function (store) {
    var _start = start(server, {
      onServerConnection: function onServerConnection() {
        store.dispatch({ type: '@@REHUB/CONNECTED', payload: { id: pid } });
      },
      onPeerOpen: function onPeerOpen(id) {
        store.dispatch({ type: '@@REHUB/PEER_OPEN', payload: { id: id } });
      },
      onPeerClose: function onPeerClose(id) {
        store.dispatch({ type: '@@REHUB/PEER_CLOSE', payload: { id: id } });
      },
      onPeerData: function onPeerData(id, action) {
        if (whitelist.has(action.type)) {
          store.dispatch(Object.assign(action, { peer: id }));
        }
      }
    }),
        peers = _start.peers,
        pid = _start.pid;

    return function (next) {
      return function (action) {
        if (whitelist.has(action.type) && !action.peer) {
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = peers.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var peer = _step.value;

              peer.send(JSON.stringify(action));
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        }
        next(action);
      };
    };
  };
};

rehub.$ = start;
module.exports = rehub;
