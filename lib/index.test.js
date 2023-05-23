const SEPA = require('.');

describe('#SEPA', () => {
  it('should generate a full SEPA', () => {
    const doc = new SEPA.Document('pain.008.001.02');
    doc.grpHdr.id = '1️⃣XMPL.20140201.TR0';
    doc.grpHdr.created = new Date('2019-01-01T08:00');
    doc.grpHdr.initiatorName = '1️⃣Example & LLC@';

    const info = doc.createPaymentInfo();
    info.collectionDate = new Date('2019-01-01T08:00');
    info.creditorIBAN = 'DE87123456781234567890';
    info.creditorBIC = 'XMPLDEM0XXX';
    info.creditorName =
      'ASSOCIATION GROUPEMENT POUR LA DIRECTION ET LA GESTION DES CENTRES DE SOINS SHOULD BE CUT';
    info.creditorId = 'DE98ZZZ09999999999';
    info.batchBooking = true;
    doc.addPaymentInfo(info);

    const tx = info.createTransaction();
    tx.debtorName = "Jean L'Och";
    tx.debtorIBAN = 'DE40987654329876543210';
    tx.debtorBIC = 'CUSTDEM0XXX';
    tx.mandateId = 'XMPL.CUST487.2014';
    tx.mandateSignatureDate = new Date('2014-02-01');
    tx.amount = 50.23;
    tx.currency = 'EUR';
    tx.remittanceInfo = 'INVOICE 54';
    tx.end2endId = '1️⃣X&M@.CUST487.INVOICE.54';
    info.addTransaction(tx);

    expect(doc.toString()).toMatchSnapshot();

    expect(tx.end2endId).toBe('1XM.CUST487.INVOICE.54');
    expect(tx.debtorName).toBe('Jean LOch');

    expect(doc.grpHdr.initiatorName).toBe('1Example  LLC');
    expect(doc.grpHdr.id).toBe('1XMPL.20140201.TR0');

    expect(info.creditorName).toBe(
      'ASSOCIATION GROUPEMENT POUR LA DIRECTION ET LA GESTION DES CENTRES DE '
    );
  });
});
