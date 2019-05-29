/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014-2015 */

const utils = require('./utils');
const { XMLSerializer } = require('xmldom');

/**
 * This is sepa.js. Its module exports the following functions:
 *
 * SEPA.Document               -- class for creating SEPA XML Documents
 * SEPA.PaymentInfo            -- class for SEPA payment information blocks
 * SEPA.Transaction            -- class for generic transactions
 * SEPA.validateIBAN           -- function to validate an IBAN
 * SEPA.checksumIBAN           -- function to calculate the IBAN checksum
 * SEPA.validateCreditorID     -- function to validate a creditor id
 * SEPA.checksumCreditorID     -- function to calculate the creditor id checksum
 * SEPA.setIDSeparator         -- function to customize the ID separator when needed (defaults to '.')
 * SEPA.enableValidations      -- function to enable/disable fields validation
 */
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
const XSI_NS = 'urn:iso:std:iso:20022:tech:xsd:';
const DEFAULT_XML_VERSION = '1.0';
const DEFAULT_XML_ENCODING = 'UTF-8';
const DEFAULT_PAIN_FORMAT = 'pain.008.001.02';

let idSeparator = '.';
function setIDSeparator(seperator) {
  idSeparator = seperator;
}

let validationsEnabled = true;
function enableValidations(enabled) {
  validationsEnabled = !!enabled;
}

const PaymentInfoTypes = {
  DirectDebit: 'DD',
  Transfer: 'TRF'
};

const SEPATypes = {
  'pain.001.001.02': 'pain.001.001.02',
  'pain.001.003.02': 'pain.001.003.02',
  'pain.001.001.03': 'CstmrCdtTrfInitn',
  'pain.001.003.03': 'CstmrCdtTrfInitn',
  'pain.008.001.01': 'pain.008.001.01',
  'pain.008.003.01': 'pain.008.003.01',
  'pain.008.001.02': 'CstmrDrctDbtInitn',
  'pain.008.003.02': 'CstmrDrctDbtInitn'
};

class SepaDocument {
  constructor(painFormat) {
    this.painFormat = painFormat || DEFAULT_PAIN_FORMAT;
    this.type = SEPATypes[this.painFormat];
    this.paymentInfo = [];
    this.xmlVersion = DEFAULT_XML_VERSION;
    this.xmlEncoding = DEFAULT_XML_ENCODING;
    this.grpHdr = new SepaGroupHeader(this.painFormat);
    this.Types = SEPATypes;
  }

  /**
   * Adds a Sepa.PaymentInfo block to this document. Its id will be
   * automatically prefixed with the group header id.
   *
   * @param paymentInfo        The payment info block.
   */
  addPaymentInfo(paymentInfo) {
    if (!(paymentInfo instanceof SepaPaymentInfo)) {
      throw new Error('Given payment is not member of the PaymentInfo class');
    }

    if (paymentInfo.id) {
      paymentInfo.id = this.grpHdr.id + idSeparator + paymentInfo.id;
    } else {
      paymentInfo.id = this.grpHdr.id + idSeparator + this.paymentInfo.length;
    }
    this.paymentInfo.push(paymentInfo);
  }

  /**
   * Factory method for PI
   */
  createPaymentInfo() {
    return new SepaPaymentInfo(this.painFormat);
  }

  /**
   * Normalize fields like the control sum or transaction count. This will be
   * called automatically when serialized to XML.
   */
  normalize() {
    const { controlSum, transactionCount } = this.paymentInfo.reduce(
      (acc, paymentInfo) => {
        paymentInfo.normalize();
        return {
          controlSum: acc.controlSum + paymentInfo.controlSum,
          transactionCount: acc.transactionCount + paymentInfo.transactionCount
        };
      },
      { controlSum: 0, transactionCount: 0 }
    );
    this.grpHdr.controlSum = controlSum;
    this.grpHdr.transactionCount = transactionCount;
  }

