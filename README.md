# rehub
A Redux middleware to share actions via WebRTC


## Usage

### Client
```js
// store.js
import { createStore, applyMiddleware } from 'redux';
import rehub from 'rehub';
import reducers from './reducers';

export default applyMiddleware(rehub({
  signaling: 'ws://localhost:9000', // this is your signaling server, see below
  action: [
    'ADD_CLICK' // these actions will be shared across all peers
  ],
}))(createStore)(reducers);
```

### Server
```js
const express = require('express');
const http = require('http');
const getSignalingServer = require('rehub/server');

const app = express();

const server = http.createServer(app);
getSignalingServer({ server });

module.exports = app;
```