#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { Command, Option, Argument, program } from 'commander';
import { Shelly3EM } from '@allterco/shelly/shelly-3em.js';
import { Shelly3EMCalibrator } from '@allterco/shelly/shelly-3em-calibrator.js';
import { IT8615 } from '@allterco/equipment/it8615.js';
import { wsTransport } from '@allterco/transport/websocket.js';
import { jsonToFile, mapToFile } from '../src/utils.js';
import {
  measurementFromDeviceEMStatus,
  measurementAccumulator,
  measurementDivideBy,
  measurementFromADEConfig,
  ADEConfigFromMeasurement,
  measurementFromReferenceValues,
  calcCoefficient,
  mergeMeasurements,
  measurementAdd,
  measurementMul,
  measurementDiv,
  measurementHasZero,
  measurementResetTo,
  ADE_CONFIG,
} from '../src/model.js';
import { config } from 'dotenv';
import { Console } from 'console';

const DEBUG = process.env.DEBUG || 'none';

//Create our device and transport

const _wait = async (_ms) => new Promise((resolve) => setTimeout(resolve, _ms));

async function read({ shelly: _shellyIP, output: _outputFileName }) {
  console.log('Shelly Pro 3EM device at ', _shellyIP);
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  try {
    await _transport.connect(_shellyIP);
    const _status = await _testDev.EM.getStatus();
    const _measurement = measurementFromDeviceEMStatus(_status.response);
    const _resultMap = new Map([
      ['mac', _testDev.info.mac],
      ...Object.entries(_measurement),
    ]);
    console.table(_resultMap);
    if (_outputFileName) {
      mapToFile(_resultMap, _outputFileName);
      console.log('Readings written to', _outputFileName);
    }
  } catch (e) {
    console.error('Device read error', e);
    throw e;
  }
}

async function compare({
  etalon  : _etalonShellyIP,
  shelly  : _shellyIP,
  output  : _outputFileName,
  etype   : _etalonType
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  const _etalonTransport = new wsTransport();
  let _etalonDev;
  if(_etalonType && _etalonType !== 'shelly')
  {
    _etalonDev = new Shelly3EMCalibrator(_etalonTransport);
    _etalonDev.getCalStatus = _etalonDev.EMCalibrator.getStatus;
  } else {
    _etalonDev = new Shelly3EM(_etalonTransport);
    _etalonDev.getCalStatus = _etalonDev.EM.getStatus;
  }
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);
  _etalonDev.setDebug(DEBUG);

  try {
    let _status;
    await _transport.connect(_shellyIP);
    const _testDevMac = await (_testDev.getInfo()).mac;
    _status = await _testDev.EM.getStatus();
    const _measurementFromTestDevice = measurementFromDeviceEMStatus(
      _status.response
    );
    await _etalonTransport.connect(_etalonShellyIP);
    const _etalonDevMac = await (_etalonDev.getInfo()).mac;
    _status = await _etalonDev.getCalStatus();
    if(typeof _status.response == 'undefnined') {
      throw new Error('Invalid etalon reading');
    }
    const _measurementFromEtalonDevice = measurementFromDeviceEMStatus(
      _status.response
    );

    let _mm = mergeMeasurements(
      _measurementFromEtalonDevice,
      _measurementFromTestDevice,
      (a, b) => Math.round((Math.abs(a - b) / a) * 10000) / 100,
      ['Reference', 'Device', 'Diff %']
    );
    console.table(_mm);

    if (_outputFileName) {
      const _testResultMap = new Map([
        ['mac', _testDevMac],
        ...Object.entries(_measurementFromTestDevice),
      ]);
      const _etalonResultMap = new Map([
        ['mac', _etalonDevMac],
        ...Object.entries(_measurementFromEtalonDevice),
      ]);
      mapToFile(_testResultMap, _outputFileName);
      mapToFile(_etalonResultMap, _outputFileName);
      console.log('Readings written to', _outputFileName);
    }
  } catch (e) {
    console.error('Device read error', e);
    throw e;
  }
}