  /**
   * Serialize this document to a DOM Document.
   *
   * @return      The DOM Document.
   */
  toXML() {
    this.normalize();

    const documentNamespace = `${XSI_NS}${this.painFormat}`;
    const document = createDocument(documentNamespace, 'Document');
    document.xmlVersion = this.xmlVersion;
    document.xmlEncoding = this.xmlEncoding;
    const body = document.documentElement;

    body.setAttribute('xmlns:xsi', XSI_NAMESPACE);
    body.setAttribute(
      'xsi:schemaLocation',
      `${XSI_NS + this.painFormat} ${this.painFormat}.xsd`
    );
    const rootElement = document.createElementNS(documentNamespace, this.type);
    rootElement.appendChild(this.grpHdr.toXML(document));
    this.paymentInfo.forEach(paymentInfo => {
      rootElement.appendChild(paymentInfo.toXML(document));
    });

    document.documentElement.appendChild(rootElement);
    return document;
  }

  /**
   * Serialize this document to an XML string.
   *
   * @return String     The XML string of this document.
   */
  toString() {
    const document = this.toXML();
    // as some banks require the document declaration string and it is not provided by the XMLSerializer, it is added here.
    const docDeclaration = `<?xml version="${document.xmlVersion}" encoding="${
      document.xmlEncoding
    }"?>`;
    return docDeclaration + serializeToString(document);
  }
}

/**
 * Wrapper class for the SEPA <GrpHdr> element.
 */
class SepaGroupHeader {
  constructor(painFormat) {
    this.painFormat = painFormat;
    this.id = '';
    this.created = '';
    this.transactionCount = 0;
    this.initiatorName = '';
    this.controlSum = 0;
    this.batchBooking = true;
    this.grouping = 'MIXD';
    this.organisationId = null;
  }

  /*
   * Serialize this document to a DOM Element.
   *
   * @return      The DOM <GrpHdr> Element.
   */
  toXML(document) {
    // Function to create a container node
    const containerNode = createXMLHelper(document, true, false);
    // Function to create a node even if no value is present
    const requiredNode = createXMLHelper(document, true, true);
    const grpHdr = document.createElementNS(
      document.documentElement.namespaceURI,
      'GrpHdr'
    );
    const painVersion = utils.getPainXMLVersion(this.painFormat);

    requiredNode(grpHdr, 'MsgId', this.id);
    requiredNode(grpHdr, 'CreDtTm', this.created.toISOString());

    // XML v2 formats, add grouping + batch booking nodes
    if (painVersion === 2) {
      requiredNode(grpHdr, 'BtchBookg', this.batchBooking.toString());
    }

    requiredNode(grpHdr, 'NbOfTxs', this.transactionCount);
    requiredNode(grpHdr, 'CtrlSum', this.controlSum.toFixed(2));

    // XML v2 formats, add grouping + batch booking nodes
    if (painVersion === 2) {
      requiredNode(grpHdr, 'Grpg', this.grouping);
    }

    const initgPty = containerNode(grpHdr, 'InitgPty');

    requiredNode(initgPty, 'Nm', this.initiatorName);

    // Organisation Identification (NIF)
    if (this.organisationId) {
      requiredNode(initgPty, 'Id', 'OrgId', 'Othr', 'Id', this.organisationId);
    }

    return grpHdr;
  }

  /**
   * Serialize this element to an XML string.
   *
   * @return      The XML string of this element.
   */
  toString() {
    return serializeToString(this.toXML());
  }
}

/**
 * Wrapper class for the SEPA <PmtInf> Element
 */
