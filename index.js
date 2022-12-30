import { readFileSync, writeFileSync } from 'fs';
import { Shelly, Pro3EMLite, wsTransport } from './shelly.js';
import { IT8615 } from './it8615.js';
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
} from './src/model.js';

if (process.argv.length <= 2) {
	printUsage();
	process.exit(1);
}

const ARGUMENTS = process.argv.slice(2);
const ACTION = ARGUMENTS[0] || 'calibrate';
const EM_IP = process.env.EM_IP;
const LOAD_IP = process.env.LOAD_IP;
const EM_COLLECT_DATA_PERIOD = process.env.EM_COLLECT_DATA_PERIOD || 1000;
const REPEAT_MEASUREMENTS = 3;

const CAL_VOLTAGE = process.env.CAL_VOLTAGE;
const CAL_CURRENT = process.env.CAL_CURRENT;
const CAL_ACTIVE_POWER = process.env.CAL_ACTIVE_POWER;
const CAL_APPARENT_POWER = process.env.CAL_APPARENT_POWER;

const _transport = new wsTransport(EM_IP);
const _testDev = new Pro3EMLite(_transport);

switch (ACTION) {
	case 'reset':
    let resetValue = 1;
		if(ARGUMENTS[1]) {
			try {
        resetValue = JSON.parse(readFileSync(ARGUMENTS[1]));
      } catch(e) {
        console.log('Can not read ', ARGUMENTS[1]);
        process.exit(1);
      }
		}
    if(typeof resetValue == Number) {
      resetValue = ADEConfigFromMeasurement(measurementResetTo(resetValue));
    }
    _transport
			.connect()
			.then(async () => {
        await setCalibrationValues(resetValue);
        console.log('Coefficients set, rebooting device');
				_testDev.reboot();
			})
			.catch((reason) => {
				console.log('Could not reset config');
				console.log(reason);
			}).finally(() => {
				process.exit(0);
			});;
		break;
	case 'read':
		_transport
			.connect()
			.then(async () => {
				const EM_status = await _testDev.EM.getStatus({ id: 0 });
        const EM_status_as_measurements = measurementFromDeviceEMStatus(EM_status.response);
				console.log('Device EM status');
				console.table(EM_status_as_measurements);
				const EMData_status = await _testDev.EMData.getStatus({ id: 0 });
				console.log('Device EMData status');
				console.log(EMData_status);
        let CSV_results = [];
        CSV_results.push(Date.now());
        CSV_results.push(_testDev.info.mac);
        Object.entries(EM_status_as_measurements).reduce((valueCollection, tupple)=>{
          valueCollection.push(tupple[1]);
          return valueCollection
        }, CSV_results);
        if(process.env.CSV_DEVICE_READ_FILE_NAME) {
          console.log('Writing to: ', process.env.CSV_DEVICE_READ_FILE_NAME);
          writeFileSync(process.env.CSV_DEVICE_READ_FILE_NAME, CSV_results.join(',')+'\n', {flag:'a'});
        }
			})
			.catch((e) => {
				console.log('Failed to read', e);
			})
			.finally(() => {
				process.exit(0);
			});
		break;
  case 'fetchdata':
		_transport
			.connect()
			.then(async () => {
        const msToS = (ms)=>Math.round(ms/1000)
        let _now = new Date();
        let _oneDayAgo = new Date();
        _oneDayAgo.setHours(_now.getHours()-24);
        let _counter = 0;
        let _startExtractTime = Date.now();
        const _startTS = _oneDayAgo.getTime();
        // const _startTS = 1660001400000;
        const _endTS = _now.getTime();
        console.log('Reading device data from ', new Date(_startTS), 'to ', new Date(_endTS));
        for await(const _valueRow of _testDev.getPeriodIterator(msToS(_startTS), msToS(_endTS))) {
          _counter++;
          const _rowDate = new Date(_valueRow.ts*1000);
          console.log(_rowDate);
          // console.log('read value', _valueRow);
        }
      })
      .catch((reason) => {
				console.log('Could not fetch data', reason);
				console.log(reason);
			})
			.finally(() => {
				process.exit(0);
			});
    break;
	case 'compare':
		_transport
			.connect()
			.then(async () => {
				let _refValues = measurementFromReferenceValues(await getReferenceMeasurements());
				let _statusValues = await _testDev.EM.getStatus({ id: 0 });
				let _devValues = measurementFromDeviceEMStatus(_statusValues.response);
				let _mm = mergeMeasurements(_refValues, _devValues, (a, b) => Math.round((Math.abs(a - b) / a) * 10000) / 100, [
					'Reference',
					'Device',
					'Diff %',
				]);
				console.table(_mm);
			})
			.catch((reason) => {
				console.log('Could not complete calibration');
				console.log(reason);
			})
			.finally(() => {
				process.exit(0);
			});
		break;
	case 'readload':
		console.table(await getReferenceMeasurements());
    process.exit(0);
		break;
	case 'setload':
		const _newPowerValue = ARGUMENTS[1];
		await setLoadPower(_newPowerValue);
    process.exit(0);
		break;
	case 'turnload':
		const _powerLoad = ['true', 'on', '1'].includes(ARGUMENTS[1].toLowerCase());
		await setLoadOutput(_powerLoad);
    process.exit(0);
		break;
	case 'readdevconfig':
		_transport
			.connect()
			.then(async () => {
				let _coefficients = await getCalibrationValues();
				console.log('Calibration coefficients');
				console.table(_coefficients);

        let CSV_results = [];
        CSV_results.push(Date.now());
        CSV_results.push(_testDev.info.mac);
        Object.entries(_coefficients).reduce((valueCollection, tupple)=>{
          valueCollection.push(tupple[1]);
          return valueCollection
        }, CSV_results);
        if(process.env.CSV_DEVICE_COEFF_FILE_NAME) {
          console.log('Writing to: ', process.env.CSV_DEVICE_COEFF_FILE_NAME);
          writeFileSync(process.env.CSV_DEVICE_COEFF_FILE_NAME, CSV_results.join(',')+'\n', {flag:'a'});
        }
			})
			.catch((reason) => {
				console.log('Could not complete calibration');
				console.log(reason);
			})
			.finally(() => {
				process.exit(0);
			});
		break;
	case 'calibrate':
		_transport
			.connect()
			.then(async () => {
				console.log(`Starting calibration procedure. Reading every ${EM_COLLECT_DATA_PERIOD} msec`);
				const _averagedMeasurements = await collectAveragedMeasurments();
				const _divBy_2 = measurementDivideBy(2);
				console.log('Averaged measurements from ', EM_IP);
				console.table(_averagedMeasurements);

				let _refValues = measurementFromReferenceValues(await getReferenceMeasurements());
				console.log('Reference measurements');
				console.table(_refValues);

				let _coefficients = measurementFromADEConfig(await getCalibrationValues());
				console.log('Current calibration coefficients');
				console.table(_coefficients);

				let _resCoefficients = measurementMul(_coefficients, measurementDiv(_refValues, _averagedMeasurements));
				console.log('New calibration coefficients');
				console.table(_resCoefficients);

				/*
        average over multiple measurements
        _resCoefficients = _divBy_2(measurementAdd(_coefficients, _resCoefficients));
        */

				const _newCoefficients = ADEConfigFromMeasurement(_resCoefficients);
				await setCalibrationValues(_newCoefficients);
				_testDev.reboot();
				console.log("Done. I'll be gone");
				process.exit(0);
			})
			.catch((reason) => {
				console.log('Could not complete calibration');
				console.log(reason);
			})
			.finally(() => {
				process.exit(0);
			});
		break;
	default:
		printUsage();
}

