import * as fs from 'fs';
import SEPA from './module.js';
import * as xsdValidator from 'xsd-validator';

const validateSchema = xsdValidator.default.default;

expect.extend({
  toMatchSchema(xml, format) {
    const schema = fs.readFileSync('schema/' + format + '.xsd');

    const res = validateSchema(xml, schema);
    
    if (res === true) {
      return {
        message: () =>
          'expected to match schema for ' + format,
        pass: true,
      };
    } else {
      return {
        message: () =>
          'expected to match schema for ' + format + ': \n' + res.join('\n'),
        pass: false,
      };
    }
  },
});

describe('transfer schema validation tests',
  () => {
    test.each([
      'pain.001.001.02',
      'pain.001.001.03',
      'pain.001.001.08',
      'pain.001.001.09',
    ])('%p schema matches', (format) => {
      var doc = new SEPA.Document(format);
      doc.grpHdr.id = 'XMPL.20140201.TR0';
      doc.grpHdr.created = new Date();
      doc.grpHdr.initiatorName = 'Example LLC';

      var info = doc.createPaymentInfo();
      info.requestedExecutionDate = new Date();
      info.debtorIBAN = 'DE87123456781234567890';
      info.debtorBIC = 'CUSTDEM0XXX';
      info.debtorName = 'Example LLC';
      doc.addPaymentInfo(info);

      var tx = info.createTransaction();
      tx.creditorName = 'Example Customer';
      tx.creditorIBAN = 'DE40987654329876543210';
      tx.creditorBIC = 'CUSTDEM0XXX';
      tx.amount = 50.23;
      tx.remittanceInfo = 'INVOICE 54';
      tx.end2endId = 'XMPL.CUST487.INVOICE.54';
      info.addTransaction(tx);

      const validation = validateSchema(doc.toString(), fs.readFileSync('schema/' + format + '.xsd'));
      expect(validation).toBe(true);
    });
  });

describe('direct debit validation tests',
  () => {
    test.each([
      'pain.008.001.02',
      'pain.008.001.08',
    ])('%p schema matches', (format) => {
      var doc = new SEPA.Document(format);
      doc.grpHdr.id = 'XMPL.20140201.TR0';
      doc.grpHdr.created = new Date();
      doc.grpHdr.initiatorName = 'Example LLC';

      var info = doc.createPaymentInfo();
      info.collectionDate = new Date();
      info.creditorIBAN = 'DE87123456781234567890';
      info.creditorBIC = 'XMPLDEM0XXX';
      info.creditorName = 'Example LLC';
      info.creditorId = 'DE98ZZZ09999999999';
      info.batchBooking = true; //optional
      doc.addPaymentInfo(info);

      var tx = info.createTransaction();
      tx.debtorName = 'Example Customer';
      tx.debtorIBAN = 'DE40987654329876543210';
      tx.debtorBIC = 'CUSTDEM0XXX';
      tx.mandateId = 'XMPL.CUST487.2014';
      tx.mandateSignatureDate = new Date('2014-02-01');
      tx.amount = 50.23;
      tx.currency = 'EUR'; //optional
      tx.remittanceInfo = 'INVOICE 54';
      tx.end2endId = 'XMPL.CUST487.INVOICE.54';
      info.addTransaction(tx);

      const validation = validateSchema(doc.toString(), fs.readFileSync('schema/' + format + '.xsd'));
      expect(validation).toBe(true);
    });
  });