class SepaPaymentInfo {
  constructor(painFormat) {
    this.painFormat = painFormat || DEFAULT_PAIN_FORMAT;
    this.method =
      this.painFormat.indexOf('pain.001') === 0
        ? PaymentInfoTypes.Transfer
        : PaymentInfoTypes.DirectDebit;

    this.payments = [];
    /** Transaction array */
    this.id = '';
    /** If true, booking will appear as one entry on your statement */
    this.batchBooking = true;
    /** Grouping, defines structure handling for XML file */
    this.grouping = 'MIXD';
    /** Sum of all payments, will be automatically set */
    this.controlSum = 0;
    /* Instrumentation code:
     * 'CORE' - Standard Transfer
     * 'COR1' - Expedited Transfer
     * 'B2B'  - Business Transfer
     * 'SDCL' - European Transfer
     */
    this.localInstrumentation = 'CORE';

    /**
     * 'FRST' - First transfer
     * 'RCUR' - Subsequent transfer
     * 'OOFF' - One Off transfer
     * 'FNAL' - Final transfer
     */
    this.sequenceType = 'FRST';

    /** Requested collection date */
    this.collectionDate = null;

    /** Execution date of the SEPA order */
    this.requestedExecutionDate = null;

    /** Id assigned to the creditor */
    this.creditorId = '';

    /** Name, Address, IBAN and BIC of the creditor */
    this.creditorName = '';
    this.creditorStreet = null;
    this.creditorCity = null;
    this.creditorCountry = null;
    this.creditorIBAN = '';
    this.creditorBIC = '';
    this.creditorCategoryPurpose = '';

    /** Id assigned to the debtor for Transfer payments */
    this.debtorId = '';

    /** Name, Address, IBAN and BIC of the debtor */
    this.debtorName = '';
    this.debtorStreet = null;
    this.debtorCity = null;
    this.debtorCountry = null;
    this.debtorIBAN = '';
    this.debtorBIC = '';
    this.debtorCategoryPurpose = '';

    /** SEPA order priority, can be HIGH or NORM */
    this.instructionPriority = 'NORM';
  }

  getField(field) {
    return this[
      this.method === PaymentInfoTypes.DirectDebit
        ? `creditor${field}`
        : `debtor${field}`
    ];
  }

  /** Number of transactions in this payment info block */
  get transactionCount() {
    return this.payments.length;
  }

  /**
   * Normalize fields like the control sum or transaction count. This will
   * _NOT_ be called when serialized to XML and must be called manually.
   */
  normalize() {
    this.controlSum = this.payments.reduce(
      (controlSum, payment) => controlSum + payment.amount,
      0
    );
  }

  /**
   * Adds a transaction to this payment. The transaction id will be prefixed
   * by the payment info id.
   *
   * @param pmt       The Transacation to add.
   */
  addTransaction(pmt) {
    if (!(pmt instanceof SepaTransaction)) {
      throw new Error(
        'Given Transaction is not member of the SepaTransaction class'
      );
    }

    if (pmt.id) {
      pmt.id = this.id + idSeparator + pmt.id;
    } else {
      pmt.id = this.id + idSeparator + this.payments.length;
    }
    this.payments.push(pmt);
  }

  createTransaction() {
    return new SepaTransaction(this.painFormat);
  }

  validate() {
    // TODO consider using getters/setters instead
    const pullFrom =
      this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';

    assert_fixed(
      this.localInstrumentation,
      ['CORE', 'COR1', 'B2B', 'SDCL', 'ONCL'],
      'localInstrumentation'
    );
    assert_fixed(
      this.sequenceType,
      ['FRST', 'RCUR', 'OOFF', 'FNAL'],
      'sequenceType'
    );

    if (this.method === PaymentInfoTypes.DirectDebit) {
      assert_date(this.collectionDate, 'collectionDate');
      assert_cid(this[`${pullFrom}Id`], `${pullFrom}Id`);
    } else {
      assert_date(this.requestedExecutionDate, 'requestedExecutionDate');
    }

    assert_length(this[`${pullFrom}Name`], null, 70, `${pullFrom}Name`);
    assert_length(this[`${pullFrom}Street`], null, 70, `${pullFrom}Street`);
    assert_length(this[`${pullFrom}City`], null, 70, `${pullFrom}City`);
    assert_length(this[`${pullFrom}Country`], null, 2, `${pullFrom}Country`);
    assert_iban(this[`${pullFrom}IBAN`], `${pullFrom}IBAN`);
    assert_length(this[`${pullFrom}BIC`], [0, 8, 11], `${pullFrom}BIC`);
    const countryMatches =
      this[`${pullFrom}BIC`].length === 0 ||
      this[`${pullFrom}BIC`].substr(4, 2) ===
        this[`${pullFrom}IBAN`].substr(0, 2);
    assert(countryMatches, 'country mismatch in BIC/IBAN');

    assert_length(this.payments.length, 1, null, '_payments');
  }

