/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014 */

var SEPA = require("sepa");

var doc = new SEPA.Document();
doc.grpHdr.id = "XMPL.20140201.TR0";
doc.grpHdr.created = new Date();
doc.grpHdr.initiatorName = "Example LLC";

var info = new SEPA.PaymentInfo();
info.collectionDate = new Date();
info.creditorIBAN = "DE87123456781234567890";
info.creditorBIC = "XMPLDEM0XXX";
info.creditorName = "Example LLC";
info.creditorId = "DE98ZZZ09999999999";
doc.addPaymentInfo(info);

var tx = new SEPA.Transaction();
tx.debitorName = "Example Customer";
tx.debitorIBAN = "DE40987654329876543210";
tx.debitorBIC = "CUSTDEM0XXX";
tx.mandateId = "XMPL.CUST487.2014"
tx.mandateSignatureDate = new Date("2014-02-01");
tx.amount = 50.23;
tx.remittanceInfo = "INVOICE 54";
tx.end2endId = "XMPL.CUST487.INVOICE.54";
info.addTransaction(tx);

console.log(doc.toString());
