var SEPA = require('./sepa.js');
var xpath = require('xpath');
var xmldom = require('@xmldom/xmldom');

// The following debtor id is provided by German Bundesbank for testing purposes.
const A_VALID_CREDITOR_ID = 'DE98ZZZ09999999999';
const ANOTHER_VALID_CREDITOR_ID = 'IT66ZZZA1B2C3D4E5F6G7H8';

const A_VALID_IBAN = 'DE43500105178994141576';
const A_VALID_DATE = new Date('2025-10-17T00:00:00Z');

const PAIN_FOR_DIRECT_DEBIT = 'pain.008.001.02';
const PAIN_FOR_TRANSFERS = 'pain.001.001.09';


function validDirectDebitDocument({
  created = A_VALID_DATE,
  creditorId = A_VALID_CREDITOR_ID,
  collectionDate = A_VALID_DATE,
  mandateSignatureDate = A_VALID_DATE,
  originalCreditorId=null,
}) {
  const doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
  doc.grpHdr.created = created;

  const info = doc.createPaymentInfo();
  info.collectionDate = collectionDate;
  info.creditorIBAN = A_VALID_IBAN;
  info.creditorId = creditorId;
  info.originalCreditorId = originalCreditorId;
  doc.addPaymentInfo(info);

  const tx = info.createTransaction();
  tx.debtorIBAN = A_VALID_IBAN;
  tx.mandateSignatureDate = mandateSignatureDate;
  tx.amount = 50.23;
  info.addTransaction(tx);

  return doc;
}

