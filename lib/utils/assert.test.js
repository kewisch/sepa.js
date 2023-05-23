const {
  assert,
  assertFixed,
  assertLength,
  assertRange,
  assertIban,
  assertCid,
  assertDate,
  assertSepaIdSet1,
  assertSepaIdSet2,
} = require('./assert');

describe('#assertRange', () => {
  it('should throw when value is not in range', () => {
    expect(() => assertRange(10, 1, 5, 'value')).toThrow();
  });

  it('should not throw when value is in range', () => {
    expect(() => assertRange(2, 1, 5, 'value')).not.toThrow();
  });
});

describe('#assertLength', () => {
  it('should throw when given string length is not in the range', () => {
    expect(() => assertLength('test', 10, 12, 'value')).toThrow();
  });

  it('should not throw when given string length is not in the range', () => {
    expect(() => assertLength('test', 1, 12, 'value')).not.toThrow();
  });
});

describe('#assertIban', () => {
  it('should throw when given IBAN is not valid', () => {
    expect(() => assertIban('FR8830006000011234567890189', 'IBAN')).toThrow();
  });

  it('should not throw when given IBAN length is valid', () => {
    expect(() => assertIban('FR7630006000011234567890189')).not.toThrow();
  });
});

describe('#assertDate', () => {
  it('should throw when given argument is not Date', () => {
    expect(() => assertDate(2, 'not valid')).toThrow();
    /* eslint-disable-next-line no-undef */
    expect(() => assertDate(Symbol.for('a'), 'not valid')).toThrow();
    expect(() => assertDate('not valid', 'not valid')).toThrow();
    expect(() => assertDate(null, 'not valid')).toThrow();
  });

  it('should not throw when given argument is a date', () => {
    expect(() => assertDate(new Date())).not.toThrow();
  });
});

describe('#assertCid', () => {
  it('should throw when given CID is not valid', () => {
    expect(() => assertCid('FR88ZZZ123456', 'CID')).toThrow();
  });

  it('should not throw when given IBAN length is valid', () => {
    expect(() => assertCid('FR72ZZZ123456', 'CID')).not.toThrow();
  });
});

describe('#assertFixed', () => {
  it('should throw when value in not in the choices', () => {
    expect(() => assertFixed(1, [2, 3, 4])).toThrow();
  });

  it('should not throw when given value in in choices', () => {
    expect(() => assertFixed(1, [1, 2])).not.toThrow();
  });
});

describe('#assert', () => {
  it('should throw when condition is false', () => {
    expect(() => assert(0, 'test')).toThrow();
    expect(() => assert('', 'test')).toThrow();
    expect(() => assert(null, 'test')).toThrow();
  });

  it('should not throw when condition is true', () => {
    expect(() => assert({}, 'test')).not.toThrow();
    expect(() => assert(0 == '', 'test')).not.toThrow();
  });
});

describe('#assertSepaIdSet1', () => {
  it('should throw when Sepa ID is not valid', () => {
    expect(() =>
      assertSepaIdSet1(
        'an invalid identifier containing too much characters',
        'test'
      )
    ).toThrow();
    expect(() => assertSepaIdSet1(null, 'test')).toThrow();
  });

  it('should not throw when SEPA is valid', () => {
    expect(() => assertSepaIdSet1('XMPL.CUST487.2014', 'test')).not.toThrow();
  });
});

describe('#assertSepaIdSet2', () => {
  it('should throw when SEPA ID is not valid', () => {
    expect(() => assertSepaIdSet2('not valid', 'test')).toThrow();
  });

  it('should not throw when SEPA is valid - without space', () => {
    expect(() =>
      assertSepaIdSet2('XMPL.CUST487.INVOICE.54', 'test')
    ).not.toThrow();
  });
});
