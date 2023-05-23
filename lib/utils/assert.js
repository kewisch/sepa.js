const utils = require('./utils');

/** Assert that |condition| is true, otherwise throw an error with |message| */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Assert that |val| is one of |choices| */
function assertFixed(val, choices, member) {
  if (choices.indexOf(val) < 0) {
    throw new Error(
      `${member} must have any value of: ${choices.join(' ')}(found: ${val})`
    );
  }
}

/** assert that |str| has a length between min and max (either may be null) */
function assertLength(value, min, max, member) {
  if (
    (min !== null && value && value.length < min) ||
    (max !== null && value && value.length > max)
  ) {
    throw new Error(
      `${member} has invalid string length, expected ${min} < ${value} < ${max}`
    );
  }
}

/** assert that |num| is in the range between |min| and |max| */
function assertRange(num, min, max, member) {
  if (num < min || num > max) {
    throw new Error(`${member} does not match range ${min} < ${num} < ${max}`);
  }
}

/** assert that |iban| is an IBAN */
function assertIban(iban, member) {
  if (!utils.validateIBAN(iban)) {
    throw new Error(`${member} has invalid IBAN "${iban}"`);
  }
}

/** assert that |cid| is a creditor id */
function assertCid(cid, member) {
  if (!utils.validateCreditorID(cid)) {
    throw new Error(`${member} is invalid "${cid}"`);
  }
}

/** assert an iso date */
function assertDate(date, member) {
  if (!(date instanceof Date)) {
    throw new Error(`${member} has invalid date ${date}`);
  }
}

/** assert that the str uses characters from the first sepa id charset */
function assertSepaIdSet1(sepaId, member) {
  if (!/^([A-Za-z0-9|+|?|/|\-|:|(|)|.|,|'| ]){1,35}$/.test(sepaId) || !sepaId) {
    throw new Error(
      `${member} doesn't match sepa id charset type 1 (found: ` + `"${sepaId}")`
    );
  }
}

/** assert that the str uses characters from the second sepa id charset */
function assertSepaIdSet2(sepaId, member) {
  if (!/^([A-Za-z0-9|+|?|/|\-|:|(|)|.|,|']){1,35}$/.test(sepaId)) {
    throw new Error(
      `${member} doesn't match sepa id charset type 2 (found: ` + `"${sepaId}")`
    );
  }
}

module.exports = {
  assert,
  assertFixed,
  assertLength,
  assertRange,
  assertIban,
  assertCid,
  assertDate,
  assertSepaIdSet1,
  assertSepaIdSet2,
};
