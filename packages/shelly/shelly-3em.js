import { Shelly, DeviceComponent } from './shelly.js';

class EM extends DeviceComponent {
  constructor() {
    super(...arguments);
  }
  async getStatus(id=0) {
    return super.getStatus({id});
  }
}

const EM_ERRORS = {
  InvalidDate: 'Invalid date parameter',
};

class EMData extends DeviceComponent {
  constructor() {
    super(...arguments);
  }
  async getData(params) {
    return this._dev.request({
      method: [this.name, 'GetData'].join('.'),
      params,
    });
  }
  async getRecords(params) {
    return this._dev.request({
      method: [this.name, 'GetRecords'].join('.'),
      params,
    });
  }
  getParams(ts, end_ts, add_keys = false) {
    return {
      id: 0,
      ts,
      end_ts,
      add_keys,
    };
  }
  async *getPeriodIterator(startTS, endTS, incPeriod = 60) {
    let _currentTS = startTS;
    const _lastTS = endTS;
    //cache for device returned values
    let _emDataResult = null;
    if (_currentTS > _lastTS)
      throw new Error('Incorrect period. Start date should be before end date');
    let _numberOfDeviceCalls = 0;
    let _numberOfItems = 0;
    let _incPeriod = incPeriod;
    const _requestedRecords = Math.round((_lastTS - _currentTS) / _incPeriod);
    let _recordsRemaining = _requestedRecords;
    //start interrogating the device
    do {
      const _emDataParams = this.getParams(_currentTS, _lastTS);
      try {
        _emDataResult = await this.getData(_emDataParams);
      } catch(e) {
        throw e;
      }
      _numberOfDeviceCalls++;
      //loop through the data packets in a response
      for (const _dataBlock of _emDataResult.response.data) {
        _incPeriod = _dataBlock.period;
        _currentTS = _dataBlock.ts;
        _recordsRemaining -= Math.round(
          (_dataBlock.ts - _currentTS) / _incPeriod
        );
        //loop through the value rows in a packet
        for (const _dataRow of _dataBlock.values) {
          _currentTS += _incPeriod;
          if (_currentTS > _lastTS) break;
          _numberOfItems++;
          _recordsRemaining--;
          yield {
            record: _dataRow,
            ts: _currentTS,
            percent: Math.round(
              (100 * (_requestedRecords - _recordsRemaining)) /
                _requestedRecords
            ),
            remaining: _recordsRemaining,
          };
        }
      }
      const _nextTS = _emDataResult.response.next_record_ts || _lastTS + 1;
      _recordsRemaining -= Math.round((_nextTS - _currentTS) / _incPeriod);
      _currentTS = _nextTS;
    } while (_currentTS <= _lastTS);
    return {
      deviceCalls: _numberOfDeviceCalls,
      itemsCount: _numberOfItems,
      averageItemsPerCall:
        Math.round((_numberOfItems / _numberOfDeviceCalls) * 100) / 100,
    };
  }
}

class Config extends DeviceComponent {
  constructor() {
    super(...arguments);
  }
  async get(key='') {
    return this._dev.request({
      method: [this.name,'Get'].join('.'),
      ...(key && { params: {key} })
    })
  }
  async set(config) {
    return this._dev.request({
      method: [this.name,'Set'].join('.'),
      params: {config}
    })
  }
  async save() {
    return this._dev.request({
      method: [this.name,'Save'].join('.')
    })
  }
}

class Sys extends DeviceComponent {
  constructor() {
    super(...arguments);
  }
  async reboot() {
    return this._dev.request({
      method: [this.name,'Reboot'].join('.')
    })
  }
}

class Shelly3EM extends Shelly {
  constructor() {
    super(...arguments);
    this.EM = new EM(this);
    this.EMData = new EMData(this);
    this.Config = new Config(this);
    this.Sys = new Sys(this);
  }

  dateToEMTS(date) {
    if (!(date instanceof Date)) throw new Error(EM_ERRORS.InvalidDate);
    return Math.round(date.getTime() / 1000);
  }

  setConfig(configKey, configObject) {
    return this.request({
      method: 'config.set',
      params: { config: { [configKey]: configObject } },
    });
  }

  getConfig(configKey) {
    return this.request({
      method: 'config.get',
      params: {
        key: configKey,
      },
    });
  }

  saveConfig(reboot = false) {
    return this.request({
      method: 'config.save',
      params: { reboot: reboot },
    });
  }
}

export { Shelly3EM };