async function compare2({
  etalon  : _etalonFileName,
  shelly  : _shellyIP,
  output  : _outputFileName,
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);

  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  try {
    const _referenceValues = JSON.parse(readFileSync(_etalonFileName));
    const _measurementFromEtalonDevice = measurementFromReferenceValues(_referenceValues);

    let _status;
    await _transport.connect(_shellyIP);
    const _devInfo = await _testDev.getInfo();
    const _testDevMac = _devInfo.mac;
    _status = await _testDev.EM.getStatus();
    const _measurementFromTestDevice = measurementFromDeviceEMStatus(
      _status.response
    );

    let _mm = mergeMeasurements(
      _measurementFromEtalonDevice,
      _measurementFromTestDevice,
      (a, b) => Math.round((Math.abs(a - b) / a) * 10000) / 100,
      ['Reference', 'Device', 'Diff %']
    );
    console.table(_mm);
    if (_outputFileName) {
      const _testResultMap = new Map([
        ['mac', _testDevMac],
        ...Object.entries(_measurementFromTestDevice),
      ]);
      const _etalonResultMap = new Map([
        ['file', _etalonFileName],
        ...Object.entries(_measurementFromEtalonDevice),
      ]);
      mapToFile(_testResultMap, _outputFileName);
      mapToFile(_etalonResultMap, _outputFileName);
      console.log('Readings written to', _outputFileName);
    }
  } catch (e) {
    console.error('Device read error', e);
    throw e;
  }
}


async function readLoad(address) {
  const [_address, _port] = address.split(':');
  const _it8615 = new IT8615();
  try {
    await _it8615.connect(_address, _port, 1000);
    const _etalonMeasurements = await _it8615.getMeasure();
    console.table(_etalonMeasurements);
  } catch (e) {
    console.log('Failed to read it8615');
    console.log(e);
    throw e;
  }
}

//load values as seen in ./config/refs.json
async function setLoadToPredefinedValues(address, loadValues) {
  const [_address, _port] = address.split(':');
  const _it8615 = new IT8615();
  try {
    await _it8615.connect(_address, _port, 1000);
    let _newVal = null;
    await _it8615.deviceRemoteControl();
    _newVal = await _it8615.setPFPriority('pf');
    _newVal = await _it8615.setPower(loadValues.apower);
    _newVal = await _it8615.setPF(loadValues.pf);
    await _it8615.setOutput(true);
    await _it8615.deviceLocalControl();
  } catch (e) {
    console.log('Failed to setup it8615');
    console.log(e);
    throw e;
  }
}

async function stopLoad(address) {
  const [_address, _port] = address.split(':');
  const _it8615 = new IT8615();
  try {
    await _it8615.connect(_address, _port, 1000);
    await _it8615.deviceRemoteControl();
    await _it8615.setOutput(false);
    await _it8615.deviceLocalControl();
  } catch (e) {
    console.log('Failed to stop it8615');
    console.log(e);
    throw e;
  }
}

async function stopEtalon({ etalon: _etalonIP }) {
  try {
    await stopLoad(_etalonIP);
    console.log('Load stopped');
  } catch (e) {
    console.log(e);
  }
}

async function startEtalon({
  etalon: _etalonIP,
  reference: _referencesJSONFile,
}) {
  try {
    let _referenceValues = null;
    try {
      _referenceValues = JSON.parse(readFileSync(_referencesJSONFile));
    } catch (e) {
      console.error('Could not read reference JSON.');
      console.log(e);
      throw e;
    }
    await setLoadToPredefinedValues(_etalonIP, _referenceValues);
    console.log('Load started');
  } catch (e) {
    console.log(e);
  }
}

async function readEtalon({
  etalon: _etalonIP
}) {
  try {
    await readLoad(_etalonIP);
  } catch (e) {
    console.log(e);
  }
}

