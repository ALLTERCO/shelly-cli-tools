import { Socket } from 'net';

const IT8615Control = {
  local: 0,
  remote: 1,
};
class IT8615 {
  socket = null;
  resp = null;
  lastReadout = {};
  control = 'local';
  constructor() {
    this.socket = new Socket();
    this.socket.on('data', this.onData.bind(this));
  }
  async connect(host, port = 30000, timeout = 1000) {
    if(!host) throw new Error('Provide an address for IT8615');
    console.log('Connecting to IT8615 at ' + host + ':' + port);
    const _this = this;
    return new Promise((resolve, reject) => {
      this.socket.setTimeout(timeout);
      this.socket.on('connect', () => {
        this.socket.removeAllListeners('error');
        clearTimeout(_connectTimeout);
        resolve(_this);
      });
      this.socket.on('error', () => {
        reject('Error on socket');
      });
      const _connectTimeout = setTimeout(() => {
        reject('Socket timeout');
      }, timeout);
      this.socket.connect({ port, host });
    });
  }
  close() {
    this.socket.removeAllListeners('connect');
    this.socket.removeAllListeners('error');
    this.socket.destroy();
  }
  write(msg) {
    this.socket.write(msg + '\n');
  }
  onData(chunk) {
    if (this.resp) {
      const received = chunk.toString().trim();
      this.resp(received);
      this.resp = null;
    }
  }
  deviceRead(msg) {
    return new Promise((resolve) => {
      this.resp = resolve;
      this.write(msg);
    });
  }
  deviceRemoteControl() {
    this.write('system:remote');
    this.control = IT8615Control.remote;
  }
  deviceLocalControl() {
    this.write('system:local');
    this.control = IT8615Control.local;
  }
  async setPower(power = null) {
    if (power == null) return;
    this.write('power ' + power);
    return this.deviceRead('power?');
  }
  async setOutput(output = false) {
    const _on = output ? '1' : '0';
    this.write('input:state ' + _on);
    return this.deviceRead('input:state?');
  }
  async setPF(PF = 1) {
    this.write('pfactor ' + PF);
    return this.deviceRead('pfactor?');
  }
  //pf, cf
  async setPFPriority(pfPriority='pf') {
    this.write('system:cfpf:priority '+pfPriority);
    return this.deviceRead('system:cfpf:priority?')
  }
  async getMeasure() {
    const measurementsRaw = await this.deviceRead('Measure?');
    let mappedMeasurements = measurementsRaw.split(',');
    mappedMeasurements.pop();
    const _map = [
      'Current_DC',
      'Current_RMS',
      'Current_Max',
      'Current_Max_PP', //positive peak max current
      'Current_Max_NP', //negative peak max current
      'Voltage_DC',
      'Voltage_RMS',
      'Voltage_Max',
      'Power_Active',
      'Power_Apparent',
      'Power_Reactive',
      'Power_Max',
      'Resistance',
      'Frequency',
      'Crest_Factor',
      'Power_Peak_Factor',
      'Voltage_THD', //Total harmonic distortion of voltage
      'ETIME', //Elapsed time under timing mode
      'TEMP', //Temperature
    ];
    const result = new Map(
      mappedMeasurements.map((value, index) => {
        return [_map[index], parseFloat(value)];
      })
    );
    this.lastReadout = result;
    return result;
  }
}

export { IT8615 };
