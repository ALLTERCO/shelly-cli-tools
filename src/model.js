const MEASUREMENT = {
  voltage_a: 0,
  voltage_b: 0,
  voltage_c: 0,
  current_a: 0,
  current_b: 0,
  current_c: 0,
  current_n: 0,
  apower_a: 0,
  apower_b: 0,
  apower_c: 0,
  aprtpower_a: 0,
  aprtpower_b: 0,
  aprtpower_c: 0,
  angle_a: 0,
  angle_b: 0,
  angle_c: 0,
  pf_a: 0,
  pf_b: 0,
  pf_c: 0,
};

const ADE_CONFIG = {
  voltage_scale_a: 'voltage_a',
  voltage_scale_b: 'voltage_b',
  voltage_scale_c: 'voltage_c',
  current_scale_a: 'current_a',
  current_scale_b: 'current_b',
  current_scale_c: 'current_c',
  current_scale_n: 'current_n',
  apower_scale_a: 'apower_a',
  apower_scale_b: 'apower_b',
  apower_scale_c: 'apower_c',
  aprtpower_scale_a: 'aprtpower_a',
  aprtpower_scale_b: 'aprtpower_b',
  aprtpower_scale_c: 'aprtpower_c',
};

let result = {
  message: {
    phase_a: {
      voltage: 1,
      current: 1,
      active_power: 1,
      apparent_power: 1,
    },
    phase_b: {
      voltage: 1,
      current: 1,
      active_power: 1,
      apparent_power: 1,
    },
    phase_c: {
      voltage: 1,
      current: 1,
      active_power: 1,
      apparent_power: 1,
    },
    neutral: {
      current: 4,
    },
  },
};

/**
 *
 * @param {*} statusResult RPC result object from EM.GetStatus (result.message property)
 * @returns MEASUREMENT record
 */
function measurementFromDeviceEMStatus(statusResult) {
  const translate = {
    voltage: 'voltage',
    current: 'current',
    apower: 'act_power',
    aprtpower: 'aprt_power',
    pf: 'pf',
    angle: 'angle',
  };
  const buildMatch = new RegExp(
    '(' + Object.keys(translate).join('|') + ')_(a|b|c|n)'
  );
  return Object.keys({ ...MEASUREMENT }).reduce((result, key) => {
    const _keys = key.match(buildMatch);
    const phase = _keys[2];
    const type = _keys[1];
    result[key] = statusResult[`${phase}_${translate[type]}`]
    if(result[key] === undefined) delete result[key];
    return result;
  }, {});
}

//ASSUMPTION - all three CT will be on the same line so we expand all values
//thus neutral is equal to phase current values
/**
 *
 * @param {*} refValues {voltage,current,apower,aprtpower}
 * @returns MEASUREMENT record
 */
function measurementFromReferenceValues(refValues) {
  return Object.keys(MEASUREMENT).reduce((result, key) => {
    const mkeys = key.match(
      /(voltage|current|apower|aprtpower|frequency|pf|angle)_*/
    );
    if (refValues[mkeys[1]]) {
      result[key] = refValues[mkeys[1]];
    }
    return result;
  }, {});
}

function mergeMeasurements(ma, mb, transformFn, columns) {
  return Object.keys(ma).reduce((result, key) => {
    const _r = {};
    _r[columns[0] || 'Original'] = ma[key];
    _r[columns[1] || 'New'] = mb[key];
    _r[columns[2] || 'Diff'] = transformFn(ma[key], mb[key]);
    result[key] = _r;
    return result;
  }, {});
}

function measurementAccumulator(measurement = { ...MEASUREMENT }) {
  return (newMeasurement) =>
    Object.keys(measurement).reduce((result, key) => {
      result[key] += newMeasurement[key];
      return result;
    }, measurement);
}

function measurementDivideBy(divisor) {
  return (measurement) =>
    Object.keys(measurement).reduce((result, key) => {
      result[key] /= divisor;
      return result;
    }, measurement);
}

function measurementAdd(ma, mb) {
  return Object.keys(ma).reduce((result, key) => {
    result[key] = ma[key] + mb[key];
    return result;
  }, {});
}

function measurementMul(ma, mb) {
  return Object.keys(ma).reduce((result, key) => {
    result[key] = ma[key] * mb[key];
    return result;
  }, {});
}

function measurementDiv(ma, mb) {
  return Object.keys(mb).reduce((result, key) => {
    result[key] = ma[key] / mb[key];
    return result;
  }, {});
}

function measurementHasZero(measurement) {
  return !Object.values(measurement).reduce((ret, value) => {
    return ret || value === 0;
  }, true);
}

function calcCoefficient(transofrmFn) {
  return (coefficients, reference, measured) => {
    return Object.keys(coefficients).reduce((result, key) => {
      coefficients[key] = transofrmFn(
        coefficients[key],
        reference[key],
        measured[key]
      );
      return coefficients;
    }, {});
  };
}

function measurementFromADEConfig(adeConfig) {
  return Object.keys(ADE_CONFIG).reduce(
    (result, key) => {
      result[ADE_CONFIG[key]] = adeConfig[key];
      return result;
    },
    { ...MEASUREMENT }
  );
}

function ADEConfigFromMeasurement(measurement) {
  return Object.keys(ADE_CONFIG).reduce((result, key) => {
    result[key] = measurement[ADE_CONFIG[key]];
    return result;
  }, {});
}

function measurementResetTo(value) {
  if (typeof value == Number)
    return Object.keys(MEASUREMENT).reduce((result, key) => {
      result[key] = value;
      return result;
    }, {});
  if (typeof value == Object)
    return Object.keys(MEASUREMENT).reduce((result, key) => {
      result[key] = value[key];
      return result;
    }, {});
}

export {
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
};