const REPEAT_MEASUREMENTS = 5;
const EM_COLLECT_DATA_PERIOD = 80;
async function collectAveragedMeasurments(_testDev) {
  const _calibrationMeasurementAccumulator = measurementAccumulator();
  const _divBy_REPEAT_MEASUREMENTS = measurementDivideBy(REPEAT_MEASUREMENTS);
  let emCount = 0;
  let _accumulator = null;
  return new Promise((resolve) => {
    const _repeatInteral = setInterval(async () => {
      emCount++;

      // console.log('Collecting sample ', emCount);

      let _statusValues = await _testDev.EMCalibrator.getStatus();
      // console.log(_statusValues.response);
      _accumulator = _calibrationMeasurementAccumulator(
        measurementFromDeviceEMStatus(_statusValues.response)
      );

      if (emCount >= REPEAT_MEASUREMENTS) {
        clearInterval(_repeatInteral);
        const _result = _divBy_REPEAT_MEASUREMENTS(_accumulator);
        resolve(_accumulator);
      }
    }, EM_COLLECT_DATA_PERIOD);
  });
}

//p.33 of ADE7880.pdf - ANGLE registers
//measured delay is LSB*3.90625 μs
//p.37
//phase calibration LSB is 0.976 μs
function calcPHCALReg(etalonPF, measuredDelay, lineFrequency) {
  const FREQUENCY_IN_US = (1 / lineFrequency) * 1e6;
  const ANGLEX_LSB_US = 3.90625;
  const XPHCAL_LSB_US = 0.976;
  let etalonDelay = 0;
  console.log('epf', etalonPF, lineFrequency);
  if (etalonPF !== 1) {
    etalonDelay = Math.acos(Math.abs(etalonPF)) / (2 * Math.PI * lineFrequency);
    etalonDelay = -1 * etalonDelay;
    etalonDelay = etalonDelay * 1e6;
  }
  let measuredDelayInuS = measuredDelay * ANGLEX_LSB_US;
  //if delay is more than half a cycle then make it negative
  if (measuredDelayInuS > FREQUENCY_IN_US / 2) {
    measuredDelayInuS = Math.round(measuredDelayInuS) - FREQUENCY_IN_US;
  }
  console.log('PHCAL dbg', measuredDelayInuS, etalonDelay);
  let PHCAL = Math.round((measuredDelayInuS - etalonDelay) / XPHCAL_LSB_US);
  //now adjust according to the datasheet as the register is 10 bit, no sign, but quirks (value | 0x200)
  if (PHCAL > 63) PHCAL = 63;
  if (PHCAL < -383) PHCAL = -383;
  if (PHCAL > 0) PHCAL += 512;
  console.log('PHCAL', PHCAL);
  return Math.abs(PHCAL);
}