  /*
   * Serialize this document to a DOM Element.
   *
   * @return      The DOM <PmtInf> Element.
   */
  toXML(doc) {
    if (validationsEnabled) {
      this.validate();
    }

    const containerNode = createXMLHelper(doc, true, false);
    const optionalNode = createXMLHelper(doc, false, true);
    const requiredNode = createXMLHelper(doc, true, true);
    const pmtInf = doc.createElementNS(
      doc.documentElement.namespaceURI,
      'PmtInf'
    );

    requiredNode(pmtInf, 'PmtInfId', this.id);
    requiredNode(pmtInf, 'PmtMtd', this.method);
    // XML v3 formats, add grouping + batch booking nodes
    if (utils.getPainXMLVersion(this.painFormat) === 3) {
      requiredNode(pmtInf, 'BtchBookg', this.batchBooking.toString());
      requiredNode(pmtInf, 'NbOfTxs', this.transactionCount);
      requiredNode(pmtInf, 'CtrlSum', this.controlSum.toFixed(2));
    }

    const pmtTpInf = containerNode(pmtInf, 'PmtTpInf');
    const pullFrom =
      this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';

    requiredNode(pmtTpInf, 'SvcLvl', 'Cd', 'SEPA');
    optionalNode(
      pmtTpInf,
      'CtgyPurp',
      'Cd',
      this[`${pullFrom}CategoryPurpose`]
    );

    if (this.method === PaymentInfoTypes.DirectDebit) {
      requiredNode(pmtTpInf, 'LclInstrm', 'Cd', this.localInstrumentation);
      requiredNode(pmtTpInf, 'SeqTp', this.sequenceType);
      requiredNode(
        pmtInf,
        'ReqdColltnDt',
        this.collectionDate.toISOString().substr(0, 10)
      );
    } else {
      requiredNode(
        pmtInf,
        'ReqdExctnDt',
        this.requestedExecutionDate.toISOString().substr(0, 10)
      );
    }

    const emitterNodeName =
      this.method === PaymentInfoTypes.DirectDebit ? 'Cdtr' : 'Dbtr';
    const emitter = containerNode(pmtInf, emitterNodeName);

    requiredNode(emitter, 'Nm', this[`${pullFrom}Name`]);
    if (
      this[`${pullFrom}Street`] &&
      this[`${pullFrom}City`] &&
      this[`${pullFrom}Country`]
    ) {
      const pstl = containerNode(emitter, 'PstlAdr');
      requiredNode(pstl, 'Ctry', this[`${pullFrom}Country`]);
      requiredNode(pstl, 'AdrLine', this[`${pullFrom}Street`]);
      requiredNode(pstl, 'AdrLine', this[`${pullFrom}City`]);
    }

    requiredNode(
      pmtInf,
      `${emitterNodeName}Acct`,
      'Id',
      'IBAN',
      this[`${pullFrom}IBAN`]
    );
    if (this[`${pullFrom}BIC`]) {
      const finInstnId = containerNode(
        pmtInf,
        `${emitterNodeName}Agt`,
        'FinInstnId'
      );
      requiredNode(finInstnId, 'BIC', this[`${pullFrom}BIC`]);
      optionalNode(finInstnId, 'PstlAdr', 'Ctry', this[`${pullFrom}Country`]);
    } else {
      requiredNode(
        pmtInf,
        `${emitterNodeName}Agt`,
        'FinInstnId',
        'Othr',
        'Id',
        'NOTPROVIDED'
      );
    }

    requiredNode(pmtInf, 'ChrgBr', 'SLEV');

    if (this.method === PaymentInfoTypes.DirectDebit) {
      const creditorScheme = containerNode(
        pmtInf,
        'CdtrSchmeId',
        'Id',
        'PrvtId',
        'Othr'
      );
      requiredNode(creditorScheme, 'Id', this.creditorId);
      requiredNode(creditorScheme, 'SchmeNm', 'Prtry', 'SEPA');
    }

    this.payments.forEach(payment => {
      pmtInf.appendChild(payment.toXML(doc));
    });

    return pmtInf;
  }

