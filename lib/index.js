/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014-2015 */

const utils = require('./utils/utils');
const assertions = require('./utils/assert');
const { XMLSerializer, DOMImplementation } = require('xmldom');

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
 */
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
const XSI_NS = 'urn:iso:std:iso:20022:tech:xsd:';
const DEFAULT_XML_VERSION = '1.0';
const DEFAULT_XML_ENCODING = 'UTF-8';
const DEFAULT_PAIN_FORMAT = 'pain.008.001.02';

let idSeparator = '.';
function setIDSeparator(separator) {
  idSeparator = separator;
}

const PaymentInfoTypes = {
  DirectDebit: 'DD',
  Transfer: 'TRF',
};

/**
 * Generic Transaction class
 */
const TransactionTypes = {
  DirectDebit: 'DrctDbtTxInf',
  Transfer: 'CdtTrfTxInf',
};

const SEPATypes = {
  'pain.001.001.02': 'pain.001.001.02',
  'pain.001.003.02': 'pain.001.003.02',
  'pain.001.001.03': 'CstmrCdtTrfInitn',
  'pain.001.003.03': 'CstmrCdtTrfInitn',
  'pain.008.001.01': 'pain.008.001.01',
  'pain.008.003.01': 'pain.008.003.01',
  'pain.008.001.02': 'CstmrDrctDbtInitn',
  'pain.008.003.02': 'CstmrDrctDbtInitn',
};

const containerNode = (document, node, ...path) =>
  addNode({
    document,
    node,
    path,
    optional: false,
  });
const optionalNode = (document, node, ...path) =>
  addNode({
    document,
    node,
    path: path.slice(0, path.length - 1),
    value: path[path.length - 1],
    optional: true,
  });
