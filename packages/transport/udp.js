import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

const printVoid = (message) => {};

class udpTransport extends EventEmitter {
  address = null;
  connected = false;
  _socket = null;
  _connectTimeout = 1000;

  constructor(debugLevel) {
    super();
    this.debug = console.log;
    this.address = null;
    this.port = null;
  }

  setDebug(debugLevel) {
    this.debug = debugLevel == 'debug' ? console.log : printVoid;
  }

  setAddress(address) {
    if(!address.includes(':')) {
      throw new Error('Provide an address in the form IP:PORT');
    }
    this.address = address.split(':')[0];
    this.port = parseInt(address.split(':')[1]);
  }

  //Throws invalid address provided or no address provided exceptions
  async connect(address = null) {
    if (address !== null) this.setAddress(address);
    if (this.address === null || this.port === null) throw new Error('No address and port provided');
    const _this = this;
    return new Promise((resolve, reject) => {
      this.debug(`Transport is connecting to ${this.address}:${this.port}`);
      if (this._socket) this._socket.close();
      this._socket = new dgram.createSocket({type:'udp4'});
      this._socket.connect(this.port, this.address)
      this._socket.on('connect', (event) => {
        this.connected = true;
        clearTimeout(_connectTimeout);
        this.emit('connect', event);
        this.debug(`Connected to ${this.address}:${this.port}`);
        resolve(_this);
      });
      this._socket.on('close', (event) => {
        this.connected = false;
        this.emit('close', event);
        this.debug(`Connection closed ${this.address}:${this.port}`);
      });
      this._socket.on('error', () => {
        this.debug(`Error in websocket connection ${this.address}:${this.port}`);
        reject('Error connecting');
      });
      const _connectTimeout = setTimeout(() => {
        this.debug('Shelly transport timeouting');
        reject('Transport timeout');
      }, this._connectTimeout);
      this._socket.on('message', (event, rinfo) => {
        this.emit('message', Buffer.from(event).toString('utf-8'));
      });
    });
  }

  close() {
    if (this._socket) {
      this._socket.close();
    }
  }

  send(message) {
    if (this._socket == null || !this.connected) return;
    this._socket.send(message);
  }
}

export { udpTransport };
