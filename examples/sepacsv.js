/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014-2015 */

import SEPA from 'sepa';
import csv from 'fast-csv';
import fs from 'fs';

// Helper functions needed in settings
function pad0(str, len) { var fmt = '', fmtsize = len; while(fmtsize--) fmt += '0'; return (fmt + str).substr(-len); }

// Make your settings here
var created = new Date();
var transIdFmt = 'XMPL.' + created.getFullYear() + pad0(created.getMonth() + 1, 2) + pad0(created.getDate(), 2) + '.TR0';
var mandateFmt = 'XMPL.CUST%id%.%sigdate.year%';
var end2endFmt= 'XMPL.CUST%id%.FEE.' + created.getFullYear() + pad0(created.getMonth() + 1, 2);
var remittanceInfo = 'Member Fee ' + created.getFullYear() + '/' + pad0(created.getMonth() + 1, 2);
var creditorIBAN = 'DE87123456781234567890';
var creditorBIC = 'XMPLDEM0XXX';
var creditorId = 'DE98ZZZ09999999999';
var creditorName = 'Example LLC';
var sequenceType = 'FRST';
var transactionAmount = 5;

function CSV_READ_ID(data) { return data.payment_info_id; }
function CSV_READ_NAME(data) { return data.debtor_name; }
function CSV_READ_IBAN(data) {
  if (!data.debtor_iban && data.debtor_account_number && data.debtor_bank_code) {
    // If there is no IBAN, put it together from the old account data. Adapt
    // for your country.
    return SEPA.checksumIBAN('DE00' + data.debtor_bank_code.padStart(8, '0') + data.debtor_account_number.padStart(10, '0'));
  } else {
    return data.debtor_iban;
  }
}
function CSV_READ_SIGDATE(data) { return new Date(data.requested_execution_date); }
function CSV_ACCEPT_ROW(data) { return data.accept == 'yes'; }
// End Settings

function Customer(id, name, iban, sigdate) {
  this.id = id;
  this.name = name;
  this.iban = iban;
  this.sigdate = sigdate;

  this.formatString = function(fmt) {
    return fmt.replace('%id%', this.id)
      .replace('%name%', this.name)
      .replace('%iban%', this.iban)
      .replace('%sigdate.year%', this.sigdate.getFullYear())
      .replace('%sigdate.month%', this.sigdate.getMonth() + 1)
      .replace('%sigdate.day%',  this.sigdate.getDate());
  };
}

function readCSV(fname) {
  var customers = [];
  csv.parseFile(fname, { headers: true }).on('data', function(data){
    var id = CSV_READ_ID(data);
    var name = CSV_READ_NAME(data);
    var iban = CSV_READ_IBAN(data);
    var sigdate = CSV_READ_SIGDATE(data);

    if (CSV_ACCEPT_ROW(data)) {
      customers.push(new Customer(id, name, iban, sigdate));
    }
  }).on('end', function(){
    generateSEPA(customers);
  });
}

function generateSEPA(customers) {
  var doc = new SEPA.Document();
  doc.grpHdr.id = transIdFmt;
  doc.grpHdr.created = created;
  doc.grpHdr.initiatorName = creditorName;

  var info = doc.createPaymentInfo();
  info.collectionDate = new Date();
  info.creditorIBAN = creditorIBAN;
  info.creditorBIC = creditorBIC;
  info.creditorName = creditorName;
  info.creditorId = creditorId;
  info.sequenceType = sequenceType;
  doc.addPaymentInfo(info);

  for (var i = 0; i < customers.length; i++) {
    var customer = customers[i];

    var tx = info.createTransaction();
    tx.debtorName = customer.name;
    tx.debtorIBAN = customer.iban;
    tx.mandateId = customer.formatString(mandateFmt);
    tx.mandateSignatureDate = customer.sigdate;
    tx.amount = transactionAmount;
    tx.remittanceInfo = customer.formatString(remittanceInfo);
    tx.end2endId = customer.formatString(end2endFmt);
    try {
      tx.validate();
      info.addTransaction(tx);
    } catch (e) {
      process.stderr.write(`Invalid customer data (${e}): ${customer.join(',')}`);
    }
  }

  process.stdout.write(doc.toString());
}

// Main program
if (process.argv.length < 3 || !fs.lstatSync(process.argv[2]).isFile()) {
  process.stdout.write('Usage: node sepacsv.js <filename>\n');
} else {
  readCSV(process.argv[2]);
}
