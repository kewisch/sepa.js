var SEPA = require('./sepa.js');
var xpath = require('xpath');

// The following debtor id is provided by German Bundesbank for testing purposes.
const A_VALID_CREDITOR_ID = 'DE98ZZZ09999999999';

const A_VALID_IBAN = 'DE43500105178994141576';

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

describe('xml generation for transfer documents', () => {
  const PAIN_FOR_TRANSFERS = 'pain.001.003.03';

  function validTransferDocument({debtorId=A_VALID_CREDITOR_ID, debtorName='default-debtor-name'}) {
    const doc = new SEPA.Document(PAIN_FOR_TRANSFERS);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.debtorIBAN = A_VALID_IBAN;
    info.debtorName = debtorName;
    info.debtorId = debtorId;
    info.requestedExecutionDate = new Date();
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.creditorName = 'creditor-name';
    tx.creditorIBAN = A_VALID_IBAN;
    tx.amount = 1.0;
    tx.mandateSignatureDate = new Date();
    info.addTransaction(tx);
    return doc;
  }

  test('debtor id is optional for transfer documents', () => {
    // GIVEN
    const doc = validTransferDocument({debtorId: null});
    // WHEN
    const dom = doc.toXML();
    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });
    const debtorId = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:Id', dom, true);
    expect(debtorId).toBeUndefined();
  });

  test('debtor name and id are included in transfer documents when they are set', () => {
    // GIVEN
    const doc = validTransferDocument({debtorId: 'FR72ZZZ123456', debtorName: 'debtor-name'});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });

    const debtorName = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:Nm', dom, true);
    expect(debtorName).not.toBeUndefined();
    expect(debtorName.textContent).toBe('debtor-name');

    const debtorId = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:Id', dom, true);
    expect(debtorId).not.toBeUndefined();
    expect(debtorId.textContent).toBe('FR72ZZZ123456');
  });

  test('dutch debtor ids are accepted', () => {
    // GIVEN
    const validDutchCreditorId = 'NL79ZZZ999999990000';
    const doc = validTransferDocument({debtorId: validDutchCreditorId});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });

    const debtorId = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:Id', dom, true);
    expect(debtorId).not.toBeUndefined();
    expect(debtorId.textContent).toBe(validDutchCreditorId);
  });
});

describe('xml generation for direct debit documents', () => {
  const PAIN_FOR_DIRECT_DEBIT = 'pain.008.001.02';
  function validDirectDebitDocument({creditorId=A_VALID_CREDITOR_ID}) {
    var doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
    doc.grpHdr.created = new Date();

    var info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = A_VALID_IBAN;
    info.creditorId = creditorId;
    doc.addPaymentInfo(info);

    var tx = info.createTransaction();
    tx.debtorIBAN = A_VALID_IBAN;
    tx.mandateSignatureDate = new Date('2014-02-01');
    tx.amount = 50.23;
    info.addTransaction(tx);

    return doc;
  }

  test('includes creditor id when set', () => {
    // GIVEN
    const doc = validDirectDebitDocument({creditorId: 'IT66ZZZA1B2C3D4E5F6G7H8'});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const creditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:Cdtr/p:Id', dom, true);
    expect(creditorId).not.toBeUndefined();
    expect(creditorId.textContent).toBe('IT66ZZZA1B2C3D4E5F6G7H8');
  });

  test('Works without setting creditor id', () => {
    // GIVEN
    const doc = validDirectDebitDocument({creditorId: null});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const creditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:Cdtr/p:Id', dom, true);
    expect(creditorId).toBeUndefined();
  });

  test('serialized document starts with proper xml declaration', () => {
    // GIVEN
    const doc = validDirectDebitDocument({});
    // WHEN
    const xmlString = doc.toString();
    // THEN
    expect(xmlString).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});