//Until we figure out how to extract real time data from the equipment
//We hardcode current 'observed' values here
async function getReferenceMeasurements() {
  let voltage = process.env.CAL_VOLTAGE;
  let current = process.env.CAL_CURRENT;
  let apower = process.env.CAL_ACTIVE_POWER;
  let aprtpower = process.env.CAL_APPARENT_POWER;
  let result = null;
  try {
    let _it = new IT8615();
		await _it.connect(LOAD_IP, 30000, 1000);
		const measurements = await _it.getMeasure();
		_it.close();
		voltage = measurements.get('Voltage_RMS');
		current = measurements.get('Current_RMS');
		apower = measurements.get('Power_Active');
		aprtpower = measurements.get('Power_Apparent');		
		console.log('Read load data');
	} catch (e) {
		console.log('Failed to connect to load or load readout error');
		console.log(e);
    console.log('Will use default values passed via environment')
	} finally {
    result = {
			voltage,
			current,
			apower,
			aprtpower,
		};
		console.table(result);
		return result;
  }
}

async function setLoadPower(power) {
	let _it = new IT8615();
	try {
		await _it.connect(LOAD_IP, 30000, 1000);
		_it.deviceRemoteControl();
		let _newPower = await _it.setPower(power);
		console.log('New load power', _newPower);
		_it.deviceLocalControl();
		_it.close();
	} catch (e) {
		console.log('Failed to connect to load');
		console.log(e);
		throw e;
	}
}

