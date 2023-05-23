/**
 * Replace letters with numbers using the SEPA scheme A=10, B=11, ...
 * Non-alphanumerical characters are dropped.
 *
 * @param value     The alphanumerical input string
 * @return        The input string with letters replaced
 */
function replaceChars(value) {
  if (typeof value !== 'string') {
    /* eslint:disable-next-line */
    throw new Error(`Value must be a string, provided: ${typeof value}`);
  }
  const sepaScheme = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  value
    .toUpperCase()
    .split('')
    .forEach((char) => {
      const charIndex = sepaScheme.indexOf(char);
      if (charIndex >= 10) {
        result = `${result}${charIndex}`;
      } else {
        result = `${result}${char}`;
      }
    });
  return result;
}

/**
 * modulo97 function for large numbers
 *
 * @param value     The number as a string.
 * @return        The number mod 97.
 */
function modulo97(value) {
  let result = 0;

  value
    .toUpperCase()
    .split('')
    .forEach((char) => {
      result = (result * 10 + parseInt(char, 10)) % 97;
    });

  return result;
}

/**
 * Checks if an IBAN is valid (no country specific checks are done).
 *
 * @param iban        The IBAN to check.
 * @return            True, if the IBAN is valid.
 */

function validateIBAN(iban) {
  const ibrev = iban.substr(4) + iban.substr(0, 4);
  return modulo97(replaceChars(ibrev)) === 1;
}

/**
 * Calculates the checksum for the given IBAN.
 * A full iban with the corrected checksum will be returned.
 *
 * Example: DE00123456781234567890 -> DE87123456781234567890
 *
 * @param iban        The IBAN to calculate the checksum for.
 * @return            The corrected IBAN.
 */
function checksumIBAN(iban) {
  const ibrev = `${iban.substr(4) + iban.substr(0, 2)}00`;
  const mod = modulo97(replaceChars(ibrev));
  return iban.substr(0, 2) + `0${98 - mod}`.substr(-2, 2) + iban.substr(4);
}

/**
 * Checks if a Creditor ID is valid (no country specific checks are done).
 *
 * @param iban        The Creditor ID to check.
 * @return            True, if the Creditor IDis valid.
 */
function validateCreditorID(cid) {
  const cidRev = cid.substr(7) + cid.substr(0, 4);
  return modulo97(replaceChars(cidRev)) === 1;
}

/**
 * Calculates the checksum for the given Creditor ID .
 * A full Creditor ID with the corrected checksum will be returned.
 *
 * Example: DE00ZZZ09999999999 -> DE98ZZZ09999999999
 *
 * @param iban        The IBAN to calculate the checksum for.
 * @return            The corrected IBAN.
 */
function checksumCreditorID(cid) {
  const cidrev = `${cid.substr(7) + cid.substr(0, 2)}00`;
  const mod = modulo97(replaceChars(cidrev));
  return cid.substr(0, 2) + `0${98 - mod}`.substr(-2, 2) + cid.substr(4);
}

function getPainXMLVersion(painFormat) {
  const incrementation = painFormat.startsWith('pain.008') ? 1 : 0;
  return parseInt(painFormat.substr(-2), 10) + incrementation;
}

/**
 *
 * @param {string} stringToFilter
 * @returns
 */
const filterOutInvalidCharacters = (stringToFilter) =>
  (stringToFilter.match(/\w| |\.|\+|\?|\/|:|\(|\)|,+/g) || []).join('');

module.exports = {
  checksumCreditorID,
  checksumIBAN,
  getPainXMLVersion,
  filterOutInvalidCharacters,
  modulo97,
  replaceChars,
  validateCreditorID,
  validateIBAN,
};
