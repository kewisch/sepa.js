const {
  checksumCreditorID,
  checksumIBAN,
  getPainXMLVersion,
  replaceChars,
  modulo97,
  validateCreditorID,
  validateIBAN,
} = require('./utils');

describe('#validateIBAN', () => {
  it('should return true for a valid FR Iban', () => {
    const IBAN = 'FR7630006000011234567890189';
    expect(validateIBAN(IBAN)).toBeTruthy();
  });

  it('should return true for a valid IT Iban', () => {
    const IBAN = 'IT60X0542811101000000123456';
    expect(validateIBAN(IBAN)).toBeTruthy();
  });

  it('should return true for a valid DE Iban', () => {
    const IBAN = 'DE75512108001245126199';
    expect(validateIBAN(IBAN)).toBeTruthy();
  });

  it('should return false when the given IBAN is invalid', () => {
    const IBAN = 'FR7630006011011234567890189';

    expect(validateIBAN(IBAN)).toBeFalsy();
  });
});

describe('#checksumIBAN', () => {
  it.each`
    Iban                             | correctedIban
    ${'FR8830006000011234567890189'} | ${'FR7630006000011234567890189'}
    ${'IT88X0542811101000000123456'} | ${'IT60X0542811101000000123456'}
    ${'DE88512108001245126199'}      | ${'DE75512108001245126199'}
  `('should return a corrected IBAN', ({ Iban, correctedIban }) => {
    expect(checksumIBAN(Iban)).toEqual(correctedIban);
  });
});

describe('#replaceChars', () => {
  it.each`
    letters | numbers
    ${'FR'} | ${'1527'}
    ${'It'} | ${'1829'}
    ${'de'} | ${'1314'}
    ${'Es'} | ${'1428'}
  `(
    'should replace $letters with numbers using the SEPA scheme',
    ({ letters, numbers }) => {
      expect(replaceChars(letters)).toEqual(numbers);
    }
  );

  it('should replace only the letters', () => {
    expect(replaceChars('FR7630006000011234567890189')).toEqual(
      '15277630006000011234567890189'
    );
  });

  it('should throw if value is not a string', () => {
    expect(() => replaceChars(null)).toThrow();
  });
});

describe('#modulo97', () => {
  it.each`
    value                     | expected
    ${'4815163342'}           | ${19}
    ${'28041992'}             | ${68}
    ${'88512108001245126199'} | ${49}
    ${'2'}                    | ${2}
  `('should compute modulo 97 of $value', ({ value, expected }) => {
    expect(modulo97(value)).toBe(expected);
  });
});

describe('#validateCreditorID', () => {
  it('should return true for a valid FR creditor ID', () => {
    const creditorId = 'FR72ZZZ123456';
    expect(validateCreditorID(creditorId)).toBeTruthy();
  });

  it('should return true for a valid FI creditor IDs', () => {
    const creditorId = 'FI22ZZZ12345678';
    expect(validateCreditorID(creditorId)).toBeTruthy();
  });
});

describe('#checksumCreditorID', () => {
  it.each`
    creditorId           | correctedCreditorId
    ${'FR88ZZZ123456'}   | ${'FR72ZZZ123456'}
    ${'FI88ZZZ12345678'} | ${'FI22ZZZ12345678'}
  `(
    'should return a corrected creditorId',
    ({ creditorId, correctedCreditorId }) => {
      expect(checksumCreditorID(creditorId)).toEqual(correctedCreditorId);
    }
  );
});

describe('#getPainXMLVersion', () => {
  it('should increment the last 2 numbers when given string begins with pain.008', () => {
    expect(getPainXMLVersion('pain.008.001.004')).toEqual(5);
    expect(getPainXMLVersion('pain.008.001.009')).toEqual(10);
  });

  it('should return the last 2 numbers', () => {
    expect(getPainXMLVersion('pain.001.041')).toEqual(41);
  });
});