async function setLoadOutput(on = false) {
	let _it = new IT8615();
	try {
		await _it.connect(LOAD_IP, 30000, 1000);
		_it.deviceRemoteControl();
		let _newPower = await _it.setOutput(on);
		console.log('New load power', _newPower);
		_it.deviceLocalControl();
		_it.close();
	} catch (e) {
		console.log('Failed to connect to load');
		console.log(e);
		throw e;
	}
}

async function getCalibrationValues() {
	const _cfgValsResp = await _testDev.request({ method: 'config.get', params: { key: `ade7880_x` } });
	const _cfgVals = _cfgValsResp.response;
	const _resCfgVals = Object.fromEntries(
		Object.entries(_cfgVals).filter((value) => Object.hasOwn(ADE_CONFIG, value[0]))
	);
	return _resCfgVals;
}

async function setCalibrationValues(_adeCoefficients) {
	let result = await _testDev.request({
		method: 'config.set',
		params: {
			config: {
				ade7880_x: _adeCoefficients,
			},
		},
	});
	console.log(EM_IP, result.method, result.response);
	result = await _testDev.request({
		method: 'config.save',
		params: {
			reboot: false,
		},
	});
	console.log(EM_IP, result.method, result.response);
}

async function collectAveragedMeasurments() {
	const _calibrationMeasurementAccumulator = measurementAccumulator();
	const _divBy_REPEAT_MEASUREMENTS = measurementDivideBy(REPEAT_MEASUREMENTS);
	let emCount = 0;
	let _accumulator = null;
	return new Promise((resolve) => {
		const _repeatInteral = setInterval(async () => {
			emCount++;
			console.log('Collecting sample ', emCount);

			let _statusValues = await _testDev.request({ method: 'em.getstatus', params: { id: 0 } });
			_accumulator = _calibrationMeasurementAccumulator(measurementFromDeviceEMStatus(_statusValues.response));

			if (emCount >= REPEAT_MEASUREMENTS) {
				clearInterval(_repeatInteral);
				const _result = _divBy_REPEAT_MEASUREMENTS(_accumulator);
				resolve(_accumulator);
			}
		}, EM_COLLECT_DATA_PERIOD);
	});
}

const wait = async (msec = 1000) => new Promise((resolve) => setTimeout(() => resolve()));

function printUsage() {
	console.log('Pro3EM Lite calibrating');
	console.log('=======================');
	console.log('Usage:');
	console.log('node index.js <device-ip> <action> [it8615-load-ip]');
	console.log('  -action:');
	console.log('    read - read EM and EMData statuses');
	console.log('    reset - reset calibration scales to 1');
	console.log('    check - compare Pro3EM momentary readings against the load reported');
	console.log('    calibrate - read from device, calculate scales, write back');
	console.log('See readme.md for details');
}
