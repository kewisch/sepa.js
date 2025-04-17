const SEPA = require('./sepa');

class SepaPaymentInfoBuilder {
  constructor() {
    this.doc = new SEPA.Document('pain.008.001.08');
    this.doc.grpHdr.id = 'XMPL.20140201.TR0';
    this.doc.grpHdr.created = new Date();
    this.doc.grpHdr.initiatorName = 'Example LLC';

    this.info = this.doc.createPaymentInfo();
    this.info.collectionDate = new Date();
    this.info.creditorIBAN = 'DE87123456781234567890';
    this.info.creditorBIC = 'XMPLDEM0XXX';
    this.info.creditorName = 'Example LLC';
    this.info.creditorId = 'DE98ZZZ09999999999';
    this.info.batchBooking = true; //optional
  }

  withIban(iban) {
    this.info.creditorIBAN = iban;
    return this;
  }

  withBic(bic) {
    this.info.creditorBIC = bic;
    return this;
  }

  build() {
    return this.info;
  }
}

class SepaTransactionBuilder {
  constructor(info) {
    this.tx = info.createTransaction();
    this.tx.debtorName = 'Example Customer';
    this.tx.debtorIBAN = 'DE40987654329876543210';
    this.tx.debtorBIC = 'CUSTDEM0XXX';
    this.tx.mandateId = 'XMPL.CUST487.2014';
    this.tx.mandateSignatureDate = new Date('2014-02-01');
    this.tx.amount = 50.23;
    this.tx.currency = 'EUR'; //optional
    this.tx.remittanceInfo = 'INVOICE 54';
    this.tx.end2endId = 'XMPL.CUST487.INVOICE.54';
  }

  withIban(iban) {
    this.tx.debtorIBAN = iban;
    return this;
  }

  withBic(bic) {
    this.tx.debtorBIC = bic;
    return this;
  }

  build() {
    return this.tx;
  }
}

module.exports = {
  SepaPaymentInfoBuilder: SepaPaymentInfoBuilder,
  SepaTransactionBuilder: SepaTransactionBuilder
};