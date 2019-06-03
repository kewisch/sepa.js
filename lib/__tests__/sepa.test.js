var DOMParser = require('xmldom').DOMParser;

const Sepa = require('../sepa');

const SEPA_TYPE = 'pain.001.001.03'; // Customer Credit Transfer Initiation V3

describe('SEPA lib', () => {

  it('should build a valid simple sepa XML', async () => {
    const doc = new Sepa.Document(SEPA_TYPE);

    doc.grpHdr.id = 'ID_1';
    doc.grpHdr.created = new Date();
    doc.grpHdr.initiatorName = 'SPENDESK';
    const xmlString = doc.toString();
    expect(xmlString).toMatch(/<\?xml version="1.0" encoding="UTF-8"\?>/);
    // Correctly build the initiatorName
    expect(xmlString).toMatch(/SPENDESK/);
  });

  it('should have payment info in order with InstrPrty first', async () => {
    const doc = new Sepa.Document(SEPA_TYPE);

    doc.grpHdr.id = 'ID_1';
    doc.grpHdr.created = new Date();
    doc.grpHdr.initiatorName = 'SPENDESK';

    const paymentInfo = doc.createPaymentInfo();
    paymentInfo.requestedExecutionDate = new Date();
    // If set to true, banks will group all payements with the same supplier and date
    // We do not want that
    paymentInfo.batchBooking = false;
  
    paymentInfo.debtorIBAN = 'FR6130002056460000061183D58';
    paymentInfo.debtorBIC = 'CRLYFRPPCRL';
    paymentInfo.debtorName = 'AMAZON';
    paymentInfo.debtorId = 'DE98ZZZ09999999999';

    const tx = paymentInfo.createTransaction();
    tx.mandateSignatureDate = new Date('2014-02-01');
  
    tx.creditorName = 'AMAZON';
    tx.creditorIBAN = 'FR6130002056460000061183D58';
    tx.creditorBIC = 'CRLYFRPPCRL';
    tx.amount = 30;
    tx.currency = 'EUR';
    tx.end2endId = '123';
    paymentInfo.addTransaction(tx);

    doc.addPaymentInfo(paymentInfo);

    const xmlString = doc.toString();
    var output = new DOMParser().parseFromString(xmlString);

    expect(output.getElementsByTagName('PmtTpInf')[0].toString()).toBe('<PmtTpInf><InstrPrty>NORM</InstrPrty><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>');
  });
});