async function calibrateCTPhaseOffsets({
  shelly: _shellyIP,
  reference: _referencesJSONFile,
  etalon: _useIT8615,
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EMCalibrator(_transport);
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  let _referenceValues = null;
  try {
    _referenceValues = JSON.parse(readFileSync(_referencesJSONFile));
  } catch (e) {
    console.error('Could not read reference JSON.');
    console.log(e);
    throw e;
  }

  if (_useIT8615) {
    try {
      await setLoadToPredefinedValues(_useIT8615, _referenceValues);
    } catch (e) {
      console.log(e);
    }
    await _wait(5000);
  }

  try {
    console.log('Connecting to calibrator at', _shellyIP);
    await _transport.connect(_shellyIP);

    const _measurementFromCalibratorDevice = await collectAveragedMeasurments(
      _testDev
    );

    const _newAPHCAL = calcPHCALReg(
      _referenceValues.pf,
      Math.round(_measurementFromCalibratorDevice.angle_a),
      _referenceValues.frequency
    );
    const _newBPHCAL = calcPHCALReg(
      _referenceValues.pf,
      Math.round(_measurementFromCalibratorDevice.angle_b),
      _referenceValues.frequency
    );
    const _newCPHCAL = calcPHCALReg(
      _referenceValues.pf,
      Math.round(_measurementFromCalibratorDevice.angle_b),
      _referenceValues.frequency
    );

    console.log('Measured', _measurementFromCalibratorDevice);

    let _devConfig = await _testDev.Config.get();
    console.log(_devConfig.response.factory.calib);

    await _testDev.Config.set({
      factory: {
        calib: {
          gains: {
            aphcal: _newAPHCAL,
            bphcal: _newBPHCAL,
            cphcal: _newCPHCAL,
          },
        },
      },
    });
    await _testDev.Config.save();
    await _testDev.EMCalibrator.loadConfig();

    _devConfig = await _testDev.Config.get();
    console.log('New ADE gain and phcal registers');
    console.log(_devConfig.response.factory.calib);
  } catch (e) {
    console.error('Step: CT compensation calibration failed');
    console.log(e);
  }

  if (_useIT8615) {
    await stopEtalon({ etalon: _useIT8615 });
  }
}

function calcGainReg_VI(
  etalonValue,
  measuredValue,
  configRegValue,
  scale = 0x800000
) {
  const k = etalonValue / measuredValue;
  const _ab = new ArrayBuffer(4);
  const _configRegDV = new DataView(_ab);
  _configRegDV.setUint32(0, Math.round(configRegValue));
  let mul = 1;
  if (_configRegDV.getUint8(1) & 0x80) {
    mul = -1;
  }
  _configRegDV.setUint8(0, 0);
  _configRegDV.setUint32(
    0,
    Math.round(
      mul * (k - 1.0) * scale.toFixed(5) +
        k * (_configRegDV.getUint32(0) & 0x0fffffff).toFixed(5)
    )
  );
  if (_configRegDV.getUint8(1) & 0x80) _configRegDV.setUint8(0, 0x0f);
  else _configRegDV.setUint8(0, 0);
  console.log(
    'test',
    k,
    configRegValue,
    _configRegDV.getUint32(0),
    configRegValue - _configRegDV.getUint32(0)
  );
  return _configRegDV.getUint32(0);
}

function calcGainReg_P(
  etalonValue,
  measuredValue,
  configRegValue,
  scale = 0x800000
) {
  const k = etalonValue / measuredValue;
  const _ab = new ArrayBuffer(4);
  const _configRegDV = new DataView(_ab);
  _configRegDV.setUint32(0, Math.round(configRegValue));

  let mul = 1;
  if (_configRegDV.getUint8(1) & 0x80) {
    mul = -1;
  }
  _configRegDV.setUint32(
    0,
    Math.round(
      mul * (k - 1.0) * scale.toFixed(5) +
        k * (_configRegDV.getUint32(0) & 0x0fffffff).toFixed(5)
    )
  );
  _configRegDV.setUint8(0, _configRegDV.getUint8(0) & 0x0f);
  console.log(
    'test',
    k,
    configRegValue,
    _configRegDV.getUint32(0),
    configRegValue - _configRegDV.getUint32(0)
  );
  return _configRegDV.getUint32(0);
}

const calcGainRegV = calcGainReg_VI;
const calcGainRegI = calcGainReg_VI;
// const calcGainRegP = calcGainReg_P;
const calcGainRegP = calcGainReg_VI;

async function calibrateVIP({
  shelly: _shellyIP,
  reference: _referencesJSONFile,
  etalon: _useIT8615,
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EMCalibrator(_transport);
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  let _referenceValues = null;
  try {
    _referenceValues = JSON.parse(readFileSync(_referencesJSONFile));
  } catch (e) {
    console.error('Could not read reference JSON.');
    console.log(e);
    throw e;
  }

  if (_useIT8615) {
    try {
      await setLoadToPredefinedValues(_useIT8615, _referenceValues);
    } catch (e) {
      console.log(e);
    }
    await _wait(5000);
  }

  try {
    console.log('Connecting to calibrator at', _shellyIP);
    await _transport.connect(_shellyIP);

    // const _measurementFromCalibratorDevice = measurementFromDeviceEMStatus(_status.response);
    let _measurementFromCalibratorDevice = await collectAveragedMeasurments(
      _testDev
    );

    console.log('Measured', _measurementFromCalibratorDevice);

    let _devConfig = await _testDev.Config.get();
    console.log(_devConfig.response.factory.calib.gains);

    let _newAIGain = calcGainRegI(
      _referenceValues.current,
      _measurementFromCalibratorDevice.current_a,
      _devConfig.response.factory.calib.gains.aigain
    );
    let _newAVGain = calcGainRegV(
      _referenceValues.voltage,
      _measurementFromCalibratorDevice.voltage_a,
      _devConfig.response.factory.calib.gains.avgain
    );

    let _newBIGain = calcGainRegI(
      _referenceValues.current,
      _measurementFromCalibratorDevice.current_b,
      _devConfig.response.factory.calib.gains.bigain
    );
    let _newBVGain = calcGainRegV(
      _referenceValues.voltage,
      _measurementFromCalibratorDevice.voltage_b,
      _devConfig.response.factory.calib.gains.bvgain
    );

    let _newCIGain = calcGainRegI(
      _referenceValues.current,
      _measurementFromCalibratorDevice.current_c,
      _devConfig.response.factory.calib.gains.cigain
    );
    let _newCVGain = calcGainRegV(
      _referenceValues.voltage,
      _measurementFromCalibratorDevice.voltage_c,
      _devConfig.response.factory.calib.gains.cvgain
    );

    let _newNIGain = calcGainRegI(
      _referenceValues.current,
      _measurementFromCalibratorDevice.current_n,
      _devConfig.response.factory.calib.gains.nigain
    );

    await _testDev.Config.set({
      factory: {
        calib: {
          gains: {
            avgain: _newAVGain,
            bvgain: _newBVGain,
            cvgain: _newCVGain,
            aigain: _newAIGain,
            bigain: _newBIGain,
            cigain: _newCIGain,
            nigain: _newNIGain,
          },
        },
      },
    });

    await _testDev.Config.save();
    await _testDev.EMCalibrator.loadConfig();

    console.log('Wait a bit for ADE to settle....');
    await _wait(4000);

    _measurementFromCalibratorDevice = await collectAveragedMeasurments(
      _testDev
    );

    console.log('Measured after VI', _measurementFromCalibratorDevice);

    let _newAPGain = calcGainRegP(
      _referenceValues.apower,
      _measurementFromCalibratorDevice.apower_a,
      _devConfig.response.factory.calib.gains.apgain
    );

    let _newBPGain = calcGainRegP(
      _referenceValues.apower,
      _measurementFromCalibratorDevice.apower_b,
      _devConfig.response.factory.calib.gains.bpgain
    );

    let _newCPGain = calcGainRegP(
      _referenceValues.apower,
      _measurementFromCalibratorDevice.apower_c,
      _devConfig.response.factory.calib.gains.cpgain
    );

    await _testDev.Config.set({
      factory: {
        calib: {
          gains: {
            apgain: _newAPGain,
            bpgain: _newBPGain,
            cpgain: _newCPGain,
          },
        },
      },
    });

    await _testDev.Config.save();
    await _testDev.EMCalibrator.loadConfig();
  } catch (e) {
    console.error('Step: VIP compensation calibration failed');
    console.log(e);
  }

  if (_useIT8615) {
    await stopEtalon({ etalon: _useIT8615 });
  }
}

async function calibratePower({ shelly: _shellyIP }) {}

async function compareAgainst({ shelly: _shellyIP }) {}

async function saveGains({ shelly: _shellyIP, output: _outputFileName }) {
  console.log('Shelly Pro 3EM device at ', _shellyIP);
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  try {
    await _transport.connect(_shellyIP);
    const _devInfo = await _testDev.getInfo();
    let _devConfig = await _testDev.Config.get();
    console.log(_devConfig.response.factory.calib.gains);
    if (_outputFileName) {
      _outputFileName = _outputFileName.replace('[mac]', _devInfo.mac);
      console.log('Saving gains to', _outputFileName);
      writeFileSync(
        _outputFileName,
        JSON.stringify(_devConfig.response.factory.calib.gains),
        { flag: 'a+' }
      );
    }
  } catch (e) {
    console.error('Device read error', e);
    throw e;
  }
}

async function restoreGains({ shelly: _shellyIP, output: _outputFileName }) {
  console.log('Shelly Pro 3EM device at ', _shellyIP);
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);
  try {
    await _transport.connect(_shellyIP);
    const _devInfo = await _testDev.getInfo();
    let _gainValues = null;
    try {
      _outputFileName = _outputFileName.replace('[mac]', _devInfo.mac);
      console.log('Restoring gains from', _outputFileName);
      _gainValues = JSON.parse(readFileSync(_outputFileName));
    } catch (e) {
      console.error('Could not read gains JSON.', _outputFileName);
      console.log(e);
      throw e;
    }
    if (_gainValues) {
      await _testDev.Config.set({
        factory: {
          calib: {
            gains: _gainValues,
          },
        },
      });
      await _testDev.Config.save();
      if(_testDev.EMCalibrator)
        await _testDev.EMCalibrator.loadConfig();
    }
  } catch (e) {
    console.error('Device read error', e);
    throw e;
  }
}

class ShellyCommand extends Command {
  createCommand(name) {
    const _command = new Command(name);
    _command.addOption(
      new Option('--shelly <shelly-ip>', 'Shelly IP address').env('SHELLY')
    );
    _command.addOption(
      new Option('-o --output [output-file]', 'File to output results to').env(
        'OUTPUT'
      )
    );
    return _command;
  }
}

const cli = new ShellyCommand('calibrate');

cli.command('read').description('Read device data').action(read);

cli
  .command('compare')
  .description('Compare two Shelly device readings')
  .addOption(
    new Option('-e --etalon <etalon-ip>', 'Etalon IP address').env('ETALON')
  )
  .addOption(
    new Option(
      '--etype [etalon-type]',
      'Type of etalon: shelly or emcalibrator'
    ).env('ETYPE')
  )
  .action(compare);

  cli
  .command('compareref')
  .description('Compare device vs reference values')
  .addOption(
    new Option('-e --etalon <etalon-file-name>', 'File with etalon references').env('ETALON')
  )
  .action(compare2);

cli
  .command('calibrateCT')
  .description('Calibrate CT')
  .addOption(
    new Option(
      '-e --etalon [etalon-ip:etalon-port]',
      'IP address of IT8615'
    ).env('ETALON')
  )
  .addOption(
    new Option(
      '--reference [reference-values]',
      'JSON file with reference measurements'
    ).env('REF')
  )
  .action(calibrateCTPhaseOffsets);

cli
  .command('calibrateVIP')
  .description('Calibrate Voltage Current and Power gain registers')
  .addOption(
    new Option(
      '-e --etalon [etalon-ip:etalon-port]',
      'IP address of IT8615'
    ).env('ETALON')
  )
  .addOption(
    new Option(
      '--reference [reference-values]',
      'JSON file with reference measurements'
    ).env('REF')
  )
  .action(calibrateVIP);

cli.command('savegains').description('Save gain registers').action(saveGains);

cli
  .command('restoregains')
  .description('Restore gain registers')
  .action(restoreGains);

cli
  .command('readload')
  .addOption(
    new Option(
      '-e --etalon [etalon-ip:etalon-port]',
      'IP address of IT8615'
    ).env('ETALON')
  )
  .description('Read IT8615').action(readEtalon);

cli
  .command('startload')
  .addOption(
    new Option(
      '-e --etalon <etalon-ip:etalon-port>',
      'IP address of IT8615'
    ).env('ETALON')
  )
  .addOption(
    new Option(
      '--reference [reference-values]',
      'JSON file with reference measurements'
    ).env('REF')
  )
  .action(startEtalon);

cli
  .command('stopload')
  .addOption(
    new Option(
      '-e --etalon <etalon-ip:etalon-port>',
      'IP address of IT8615'
    ).env('ETALON')
  )
  .action(stopEtalon);

async function main() {
  return await cli.showHelpAfterError().parseAsync();
}

main()
  .then((_) => {
    process.exit(0);
  })
  .catch((_) => {
    process.exit(-1);
  });
