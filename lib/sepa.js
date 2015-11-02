/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Portions Copyright (C) Philipp Kewisch, 2014-2015 */

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
(function(exports) {
  var XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
  var XSI_NS        = 'urn:iso:std:iso:20022:tech:xsd:';

  var ID_SEPARATOR = '.';
  function setIDSeparator(seperator) {
    ID_SEPARATOR = seperator;
  }

  var VALIDATIONS_ENABLED = true;
  function enableValidations(enabled) {
    VALIDATIONS_ENABLED = !!enabled;
  }

  var SEPATypes = {
    'pain.001.001.02': 'pain.001.001.02',
    'pain.001.003.02': 'pain.001.003.02',
    'pain.001.001.03': 'CstmrCdtTrfInitn',
    'pain.001.003.03': 'CstmrCdtTrfInitn',
    'pain.008.001.01': 'pain.008.001.01',
    'pain.008.003.01': 'pain.008.003.01',
    'pain.008.001.02': 'CstmrDrctDbtInitn',
    'pain.008.003.02': 'CstmrDrctDbtInitn'
  };

  function getPainXMLVersion(painFormat) {
    var inc = painFormat.indexOf('pain.008') === 0 ?  1 : 0;
    return parseInt(painFormat.substr(-2), 10) + inc;
  }

  function SepaDocument(painFormat) {
    this._painFormat = painFormat || 'pain.008.001.02';
    this._type = SEPATypes[painFormat];
    this._paymentInfo = [];
    this.grpHdr = new SepaGroupHeader(this._painFormat);
  }

  SepaDocument.Types = SEPATypes;

  SepaDocument.prototype = {

    /** Pain Format used */
    _painFormat: null,

    /** Group Header object */
    grpHdr: null,

    /** Payment Info array */
    _paymentInfo: [],

    /** SEPA Document type setting, contains the root element */
    _type: null,

    /**
     * Adds a Sepa.PaymentInfo block to this document. Its id will be
     * automatically prefixed with the group header id.
     *
     * @param pi        The payment info block.
     */
    addPaymentInfo: function(pi) {
      if (!(pi instanceof SepaPaymentInfo)) {
        throw new Error('Given payment is not member of the PaymentInfo class');
      }

      if (pi.id) {
        pi.id = this.grpHdr.id + ID_SEPARATOR + pi.id;
      } else {
        pi.id = this.grpHdr.id + ID_SEPARATOR + this._paymentInfo.length;
      }
      this._paymentInfo.push(pi);
    },

    /**
     * Factory method for PI
     */
    createPaymentInfo: function() {
      return new SepaPaymentInfo(this._painFormat);
    },

    /**
     * Normalize fields like the control sum or transaction count. This will be
     * called automatically when serialized to XML.
     */
    normalize: function() {
      var controlSum = 0;
      var txCount = 0;
      for (var i = 0, l = this._paymentInfo.length; i < l; ++i) {
        this._paymentInfo[i].normalize();
        controlSum += this._paymentInfo[i].controlSum;
        txCount += this._paymentInfo[i].transactionCount;
      }
      this.grpHdr.controlSum = controlSum;
      this.grpHdr.transactionCount = txCount;
    },

    /**
     * Serialize this document to a DOM Document.
     *
     * @return      The DOM Document.
     */
    toXML: function() {
      this.normalize();

      var docNS = 'urn:iso:std:iso:20022:tech:xsd:' + this._painFormat;
      var doc = createDocument(docNS, 'Document');
      var body = doc.documentElement;

      body.setAttributeNS(XSI_NAMESPACE, 'xmlns', XSI_NS + this._painFormat);
      body.setAttributeNS(XSI_NAMESPACE, 'xmlns:xsi', XSI_NAMESPACE);
      body.setAttributeNS(XSI_NAMESPACE, 'xsi:schemaLocation', XSI_NS + this._painFormat + ' ' + this._painFormat + '.xsd');
      var rootElement = doc.createElementNS(docNS, this._type);

      rootElement.appendChild(this.grpHdr.toXML(doc));
      for (var i = 0, l = this._paymentInfo.length; i < l; ++i) {
        rootElement.appendChild(this._paymentInfo[i].toXML(doc));
      }

      doc.documentElement.appendChild(rootElement);
      return doc;
    },

    /**
     * Serialize this document to an XML string.
     *
     * @return      The XML string of this document.
     */
    toString: function() {
      return serializeToString(this.toXML());
    }
  };

  /**
   * Wrapper class for the SEPA <GrpHdr> element.
   */
  function SepaGroupHeader(painFormat) {
    this._painFormat = painFormat;
  }

  SepaGroupHeader.prototype = {
    _painFormat: null,

    id: '',
    created: '',
    transactionCount: 0,
    initiatorName: '',
    controlSum: 0,
    batchBooking: false,
    grouping: 'MIXD',

    /*
     * Serialize this document to a DOM Element.
     *
     * @return      The DOM <GrpHdr> Element.
     */
    toXML: function(doc) {
      var r = createXMLHelper(doc, true, true);
      var grpHdr = doc.createElementNS(doc.documentElement.namespaceURI, 'GrpHdr');
      var painVersion = getPainXMLVersion(this._painFormat);

      r(grpHdr, 'MsgId', this.id);
      r(grpHdr, 'CreDtTm', this.created.toISOString());

      // XML v2 formats, add grouping + batch booking nodes
      if (painVersion === 2) {
        r(grpHdr, 'BtchBookg', this.batchBooking.toString());
      }

      r(grpHdr, 'NbOfTxs', this.transactionCount);
      r(grpHdr, 'CtrlSum', this.controlSum.toFixed(2));

      // XML v2 formats, add grouping + batch booking nodes
      if (painVersion === 2) {
        r(grpHdr, 'Grpg', this.grouping);
      }

      r(grpHdr, 'InitgPty', 'Nm', this.initiatorName);

      return grpHdr;
    },

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString: function() {
      return serializeToString(this.toXML());
    }
  };

  var PaymentInfoTypes = {
    DirectDebit: 'DD',
    Transfer:    'TRF'
  };

  /**
   * Wrapper class for the SEPA <PmtInf> Element
   */
  function SepaPaymentInfo(painFormat) {
    this._painFormat = painFormat;
    this.method = painFormat.indexOf('pain.001') === 0 ? PaymentInfoTypes.Transfer : PaymentInfoTypes.DirectDebit;
    this._payments = [];
  }

  SepaPaymentInfo.PaymentInfoTypes = PaymentInfoTypes;

  SepaPaymentInfo.prototype = {
    _painFormat: null,

    /** Transaction array */
    _payments: null,

    id: '',

    /** SEPA payment method. */
    method: null,

    /** If true, booking will appear as one entry on your statement */
    batchBooking: false,

    /** Grouping, defines structure handling for XML file */
    grouping: 'MIXD',

    /** Sum of all payments, will be automatically set */
    controlSum: 0,

    /* Instrumentation code:
     * 'CORE' - Standard Transfer
     * 'COR1' - Expedited Transfer
     * 'B2B'  - Business Transfer
     */
    localInstrumentation: 'CORE',

    /**
     * 'FRST' - First transfer
     * 'RCUR' - Subsequent transfer
     * 'OOFF' - One Off transfer
     * 'FNAL' - Final transfer
     */
    sequenceType: 'FRST',

    /** Requested collection date */
    collectionDate: null,

    /** Execution date of the SEPA order */
    requestedExecutionDate: null,

    /** Id assigned to the creditor */
    creditorId: '',

    /** Name, Address, IBAN and BIC of the creditor */
    creditorName: '',
    creditorStreet: null,
    creditorCity: null,
    creditorCountry: null,
    creditorIBAN: '',
    creditorBIC: '',

    /** Id assigned to the debtor for Transfer payments */
    debtorId: '',

    /** Name, Address, IBAN and BIC of the debtor */
    debtorName: '',
    debtorStreet: null,
    debtorCity: null,
    debtorCountry: null,
    debtorIBAN: '',
    debtorBIC: '',

    /** SEPA order priority, can be HIGH or NORM */
    instructionPriority: 'NORM',

    /** Number of transactions in this payment info block */
    get transactionCount() {
      return this._payments.length;
    },

    /**
     * Normalize fields like the control sum or transaction count. This will
     * _NOT_ be called when serialized to XML and must be called manually.
     */
    normalize: function() {
      var controlSum = 0;
      for (var i = 0, l = this._payments.length; i < l; ++i) {
        controlSum += this._payments[i].amount;
      }
      this.controlSum = controlSum;
    },

    /**
     * Adds a transaction to this payment. The transaction id will be prefixed
     * by the payment info id.
     *
     * @param pmt       The Transacation to add.
     */
    addTransaction: function(pmt) {
      if (!(pmt instanceof SepaTransaction)) {
        throw new Error('Given Transaction is not member of the SepaTransaction class');
      }

      if (pmt.id) {
        pmt.id = this.id + ID_SEPARATOR + pmt.id;
      } else {
        pmt.id = this.id + ID_SEPARATOR + this._payments.length;
      }
      this._payments.push(pmt);
    },

    createTransaction: function() {
      return new SepaTransaction(this._painFormat);
    },

    validate: function() {
      // TODO consider using getters/setters instead
      var pullFrom = this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';

      assert_fixed(this.localInstrumentation, ['CORE', 'COR1', 'B2B'], 'localInstrumentation');
      assert_fixed(this.sequenceType, ['FRST', 'RCUR', 'OOFF', 'FNAL'], 'sequenceType');

      if (this.method === PaymentInfoTypes.DirectDebit) {
        assert_date(this.collectionDate, 'collectionDate');
      }
      else {
        assert_date(this.requestedExecutionDate, 'requestedExecutionDate');
      }

      assert_cid(this[pullFrom + 'Id'], pullFrom + 'Id');

      assert_length(this[pullFrom + 'Name'], null, 70, pullFrom + 'Name');
      assert_length(this[pullFrom + 'Street'], null, 70, pullFrom + 'Street');
      assert_length(this[pullFrom + 'City'], null, 70, pullFrom + 'City');
      assert_length(this[pullFrom + 'Country'], null, 2, pullFrom + 'Country');
      assert_iban(this[pullFrom + 'IBAN'], pullFrom + 'IBAN');
      assert_length(this[pullFrom + 'BIC'], [0,8,11], pullFrom + 'BIC');
      var countryMatches = (this[pullFrom + 'BIC'].length === 0 || this[pullFrom + 'BIC'].substr(4, 2) === this[pullFrom + 'IBAN'].substr(0, 2));
      assert(countryMatches, 'country mismatch in BIC/IBAN');

      assert_length(this._payments.length, 1, null, '_payments');
    },

    /*
     * Serialize this document to a DOM Element.
     *
     * @return      The DOM <PmtInf> Element.
     */
    toXML: function(doc) {
      if (VALIDATIONS_ENABLED) {
        this.validate();
      }

      var n = createXMLHelper(doc, true, false);
      //var o = createXMLHelper(doc, false, true);
      var r = createXMLHelper(doc, true, true);
      var pmtInf = doc.createElementNS(doc.documentElement.namespaceURI, 'PmtInf');

      r(pmtInf, 'PmtInfId', this.id);
      r(pmtInf, 'PmtMtd', this.method);
      // XML v3 formats, add grouping + batch booking nodes
      if (getPainXMLVersion(this._painFormat) === 3) {
        r(pmtInf, 'BtchBookg', this.batchBooking.toString());
        r(pmtInf, 'NbOfTxs', this.transactionCount);
        r(pmtInf, 'CtrlSum', this.controlSum.toFixed(2));
      }

      var pmtTpInf = n(pmtInf, 'PmtTpInf');
      r(pmtTpInf, 'SvcLvl', 'Cd', 'SEPA');
      r(pmtTpInf, 'LclInstrm', 'Cd', this.localInstrumentation);

      if (this.method === PaymentInfoTypes.DirectDebit) {
        r(pmtTpInf, 'SeqTp', this.sequenceType);
        r(pmtInf, 'ReqdColltnDt', this.collectionDate.toISOString().substr(0, 10));
      }
      else {
        r(pmtInf, 'ReqdExctnDt', this.requestedExecutionDate.toISOString().substr(0, 10));
      }

      var pullFrom = this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';
      var emitterNodeName = this.method === PaymentInfoTypes.DirectDebit ? 'Cdtr' : 'Dbtr';
      var emitter = n(pmtInf, emitterNodeName);

      r(emitter, 'Nm', this[pullFrom + 'Name']);
      if (this[pullFrom + 'Street'] && this[pullFrom + 'City'] && this[pullFrom + 'Country']) {
        var pstl = n(emitter, 'PstlAdr');
        r(pstl, 'Ctry', this[pullFrom + 'Country']);
        r(pstl, 'AdrLine', this[pullFrom + 'Street']);
        r(pstl, 'AdrLine', this[pullFrom + 'City']);
      }

      r(pmtInf, emitterNodeName + 'Acct', 'Id', 'IBAN', this[pullFrom + 'IBAN']);
      if (this[pullFrom + 'BIC']) {
        r(pmtInf, emitterNodeName + 'Agt', 'FinInstnId', 'BIC', this[pullFrom + 'BIC']);
      } else {
        r(pmtInf, emitterNodeName + 'Agnt', 'FinInstnId', 'Othr', 'Id', 'NOTPROVIDED');
      }

      r(pmtInf, 'ChrgBr', 'SLEV');

      if (this.method === PaymentInfoTypes.DirectDebit) {
        var creditorScheme = n(pmtInf, 'CdtrSchmeId', 'Id', 'PrvtId', 'Othr');
        r(creditorScheme, 'Id', this.creditorId);
        r(creditorScheme, 'SchmeNm', 'Prtry', 'SEPA');
      }

      for (var i = 0, l = this._payments.length; i < l; ++i) {
        pmtInf.appendChild(this._payments[i].toXML(doc));
      }

      return pmtInf;
    },

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString: function() {
      return serializeToString(this.toXML());
    }
  };

  /**
   * Generic Transaction class
   */
  var TransactionTypes = {
    DirectDebit: 'DrctDbtTxInf',
    Transfer:    'CdtTrfTxInf'
  };

  function SepaTransaction(painFormat) {
    this._painFormat = painFormat;
    this._type = painFormat.indexOf('pain.001') === 0 ? TransactionTypes.Transfer : TransactionTypes.DirectDebit;
  }

  SepaTransaction.TransactionTypes = TransactionTypes;

  SepaTransaction.prototype = {
    /** Generic Transaction Type */
    _type: TransactionTypes.DirectDebit,

    /** The unique transaction id */
    id: '',

    /** The End-To-End id */
    end2endId: '',

    /** The currency to transfer */
    currency: 'EUR',

    /** The amount to transfer */
    amount: 0,

    /** (optional) The purpose code to use */
    purposeCode: null,

    /** The mandate id of the debtor */
    mandateId: '',

    /** The signature date of the mandate */
    mandateSignatureDate: null,

    /** Name, Address, IBAN and BIC of the debtor */
    debtorName: '',
    debtorStreet: null,
    debtorCity: null,
    debtorCountry: null,
    debtorIBAN: '',
    debtorBIC: '',

    /** Unstructured Remittance Info */
    remittanceInfo: '',

    /** Name, Address, IBAN and BIC of the creditor */
    creditorName: '',
    creditorStreet: null,
    creditorCity: null,
    creditorCountry: null,
    creditorIBAN: '',
    creditorBIC: '',

    validate: function() {
      var pullFrom = this._type === TransactionTypes.Transfer ? 'creditor' : 'debtor';

      assert_sepa_id_set1(this.end2endId, 'end2endId');
      assert_range(this.amount, 0.01, 999999999.99, 'amount');
      assert(this.amount == this.amount.toFixed(2), 'amount has too many fractional digits');
      assert_length(this.purposeCode, 1, 4, 'purposeCode');
      assert_sepa_id_set2(this.mandateId, 'mandateId');
      assert_date(this.mandateSignatureDate, 'mandateSignatureDate');

      assert_length(this[pullFrom + 'Name'], null, 70, pullFrom + 'Name');
      assert_length(this[pullFrom + 'Street'], null, 70, pullFrom + 'Street');
      assert_length(this[pullFrom + 'City'], null, 70, pullFrom + 'City');
      assert_length(this[pullFrom + 'Country'], null, 2, pullFrom + 'Country');
      assert_iban(this[pullFrom + 'IBAN'], pullFrom + 'IBAN');
      assert_fixed(this[pullFrom + 'BIC'].length, [0, 8, 11], pullFrom + 'BIC');
      var countryMatches = (this[pullFrom + 'BIC'].length === 0 || this[pullFrom + 'BIC'].substr(4, 2) === this[pullFrom + 'IBAN'].substr(0, 2));
      assert(countryMatches, 'country mismatch in BIC/IBAN');

      assert_length(this.remittanceInfo, null, 140, 'remittanceInfo');
    },

    toXML: function(doc) {
      if (VALIDATIONS_ENABLED) {
        this.validate();
      }

      var pullFrom = this._type === TransactionTypes.Transfer ? 'creditor' : 'debtor';
      var recieverNodeName = this._type === TransactionTypes.Transfer ? 'Cdtr' : 'Dbtr';

      var n = createXMLHelper(doc, true, false);
      var o = createXMLHelper(doc, false, true);
      var r = createXMLHelper(doc, true, true);

      var txInf = doc.createElementNS(doc.documentElement.namespaceURI, this._type);

      var paymentId = n(txInf, 'PmtId');
      r(paymentId, 'InstrId', this.id);
      r(paymentId, 'EndToEndId', this.end2endId);

      if (this._type === TransactionTypes.DirectDebit) {
        r(txInf, 'InstdAmt', this.amount.toFixed(2)).setAttribute('Ccy', this.currency);

        var mandate = n(txInf, 'DrctDbtTx', 'MndtRltdInf');
        r(mandate, 'MndtId', this.mandateId);
        r(mandate, 'DtOfSgntr', this.mandateSignatureDate.toISOString().substr(0, 10));

        if (this.ammendment) {
          r(mandate, 'AmdmntInd', 'true');
          r(mandate, 'AmdmnInfDtls', this.ammendment);
        } else {
          r(mandate, 'AmdmntInd', 'false');
        }
      }
      else {
        r(txInf, 'Amt', 'InstdAmt', this.amount.toFixed(2)).setAttribute('Ccy', this.currency);
      }

      if (this[pullFrom + 'BIC']) {
        r(txInf, recieverNodeName + 'Agt', 'FinInstnId', 'BIC', this[pullFrom + 'BIC']);
      } else {
        r(txInf, recieverNodeName + 'Agt', 'FinInstnId', 'Othr', 'Id', 'NOTPROVIDED');
      }

      var reciever = n(txInf, recieverNodeName);
      r(reciever, 'Nm', this[pullFrom + 'Name']);

      if (this[pullFrom + 'Street'] && this[pullFrom + 'City'] && this[pullFrom + 'Country']) {
        var pstl = n(reciever, 'PstlAdr');
        r(pstl, 'Ctry', this.debtorCountry);
        r(pstl, 'AdrLine', this.debtorStreet);
        r(pstl, 'AdrLine', this.debtorCity);
      }

      r(txInf, recieverNodeName + 'Acct', 'Id', 'IBAN', this[pullFrom + 'IBAN']);

      r(txInf, 'RmtInf', 'Ustrd', this.remittanceInfo);
      o(txInf, 'Purp', 'Cd', this.purposeCode);

      return txInf;
    }
  };

  /**
   * Replace letters with numbers using the SEPA scheme A=10, B=11, ...
   * Non-alphanumerical characters are dropped.
   *
   * @param str     The alphanumerical input string
   * @return        The input string with letters replaced
   */
  function _replaceChars(str) {
    var res = '';
    for (var i = 0, l = str.length; i < l; ++i) {
      var cc = str.charCodeAt(i);
      if (cc >= 65 && cc <= 90) {
        res += (cc - 55).toString();
      } else if (cc >= 97 && cc <= 122) {
        res += (cc - 87).toString();
      } else if (cc >= 48 && cc <= 57) {
        res += str[i];
      }
    }
    return res;
  }

  /**
   * mod97 function for large numbers
   *
   * @param str     The number as a string.
   * @return        The number mod 97.
   */
  function _txtMod97(str) {
    var res = 0;
    for (var i = 0, l = str.length; i < l; ++i) {
      res = (res * 10 + parseInt(str[i], 10)) % 97;
    }
    return res;
  }

  /**
   * Checks if an IBAN is valid (no country specific checks are done).
   *
   * @param iban        The IBAN to check.
   * @return            True, if the IBAN is valid.
   */
  function validateIBAN(iban) {
    var ibrev = iban.substr(4) + iban.substr(0, 4);
    return _txtMod97(_replaceChars(ibrev)) === 1;
  }

  /**
   * Calculates the checksum for the given IBAN. The input IBAN should pass 00
   * as the checksum digits, a full iban with the corrected checksum will be
   * returned.
   *
   * Example: DE00123456781234567890 -> DE87123456781234567890
   *
   * @param iban        The IBAN to calculate the checksum for.
   * @return            The corrected IBAN.
   */
  function checksumIBAN(iban) {
    var ibrev = iban.substr(4) + iban.substr(0, 2) + '00';
    var mod = _txtMod97(_replaceChars(ibrev));
    return iban.substr(0, 2) + ('0' + (98 - mod)).substr(-2,2) + iban.substr(4);
  }

  /**
   * Checks if a Creditor ID is valid (no country specific checks are done).
   *
   * @param iban        The Creditor ID to check.
   * @return            True, if the Creditor IDis valid.
   */
  function validateCreditorID(cid) {
    var cidrev = cid.substr(7) + cid.substr(0, 4);
    return _txtMod97(_replaceChars(cidrev)) === 1;
  }

  /**
   * Calculates the checksum for the given Creditor ID . The input Creditor ID
   * should pass 00 as the checksum digits, a full Creditor ID with the
   * corrected checksum will be returned.
   *
   * Example: DE00ZZZ09999999999 -> DE98ZZZ09999999999
   *
   * @param iban        The IBAN to calculate the checksum for.
   * @return            The corrected IBAN.
   */
  function checksumCreditorID(cid) {
    var cidrev = cid.substr(7) + cid.substr(0, 2) + '00';
    var mod = _txtMod97(_replaceChars(cidrev));
    return cid.substr(0, 2) + ('0' + (98 - mod)).substr(-2,2) + cid.substr(4);
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
      throw new Error(member + ' must have any value of: ' + choices.join(' ') + '(found: ' + val + ')');
    }
  }

  /** assert that |str| has a length between min and max (either may be null) */
  function assert_length(str, min, max, member) {
    if ((min !== null && str && str.length < min) ||
        (max !== null && str && str.length > max)) {
      throw new Error(member + ' has invalid string length, expected ' + min + ' < ' + str + ' < ' + max);
    }
  }

  /** assert that |num| is in the range between |min| and |max| */
  function assert_range(num, min, max, member) {
    if (num < min || num > max) {
      throw new Error(member + ' does not match range ' + min + ' < ' + num + ' < ' + max);
    }
  }

  /** assert that |str| is an IBAN */
  function assert_iban(str,  member) {
    if (!validateIBAN(str)) {
      throw new Error(member + ' has invalid IBAN "' + str + '"');
    }
  }

  /** assert that |str| is a creditor id */
  function assert_cid(str, member) {
    if (!validateCreditorID(str)) {
      throw new Error(member + ' is invalid "' + str + '"');
    }
  }

  /** assert an iso date */
  function assert_date(dt, member) {
    if (!dt || isNaN(dt.getTime())) {
      throw new Error(member + ' has invalid date ' + dt);
    }
  }

  /** assert that the str uses characters from the first sepa id charset */
  function assert_sepa_id_set1(str, member) {
    if (str && !str.match(/([A-Za-z0-9]|[\+|\?|\/|\-|:|\(|\)|\.|,|'| ]){1,35}/)) {
      throw new Error(member + ' doesn\'t match sepa id charset type 1 (found: ' + '"' + str + '")');
    }
  }

  /** assert that the str uses characters from the second sepa id charset */
  function assert_sepa_id_set2(str, member) {
    if (str && !str.match(/([A-Za-z0-9]|[\+|\?|\/|\-|:|\(|\)|\.|,|']){1,35}/)) {
      throw new Error(member + ' doesn\'t match sepa id charset type 2 (found: ' + '"' + str + '")');
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
    if (typeof document !== 'undefined' && typeof document.implementation !== 'undefined') {
      return document.implementation.createDocument(nsURI, qname);
    } else {
      var DOMImplementation = require('xmldom').DOMImplementation;
      return new DOMImplementation().createDocument(nsURI, qname);
    }
  }

  /**
   * Serializes a dom element or document to string, using either the builtin
   * XMLSerializer or the one from node.js xmldom.
   *
   * @param doc         The document or element to serialize
   * @return            The serialized XML document.
   */
  function serializeToString(doc) {
    var s;
    if (typeof window === 'undefined') {
      var XMLSerializer = require('xmldom').XMLSerializer;
      s = new XMLSerializer();
    } else {
      s = new window.XMLSerializer();
    }
    return s.serializeToString(doc);
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
   *  var n = createXMLHelper(doc, true, false);
   *
   *  // This helper creates a node with an optional value. If the value is
   *  // null, then the node is not added to the parent.
   *  // Usage: o(rootNode, 'foo', 'bar', myValue)
   *  // Result (if myValue is not null): <root><foo><bar>myValue</bar></foo></root>
   *  var o = createXMLHelper(doc, false, true);
   *
   *  // This helper creates a node with a required value. It is added
   *  // regardless of if its null or not.
   *  // Usage: r(rootNode, 'foo', 'bar', myValue)
   *  // Result: <root><foo><bar>myValue</bar></foo></root>
   *  var r = createXMLHelper(doc, true, true);
   *
   * @param doc         The document to create nodes with
   * @param required    If false, nodes with null values will not be added to the parent.
   * @param withVal     If true, the last parameter of the returned function is set as textContent.
   */
  function createXMLHelper(doc, required, withVal) {
    return function() {
      var node = arguments[0];
      var val = withVal && arguments[arguments.length - 1];
      var maxarg = (withVal ? arguments.length - 1 : arguments.length);

      if (required || val || val === 0) {
        for (var i = 1; i < maxarg; ++i) {
          node = node.appendChild(doc.createElementNS(doc.documentElement.namespaceURI, arguments[i]));
        }
        if (withVal) {
          node.textContent = val;
        }
        return node;
      } else {
        return null;
      }
    };
  }

  // --- Module Exports follow --- //

  exports.Document               = SepaDocument;
  exports.validateIBAN           = validateIBAN;
  exports.checksumIBAN           = checksumIBAN;
  exports.validateCreditorID     = validateCreditorID;
  exports.checksumCreditorID     = checksumCreditorID;
  exports.setIDSeparator         = setIDSeparator;
  exports.enableValidations      = enableValidations;

})(typeof exports === 'undefined' ? this.SEPA = {} : exports);