function validTransferDocument({
  created = A_VALID_DATE,
  debtorId = A_VALID_CREDITOR_ID,
  debtorName = 'default-debtor-name',
  debtorCity=null,
  debtorCountry=null,
  debtorStreet=null,
  creditorCity=null,
  creditorCountry=null,
  creditorStreet=null,
  requestedExecutionDate = A_VALID_DATE,
  painFormat = PAIN_FOR_TRANSFERS,
} = {}) {
  const doc = new SEPA.Document(painFormat);
  doc.grpHdr.created = created;

  const info = doc.createPaymentInfo();
  info.collectionDate = new Date();
  info.debtorIBAN = A_VALID_IBAN;
  info.debtorName = debtorName;
  info.debtorId = debtorId;
  info.requestedExecutionDate = requestedExecutionDate;

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

  /**
   * Adds a transaction to the first SepaPaymentInfo of the given SepaDocument
   *
   * @param endToEndId {string}
   * @param purposeCode {string|null}
   */
  function addTransaction(doc, {endToEndId = 'end-to-end-id', purposeCode = null} = {}) {
    const transaction = doc._paymentInfo[0].createTransaction();
    transaction.creditorName = 'creditor-name';
    transaction.creditorIBAN = A_VALID_IBAN;
    transaction.amount = 1.0;
    transaction.mandateSignatureDate = new Date();
    transaction.end2endId = endToEndId;
    transaction.purposeCode = purposeCode;
    doc._paymentInfo[0].addTransaction(transaction);
  }

  test('rejects unknown pain formats', () => {
    expect(() => {new SEPA.Document('pain.001.001.01');}).toThrow();
  });

  test('debtor id is optional for transfer documents', () => {
    // GIVEN
    const doc = validTransferDocument({debtorId: null});
    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

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
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });

    const debtorName = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:Dbtr/p:Nm', dom, true);
    expect(debtorName).not.toBeUndefined();
    expect(debtorName.textContent).toBe('debtor-name');
  });

  test('detects invalid characters for end2endId', () => {
    // GIVEN a SEPA document with invalid characters as end-to-end id
    const doc = validTransferDocument({});
    addTransaction(doc, {endToEndId: 'Ö'});

    // WHEN we serialize the document
    // THEN the invalid character causes an error
    expect(() => doc.toString()).toThrow();
  });

  test('accepts valid end2endId', () => {
    // GIVEN
    const doc = validTransferDocument({});
    addTransaction(doc, {endToEndId: 'ascii only end-2-end-id'});

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });
    const end2endId = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[2]/p:PmtId/p:EndToEndId/text()', dom, true);
    expect(end2endId.toString()).toBe('ascii only end-2-end-id');
  });

  test('accepts all valid punctuation signs for end2endId', () => {
    // GIVEN a SEPA document containing transactions with various punctuations
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

    // WHEN we serialize the document
    // THEN no error is thrown
    expect(() => doc.toString()).not.toThrow();
  });

  test('Disabling charset validation works', () => {
    try {
      // GIVEN a document with a greek end-to-end id.
      const doc = validTransferDocument({});
      const greekText = 'Κείμενο με ελληνικά γράμματα';
      addTransaction(doc, {endToEndId: greekText});
      SEPA.enableValidations(true, false);

      // WHEN we serialize the document
      // THEN no exception is thrown
      expect(() => doc.toString()).not.toThrow();
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
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

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

  test('Adds purpose code if provided', () => {
    // GIVEN a document with a transaction that has a purpose code
    const purposeCode = 'BONU';
    const doc = validTransferDocument({});
    addTransaction(doc, {purposeCode});

    // WHEN we serialize the document
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN the purpose code is set
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });
    const purposeCodeNode = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[2]/p:Purp/p:Cd/text()', dom, true);
    expect(purposeCodeNode.textContent).toBe(purposeCode);
  });

  test('Includes number of transactions', () => {
    // GIVEN a document with 5 transactions
    const doc = validTransferDocument({});
    addTransaction(doc);
    addTransaction(doc);
    addTransaction(doc);
    addTransaction(doc);

    // WHEN we serialize the document
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN the number of transactions is set
    const select = xpath.useNamespaces({p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`});
    const purposeCodeNode = select('/p:Document/p:CstmrCdtTrfInitn/p:GrpHdr/p:NbOfTxs/text()', dom, true);
    expect(purposeCodeNode.textContent).toBe('5');
  });
});

describe('xml generation for direct debit documents', () => {
  const PAIN_FOR_DIRECT_DEBIT = 'pain.008.001.08';
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

  test('document-level namespace attributes are present', () => {
    // GIVEN a valid SEPA document
    const painFormat = 'pain.001.001.09';
    const doc = validTransferDocument({painFormat});
    // WHEN we serialize the document
    const xmlString = doc.toString();
    // THEN the document contains the top level attribute for the xml schema
    expect(xmlString).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    expect(xmlString).toContain(`xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:${painFormat} ${painFormat}.xsd"`);
    // AND the document contains the default namespace
    expect(xmlString).toContain(`xmlns="urn:iso:std:iso:20022:tech:xsd:${painFormat}"`);
  });

  test('includes creditor id when set', () => {
    // GIVEN
    const doc = validDirectDebitDocument({creditorId: 'IT66ZZZA1B2C3D4E5F6G7H8'});

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

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
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const creditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:Cdtr/p:Id', dom, true);
    expect(creditorId).toBeUndefined();
  });

  test('includes amendment information in transaction when set', () => {
    // GIVEN
    var doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
    doc.grpHdr.created = new Date();

    var info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = A_VALID_IBAN;
    info.creditorId = A_VALID_CREDITOR_ID; // New creditor ID
    doc.addPaymentInfo(info);

    var tx = info.createTransaction();
    tx.debtorIBAN = A_VALID_IBAN;
    tx.mandateSignatureDate = new Date('2014-02-01');
    tx.amount = 50.23;
    tx.amendment = {
      originalCreditorSchemeId: ANOTHER_VALID_CREDITOR_ID // Old creditor ID
    };
    info.addTransaction(tx);

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    // Check amendment indicator
    const amendmentInd = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInd', dom, true);
    expect(amendmentInd).not.toBeUndefined();
    expect(amendmentInd.textContent).toBe('true');

    // Check original creditor scheme ID in amendment details
    const originalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInfDtls/p:OrgnlCdtrSchmeId/p:Id/p:PrvtId/p:Othr/p:Id', dom, true);
    expect(originalCreditorId).not.toBeUndefined();
    expect(originalCreditorId.textContent).toBe(ANOTHER_VALID_CREDITOR_ID);

    // Verify OrgnlCdtrSchmeId is NOT at PmtInf level (that would be invalid)
    const pmtInfOriginalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:OrgnlCdtrSchmeId', dom, true);
    expect(pmtInfOriginalCreditorId).toBeUndefined();
  });

  test('works without amendment information', () => {
    // GIVEN
    const doc = validDirectDebitDocument({});

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    // Amendment indicator should be present and set to false
    const amendmentInd = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInd', dom, true);
    expect(amendmentInd).not.toBeUndefined();
    expect(amendmentInd.textContent).toBe('false');

    // No amendment details should be present
    const amendmentDetails = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInfDtls', dom, true);
    expect(amendmentDetails).toBeUndefined();
  });

  test('backward compatibility: info.originalCreditorId applies only to first transaction', () => {
    // GIVEN - Using deprecated paymentInfo.originalCreditorId (old API) with multiple transactions
    var doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
    doc.grpHdr.created = new Date();

    var info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = A_VALID_IBAN;
    info.creditorId = A_VALID_CREDITOR_ID; // New creditor ID
    info.originalCreditorId = ANOTHER_VALID_CREDITOR_ID; // Old API - at payment info level
    doc.addPaymentInfo(info);

    // First transaction - should get the amendment
    var tx1 = info.createTransaction();
    tx1.debtorIBAN = A_VALID_IBAN;
    tx1.mandateSignatureDate = new Date('2014-02-01');
    tx1.amount = 50.23;
    info.addTransaction(tx1);

    // Second transaction - should NOT get the amendment
    var tx2 = info.createTransaction();
    tx2.debtorIBAN = A_VALID_IBAN;
    tx2.mandateSignatureDate = new Date('2014-02-01');
    tx2.amount = 75.50;
    info.addTransaction(tx2);

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    // First transaction should have amendment
    const allTransactions = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf', dom);
    expect(allTransactions.length).toBe(2);

    const firstTxAmendmentInd = select('p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInd', allTransactions[0], true);
    expect(firstTxAmendmentInd.textContent).toBe('true');

    const firstTxOriginalCreditorId = select('p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInfDtls/p:OrgnlCdtrSchmeId/p:Id/p:PrvtId/p:Othr/p:Id', allTransactions[0], true);
    expect(firstTxOriginalCreditorId).not.toBeUndefined();
    expect(firstTxOriginalCreditorId.textContent).toBe(ANOTHER_VALID_CREDITOR_ID);

    // Second transaction should NOT have amendment
    const secondTxAmendmentInd = select('p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInd', allTransactions[1], true);
    expect(secondTxAmendmentInd.textContent).toBe('false');

    const secondTxAmendmentDetails = select('p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInfDtls', allTransactions[1], true);
    expect(secondTxAmendmentDetails).toBeUndefined();

    // Verify OrgnlCdtrSchmeId is NOT at PmtInf level (old incorrect location)
    const pmtInfOriginalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:OrgnlCdtrSchmeId', dom, true);
    expect(pmtInfOriginalCreditorId).toBeUndefined();
  });

  test('transaction-level amendment overrides info.originalCreditorId', () => {
    // GIVEN - Both old and new API used, transaction-level should win
    var doc = new SEPA.Document(PAIN_FOR_DIRECT_DEBIT);
    doc.grpHdr.created = new Date();

    var info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = A_VALID_IBAN;
    info.creditorId = A_VALID_CREDITOR_ID;
    info.originalCreditorId = 'FR72ZZZ123456'; // Old API value (should be ignored)
    doc.addPaymentInfo(info);

    var tx = info.createTransaction();
    tx.debtorIBAN = A_VALID_IBAN;
    tx.mandateSignatureDate = new Date('2014-02-01');
    tx.amount = 50.23;
    tx.amendment = {
      originalCreditorSchemeId: ANOTHER_VALID_CREDITOR_ID // New API value (should be used)
    };
    info.addTransaction(tx);

    // WHEN
    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    // THEN
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    // Should use transaction-level value, not payment-level
    const originalCreditorId = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:AmdmntInfDtls/p:OrgnlCdtrSchmeId/p:Id/p:PrvtId/p:Othr/p:Id', dom, true);
    expect(originalCreditorId.textContent).toBe(ANOTHER_VALID_CREDITOR_ID);
    expect(originalCreditorId.textContent).not.toBe('FR72ZZZ123456');
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

describe('DbtrAgt and CdtrAgt without BIC', () => {
  // cf. https://github.com/kewisch/sepa.js/issues/207
  test('pain.001: transaction WITHOUT creditor BIC should NOT include CdtrAgt', () => {
    const PAIN = 'pain.001.001.09';
    const doc = new SEPA.Document(PAIN);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.requestedExecutionDate = new Date();
    info.debtorIBAN = 'DE43500105178994141576';
    info.debtorName = 'Debtor';
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.creditorName = 'Creditor';
    tx.creditorIBAN = 'DE43500105178994141576';
    tx.amount = 1.23;
    // no creditorBIC set
    info.addTransaction(tx);

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN}`,
    });

    const cdtrAgt = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[1]/p:CdtrAgt', dom, true);
    expect(cdtrAgt).toBeUndefined();
  });

  test('pain.001: transaction WITH creditor BIC should include CdtrAgt/BIC', () => {
    const PAIN = 'pain.001.001.09';
    const doc = new SEPA.Document(PAIN);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.requestedExecutionDate = new Date();
    info.debtorIBAN = 'DE43500105178994141576';
    info.debtorName = 'Debtor';
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.creditorName = 'Creditor';
    tx.creditorIBAN = 'DE43500105178994141576';
    // use a realistic DE BIC so validation passes
    tx.creditorBIC = 'DEUTDEFF';
    tx.amount = 1.23;
    info.addTransaction(tx);

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN}`,
    });

    const bic = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:CdtTrfTxInf[1]/p:CdtrAgt/p:FinInstnId/p:BICFI', dom, true);
    expect(bic).not.toBeUndefined();
    expect(bic.textContent).toBe('DEUTDEFF');
  });

  test('pain.001: DbtrAgt WITHOUT debtor BIC should include Othr/Id=NOTPROVIDED', () => {
    const PAIN = 'pain.001.001.09';
    const doc = new SEPA.Document(PAIN);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.requestedExecutionDate = new Date();
    info.debtorIBAN = 'DE43500105178994141576';
    info.debtorName = 'Debtor';
    // no debtorBIC set on payment info
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.creditorName = 'Creditor';
    tx.creditorIBAN = 'DE43500105178994141576';
    tx.amount = 1.23;
    info.addTransaction(tx);

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN}`,
    });

    const id = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:DbtrAgt/p:FinInstnId/p:Othr/p:Id', dom, true);
    expect(id).not.toBeUndefined();
    expect(id.textContent).toBe('NOTPROVIDED');
  });

  test('pain.008: transaction WITHOUT debtor BIC should include DbtrAgt Othr/Id=NOTPROVIDED', () => {
    const PAIN = 'pain.008.001.08';
    const doc = new SEPA.Document(PAIN);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = 'DE43500105178994141576';
    info.creditorName = 'Creditor';
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.debtorName = 'Debtor';
    tx.debtorIBAN = 'DE43500105178994141576';
    // Direct debit transactions require mandate information
    tx.mandateId = 'MANDATE.1';
    tx.mandateSignatureDate = new Date('2020-01-01');
    tx.amount = 2.34;
    // no debtorBIC set
    info.addTransaction(tx);

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN}`,
    });

    const id = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf[1]/p:DbtrAgt/p:FinInstnId/p:Othr/p:Id', dom, true);
    expect(id).not.toBeUndefined();
    expect(id.textContent).toBe('NOTPROVIDED');
  });

  test('pain.008: transaction WITH debtor BIC should include DbtrAgt/BIC', () => {
    const PAIN = 'pain.008.001.08';
    const doc = new SEPA.Document(PAIN);
    doc.grpHdr.created = new Date();

    const info = doc.createPaymentInfo();
    info.collectionDate = new Date();
    info.creditorIBAN = 'DE43500105178994141576';
    info.creditorName = 'Creditor';
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.debtorName = 'Debtor';
    tx.debtorIBAN = 'DE43500105178994141576';
    // Direct debit transactions require mandate information
    tx.mandateId = 'MANDATE.1';
    tx.mandateSignatureDate = new Date('2020-01-01');
    // use a realistic DE BIC so validation passes
    tx.debtorBIC = 'DEUTDEFF';
    tx.amount = 2.34;
    info.addTransaction(tx);

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN}`,
    });

    const bic = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf[1]/p:DbtrAgt/p:FinInstnId/p:BICFI', dom, true);
    expect(bic).not.toBeUndefined();
    expect(bic.textContent).toBe('DEUTDEFF');
  });
});

describe('Dates are not converted to UTC', () => {
  // The tests use the local timezone. If the tests run on a machine that is configured to be UTC
  // (as for the GitHub Actions), they will not test the bug behaviour described in
  // https://github.com/kewisch/sepa.js/issues/179.
  // Realistically, most developer machines will be in CET/CEST because SEPA is a European standard.
  // Hence, we can assume that the bug behaviour will be regularly tested.

  test('dates stay the same during xml generation for direct debit documents', () => {
    // GIVEN a date in a non-utc timezone which gets mapped to a different date in UTC
    const collectionDate = new Date(2025, 6, 29);
    const mandateSignatureDate = new Date(2024, 6, 29);
    const created = new Date(2023, 6, 29, 1, 2, 3);

    // WHEN these dates are used in a direct debit document
    const doc = validDirectDebitDocument({
      created, collectionDate, mandateSignatureDate
    });

    // THEN the date stay the same
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_DIRECT_DEBIT}`,
    });

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    const generatedCreatedDate = select('/p:Document/p:CstmrDrctDbtInitn/p:GrpHdr/p:CreDtTm/text()', dom, true);
    expect(generatedCreatedDate.toString()).toBe('2023-07-29T01:02:03');

    const generatedCollectionDate = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:ReqdColltnDt/text()', dom, true);
    expect(generatedCollectionDate.toString()).toBe('2025-07-29');

    // /Document/CstmrDrctDbtInitn/PmtInf/DrctDbtTxInf/DrctDbtTx/MndtRltdInf/DtOfSgntr/text()
    const generatedMandateSignatureDate = select('/p:Document/p:CstmrDrctDbtInitn/p:PmtInf/p:DrctDbtTxInf/p:DrctDbtTx/p:MndtRltdInf/p:DtOfSgntr/text()', dom, true);
    expect(generatedMandateSignatureDate.toString()).toBe('2024-07-29');
  });

  test('dates stays the same during xml generation for transfer documents', () => {
    // GIVEN dates in a non-utc timezone which gets mapped to a different date in UTC
    const created = new Date(2023, 6, 29, 1, 2, 3);
    const requestedExecutionDate = new Date(2025, 6, 29);

    // WHEN the date is used as execution date in a transfer document
    const doc = validTransferDocument({
      created, requestedExecutionDate
    });

    // THEN the date is preserved
    const select = xpath.useNamespaces({
      p: `urn:iso:std:iso:20022:tech:xsd:${PAIN_FOR_TRANSFERS}`,
    });

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    const generatedCreatedDate = select('/p:Document/p:CstmrCdtTrfInitn/p:GrpHdr/p:CreDtTm/text()', dom, true);
    expect(generatedCreatedDate.toString()).toBe('2023-07-29T01:02:03');

    const generatedExecutionDate = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:ReqdExctnDt/p:Dt/text()', dom, true);
    expect(generatedExecutionDate.toString()).toBe('2025-07-29');
  });

  test('requested execution date stays the same in old pain versions for transfer documents', () => {
    // GIVEN dates in a non-utc timezone which gets mapped to a different date in UTC
    const requestedExecutionDate = new Date(2025, 6, 29);
    const painFormat = 'pain.001.001.03';
    // WHEN the date is used as execution date in a transfer document in a pain version < 8
    const doc = validTransferDocument({
      requestedExecutionDate, painFormat
    });
    // THEN the date is preserved
    const select = xpath.useNamespaces({
      p: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
    });

    const xmlString = doc.toString();
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');

    const generatedExecutionDate = select('/p:Document/p:CstmrCdtTrfInitn/p:PmtInf/p:ReqdExctnDt/text()', dom, true);
    expect(generatedExecutionDate.toString()).toBe('2025-07-29');
  });
});