  /**
   * Serialize this element to an XML string.
   *
   * @return      The XML string of this element.
   */
  toString() {
    return serializeToString(this.toXML());
  }
}

/**
 * Generic Transaction class
 */
const TransactionTypes = {
  DirectDebit: 'DrctDbtTxInf',
  Transfer: 'CdtTrfTxInf'
};

class SepaTransaction {
  constructor(painFormat) {
    this.painFormat = painFormat;
    this.type =
      painFormat.indexOf('pain.001') === 0
        ? TransactionTypes.Transfer
        : TransactionTypes.DirectDebit;

    /** Generic Transaction Type */
    this._type = TransactionTypes.DirectDebit;
    /** The unique transaction id */
    this.id = '';
    /** The End-To-End id */
    this.end2endId = '';
    /** The currency to transfer */
    this.currency = 'EUR';
    /** The amount to transfer */
    this.amount = 0;
    /** (optional) The purpose code to use */
    this.purposeCode = null;
    /** The mandate id of the debtor */
    this.mandateId = '';
    /** The signature date of the mandate */
    this.mandateSignatureDate = null;
    /** Name, Address, IBAN, and BIC of the debtor */
    this.debtorName = '';
    this.debtorStreet = null;
    this.debtorCity = null;
    this.debtorCountry = null;
    this.debtorIBAN = '';
    this.debtorBIC = '';
    /** Unstructured Remittance Info */
    this.remittanceInfo = '';
    /** Name, Address, IBAN and BIC of the creditor */
    this.creditorName = '';
    this.creditorStreet = null;
    this.creditorCity = null;
    this.creditorCountry = null;
    this.creditorIBAN = '';
    this.creditorBIC = '';
  }

  validate() {
    const pullFrom =
      this.type === TransactionTypes.Transfer ? 'creditor' : 'debtor';

    assert_sepa_id_set1(this.end2endId, 'end2endId');
    assert_range(this.amount, 0.01, 999999999.99, 'amount');
    assert(
      this.amount == this.amount.toFixed(2),
      'amount has too many fractional digits'
    );
    assert_length(this.purposeCode, 1, 4, 'purposeCode');
    assert_sepa_id_set2(this.mandateId, 'mandateId');
    assert_date(this.mandateSignatureDate, 'mandateSignatureDate');

    assert_length(this[`${pullFrom}Name`], null, 70, `${pullFrom}Name`);
    assert_length(this[`${pullFrom}Street`], null, 70, `${pullFrom}Street`);
    assert_length(this[`${pullFrom}City`], null, 70, `${pullFrom}City`);
    assert_length(this[`${pullFrom}Country`], null, 2, `${pullFrom}Country`);
    assert_iban(this[`${pullFrom}IBAN`], `${pullFrom}IBAN`);
    // assert_fixed(this[pullFrom + 'BIC'].length, [0, 8, 11], pullFrom + 'BIC')
    // var countryMatches = (this[pullFrom + 'BIC'].length === 0 || this[pullFrom + 'BIC'].substr(4, 2) === this[pullFrom + 'IBAN'].substr(0, 2))
    // assert(countryMatches, 'country mismatch in BIC/IBAN')

    assert_length(this.remittanceInfo, null, 140, 'remittanceInfo');
  }

