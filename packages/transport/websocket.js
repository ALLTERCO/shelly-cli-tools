import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

const printVoid = (message) => {};

class wsTransport extends EventEmitter {
  address = null;
  connected = false;
  _ws = null;
  _connectTimeout = 1000;

  constructor(debugLevel) {
    super();
    this.debug = console.log;
    this.address = null;
  }

  setDebug(debugLevel) {
    this.debug = debugLevel == 'debug' ? console.log : printVoid;
  }

  setAddress(address) {
    this.address = address;
  }

  async connect(address = '') {
    if (address !== '') this.setAddress(address);
    if (this.address == null) throw new Error('No address provided');
    const _this = this;
    return new Promise((resolve, reject) => {
      this.debug('Transport is connecting to ', this.address);
      if (this._ws) this._ws.close();
      this._ws = new WebSocket(`ws://${this.address}/rpc`);
      this._ws.on('open', (event) => {
        this.connected = true;
        clearTimeout(_connectTimeout);
        this.emit('connect', event);
        this.debug('Connected to ', this.address);
        resolve(_this);
      });
      this._ws.on('close', (event) => {
        this.connected = false;
        this.emit('close', event);
        this.debug('Connection closed ', this.address);
      });
      this._ws.on('error', () => {
        this.debug('Error in websocket connection ', this.address);
        reject('Error connecting');
      });
      const _connectTimeout = setTimeout(() => {
        this.debug('Shelly transport timeouting');
        reject('Transport timeout');
      }, this._connectTimeout);
      this._ws.on('message', (event) => {
        this.emit('message', Buffer.from(event).toString('utf-8'));
      });
    });
  }

  close() {
    if (this._ws) {
      this._ws.close();
    }
  }

  send(message) {
    if (this._ws == null || !this.connected) return;
    this._ws.send(message);
  }
}

export { wsTransport };
