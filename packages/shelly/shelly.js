import EventEmitter from 'events';

const printVoid = (message) => {};
class Shelly extends EventEmitter {
  address;
  transport;
  messageMap;
  messageCounter = 0;
  info = null;
  constructor(transport) {
    super();
    this.debug = console.log;
    this.otc_ = this.onTransportConnect.bind(this);
    this.otm_ = this.onTransportMessage.bind(this);
    this.otcl_ = this.onTransportClose.bind(this);
    this.messageMap = new Map();
    this.setTransport(transport);
  }
  setTransport(transport = null) {
    if (this.transport) {
      this.transport.close();
      this.transport.removeAllListeners('connect');
      this.transport.removeAllListeners('message');
      this.transport.removeAllListeners('close');
    }
    if (transport === null) return;
    this.transport = transport;
    transport.addListener('message', this.otm_);
    transport.addListener('close', this.otcl_);
    transport.addListener('connect', this.otc_);
  }
  async onTransportConnect() {
    this.info = await this.getInfo();
    this.emit('connect');
  }
  onTransportMessage(message) {
    this.messageHandler(message);
  }
  onTransportClose(event) {
    this.info = null;
    this.emit('close');
  }
  async getInfo() {
    try {
      const _info = await this.request({ method: 'Shelly.GetDeviceInfo' });
      return _info.response;
    } catch (e) {
      throw e;
    }
  }
  setDebug(debugLevel) {
    this.debug = debugLevel == 'debug' ? console.log : printVoid;
  }
  composeMessage({ method, params }) {
    return {
      jsonrpc: '2.0',
      id: 'UID-' + this.messageCounter++,
      src: 'shelly-client',
      method: method,
      ...(params && { params: params }),
    };
  }
  messageHandler(message) {
    const _message = JSON.parse(message);
    if (this.messageMap.has(_message.id)) {
      if(_message.error) {
        this.messageMap.get(_message.id).reject({
          response: _message.error,
          method: this.messageMap.get(_message.id).method
        })  
      } else {
        this.messageMap.get(_message.id).resolve({
          response: _message.result,
          method: this.messageMap.get(_message.id).method,
        });
      }
      this.messageMap.delete(_message.id);
    } else {
      this.emit('Notify', _message);
    }
    this.debug('\n\nreceived message\n', JSON.stringify(message));
  }
  async request({ method, params }) {
    const rpcMessage = this.composeMessage({ method, params });
    const _mm = this.messageMap;
    const _strMessage = JSON.stringify(rpcMessage);
    this.debug(_strMessage);
    this.transport.send(_strMessage);
    return new Promise((resolve, reject) => {
      _mm.set(rpcMessage.id, { resolve, reject, method });
    });
  }
  async reboot(after = 0) {
    return await this.request({
      method: 'shelly.reboot',
      params: {
        delay_ms: after,
      },
    });
  }
}

class DeviceComponent {
  name;
  constructor(device /*Shelly*/) {
    this.name = this.constructor.name;
    this._dev = device;
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (typeof target[property] !== 'function') return target[property];
        return (...args) => {
          if (target.constructor.name === 'DeviceComponent')
            throw new Error('You should call this method from a descendant');
          return Reflect.apply(target[property], receiver, args);
        };
      },
    });
  }
  asyncWrapDeviceCall(params) {
    return async (params) =>
      this.device.request({
        method: [this.name, method].join('.'),
        params,
      });
  }
  async getConfig(params) {
    return this._dev.request({ method: this.name + '.GetConfig', params });
  }
  async setConfig(params) {
    return this._dev.request({ method: this.name + '.SetConfig', params });
  }
  async getStatus(params) {
    return this._dev.request({ method: this.name + '.GetStatus', params });
  }
}

export { Shelly, DeviceComponent };
