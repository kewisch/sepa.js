/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014 */

function process() {
  function e(id) { return document.getElementById(id); }
  function v(id) { return e(id).value; }
  function d(id) { var x = e(id).date || new Date(e(id).value); return x.getTime() ? x : new Date() }
  function n(id) { var x = v(id); return typeof x == "number" ? x : parseFloat(x, 10) }

  var doc = new SEPA.Document();
  doc.grpHdr.id = v("grpHdr-id");
  doc.grpHdr.created = new Date();
  doc.grpHdr.initiatorName = v("grpHdr-initiatorName");

  var info = doc.createPaymentInfo();
  info.collectionDate = d("info-collectionDate");
  info.creditorName = v("info-creditorName");
  info.creditorIBAN = v("info-creditorIBAN");
  info.creditorBIC = v("info-creditorBIC");
  info.creditorId = v("info-creditorId");
  doc.addPaymentInfo(info);

  var tx = info.createTransaction();
  tx.debtorName = v("tx-debitorName");
  tx.debtorIBAN = v("tx-debitorIBAN");
  tx.debtorBIC = v("tx-debitorBIC");
  tx.mandateId = v("tx-mandateId");
  tx.mandateSignatureDate = d("tx-mandateSignatureDate");
  tx.amount = n("tx-amount");
  tx.remittanceInfo = v("tx-remittanceInfo");
  info.addTransaction(tx);

  var hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  //document.getElementById("results").textContent =  hdr + "\n" + vkbeautify.xml(doc.toString(), "  ");
  var results = document.getElementById("results")
  results.src = "data:text/xml," + doc.toString();
  results.style.display = "block";
  results.style.height = (document.body.scrollHeight - 40) + "px";
}

function validateIBAN(event) {
  if (event.target.value.substr(2, 2) == "00") {
    event.target.value = SEPA.checksumIBAN(event.target.value);
  }
  var isValid = SEPA.validateIBAN(event.target.value);
  event.target.setCustomValidity(isValid ? "" : "IBAN is not valid");
}

function validateCID(event) {
  var isValid = SEPA.validateCreditorID(event.target.value);
  event.target.setCustomValidity(isValid ? "" : "Creditor ID is not valid");
}
