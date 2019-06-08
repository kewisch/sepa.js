var DOMParser = require('xmldom').DOMParser;

const Sepa = require('../sepa');

const SEPA_TYPE = 'pain.001.001.03'; // Customer Credit Transfer Initiation V3

describe('All specifics to Italy SEPA', () => {

  it('should build a valid simple sepa XML with cuc number for italy', async () => {
    const doc = new Sepa.Document(SEPA_TYPE);

    doc.grpHdr.id = 'ID_1';
    doc.grpHdr.created = new Date();
    doc.grpHdr.initiatorName = 'SPENDESK';
    doc.grpHdr.cucNumber = '1557856M';
    const xmlString = doc.toString();
    expect(xmlString).toMatch(/<\?xml version="1.0" encoding="UTF-8"\?>/);
    // Correctly build the initiatorName
    expect(xmlString).toMatch(/<Id><OrgId><Othr><Id>1557856M<\/Id><Issr>CBI<\/Issr><\/Othr><\/OrgId><\/Id>/);
  });

  it('should build add Codice ABI for italy as debitorMemberId', async () => {
    const doc = new Sepa.Document(SEPA_TYPE);

    doc.grpHdr.id = 'ID_1';
    doc.grpHdr.created = new Date();
    doc.grpHdr.initiatorName = 'SPENDESK';
    doc.grpHdr.cucNumber = '1557856M';

    const paymentInfo = doc.createPaymentInfo();
    paymentInfo.requestedExecutionDate = new Date();
    // If set to true, banks will group all payements with the same supplier and date
    // We do not want that
    paymentInfo.batchBooking = false;
  
    paymentInfo.debtorIBAN = 'FR6130002056460000061183D58';
    paymentInfo.debtorBIC = 'CRLYFRPPCRL';
    paymentInfo.debtorName = 'AMAZON';
    paymentInfo.debtorId = 'DE98ZZZ09999999999';
    paymentInfo.debtorMemberId = '03268';
    doc.addPaymentInfo(paymentInfo);

    const xmlString = doc.toString();
    var output = new DOMParser().parseFromString(xmlString);

    expect(output.getElementsByTagName('DbtrAgt')[0].toString()).toBe('<DbtrAgt><FinInstnId><BIC>CRLYFRPPCRL</BIC><ClrSysMmbId><MmbId>03268</MmbId></ClrSysMmbId></FinInstnId></DbtrAgt>');
  });
});

describe('Italy country helper', () => {
  it('should extract the ABI code correctly from the IBAN', async () => {
    const abiCode = Sepa.CountryHelpers.italy.extractABICodeFromIBAN('IT89N0326801607052353778761');
    expect(abiCode).toEqual('03268');
  });
});
