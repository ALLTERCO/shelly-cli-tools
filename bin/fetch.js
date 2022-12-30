#!/usr/bin/env node
import { Shelly3EM } from '@allterco/shelly/shelly-3em.js';
import { wsTransport } from '@allterco/transport/websocket.js';
import { Command, Argument, Option } from 'commander';
import cliProgress from 'cli-progress';
import { writeFileSync } from 'fs';

const debug = process.env.DEBUG || 'none';

async function fetchData(
  startDate,
  endDate,
  { shelly: _shellyIP, output: _outputFileName }
) {
  const _transport = new wsTransport();
  const _testDev = new Shelly3EM(_transport);
  _transport.setDebug(debug);
  _testDev.setDebug(debug);

  const _dRegEx = /([0-9]*)([d,D,h,H,m])/;
  const _matchDayPeriod = startDate.match(_dRegEx);
  let _startDate, _endDate;
  if (_matchDayPeriod.length > 1) {
    _endDate = new Date();
    _startDate = new Date();
    if (_matchDayPeriod[2].toLowerCase() == 'd') {
      _startDate.setDate(_endDate.getDate() - parseInt(_matchDayPeriod[1]));
    } else if (_matchDayPeriod[2].toLowerCase() == 'h') {
      _startDate.setHours(_endDate.getHours() - parseInt(_matchDayPeriod[1]));
    } else if (_matchDayPeriod[2].toLowerCase() == 'm') {
      _startDate.setMinutes(_endDate.getMinutes() - parseInt(_matchDayPeriod[1]));
    }
  } else {
    _startDate = new Date(Date.parse(startDate));
    _endDate = endDate ? new Date(endDate) : new Date();
  }

  const _startTS = _startDate.getTime();
  const _endTS = _endDate.getTime();
  console.log('Shelly Pro 3EM device at ', _shellyIP);
  console.log(
    'Reading device data from ',
    new Date(_startTS),
    'to ',
    new Date(_endTS),
    '\n'
  );
  let _emDataIteratorResult = null;

  try {
    await _transport.connect(_shellyIP);
    const _devInfo = await _testDev.getInfo();
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progressBar.start(100, 0);

    const msToS = (ms) => Math.round(ms / 1000);
    const _resultIterator = _testDev.EMData.getPeriodIterator(
      msToS(_startTS),
      msToS(_endTS)
    );

    let _deviceDataResults = [];

    const _startTimeMs = Date.now();
    do {
      _emDataIteratorResult = await _resultIterator.next();
      if (_emDataIteratorResult.done) {
        break;
      }

      _deviceDataResults.push([
        _emDataIteratorResult.value.ts,
        ..._emDataIteratorResult.value.record,
      ]);

      progressBar.update(_emDataIteratorResult.value.percent);
    } while (_emDataIteratorResult.done == false);
    const _endTimeMs = Date.now();
    
    progressBar.update(100);

    console.log('\n');
    
    _outputFileName = _outputFileName || _devInfo.mac + '.log';
    _outputFileName = _outputFileName.replace('[mac]', _devInfo.mac)
    console.log('Writing output file', _outputFileName);
    _deviceDataResults.forEach((value) => {
      writeFileSync(_outputFileName, value.join(',') + '\n', {
        flag: 'a+',
      });
    });

    console.log('Results of this fetch operation: ');
    console.log('Device calls: ', _emDataIteratorResult.value.deviceCalls);
    console.log('Time elapsed in ms: ', _endTimeMs - _startTimeMs);
    console.log('Number of items: ', _emDataIteratorResult.value.itemsCount);
    console.log(
      'Average number of items in a response: ',
      _emDataIteratorResult.value.averageItemsPerCall
    );
  } catch (e) {
    console.log('Could not fetch data. Check connection to device.', reason);
    console.log(reason);
  } finally {
    console.log('Fetch complete.');
  }
}

const cli = new Command('fetch');

cli
  .argument(
    '<start-date>',
    'Start datetime of the period or [1,2,3][d,h,m] e.g. 1d means one day of data, 2h means 2 hours of data, 3m - three minutes'
  )
  .argument('[end-date]')
  .addOption(
    new Option('--shelly <shelly-ip>', 'Shelly IP address').env('SHELLY')
  )
  .option(
    '-o, --output [filename]',
    'filename for output, defaults to <device-mac>.log'
  )
  .action(fetchData)
  .addHelpText(
    'after',
    `
Example date format:
  2022-08-09T14:00:00`
  );

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
