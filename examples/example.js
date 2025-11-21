/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014-2015 */

var SEPA = require('sepa');

var doc = new SEPA.Document();
doc.grpHdr.id = 'XMPL.20140201.TR0';
doc.grpHdr.created = new Date();
doc.grpHdr.initiatorName = 'Example LLC';

var info = doc.createPaymentInfo();
info.collectionDate = new Date();
info.creditorIBAN = 'DE87123456781234567890';
info.creditorBIC = 'XMPLDEM0XXX';
info.creditorName = 'Example LLC';
info.creditorId = 'DE98ZZZ09999999999'; // New creditor scheme ID
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

// Transaction with mandate amendment (e.g., migrated from old creditor ID)
var tx2 = info.createTransaction();
tx2.debtorName = 'Another Customer';
tx2.debtorIBAN = 'DE02500105170137075030';
tx2.debtorBIC = 'CUSTDEM0XXX';
tx2.mandateId = 'XMPL.CUST999.2014';
tx2.mandateSignatureDate = new Date('2014-01-15');
tx2.amount = 75.50;
tx2.remittanceInfo = 'INVOICE 87';
tx2.end2endId = 'XMPL.CUST999.INVOICE.87';
// Set amendment information for ICS migration
tx2.amendment = {
  originalCreditorSchemeId: 'IT66ZZZA1B2C3D4E5F6G7H8' // Old creditor scheme ID
};
info.addTransaction(tx2);

console.log(doc.toString());