  toXML(doc) {
    if (validationsEnabled) {
      this.validate();
    }

    const pullFrom =
      this.type === TransactionTypes.Transfer ? 'creditor' : 'debtor';
    const recieverNodeName =
      this.type === TransactionTypes.Transfer ? 'Cdtr' : 'Dbtr';

    const containerNode = createXMLHelper(doc, true, false);
    const optionalNode = createXMLHelper(doc, false, true);
    const requiredNode = createXMLHelper(doc, true, true);

    const txInf = doc.createElementNS(
      doc.documentElement.namespaceURI,
      this.type
    );

    const paymentId = containerNode(txInf, 'PmtId');
    requiredNode(paymentId, 'InstrId', this.id);
    requiredNode(paymentId, 'EndToEndId', this.end2endId);

    if (this.type === TransactionTypes.DirectDebit) {
      requiredNode(txInf, 'InstdAmt', this.amount.toFixed(2)).setAttribute(
        'Ccy',
        this.currency
      );

      const mandate = containerNode(txInf, 'DrctDbtTx', 'MndtRltdInf');
      requiredNode(mandate, 'MndtId', this.mandateId);
      requiredNode(
        mandate,
        'DtOfSgntr',
        this.mandateSignatureDate.toISOString().substr(0, 10)
      );

      if (this.ammendment) {
        requiredNode(mandate, 'AmdmntInd', 'true');
        requiredNode(mandate, 'AmdmnInfDtls', this.ammendment);
      } else {
        requiredNode(mandate, 'AmdmntInd', 'false');
      }
    } else {
      requiredNode(
        txInf,
        'Amt',
        'InstdAmt',
        this.amount.toFixed(2)
      ).setAttribute('Ccy', this.currency);
    }

    if (this[`${pullFrom}BIC`]) {
      const finInstnId = containerNode(
        txInf,
        `${recieverNodeName}Agt`,
        'FinInstnId'
      );
      requiredNode(finInstnId, 'BIC', this[`${pullFrom}BIC`]);
      optionalNode(finInstnId, 'PstlAdr', 'Ctry', this[`${pullFrom}Country`]);
    } else {
      requiredNode(
        txInf,
        `${recieverNodeName}Agt`,
        'FinInstnId',
        'Othr',
        'Id',
        'NOTPROVIDED'
      );
    }

    const reciever = containerNode(txInf, recieverNodeName);
    requiredNode(reciever, 'Nm', this[`${pullFrom}Name`]);

    if (
      this[`${pullFrom}Street`] &&
      this[`${pullFrom}City`] &&
      this[`${pullFrom}Country`]
    ) {
      const pstl = containerNode(reciever, 'PstlAdr');
      requiredNode(pstl, 'Ctry', this.debtorCountry);
      requiredNode(pstl, 'AdrLine', this.debtorStreet);
      requiredNode(pstl, 'AdrLine', this.debtorCity);
    }

    requiredNode(
      txInf,
      `${recieverNodeName}Acct`,
      'Id',
      'IBAN',
      this[`${pullFrom}IBAN`]
    );

    requiredNode(txInf, 'RmtInf', 'Ustrd', this.remittanceInfo);
    optionalNode(txInf, 'Purp', 'Cd', this.purposeCode);

    return txInf;
  }
}

// --- Various private functions follow --- //

/** Assert that |cond| is true, otherwise throw an error with |msg| */
function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

/** Assert that |val| is one of |choices| */
function assert_fixed(val, choices, member) {
  if (choices.indexOf(val) < 0) {
    throw new Error(
      `${member} must have any value of: ${choices.join(' ')}(found: ${val})`
    );
  }
}

/** assert that |str| has a length between min and max (either may be null) */
function assert_length(str, min, max, member) {
  if (
    (min !== null && str && str.length < min) ||
    (max !== null && str && str.length > max)
  ) {
    throw new Error(
      `${member} has invalid string length, expected ${min} < ${str} < ${max}`
    );
  }
}

/** assert that |num| is in the range between |min| and |max| */
function assert_range(num, min, max, member) {
  if (num < min || num > max) {
    throw new Error(`${member} does not match range ${min} < ${num} < ${max}`);
  }
}

/** assert that |str| is an IBAN */
function assert_iban(str, member) {
  if (!utils.validateIBAN(str)) {
    throw new Error(`${member} has invalid IBAN "${str}"`);
  }
}

