const ReconnectingWebSocket = require('reconnecting-websocket');
const WS = require('ws');

const { timeToFinality,
        bestBlock,
        bestFinalized,
        blockProductionTime,
        blockPropagationTime
      } = require('./prometheus');

const Actions = {
  FeedVersion      : 0,
  BestBlock        : 1,
  BestFinalized    : 2,
  AddedNode        : 3,
  RemovedNode      : 4,
  LocatedNode      : 5,
  ImportedBlock    : 6,
  FinalizedBlock   : 7,
  NodeStats        : 8,
  NodeHardware     : 9,
  TimeSync         : 10,
  AddedChain       : 11,
  RemovedChain     : 12,
  SubscribedTo     : 13,
  UnsubscribedFrom : 14,
  Pong             : 15,
  AfgFinalized         : 16,
  AfgReceivedPrevote   : 17,
  AfgReceivedPrecommit : 18,
  AfgAuthoritySet      : 19
};

const DEFAULT_TELEMETRY_HOST = 'wss://telemetry.hydradx.io:9001/feed';

class Client {
  constructor(cfg) {
    this.cfg = cfg;

    const options = {
      WebSocket: WS, // custom WebSocket constructor
      connectionTimeout: 1000,
      maxRetries: 10,
    };
    this.address = cfg.telemetry_host || DEFAULT_TELEMETRY_HOST;
    this.socket = new ReconnectingWebSocket(this.address, [], options);
    this.timestamps = {};
    this.nodes = {};
  }

  start() {
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => {
        console.log(`Conected to substrate-telemetry on ${this.address}`);
        resolve();
      };

      this.socket.onclose = () => {
        console.log(`Conection to substrate-telemetry on ${this.address} closed`);
        reject();
      };

      this.socket.onerror = (err) => {
        console.log(`Could not connect to substrate-telemetry on ${this.address}: ${err}`);
        process.exit(1);
        reject();
      };

      this.socket.onmessage = (data) => {
        const currentTimestamp = Date.now();
        const messages = this._deserialize(data);
        for (let count = 0; count < messages.length; count++) {
          this._handle(messages[count], currentTimestamp);
        }
      };
    });
  }

  _deserialize(msg) {
    const data = JSON.parse(msg.data);

    const messages = new Array(data.length / 2);

    for (const index of messages.keys()) {
      const [ action, payload] = data.slice(index * 2);

      messages[index] = { action, payload };
    }
    return messages;
  }

  _handle(message, currentTimestamp) {
    const { action, payload } = message;
    const {chain} = this;

    switch(action) {
    case Actions.AddedChain:
      {
        this._subscribe(payload);
      }
      break;

    case Actions.AddedNode:
      {
        const nodeID = payload[0];
        const [name,,tag,,id] = payload[1];
        const [version,, runtime,, node, arch] = tag.split(' ');

        this.nodes[nodeID] = {name, version, node, runtime, arch, id};

        console.log(`New node`, this.nodes[nodeID]);
      }
      break;

    case Actions.RemovedNode:
      {
        const nodeID = payload;
        const {nodeName} = this.nodes[nodeID];

        delete this.nodes[nodeID];

        console.log(`Node '${nodeName}' departed`);
      }
      break;

    case Actions.BestBlock:
      {
        const blockNumber = payload[0];

        bestBlock.set({chain}, blockNumber);

        const productionTime = payload[1];
        blockProductionTime.observe({chain}, productionTime);

        this.timestamps[blockNumber] = productionTime;

        console.log(`New best block ${blockNumber}`);
      }
      break;

    case Actions.ImportedBlock:
      {
        const blockNumber = payload[1][0];
        const nodeID = payload[0];
        const {name, version, node, runtime, arch, id} = this.nodes[nodeID];

        const propagationTime = payload[1][4] / 1000;
        blockPropagationTime.observe({ chain, name, version, node, runtime, arch, id }, propagationTime);
        console.log(`propagationTime at node ${nodeID} : ${propagationTime}`);
        console.log(`Block ${blockNumber} imported at node ${nodeID}`);
      }
      break;

    case Actions.BestFinalized:
      {
        const blockNumber = payload[0];

        bestFinalized.set({chain}, blockNumber);

        const productionTime = this.timestamps[blockNumber];

        if (productionTime) {
          const finalityTime = (currentTimestamp - productionTime) / 1000;
          console.log(`finality time for ${blockNumber}: ${finalityTime}`)
          timeToFinality.observe({chain}, finalityTime);

          delete this.timestamps[blockNumber];
        }

        console.log(`New best finalized block ${blockNumber}`)
      }
      break;
    }
  }

  _subscribe([chain, hash]) {
    if(!this.subscribed && this.cfg.subscribe.chains.includes(hash)) {
      this.subscribed = true;
      this.chain = chain;
      this.socket.send(`subscribe:${hash}`);
      console.log(`Subscribed to chain '${chain}'`);
      this.socket.send(`send-finality:${hash}`);
      console.log('Requested finality data');
    }
  }
}

module.exports = {
  Client
}
