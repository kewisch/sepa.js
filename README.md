Welcome to sepa.js
==================

This library can be used to generate the XML structure used
for [SEPA](http://en.wikipedia.org/wiki/Single_Euro_Payments_Area) payment
transfers. It is currently in its early stages and mostly geared towards German
batched direct debit transactions.

It will work in the browser or using node.js. To use it in the browser, just
include it via script-tag and access through the `SEPA` variable. There are a
few examples below.

You can also try the [live online generator](http://kewisch.github.io/sepa.js/examples/web.html).
If you are worried about account number safety, be assured that everything is
calculated client side. Check the source code if you don't trust me.

If you have extended sepa.js for a different purpose, please contribute the code
either via email or ideally as a [pull request](https://github.com/kewisch/sepa.js/pulls).
If you are missing something, please [create an issue](https://github.com/kewisch/sepa.js/issues).

* Each SEPA document contains exactly one group header, accessible via the `grpHdr` property.
* You can add multiple paymentInfo blocks to a document, i.e one per sequenceType (FRST/RCUR)
* A payment info block can contain multiple transactions.

Validating an IBAN or Creditor ID
---------------------------------

You can use sepa.js to validate IBAN and Creditor ID numbers or calculate their checksum. Here is an example:

```javascript
var SEPA = require("sepa");

// Validating this IBAN returns true.
SEPA.validateIBAN("DE40987654329876543210");

// Passing this IBAN with "00" as the checksum returns the
// IBAN with the correct checksum, "DE87123456781234567890".
SEPA.checksumIBAN("DE00123456781234567890");

// Validating this Creditor ID returns true.
SEPA.validateCreditorID("DE98ZZZ09999999999");

// Passing this Creditor ID with "00" as the checksum returns the
// Creditor ID with the correct checksum, "DE98ZZZ09999999999".
SEPA.checksumCreditorID("DE00ZZZ09999999999");
```

Creating an XML DirectDebit Document
---------------------------------
The main use case for sepa.js is creating an XML Document based on the
[EBICS Specification](http://www.ebics.org/index.php?id=30).
Here is a simple node.js example. If you want to use the browser instead, just
omit the first line and include via script-tag or module loader instead.
```javascript
var SEPA = require("sepa");

var doc = new SEPA.Document('pain.008.001.02');
doc.grpHdr.id = "XMPL.20140201.TR0";
doc.grpHdr.created = new Date();
doc.grpHdr.initiatorName = "Example LLC";

var info = doc.createPaymentInfo();
info.collectionDate = new Date();
info.creditorIBAN = "DE87123456781234567890";
info.creditorBIC = "XMPLDEM0XXX";
info.creditorName = "Example LLC";
info.creditorId = "DE98ZZZ09999999999";
info.batchBooking = true; //optional
doc.addPaymentInfo(info);

var tx = info.createTransaction();
tx.debtorName = "Example Customer";
tx.debtorIBAN = "DE40987654329876543210";
tx.debtorBIC = "CUSTDEM0XXX";
tx.mandateId = "XMPL.CUST487.2014";
tx.mandateSignatureDate = new Date("2014-02-01");
tx.amount = 50.23;
tx.currency = 'EUR'; //optional
tx.remittanceInfo = "INVOICE 54";
tx.end2endId = "XMPL.CUST487.INVOICE.54";
info.addTransaction(tx);

console.log(doc.toString());
```

Creating an XML Transfer Document
---------------------------------

```javascript
var SEPA = require("sepa");

var doc = new SEPA.Document('pain.001.001.03');
doc.grpHdr.id = "XMPL.20140201.TR0";
doc.grpHdr.created = new Date();
doc.grpHdr.initiatorName = "Example LLC";

var info = doc.createPaymentInfo();
info.requestedExecutionDate = new Date();
info.debtorIBAN = "DE87123456781234567890";
info.debtorBIC = "XMPLDEM0XXX";
info.debtorName = "Example LLC";
info.debtorId = "DE98ZZZ09999999999";
doc.addPaymentInfo(info);

var tx = info.createTransaction();
tx.creditorName = "Example Customer";
tx.creditorIBAN = "DE40987654329876543210";
tx.creditorBIC = "CUSTDEM0XXX";
tx.mandateId = "XMPL.CUST487.2014";
tx.mandateSignatureDate = new Date("2014-02-01");
tx.amount = 50.23;
tx.remittanceInfo = "INVOICE 54";
tx.end2endId = "XMPL.CUST487.INVOICE.54";
info.addTransaction(tx);

console.log(doc.toString());
```

### XML Result
```xml
<?xml version="1.0"?>
<Document schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.003.02 pain.008.003.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>XMPL.20140201.TR0</MsgId>
      <CreDtTm>2014-01-23T19:16:10.285Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>50.23</CtrlSum>
      <InitgPty>
        <Nm>Example LLC</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>XMPL.20140201.TR0.0</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>50.23</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>FRST</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>2014-01-23</ReqdColltnDt>
      <Cdtr>
        <Nm>Example LLC</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>DE87123456781234567890</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BIC>XMPLDEM0XXX</BIC>
        </FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>DE98ZZZ09999999999</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>XMPL.CUST487.INVOICE.54</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">50.23</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>XMPL.CUST487.2014</MndtId>
            <DtOfSgntr>2014-02-01</DtOfSgntr>
            <AmdmntInd>false</AmdmntInd>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>
            <BIC>CUSTDEM0XXX</BIC>
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>Example Customer</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>DE40987654329876543210</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>INVOICE 54</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
```