/** assert that |str| is a creditor id */
function assert_cid(str, member) {
  if (!utils.validateCreditorID(str)) {
    throw new Error(`${member} is invalid "${str}"`);
  }
}

/** assert an iso date */
function assert_date(dt, member) {
  if (!dt || isNaN(dt.getTime())) {
    throw new Error(`${member} has invalid date ${dt}`);
  }
}

/** assert that the str uses characters from the first sepa id charset */
function assert_sepa_id_set1(str, member) {
  if (str && !str.match(/([A-Za-z0-9]|[+|?|/|\-|:|(|)|.|,|'| ]){1,35}/)) {
    throw new Error(
      `${member} doesn't match sepa id charset type 1 (found: ` + `"${str}")`
    );
  }
}

/** assert that the str uses characters from the second sepa id charset */
function assert_sepa_id_set2(str, member) {
  if (str && !str.match(/([A-Za-z0-9]|[+|?|/|\-|:|(|)|.|,|']){1,35}/)) {
    throw new Error(
      `${member} doesn't match sepa id charset type 2 (found: ` + `"${str}")`
    );
  }
}

/**
 * Creates a DOM Document, either using the browser document, or node.js xmldom.
 *
 * @param nsURI       The namespace URI.
 * @param qname       Qualified name for the root tag.
 * @return            The created DOM document.
 */
function createDocument(nsURI, qname) {
  const { DOMImplementation } = require('xmldom');
  return new DOMImplementation().createDocument(nsURI, qname);
}

/**
 * Serializes a dom element or document to string, using either the builtin
 * XMLSerializer or the one from node.js xmldom.
 *
 * @param doc         The document or element to serialize
 * @return            The serialized XML document.
 */
function serializeToString(doc) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Returns a helper for creating XML nodes. There are three intended calls
 * for this helper. The first parameter for the returned function is always
 * the parent element, followed by a variable number of element names. The
 * last parameter may be the text content value, as shown below. The
 * innermost node is always returned.
 *
 *  // This helper creates a node without a contained value
 *  // Usage: n(rootNode, 'foo', 'bar')
 *  // Result: <root><foo><bar/></foo></root>
 *  var n = createXMLHelper(doc, true, false)
 *
 *  // This helper creates a node with an optional value. If the value is
 *  // null, then the node is not added to the parent.
 *  // Usage: o(rootNode, 'foo', 'bar', myValue)
 *  // Result (if myValue is not null): <root><foo><bar>myValue</bar></foo></root>
 *  var o = createXMLHelper(doc, false, true)
 *
 *  // This helper creates a node with a required value. It is added
 *  // regardless of if its null or not.
 *  // Usage: r(rootNode, 'foo', 'bar', myValue)
 *  // Result: <root><foo><bar>myValue</bar></foo></root>
 *  var r = createXMLHelper(doc, true, true)
 *
 * @param doc         The document to create nodes with
 * @param required    If false, nodes with null values will not be added to the parent.
 * @param withVal     If true, the last parameter of the returned function is set as textContent.
 */
function createXMLHelper(doc, required, withVal) {
  return function() {
    let node = arguments[0];
    const val = withVal && arguments[arguments.length - 1];
    const maxarg = withVal ? arguments.length - 1 : arguments.length;

    if (required || val || val === 0) {
      for (let i = 1; i < maxarg; ++i) {
        node = node.appendChild(
          doc.createElementNS(doc.documentElement.namespaceURI, arguments[i])
        );
      }
      if (withVal) {
        node.textContent = val;
      }
      return node;
    }
    return null;
  };
}

// --- Module Exports follow --- //

module.exports = {
  Document: SepaDocument,
  validateIBAN: utils.validateIBAN,
  checksumIBAN: utils.checksumIBAN,
  validateCreditorID: utils.validateCreditorID,
  checksumCreditorID: utils.checksumCreditorID,
  setIDSeparator,
  enableValidations
};