const requiredNode = (document, node, ...path) =>
  addNode({
    document,
    node,
    path: path.slice(0, path.length - 1),
    value: path[path.length - 1],
    optional: false,
  });

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
          transactionCount: acc.transactionCount + paymentInfo.transactionCount,
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

    body.setAttribute('xmlns', `${XSI_NS}${this.painFormat}`);
    body.setAttribute('xmlns:xsi', XSI_NAMESPACE);
    body.setAttribute(
      'xsi:schemaLocation',
      `${XSI_NS}${this.painFormat} ${this.painFormat}.xsd`
    );
    const rootElement = document.createElementNS(documentNamespace, this.type);
    rootElement.appendChild(this.grpHdr.toXML(document));
    this.paymentInfo.forEach((paymentInfo) => {
      rootElement.appendChild(paymentInfo.toXML(document));
    });

    document.documentElement.appendChild(rootElement);
    return document;
  }

  /**
   * Serialize this document to an XML string.
   *
   * @returns {String} The XML string of this document.
   */
  toString() {
    const document = this.toXML();
    // as some banks require the document declaration string and it is not provided by the XMLSerializer, it is added here.
    const documentDeclaration = `<?xml version="${document.xmlVersion}" encoding="${document.xmlEncoding}"?>`;
    const xmlToString = documentDeclaration + serializeToString(document);
    return (
      xmlToString
        // fix wrong attributes in root node like xmlns:xmlns='....'
        .replace(/[\w:]*='[^']*'/g, '')
        // & (which is converted into &amp;) isn't properly recognized by all banks
        // we follow https://www.europeanpaymentscouncil.eu/sites/default/files/KB/files/EPC217-08%20Draft%20Best%20Practices%20SEPA%20Requirements%20for%20Character%20Set%20v1.1.pdf recommendations
        .replace(/&amp;/g, '+')
        // same for apostrophes, which are simply removed
        .replace(/'/g, ' ')
        .replace(/@/g, '')
    );
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
    // Function to create a node even if no value is present
    const grpHdr = document.createElementNS(
      document.documentElement.namespaceURI,
      'GrpHdr'
    );
    const painVersion = utils.getPainXMLVersion(this.painFormat);

    this.id = utils.filterOutInvalidCharacters(this.id);
    this.initiatorName = utils.filterOutInvalidCharacters(this.initiatorName);

    requiredNode(document, grpHdr, 'MsgId', this.id);
    requiredNode(document, grpHdr, 'CreDtTm', this.created.toISOString());

    // XML v2 formats, add grouping + batch booking nodes
    if (painVersion === 2) {
      requiredNode(document, grpHdr, 'BtchBookg', this.batchBooking.toString());
    }

    requiredNode(document, grpHdr, 'NbOfTxs', this.transactionCount);
    requiredNode(document, grpHdr, 'CtrlSum', this.controlSum.toFixed(2));

    // XML v2 formats, add grouping + batch booking nodes
    if (painVersion === 2) {
      requiredNode(document, grpHdr, 'Grpg', this.grouping);
    }

    const initgPty = containerNode(document, grpHdr, 'InitgPty');

    requiredNode(document, initgPty, 'Nm', this.initiatorName);

    // Organisation Identification (NIF)
    if (this.organisationId) {
      requiredNode(
        document,
        initgPty,
        'Id',
        'OrgId',
        'Othr',
        'Id',
        this.organisationId
      );
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

  handleSpecialCharsAndValidate() {
    const pullFrom =
      this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';

    if (this[`${pullFrom}Name`] && this[`${pullFrom}Name`].length > 0) {
      this[`${pullFrom}Name`] = utils.filterOutInvalidCharacters(
        this[`${pullFrom}Name`].substring(0, 70)
      );
    }
    if (this[`${pullFrom}Street`] && this[`${pullFrom}Street`].length > 0) {
      this[`${pullFrom}Street`] = this[`${pullFrom}Street`].substring(0, 70);
    }
    if (this[`${pullFrom}City`] && this[`${pullFrom}City`].length > 0) {
      this[`${pullFrom}City`] = this[`${pullFrom}City`].substring(0, 70);
    }
    if (this[`${pullFrom}Country`] && this[`${pullFrom}Country`].length > 0) {
      this[`${pullFrom}Country`] = this[`${pullFrom}Country`].substring(0, 2);
    }
    this.id = utils.filterOutInvalidCharacters(this.id);

    assertions.assertFixed(
      this.localInstrumentation,
      ['CORE', 'COR1', 'B2B', 'SDCL', 'ONCL'],
      'localInstrumentation'
    );
    assertions.assertFixed(
      this.sequenceType,
      ['FRST', 'RCUR', 'OOFF', 'FNAL'],
      'sequenceType'
    );
    assertions.assertIban(this[`${pullFrom}IBAN`], `${pullFrom}IBAN`);

    if (this.method === PaymentInfoTypes.DirectDebit) {
      assertions.assertDate(this.collectionDate, 'collectionDate');
      assertions.assertCid(this[`${pullFrom}Id`], `${pullFrom}Id`);
    } else {
      assertions.assertDate(
        this.requestedExecutionDate,
        'requestedExecutionDate'
      );
    }

    assertions.assertLength(
      this[`${pullFrom}BIC`],
      [0, 8, 11],
      `${pullFrom}BIC`
    );
    const countryMatches =
      this[`${pullFrom}BIC`].length === 0 ||
      this[`${pullFrom}BIC`].substr(4, 2) ===
        this[`${pullFrom}IBAN`].substr(0, 2);
    assertions.assert(countryMatches, 'country mismatch in BIC/IBAN');
    assertions.assertLength(this.id, 0, 35);
    assertions.assertLength(this.payments.length, 1, null, '_payments');
  }

  /*
   * Serialize this document to a DOM Element.
   *
   * @return      The DOM <PmtInf> Element.
   */
  toXML(document) {
    this.handleSpecialCharsAndValidate();

    const pmtInf = document.createElementNS(
      document.documentElement.namespaceURI,
      'PmtInf'
    );

    requiredNode(document, pmtInf, 'PmtInfId', this.id);
    requiredNode(document, pmtInf, 'PmtMtd', this.method);
    // XML v3 formats, add grouping + batch booking nodes
    if (utils.getPainXMLVersion(this.painFormat) === 3) {
      requiredNode(document, pmtInf, 'BtchBookg', this.batchBooking.toString());
      requiredNode(document, pmtInf, 'NbOfTxs', this.transactionCount);
      requiredNode(document, pmtInf, 'CtrlSum', this.controlSum.toFixed(2));
    }

    const pmtTpInf = containerNode(document, pmtInf, 'PmtTpInf');
    const pullFrom =
      this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';

    requiredNode(document, pmtTpInf, 'SvcLvl', 'Cd', 'SEPA');
    optionalNode(
      document,
      pmtTpInf,
      'CtgyPurp',
      'Cd',
      this[`${pullFrom}CategoryPurpose`]
    );

    if (this.method === PaymentInfoTypes.DirectDebit) {
      requiredNode(
        document,
        pmtTpInf,
        'LclInstrm',
        'Cd',
        this.localInstrumentation
      );
      requiredNode(document, pmtTpInf, 'SeqTp', this.sequenceType);
      requiredNode(
        document,
        pmtInf,
        'ReqdColltnDt',
        this.collectionDate.toISOString().substr(0, 10)
      );
    } else {
      requiredNode(
        document,
        pmtInf,
        'ReqdExctnDt',
        this.requestedExecutionDate.toISOString().substr(0, 10)
      );
    }

    const emitterNodeName =
      this.method === PaymentInfoTypes.DirectDebit ? 'Cdtr' : 'Dbtr';
    const emitter = containerNode(document, pmtInf, emitterNodeName);

    requiredNode(document, emitter, 'Nm', this[`${pullFrom}Name`]);
    if (
      this[`${pullFrom}Street`] &&
      this[`${pullFrom}City`] &&
      this[`${pullFrom}Country`]
    ) {
      const pstl = containerNode(document, emitter, 'PstlAdr');
      requiredNode(document, pstl, 'Ctry', this[`${pullFrom}Country`]);
      requiredNode(document, pstl, 'AdrLine', this[`${pullFrom}Street`]);
      requiredNode(document, pstl, 'AdrLine', this[`${pullFrom}City`]);
    }

    requiredNode(
      document,
      pmtInf,
      `${emitterNodeName}Acct`,
      'Id',
      'IBAN',
      this[`${pullFrom}IBAN`]
    );
    if (this[`${pullFrom}BIC`]) {
      const finInstnId = containerNode(
        document,
        pmtInf,
        `${emitterNodeName}Agt`,
        'FinInstnId'
      );
      requiredNode(document, finInstnId, 'BIC', this[`${pullFrom}BIC`]);
      optionalNode(
        document,
        finInstnId,
        'PstlAdr',
        'Ctry',
        this[`${pullFrom}Country`]
      );
    } else {
      requiredNode(
        document,
        pmtInf,
        `${emitterNodeName}Agt`,
        'FinInstnId',
        'Othr',
        'Id',
        'NOTPROVIDED'
      );
    }

    requiredNode(document, pmtInf, 'ChrgBr', 'SLEV');

    if (this.method === PaymentInfoTypes.DirectDebit) {
      const creditorScheme = containerNode(
        document,
        pmtInf,
        'CdtrSchmeId',
        'Id',
        'PrvtId',
        'Othr'
      );
      requiredNode(document, creditorScheme, 'Id', this.creditorId);
      requiredNode(document, creditorScheme, 'SchmeNm', 'Prtry', 'SEPA');
    }

    this.payments.forEach((payment) => {
      pmtInf.appendChild(payment.toXML(document));
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

  handleSpecialCharsAndValidate() {
    const pullFrom =
      this.type === TransactionTypes.Transfer ? 'creditor' : 'debtor';

    this.id = utils.filterOutInvalidCharacters(this.id);
    this.end2endId = utils.filterOutInvalidCharacters(this.end2endId);
    this.mandateId = utils.filterOutInvalidCharacters(this.mandateId);
    if (this[`${pullFrom}Name`] && this[`${pullFrom}Name`].length > 0) {
      this[`${pullFrom}Name`] = utils.filterOutInvalidCharacters(
        this[`${pullFrom}Name`].substring(0, 70)
      );
    }
    if (this[`${pullFrom}Street`] && this[`${pullFrom}Street`].length > 0) {
      this[`${pullFrom}Street`] = this[`${pullFrom}Street`].substring(0, 70);
    }
    if (this[`${pullFrom}City`] && this[`${pullFrom}City`].length > 0) {
      this[`${pullFrom}City`] = this[`${pullFrom}City`].substring(0, 70);
    }
    if (this[`${pullFrom}Country`] && this[`${pullFrom}Country`].length > 0) {
      this[`${pullFrom}Country`] = this[`${pullFrom}Country`].substring(0, 2);
    }
    if (this.remittanceInfo && this.remittanceInfo.length > 0) {
      this.remittanceInfo = utils.filterOutInvalidCharacters(
        this.remittanceInfo.substring(0, 140)
      );
    }

    assertions.assertSepaIdSet1(this.end2endId, 'end2endId'); // should be useless as we filter all invalid chars
    assertions.assert(!isNaN(this.amount), 'amount is not a number');
    assertions.assertRange(this.amount, 0.01, 999999999.99, 'amount');
    assertions.assert(
      this.amount == this.amount.toFixed(2),
      'amount has too many fractional digits'
    );
    assertions.assertLength(this.purposeCode, 1, 4, 'purposeCode');
    assertions.assertSepaIdSet2(this.mandateId, 'mandateId');
    assertions.assertDate(this.mandateSignatureDate, 'mandateSignatureDate');
    assertions.assertIban(this[`${pullFrom}IBAN`], `${pullFrom}IBAN`);
  }

  toXML(document) {
    this.handleSpecialCharsAndValidate();

    const pullFrom =
      this.type === TransactionTypes.Transfer ? 'creditor' : 'debtor';
    const recieverNodeName =
      this.type === TransactionTypes.Transfer ? 'Cdtr' : 'Dbtr';

    const txInf = document.createElementNS(
      document.documentElement.namespaceURI,
      this.type
    );

    const paymentId = containerNode(document, txInf, 'PmtId');
    requiredNode(document, paymentId, 'InstrId', this.id);
    requiredNode(document, paymentId, 'EndToEndId', this.end2endId);

    if (this.type === TransactionTypes.DirectDebit) {
      requiredNode(
        document,
        txInf,
        'InstdAmt',
        this.amount.toFixed(2)
      ).setAttribute('Ccy', this.currency);

      const mandate = containerNode(
        document,
        txInf,
        'DrctDbtTx',
        'MndtRltdInf'
      );
      requiredNode(document, mandate, 'MndtId', this.mandateId);
      requiredNode(
        document,
        mandate,
        'DtOfSgntr',
        this.mandateSignatureDate.toISOString().substr(0, 10)
      );

      if (this.ammendment) {
        requiredNode(document, mandate, 'AmdmntInd', 'true');
        requiredNode(document, mandate, 'AmdmnInfDtls', this.ammendment);
      } else {
        requiredNode(document, mandate, 'AmdmntInd', 'false');
      }
    } else {
      requiredNode(
        document,
        txInf,
        'Amt',
        'InstdAmt',
        this.amount.toFixed(2)
      ).setAttribute('Ccy', this.currency);
    }

    if (this[`${pullFrom}BIC`]) {
      const finInstnId = containerNode(
        document,
        txInf,
        `${recieverNodeName}Agt`,
        'FinInstnId'
      );
      requiredNode(document, finInstnId, 'BIC', this[`${pullFrom}BIC`]);
      optionalNode(
        document,
        finInstnId,
        'PstlAdr',
        'Ctry',
        this[`${pullFrom}Country`]
      );
    } else {
      requiredNode(
        document,
        txInf,
        `${recieverNodeName}Agt`,
        'FinInstnId',
        'Othr',
        'Id',
        'NOTPROVIDED'
      );
    }

    const reciever = containerNode(document, txInf, recieverNodeName);
    requiredNode(document, reciever, 'Nm', this[`${pullFrom}Name`]);

    if (
      this[`${pullFrom}Street`] &&
      this[`${pullFrom}City`] &&
      this[`${pullFrom}Country`]
    ) {
      const pstl = containerNode(document, reciever, 'PstlAdr');
      requiredNode(document, pstl, 'Ctry', this.debtorCountry);
      requiredNode(document, pstl, 'AdrLine', this.debtorStreet);
      requiredNode(document, pstl, 'AdrLine', this.debtorCity);
    }

    requiredNode(
      document,
      txInf,
      `${recieverNodeName}Acct`,
      'Id',
      'IBAN',
      this[`${pullFrom}IBAN`]
    );

    requiredNode(document, txInf, 'RmtInf', 'Ustrd', this.remittanceInfo);
    optionalNode(document, txInf, 'Purp', 'Cd', this.purposeCode);

    return txInf;
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
  return new DOMImplementation().createDocument(nsURI, qname);
}

/**
 * Serializes a dom element or document to string, using either the builtin
 * XMLSerializer or the one from node.js xmldom.
 *
 * @param document         The document or element to serialize
 * @return            The serialized XML document.
 */
function serializeToString(document) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(document);
}

/**
 * Adds a node depending on the path, value and optional parameter
 *
 * @param {XMLDocument} document XML Document to write to
 * @param {any} node Parent node to write in
 * @param {string[]} path Array of path (e.g. ['node', 'child'] -> <node><child /><node/>)
 * @param {string|number} value Last path node content value
 * @param {boolean} optional Whether or not the node should not written if `value` is undefined
 * @returns
 */
function addNode({ document, node, path, value, optional }) {
  if (optional && (!value || value === 0)) {
    return null;
  }

  const lastNode = path.reduce(
    (currentNode, pathPart) =>
      currentNode.appendChild(
        document.createElementNS(
          document.documentElement.namespaceURI,
          pathPart
        )
      ),
    node
  );
  if (value) {
    lastNode.textContent = value;
  }

  return lastNode;
}

module.exports = {
  Document: SepaDocument,
  validateIBAN: utils.validateIBAN,
  checksumIBAN: utils.checksumIBAN,
  validateCreditorID: utils.validateCreditorID,
  checksumCreditorID: utils.checksumCreditorID,
  setIDSeparator,
};