describe('direct debit with amendments validation tests',
  () => {
    test.each([
      'pain.008.001.02',
      'pain.008.001.08',
    ])('%p schema matches with mandate amendments', (format) => {
      var doc = new SEPA.Document(format);
      doc.grpHdr.id = 'XMPL.20140201.TR0';
      doc.grpHdr.created = new Date();
      doc.grpHdr.initiatorName = 'Example LLC';

      var info = doc.createPaymentInfo();
      info.collectionDate = new Date();
      info.creditorIBAN = 'DE87123456781234567890';
      info.creditorBIC = 'XMPLDEM0XXX';
      info.creditorName = 'Example LLC';
      info.creditorId = 'DE98ZZZ09999999999'; // New creditor ID
      info.batchBooking = true;
      doc.addPaymentInfo(info);

      // Regular transaction without amendment
      var tx1 = info.createTransaction();
      tx1.debtorName = 'Example Customer';
      tx1.debtorIBAN = 'DE40987654329876543210';
      tx1.debtorBIC = 'CUSTDEM0XXX';
      tx1.mandateId = 'XMPL.CUST487.2014';
      tx1.mandateSignatureDate = new Date('2014-02-01');
      tx1.amount = 50.23;
      tx1.remittanceInfo = 'INVOICE 54';
      tx1.end2endId = 'XMPL.CUST487.INVOICE.54';
      info.addTransaction(tx1);

      // Transaction with mandate amendment (ICS migration)
      var tx2 = info.createTransaction();
      tx2.debtorName = 'Another Customer';
      tx2.debtorIBAN = 'DE40987654329876543210';
      tx2.debtorBIC = 'CUSTDEM0XXX';
      tx2.mandateId = 'XMPL.CUST999.2014';
      tx2.mandateSignatureDate = new Date('2014-01-15');
      tx2.amount = 75.50;
      tx2.remittanceInfo = 'INVOICE 87';
      tx2.end2endId = 'XMPL.CUST999.INVOICE.87';
      // Set amendment for creditor scheme ID migration
      tx2.amendment = {
        originalCreditorSchemeId: 'IT66ZZZA1B2C3D4E5F6G7H8' // Old creditor ID
      };
      info.addTransaction(tx2);

      const validation = validateSchema(doc.toString(), fs.readFileSync('schema/' + format + '.xsd'));
      expect(validation).toBe(true);
    });

    test('pain.008.001.02 generates correct amendment XML structure', () => {
      var doc = new SEPA.Document('pain.008.001.02');
      doc.grpHdr.id = 'AMEND.TEST';
      doc.grpHdr.created = new Date();
      doc.grpHdr.initiatorName = 'Test Corp';

      var info = doc.createPaymentInfo();
      info.collectionDate = new Date();
      info.creditorIBAN = 'DE87123456781234567890';
      info.creditorBIC = 'XMPLDEM0XXX';
      info.creditorName = 'Test Corp';
      info.creditorId = 'DE98ZZZ09999999999'; // New ICS
      doc.addPaymentInfo(info);

      var tx = info.createTransaction();
      tx.debtorName = 'Test Debtor';
      tx.debtorIBAN = 'DE40987654329876543210';
      tx.debtorBIC = 'CUSTDEM0XXX';
      tx.mandateId = 'MANDATE-123';
      tx.mandateSignatureDate = new Date('2023-05-10');
      tx.amount = 42.00;
      tx.remittanceInfo = 'Test payment';
      tx.end2endId = 'E2E-123';
      tx.amendment = {
        originalCreditorSchemeId: 'IT66ZZZA1B2C3D4E5F6G7H8' // Old ICS
      };
      info.addTransaction(tx);

      const xml = doc.toString();
      
      // Verify amendment structure
      expect(xml).toContain('<AmdmntInd>true</AmdmntInd>');
      expect(xml).toContain('<AmdmntInfDtls>');
      expect(xml).toContain('<OrgnlCdtrSchmeId>');
      expect(xml).toContain('<Id>IT66ZZZA1B2C3D4E5F6G7H8</Id>'); // Old ICS in amendment
      expect(xml).toContain('<Id>DE98ZZZ09999999999</Id>'); // New ICS in creditor scheme
      
      // Verify OrgnlCdtrSchmeId is NOT at PmtInf level (would be invalid)
      const pmtInfMatch = xml.match(/<PmtInf>[\s\S]*?<\/PmtInf>/);
      expect(pmtInfMatch).toBeTruthy();
      const pmtInfXml = pmtInfMatch[0];
      const drctDbtTxInfStart = pmtInfXml.indexOf('<DrctDbtTxInf>');
      const pmtInfoOnly = pmtInfXml.substring(0, drctDbtTxInfStart);
      expect(pmtInfoOnly).not.toContain('<OrgnlCdtrSchmeId>');
      
      // Schema validation
      const validation = validateSchema(xml, fs.readFileSync('schema/pain.008.001.02.xsd'));
      expect(validation).toBe(true);
    });
  });
