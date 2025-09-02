var SEPA = require('./sepa.js');
var xpath = require('xpath');

// The following debtor id is provided by German Bundesbank for testing purposes.
const A_VALID_CREDITOR_ID = 'DE98ZZZ09999999999';
const ANOTHER_VALID_CREDITOR_ID = 'IT66ZZZA1B2C3D4E5F6G7H8';

const A_VALID_IBAN = 'DE43500105178994141576';

describe('IBAN tests',
  () => {
    function buildSepaPaymentInfo(creditorIban, creditorBic){
      var doc = new SEPA.Document('pain.008.001.08');
      doc.grpHdr.id = 'XMPL.20140201.TR0';
      doc.grpHdr.created = new Date();
      doc.grpHdr.initiatorName = 'Example LLC';

      var info = doc.createPaymentInfo();
      info.collectionDate = new Date();
      info.creditorIBAN = creditorIban;
      info.creditorBIC = creditorBic;
      info.creditorName = 'Example LLC';
      info.creditorId = 'DE98ZZZ09999999999';
      info.batchBooking = true; //optional

      return info;
    }

    function buildSepaTransaction(paymentInfo, debtorIban, debtorBic){
      var tx = paymentInfo.createTransaction();
      tx.debtorName = 'Example Customer';
      tx.debtorIBAN = debtorIban;
      tx.debtorBIC = debtorBic;
      tx.mandateId = 'XMPL.CUST487.2014';
      tx.mandateSignatureDate = new Date('2014-02-01');
      tx.amount = 50.23;
      tx.currency = 'EUR'; //optional
      tx.remittanceInfo = 'INVOICE 54';
      tx.end2endId = 'XMPL.CUST487.INVOICE.54';

      return tx;
    }

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

    test('Detects valid BIC/IBAN pairs in SepaTransaction and SepaPaymentInfo', () => {
      // some random IBANs from randomiban.com with valid BIC
      const debtorCreditorBicIbans = [
        {
          debtor: {
            bic: 'MLIRFIH1',
            iban: 'FI4839324663894727'},
          creditor: {
            bic: 'MLIRFIH1',
            iban: 'FI4839324663894727'}
        }, {
          debtor: {
            bic: 'AGRIMQMX',
            iban: 'FR3930003000306936293381A23'},
          creditor: {
            bic: 'AGRIMQMX',
            iban: 'FR3930003000306936293381A23'}
        }
      ];

      debtorCreditorBicIbans.forEach(item => {
        var info = buildSepaPaymentInfo(item.creditor.iban, item.creditor.bic);
        expect(() => info.validate()).not.toThrow();

        var tx = buildSepaTransaction(info, item.debtor.iban, item.debtor.bic);
        expect(() => tx.validate()).not.toThrow();
      });
    });

    test('Detects invalid BIC/IBAN pairs in SepaTransaction and SepaPaymentInfo', () => {
      // some random IBANs from randomiban.com with invalid BIC
      const debtorCreditorBicIbans = [
        {
          debtor: {
            bic: 'MLIRFAH1',
            iban: 'FI4839324663894727'},
          creditor: {
            bic: 'MLIRFAH1',
            iban: 'FI4839324663894727'}
        }, {
          debtor: {
            bic: 'AGRIMAMX',
            iban: 'FR3930003000306936293381A23'},
          creditor: {
            bic: 'AGRIMAMX',
            iban: 'FR3930003000306936293381A23'}
        }
      ];

      debtorCreditorBicIbans.forEach(item => {
        var info = buildSepaPaymentInfo(item.creditor.iban, item.creditor.bic);
        expect(() => info.validate()).toThrow();

        var tx = buildSepaTransaction(info, item.debtor.iban, item.debtor.bic);
        expect(() => tx.validate()).toThrow();
      });
    });
  });

