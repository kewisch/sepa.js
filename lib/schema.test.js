var fs = require('fs');
var SEPA = require('./sepa.js');
var validateSchema = require('xsd-validator').default;

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
