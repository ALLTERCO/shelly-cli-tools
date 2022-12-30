#!/usr/bin/env node
import { readFileSync } from 'fs';
import { Command, Option } from 'commander';
import { Shelly3EM } from '@allterco/shelly/shelly-3em.js';
import { wsTransport } from '@allterco/transport/websocket.js';
import { mapToFile } from '../src/utils.js';
import {
  measurementFromDeviceEMStatus,
  measurementFromReferenceValues,
  mergeMeasurements,
} from '../src/model.js';

const DEBUG = process.env.DEBUG || 'none';

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
  etalon: _etalonShellyIP,
  shelly: _shellyIP,
  output: _outputFileName,
  etype: _etalonType,
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  const _etalonTransport = new wsTransport();
  let _etalonDev;
  _etalonDev = new Shelly3EM(_etalonTransport);
  _etalonDev.getCalStatus = _etalonDev.EM.getStatus;
  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);
  _etalonDev.setDebug(DEBUG);

  try {
    let _status;
    await _transport.connect(_shellyIP);
    const _testDevMac = await _testDev.getInfo().mac;
    _status = await _testDev.EM.getStatus();
    const _measurementFromTestDevice = measurementFromDeviceEMStatus(
      _status.response
    );
    await _etalonTransport.connect(_etalonShellyIP);
    const _etalonDevMac = await _etalonDev.getInfo().mac;
    _status = await _etalonDev.getCalStatus();
    if (typeof _status.response == 'undefnined') {
      throw new Error('Invalid etalon reading');
    }
    const _measurementFromEtalonDevice = measurementFromDeviceEMStatus(
      _status.response
    );

    let _mm = mergeMeasurements(
      _measurementFromEtalonDevice,
      _measurementFromTestDevice,
      (a, b) => Math.round(((b - a) / a) * 10000) / 100,
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

async function compareRefValue({
  etalon: _etalonFileName,
  shelly: _shellyIP,
  output: _outputFileName,
}) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);

  _transport.setDebug(DEBUG);
  _testDev.setDebug(DEBUG);

  try {
    const _referenceValues = JSON.parse(readFileSync(_etalonFileName));
    const _measurementFromEtalonDevice =
      measurementFromReferenceValues(_referenceValues);

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

const cli = new ShellyCommand('read');

cli.command('read').description('Read device data').action(read);

cli
  .command('compare')
  .description('Compare two Shelly device readings')
  .addOption(
    new Option('-e --etalon <etalon-ip>', 'Etalon IP address').env('ETALON')
  )
  .action(compare);

cli
  .command('compareref')
  .description('Compare device vs reference values')
  .addOption(
    new Option(
      '-e --etalon <etalon-file-name>',
      'File with etalon references'
    ).env('ETALON')
  )
  .action(compareRefValue);

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