describe('xml generation for transfer documents', () => {
  const PAIN_FOR_TRANSFERS = 'pain.001.001.09';

  function validTransferDocument({
    debtorId=A_VALID_CREDITOR_ID,
    debtorName='default-debtor-name',
    debtorCity=null,
    debtorCountry=null,
    debtorStreet=null,
    creditorCity=null,
    creditorCountry=null,
    creditorStreet=null}) {
    const doc = new SEPA.Document(PAIN_FOR_TRANSFERS);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.debtorIBAN = A_VALID_IBAN;
    info.debtorName = debtorName;
    info.debtorId = debtorId;
    info.requestedExecutionDate = new Date();

    info.debtorCountry = debtorCountry;
    info.debtorCity = debtorCity;
    info.debtorStreet = debtorStreet;

    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.creditorName = 'creditor-name';
    tx.creditorIBAN = A_VALID_IBAN;
    tx.amount = 1.0;
    tx.mandateSignatureDate = new Date();

    tx.creditorCountry = creditorCountry;
    tx.creditorCity = creditorCity;
    tx.creditorStreet = creditorStreet;

    info.addTransaction(tx);
    return doc;
  }

  /** Adds a transaction to the first SepaPaymentInfo of the given SepaDocument */
  function addTransaction(doc, endToEndId) {
    const transaction = doc._paymentInfo[0].createTransaction();
    transaction.creditorName = 'creditor-name';
    transaction.creditorIBAN = A_VALID_IBAN;
    transaction.amount = 1.0;
    transaction.mandateSignatureDate = new Date();
    transaction.end2endId = endToEndId;
    doc._paymentInfo[0].addTransaction(transaction);
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

  test('debtor name is included in transfer documents when it is set', () => {
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
  });

  test('detects invalid characters for end2endId', () => {
    // GIVEN
    const doc = validTransferDocument({});
    addTransaction(doc, 'Ö');

    // WHEN THEN
    expect(() => doc.toXML()).toThrow(Error);
  });

  test('accepts valid end2endId', () => {
    // GIVEN
    const doc = validTransferDocument({});
    addTransaction(doc, 'ascii only end-2-end-id');

    // WHEN
    const xml = doc.toXML();

    // THEN
    expect(xml).not.toBeUndefined();
  });

  test('accepts all valid punctuation signs for end2endId', () => {
    // GIVEN
    const doc = validTransferDocument({});
    addTransaction(doc, '-');
    addTransaction(doc, '?');
    addTransaction(doc, ':');
    addTransaction(doc, '(');
    addTransaction(doc, ')');
    addTransaction(doc, '.');
    addTransaction(doc, ',');
    addTransaction(doc, '\'');
    addTransaction(doc, '+');

    // WHEN
    const xml = doc.toXML();

    // THEN
    expect(xml).not.toBeUndefined();
  });

  test('Disabling charset validation works', () => {
    try {
      // GIVEN
      const doc = validTransferDocument({});
      const greekText = 'Κείμενο με ελληνικά γράμματα';
      addTransaction(doc, greekText);
      SEPA.enableValidations(true, false);

      // WHEN
      const xml  = doc.toXML();

      // THEN
      expect(xml).not.toBeUndefined();
    } finally {
      SEPA.enableValidations(true, true);
    }
  });

  test('Rejects identifiers which are too long', () => {
    // GIVEN
    const doc = validTransferDocument({});
    const longIdentifier = 'one-more-than-thirty-five-characters';
    addTransaction(doc, {endToEndId: longIdentifier});

    // WHEN THEN
    expect(() => doc.toXML()).toThrow(Error);
  });

  test('Rejects ids which start with a /', () => {
    // GIVEN
    const doc = validTransferDocument({});
    const invalidIdentifier = '/id-starts-with-slash';
    addTransaction(doc, {endToEndId: invalidIdentifier});

    // WHEN THEN
    expect(()=>doc.toXML()).toThrow(Error);
  });

  test('Rejects ids which contain "//"', () => {
    // GIVEN
    const doc = validTransferDocument({});
    const invalidIdentifier = 'an/id/with//double/slash';
    addTransaction(doc, {endToEndId: invalidIdentifier});

    // WHEN THEN
    expect(()=>doc.toXML()).toThrow(Error);
  });

  test('ctry and address field not null', () => {
    // GIVEN
    const doc = validTransferDocument({
      debtorCountry: 'FR',
      debtorStreet: 'Rue du debtor',
      debtorCity: 'DebtorCity',
      creditorCountry: 'FR',
      creditorStreet: 'Rue du creditor',
      creditorCity: 'CreditorCity'});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });

    const debtorCtry = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:PstlAdr/p:Ctry', dom, true);
    const debtorStreet = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:PstlAdr/p:AdrLine[1]', dom, true);
    const debtorCity = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:PstlAdr/p:AdrLine[2]', dom, true);
    expect(debtorCtry.textContent).toBe('FR');
    expect(debtorStreet.textContent).toBe('Rue du debtor');
    expect(debtorCity.textContent).toBe('DebtorCity');

    const creditorCtry = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[1]/p:Cdtr/p:PstlAdr/p:Ctry', dom, true);
    const creditorStreet = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[1]/p:Cdtr/p:PstlAdr/p:AdrLine[1]', dom, true);
    const creditorCity = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[1]/p:Cdtr/p:PstlAdr/p:AdrLine[2]', dom, true);

    expect(creditorCtry.textContent).toBe('FR');
    expect(creditorStreet.textContent).toBe('Rue du creditor');
    expect(creditorCity.textContent).toBe('CreditorCity');
  });
});

describe('xml generation for direct debit documents', () => {
  const PAIN_FOR_DIRECT_DEBIT = 'pain.008.001.08';
  function validDirectDebitDocument({creditorId=A_VALID_CREDITOR_ID, originalCreditorId=null}) {
    var doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
    doc.grpHdr.created = new Date();

    var info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = A_VALID_IBAN;
    info.creditorId = creditorId;
    info.originalCreditorId = originalCreditorId;
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

    const creditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:CdtrSchmeId/p:Id/p:PrvtId/p:Othr/p:Id', dom, true);
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

  test('includes original creditor id when set', () => {
    // GIVEN
    const doc = validDirectDebitDocument({originalCreditorId: ANOTHER_VALID_CREDITOR_ID});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const originalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:OrgnlCdtrSchmeId/p:Id/p:PrvtId/p:Othr/p:Id', dom, true);
    expect(originalCreditorId).not.toBeUndefined();
    expect(originalCreditorId.textContent).toBe(ANOTHER_VALID_CREDITOR_ID);
  });

  test('works without setting original creditor id', () => {
    // GIVEN
    const doc = validDirectDebitDocument({originalCreditorId: null});

    // WHEN
    const dom = doc.toXML();

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const originalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:OrgnlCdtrSchmeId', dom, true);
    expect(originalCreditorId).toBeUndefined();
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