describe('XML tests', () => {
  test('Nodes are written out as self-closing', () => {
    // GIVEN a node without children or text
    const sut = new SEPA._SepaXmlNode('node');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    // THEN the node is self-closing
    expect(xmlString).toContain('<node/>');
  });

  test('Adds text', () => {
    // GIVEN a node with text
    const sut = new SEPA._SepaXmlNode('node', 'some-text');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    // THEN the text is added to the output
    expect(dom.documentElement.textContent).toBe('some-text');
  });

  test('Adds attributes', () => {
    // GIVEN a node with an attribute
    const sut = new SEPA._SepaXmlNode('node', 'some-text');
    sut.setAttribute('key', 'value');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    // THEN the attribute is added to the node
    expect(dom.documentElement.getAttribute('key')).toBe('value');
  });

  test('Adds children', () => {
    // GIVEN a node with a child
    const parent = new SEPA._SepaXmlNode('parent');
    parent.appendChild(new SEPA._SepaXmlNode('child'));
    // WHEN we serialize the xml tree
    const xmlString = parent.toString(0, false);
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    // THEN the parent/child relationship is respected
    expect(dom.documentElement.nodeName).toBe('parent');
    expect(dom.documentElement.childNodes.length).toBe(1);
    expect(dom.documentElement.childNodes[0].nodeName).toBe('child');
  });

  test('Escapes text', () => {
    // GIVEN a node with text that need to be escaped
    const sut = new SEPA._SepaXmlNode('node', '&<');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    // THEN the text is escaped
    expect(xmlString).toContain('&amp;&lt');
    // AND the values can be parsed again
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    expect(dom.documentElement.textContent).toBe('&<');
  });

  test('Escapes attributes', () => {
    // GIVEN a node with attribute values that need to be escaped
    const sut = new SEPA._SepaXmlNode('node');
    sut.setAttribute('key1', '&"\'');
    sut.setAttribute('key2', '<>');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    // THEN the values are escaped
    expect(xmlString).toContain('&amp;&quot;&apos;');
    expect(xmlString).toContain('&lt;&gt;');
    // AND the values can be parsed again
    const dom = new xmldom.DOMParser().parseFromString(xmlString, 'text/xml');
    expect(dom.documentElement.getAttribute('key1')).toBe('&"\'');
    expect(dom.documentElement.getAttribute('key2')).toBe('<>');
  });

  test('Does not allow cdata as text value', () => {
    // GIVEN a malicious node text with cdata
    const sut = new SEPA._SepaXmlNode('node', '<![CDATA[text]]>');
    // WHEN we serialize the xml tree
    const xmlString = sut.toString(0, false);
    // THEN the generated string has the cdata section escaped
    expect(xmlString).toContain('&lt;![CDATA[text]]&gt;');
  });

  test.each([
    'Null \u0000', 'Bell \u0007', 'Non-character \uffff'
  ])('Rejects invalid xml characters', (text) => {
    expect(() => new SEPA._SepaXmlNode('node', text)).toThrow();
  });

  test('Uses attributes from constructor', () => {
    // GIVEN a node with attributes set in the constructor
    const sut = new SEPA._SepaXmlNode('node', 'text', {key1: 'value1'});
    // WHEN we set another attribute
    sut.setAttribute('key2', 'value2');
    // THEN both attributes are contained in the serialized string
    const xmlString = sut.toString(0, false);
    expect(xmlString).toContain('key1="value1"');
    expect(xmlString).toContain('key2="value2"');
  });

  test('Does not allow invalid node names', () => {
    // GIVEN a node name with invalid characters
    const badName = 'nöde';
    // WHEN we use the bad string as name for an xml node
    // THEN an exception is thrown
    expect(() => {new SEPA._SepaXmlNode(badName);}).toThrow();
  });

  test('Does not allow invalid attribute names', () => {
    // GIVEN an attribute key with invalid characters
    const badKey = ' key ';
    // WHEN we use the bad string as name for an xml attribute
    // THEN an exception is thrown
    const sut = new SEPA._SepaXmlNode('node');
    expect(() => { sut.setAttribute(badKey, 'value'); }).toThrow();
  });

  test('node with both children and text is rejected', () => {
    // GIVEN an xml node with text and a child
    const parent = new SEPA._SepaXmlNode('p');
    parent.appendChild(new SEPA._SepaXmlNode('c'));
    parent.setText('text'); // if setText returns this, fine; we just set it
    // WHEN we serialize the tree
    // THEN an exception is thrown
    expect(() => parent.toString()).toThrow();
  });

  test('pretty printing includes indentation and newlines', () => {
    const parent = new SEPA._SepaXmlNode('p');
    parent.appendChild(new SEPA._SepaXmlNode('c1'));
    parent.appendChild(new SEPA._SepaXmlNode('c2'));
    const xml = parent.toString(0, true);
    expect(xml.split('\n')).toContain('<p>');
    expect(xml.split('\n')).toContain('    <c1/>');
    expect(xml.split('\n')).toContain('    <c2/>');
    expect(xml.split('\n')).toContain('</p>');
  });

  test('constructor attribute validation rejects invalid attribute value', () => {
    expect(() => new SEPA._SepaXmlNode('n', '', {k: 'Bad\u0000'})).toThrow();
  });

  test('allows emojis in text', () => {
    // GIVEN a node with an emoji in its text
    const emoji = 'Smile ' + String.fromCodePoint(0x1F600);
    const node = new SEPA._SepaXmlNode('n', emoji);
    // WHEN the node is serialized
    expect(() => node.toString()).not.toThrow();
    const xml = node.toString();
    // THEN the text content is preserved
    const dom = new xmldom.DOMParser().parseFromString(xml, 'text/xml');
    expect(dom.documentElement.textContent).toBe(emoji);
  });
});
