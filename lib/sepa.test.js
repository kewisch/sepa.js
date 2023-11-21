var SEPA = require('./sepa.js');

describe('IBAN tests',
  () => {
    test('Detects valid random IBANs', () => {
      // some random IBANs from randomiban.com
      var validIbans = ['NL30ABNA8727958558', 'DE64500105171488962235', 'CH6389144234422115817',
        'FR0617569000706665685358G36'];

      validIbans.forEach((iban) => expect(SEPA.validateIBAN(iban)).toBe(true));
    });

    test('Detects IBAN with bad checksum', () => {
      expect(SEPA.validateIBAN('DE54500105171488962235')).toBe(false);
    });

    test('Detects IBAN which starts with lowercase letters', () => {
      // This IBAN would be valid if it started with 'NL'
      expect(SEPA.validateIBAN('nl30ABNA8727958558')).toBe(false);
    });

    test('santander is not a valid IBAN (issue #18)', () => {
      expect(SEPA.validateIBAN('santander')).toBe(false);
    });

    test('Detects IBANs which do not start with two letters and two digits', () => {
      expect(SEPA.validateIBAN('0E11santander')).toBe(false);
      expect(SEPA.validateIBAN('D911santander')).toBe(false);
      expect(SEPA.validateIBAN('DEA1santander')).toBe(false);
      expect(SEPA.validateIBAN('DE1Zsantander')).toBe(false);
    });
  });
