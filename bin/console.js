#!/usr/bin/env node
import { Shelly } from '@allterco/shelly/shelly.js';
import { wsTransport } from '@allterco/transport/websocket.js';
import { udpTransport } from '@allterco/transport/udp.js';
import { default as consoleInput } from 'serverline';

const DEBUG = process.env.DEBUG || 'none';
const SHELLY = process.env.SHELLY || process.argv.slice(2)[0];
const TRANSPORT = process.env.TRANSPORT || process.argv.slice(3)[0] || 'ws';
const TRANSPORT_LIST = {
  'ws': wsTransport,
  'udp': udpTransport,
};

if (typeof SHELLY == undefined) {
  console.log('Please provide device address');
  process.exit(-1);
}

const TRANSPORT_TYPE = ['ws', 'udp'].includes(TRANSPORT.toLowerCase())
  ? TRANSPORT.toLowerCase()
  : 'ws';
const TRANSPORT_PROTO = TRANSPORT_LIST[TRANSPORT_TYPE];

let minMessageLen = Number.MAX_VALUE;
let maxMessageLen = 0;

console.log(`Connecting to Shelly device at ${SHELLY} over ${TRANSPORT_TYPE}`);

const _transport = new TRANSPORT_PROTO();
const _testDev = new Shelly(_transport);
_transport.setDebug(DEBUG);
_testDev.setDebug(DEBUG);

consoleInput.init({
  prompt: 'rpc > ',
});

consoleInput.setCompletion(
  ["Shelly.GetDeviceInfo", "Shelly.GetStatus", "Shelly.GetConfig"]
);

consoleInput.on('line', async (line) => {
  let [method, params] = line.split(' ');
  params = params ? params.trim() : '{}';
  try {
    params = JSON.parse(params);
  } catch (e) {
    console.error('Invalid JSON parameters');
    return;
  }
  const _request = { method, params };
  console.log(_request);
  try {
    let result = await _testDev.request(_request);
    console.log(`${method}: \n`, result.response);
  } catch (e) {
    console.error('Failed rpc call: ', e);
  }
});

consoleInput.on('SIGINT', () => {
  console.log('');
  console.log('Exiting Shelly console monitor');
  console.log(`Message stats: Min: ${minMessageLen}, Max: ${maxMessageLen}`);
  process.exit(0);
});

try {
  await _transport.connect(SHELLY);
  const _deviceInfo = await _testDev.getInfo();
  const _deviceStatus = await _testDev.request({ method: 'Shelly.GetStatus' });
  console.log(`Device id ${_deviceInfo.id}`);
  consoleInput.setPrompt(`${_deviceInfo.id} > `);
  _testDev.on('Notify', (message) => {
    if (message.length < minMessageLen) minMessageLen = message.length;
    if (message.length > maxMessageLen) maxMessageLen = message.length;
    let ntfType =
      message.method == 'NotifyStatus' ? 'Status update' : 'Event update';
    let _date = new Date();
    _date.setTime(Math.round(message.params.ts) * 1000);
    console.log(ntfType, _date.toTimeString());
    console.log(message);
  });
  _testDev.on('close', () => {
    console.error('Connection closed');
    process.exit(-2);
  });
} catch (e) {
  console.error(`Could not connect to device ${SHELLY}`, e);
  process.exit(-1);
}
