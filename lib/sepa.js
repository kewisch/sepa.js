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
  var DEFAULT_XML_VERSION   = '1.0';
  var DEFAULT_XML_ENCODING  = 'UTF-8';
  var DEFAULT_PAIN_FORMAT   = 'pain.008.001.02';

  var ID_SEPARATOR = '.';
  function setIDSeparator(seperator) {
    ID_SEPARATOR = seperator;
  }

  var VALIDATIONS_ENABLED = true;
  var CHARSET_VALIDATION_ENABLED = true;
  /**
   * Controls the validation that is conducted when SepaDocuments are serialized.
   *
   * @param {boolean} enabled - Whether the validation should be conducted
   * @param {boolean} [charsetValidationsEnabled=true] - If validation is enabled, whether fields
   *    should be checked for the limited SEPA character set. You want to set this to false, e.g.,
   *    if you are using this library to handle communication within Greece or Finnland, where
   *    more characters are allowed.
   */
  function enableValidations(enabled, charsetValidationsEnabled = true) {
    VALIDATIONS_ENABLED = !!enabled;
    CHARSET_VALIDATION_ENABLED = !!charsetValidationsEnabled;
  }

  const SEPATypes = {
    'pain.001.001.02': 'pain.001.001.02',
    'pain.001.001.03': 'CstmrCdtTrfInitn',
    'pain.001.001.08': 'CstmrCdtTrfInitn',
    'pain.001.001.09': 'CstmrCdtTrfInitn',
    'pain.008.001.02': 'CstmrDrctDbtInitn',
    'pain.008.001.08': 'CstmrDrctDbtInitn',
  };

  function getPainXMLVersion(painFormat) {
    var inc = painFormat.indexOf('pain.008') === 0 ?  1 : 0;
    return parseInt(painFormat.substr(-2), 10) + inc;
  }

  /**
   * Check if the code point is a valid xml 1.0 character.
   * The list of rules has been taken from Wikipedia.
   * @param codePoint {number}
   * @returns {boolean}
   */
  function _isValidXmlCodepoint(codePoint) {
    // Specific C0 Controls (Whitespace)
    if (codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D) {
      return true;
    }

    // Basic multilingual plane without some non-characters
    if (codePoint >= 0x20 && codePoint <= 0xD7FF) {
      return true;
    }
    if (codePoint >= 0xE000 && codePoint <= 0xFFFD) {
      return true;
    }

    // Supplementary Planes
    if (codePoint >= 0x10000 && codePoint <= 0x10FFFF) {
      return true;
    }

    // All other code points are not allowed.
    return false;
  }

  /**
   * @param text {string}
   * @returns {boolean}
   * @private
   */
  function _isValidXmlString(text) {
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (!_isValidXmlCodepoint(codePoint)) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param text {string}
   * @private
   */
  function _escapeStringForXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Checks if a string is a valid XML identifier that can be used for element and attribute names.
   * @param {string} str
   * @returns {boolean}
   */
  function _isValidXmlName(str) {
    // Check if the string is empty
    if (!str || typeof str !== 'string') {
      return false;
    }

    // Check the first character: must be a letter, underscore, or colon
    const firstChar = str.charAt(0);
    if (!/^[a-zA-Z_:]$/.test(firstChar)) {
      return false;
    }

    // xml is a reserved word. We allow xmlns though
    if (str.toLowerCase().startsWith('xml') && !str.toLowerCase().startsWith('xmlns')) {
      return false;
    }

    // Check subsequent characters: letters, digits, hyphen, underscore, period, or colon
    const validSubsequentChars = /^[a-zA-Z0-9\-._:]+$/;
    if (!validSubsequentChars.test(str)) {
      return false;
    }

    return true;
  }

  /**
   * Class to construct a graph of xml nodes.
   *
   * Important: It is not a generic xml builder and should not be used outside of this library.
   *
   * @private
   */
  class _SepaXmlNode {

    /**
     * @type {string}
     * @private
     */
    _name;

    /**
     * @type {string}
     * @private
     */
    _namespace;

    /**
     * @type {Object<string,string|number|boolean>}
     * @private
     */
    _attributes;

    /**
     * @type {_SepaXmlNode[]}
     * @private
     */
    _children;

    /**
     * @type {string}
     * @private
     */
    _text;

    /**
     * @param name {string}
     * @param text {string}
     * @param attributes {Object<string, string|number|boolean>}
     */
    constructor(name, text= '', attributes = {}) {
      if (!_isValidXmlName(name)) {
        throw new Error(`Not a valid xml element name: '${name}'`);
      }
      this._name = name;
      this._children = [];
      this.setText(text);
      this._attributes = {};
      for (const key of Object.keys(attributes)) {
        this.setAttribute(key, attributes[key]);
      }
    }

    /**
     *  Set the text content on the node.
     *  Careful: setting text is only supported for leaf nodes.
     *  @param value {string}
     */
    setText(value) {
      if (!_isValidXmlString(value)) {
        throw new Error(`Not a valid xml element text: '${value}'`);
      }

      this._text = value;
    }

    /**
     * Sets an attribute on the element.
     * @param {string} key - The attribute name.
     * @param {string|number|boolean} value - The attribute value.
     */
    setAttribute(key, value) {
      if (!_isValidXmlName(key)) {
        throw new Error(`Invalid attribute name: '${key}'`);
      }
      if (!_isValidXmlString(String(value))) {
        throw new Error(`Invalid attribute value given for ${key}: '${value}'`);
      }

      this._attributes[key] = value;
    }

    /**
     * Append a child.
     * @param child {_SepaXmlNode}
     */
    appendChild(child) {
      this._children.push(child);
    }

    /**
     * Generates the XML string representation of this element.
     * @param {number} indentation - The current level of indentation. One level of indentation is 4 spaces.
     * @param {boolean} prettyPrint - Whether to add indentation and newlines to make the output more human-readable.
     * @returns {string} String representation of this xml node and its children.
     */
    toString(indentation = 0, prettyPrint = false) {
      const indent = prettyPrint ? ' '.repeat(indentation * 4) : '';
      const newline = prettyPrint ? '\n' : '';

      const hasChildren = this._children.length > 0;
      const hasText = this._text !== '';

      const attributesString = this._buildAttributesString();
      // If we have no children, we return a self-closing tag.
      if (!hasChildren && !hasText) {
        return `${indent}<${(this._name)}${attributesString}/>${newline}`;
      }

      let openingTag = `<${(this._name)}${attributesString}>`;
      let closingTag = `</${(this._name)}>`;

      // If we have no children, we put opening and closing tags on the same line.
      if (!hasChildren && hasText) {
        return indent + openingTag + _escapeStringForXml(this._text) + closingTag + newline;
      }

      if (hasChildren && hasText) {
        throw new Error(`Node ${this._name} has children *and* text. This is not supported.`);
      }

      let childrenString = '';
      for (const child of this._children) {
        childrenString += child.toString(indentation + 1, prettyPrint);
      }

      return indent + openingTag + newline + childrenString + indent + closingTag + newline;
    }

    _buildAttributesString() {
      let result = '';

      for (const key of Object.keys(this._attributes)) {
        const value = this._attributes[key];
        result += ` ${key}="${_escapeStringForXml(value)}"`;
      }

      return result;
    }
  }

  /**
   * Ctor.
   * @param {string} painFormat
   * @constructor
   */
  function SepaDocument(painFormat = DEFAULT_PAIN_FORMAT) {
    if (!(painFormat in SEPATypes)) {
      throw new Error('Pain format "' + painFormat + '" is not supported');
    }

    this._painFormat = painFormat;
    this._type = SEPATypes[this._painFormat];
    this._paymentInfo = [];
    this._xmlVersion = DEFAULT_XML_VERSION;
    this._xmlEncoding = DEFAULT_XML_ENCODING;
    this.grpHdr = new SepaGroupHeader(this._painFormat);
  }

  SepaDocument.Types = SEPATypes;

  SepaDocument.prototype = {

    /** Pain Format used */
    _painFormat: null,

    /**
    * Group Header object.
    * @type {SepaGroupHeader}
    */
    grpHdr: null,

    /**
     * Payment Info array
     * @type {SepaPaymentInfo[]}
     */
    _paymentInfo: [],

    /** SEPA Document type setting, contains the root element */
    _type: null,

    /** Xml version */
    _xmlVersion: null,

    /** Xml encoding */
    _xmlEncoding: null,

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

    _toXml: function() {
      this.normalize();

      const namespace = XSI_NS + this._painFormat;
      const document = new _SepaXmlNode('Document');

      // set default namespace
      document.setAttribute('xmlns', namespace);

      document.setAttribute('xmlns:xsi', XSI_NAMESPACE);
      document.setAttribute('xsi:schemaLocation', `${XSI_NS}${this._painFormat} ${this._painFormat}.xsd`);
      const root = new _SepaXmlNode(this._type);

      root.appendChild(this.grpHdr._toXml());

      for (let i = 0, l = this._paymentInfo.length; i < l; ++i) {
        root.appendChild(this._paymentInfo[i]._toXml());
      }

      document.appendChild(root);
      return document;
    },

    /**
     * Serialize this document to an XML string.
     *
     * @return String     The XML string of this document.
     */
    toString: function() {
      const doc = this._toXml();
      // as some banks require the document declaration string and it is not provided by the XMLSerializer, it is added here.
      const docDeclaration = '<?xml version="' + this._xmlVersion + '" encoding="' + this._xmlEncoding + '"?>';
      return docDeclaration + doc.toString();
    }
  };

  /**
   * Wrapper class for the SEPA <GrpHdr> element.
   */
  function SepaGroupHeader(painFormat) {
    this._painFormat = painFormat;
  }

  /**
   * Add nested children to the given parent.
   * Parent will receive children with the names in childrenNames.
   * The child node will have valueForLastChild set as text content.
   * @param parent {_SepaXmlNode}
   * @param childrenNames {string[]}
   * @param valueForLastChild {string | null}
   * @returns {_SepaXmlNode} The last child.
   * @private
   */
  function _addNestedChildren(parent, childrenNames, valueForLastChild = null) {
    let child = null;
    let currentParent = parent;
    for (const childName of childrenNames) {
      child = new _SepaXmlNode(childName);
      currentParent.appendChild(child);
      currentParent = child;
    }
    if (valueForLastChild) {
      child.setText(valueForLastChild);
    }
    return child;
  }

  /**
   * @param parent {_SepaXmlNode}
   * @param childName {string}
   * @param value {string|null}
   * @returns {_SepaXmlNode}
   * @private
   */
  function _addSingleChild(parent, childName, value = null) {
    const newNode = new _SepaXmlNode(childName);
    if (value) {
      newNode.setText(value);
    }
    parent.appendChild(newNode);
    return newNode;
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

    /**
     * Serialize this document to an XML tree.
     *
     * @returns {_SepaXmlNode} generated XML tree.
     */
    _toXml: function() {
      const result = new _SepaXmlNode('GrpHdr');
      _addSingleChild(result, 'MsgId', this.id);
      _addSingleChild(result, 'CreDtTm', toLocalDateTimeString(this.created));

      const painVersion = getPainXMLVersion(this._painFormat);
      // XML >= v2 formats, add batch booking nodes
      if (painVersion === 2) {
        _addSingleChild(result, 'BtchBookg', this.batchBooking.toString());
      }

      _addSingleChild(result, 'NbOfTxs', this.transactionCount.toString());
      _addSingleChild(result, 'CtrlSum', this.controlSum.toFixed(2));

      // XML v2 formats, add grouping booking nodes
      if (painVersion === 2) {
        _addSingleChild(result, 'Grpg', this.grouping);
      }

      _addNestedChildren(result, ['InitgPty', 'Nm'], this.initiatorName);

      return result;
    },

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString: function() {
      return this._toXml().toString();
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

    /**
     * Transaction array.
     * @type {SepaTransaction[]}
     */
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

    /** @deprecated Use transaction-level amendment.originalCreditorSchemeId instead.
     * Original creditor id (for backward compatibility - will be applied only to first transaction without explicit amendment)
     */
    originalCreditorId: null,

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

      // Backward compatibility: apply originalCreditorId only to first transaction
      if (this._payments.length === 0 && this.originalCreditorId && !pmt.amendment) {
        pmt._paymentInfoOriginalCreditorId = this.originalCreditorId;
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

      if (this[pullFrom + 'Id']) {
        assert_cid(this[pullFrom + 'Id'], pullFrom + 'Id');
      }

      // Backward compatibility: validate originalCreditorId if provided
      if (this.originalCreditorId) {
        assert_cid(this.originalCreditorId, 'originalCreditorId');
      }

      assert_length(this[pullFrom + 'Name'], null, 70, pullFrom + 'Name');
      assert_length(this[pullFrom + 'Street'], null, 70, pullFrom + 'Street');
      assert_length(this[pullFrom + 'City'], null, 70, pullFrom + 'City');
      assert_length(this[pullFrom + 'Country'], null, 2, pullFrom + 'Country');
      assert_iban(this[pullFrom + 'IBAN'], pullFrom + 'IBAN');
      assert_length(this[pullFrom + 'BIC'], [0,8,11], pullFrom + 'BIC');
      var countryMatches = (this[pullFrom + 'BIC'].length === 0 || this[pullFrom + 'BIC'].substr(4, 2) === this[pullFrom + 'IBAN'].substr(0, 2));
      var includedTerritoryCodes = {
        'FI': ['AX'],
        'FR': [ 'GF', 'GP', 'MQ', 'RE', 'PF', 'TF', 'YT', 'NC', 'BL', 'MF', 'PM', 'WF'],
        'GB': ['IM', 'JE', 'GG']
      };
      var countryIncludesOtherTerritory = Object.keys(includedTerritoryCodes).includes(this[pullFrom + 'IBAN'].substr(0, 2));
      countryMatches = countryMatches || countryIncludesOtherTerritory && includedTerritoryCodes[this[pullFrom + 'IBAN'].substr(0, 2)].includes(this[pullFrom + 'BIC'].substr(4, 2));
      assert(countryMatches, 'country mismatch in BIC/IBAN');

      assert_length(this._payments.length, 1, null, '_payments');
    },

    _toXml: function() {
      if (VALIDATIONS_ENABLED) {
        this.validate();
      }

      // Deprecation warning for originalCreditorId at PaymentInfo level
      if (this.originalCreditorId && typeof console !== 'undefined' && console.warn) {
        console.warn('DEPRECATION WARNING: paymentInfo.originalCreditorId is deprecated. ' +
            'Use transaction.amendment = { originalCreditorSchemeId: "..." } instead. ' +
            'The payment-level originalCreditorId will be applied only to the first transaction without an explicit amendment.');
      }

      const pmtInf = new _SepaXmlNode('PmtInf');
      _addSingleChild(pmtInf, 'PmtInfId', this.id);
      _addSingleChild(pmtInf, 'PmtMtd', this.method);

      // XML v3 formats, add grouping + batch booking nodes
      if (getPainXMLVersion(this._painFormat) >= 3) {
        _addSingleChild(pmtInf, 'BtchBookg', this.batchBooking.toString());
        _addSingleChild(pmtInf, 'NbOfTxs', this.transactionCount.toString());
        _addSingleChild(pmtInf, 'CtrlSum', this.controlSum.toFixed(2));
      }

      const pmtTpInf = _addSingleChild(pmtInf, 'PmtTpInf');
      _addNestedChildren(pmtTpInf, ['SvcLvl', 'Cd'], 'SEPA');

      if (this.method === PaymentInfoTypes.DirectDebit) {
        _addNestedChildren(pmtTpInf, ['LclInstrm', 'Cd'], this.localInstrumentation);
        _addNestedChildren(pmtTpInf, ['SeqTp'], this.sequenceType);
        _addNestedChildren(pmtInf, ['ReqdColltnDt'], toLocalCalendarDateString(this.collectionDate));
      }
      else {
        const executionDate = toLocalCalendarDateString(this.requestedExecutionDate);
        if (getPainXMLVersion(this._painFormat) >= 8) {
          _addNestedChildren(pmtInf, ['ReqdExctnDt', 'Dt'], executionDate);
        } else {
          _addNestedChildren(pmtInf, ['ReqdExctnDt'], executionDate);
        }
      }

      const pullFrom = this.method === PaymentInfoTypes.DirectDebit ? 'creditor' : 'debtor';
      const emitterNodeName = this.method === PaymentInfoTypes.DirectDebit ? 'Cdtr' : 'Dbtr';
      const emitter = _addSingleChild(pmtInf, emitterNodeName);

      _addSingleChild(emitter, 'Nm', this[pullFrom + 'Name']);

      if (this[pullFrom + 'Street'] && this[pullFrom + 'City'] && this[pullFrom + 'Country']) {
        const pstl = _addSingleChild(emitter, 'PstlAdr');
        _addSingleChild(pstl,'Ctry', this[pullFrom + 'Country']);
        _addSingleChild(pstl,'AdrLine', this[pullFrom + 'Street']);
        _addSingleChild(pstl,'AdrLine', this[pullFrom + 'City']);
      }

      _addNestedChildren(pmtInf, [emitterNodeName + 'Acct', 'Id', 'IBAN'], this[pullFrom + 'IBAN']);

      if (this[pullFrom + 'BIC']) {
        const bicNodeName = getPainXMLVersion(this._painFormat) >= 8 ? 'BICFI' : 'BIC';
        _addNestedChildren(pmtInf, [emitterNodeName + 'Agt', 'FinInstnId', bicNodeName], this[pullFrom + 'BIC']);
      } else {
        _addNestedChildren(pmtInf, [emitterNodeName + 'Agt', 'FinInstnId', 'Othr', 'Id'], 'NOTPROVIDED');
      }

      _addSingleChild(pmtInf, 'ChrgBr', 'SLEV');

      if (this.method === PaymentInfoTypes.DirectDebit) {
        const othr = _addNestedChildren(pmtInf, ['CdtrSchmeId', 'Id', 'PrvtId', 'Othr']);
        _addSingleChild(othr, 'Id', this.creditorId);
        _addNestedChildren(othr, ['SchmeNm', 'Prtry'], 'SEPA');
      }

      for (let i = 0, l = this._payments.length; i < l; ++i) {
        pmtInf.appendChild(this._payments[i]._toXml());
      }

      return pmtInf;
    },

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString: function() {
      return this._toXml().toString();
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

    /** Structured Remittance Info */
    structuredRemittanceInfo: {
      typeCode: '',
      issuer: '',
      reference: ''
    },

    /** Amendment information for mandate changes */
    amendment: null,

    /** Name, Address, IBAN and BIC of the creditor */
    creditorName: '',
    creditorStreet: null,
    creditorCity: null,
    creditorCountry: null,
    creditorIBAN: '',
    creditorBIC: '',

    validate: function() {
      var pullFrom = this._type === TransactionTypes.Transfer ? 'creditor' : 'debtor';

      assert_valid_sepa_id(this.end2endId, 35, 'end2endId', CHARSET_VALIDATION_ENABLED);
      assert_range(this.amount, 0.01, 999999999.99, 'amount');
      assert(this.amount == this.amount.toFixed(2), 'amount has too many fractional digits');
      assert_length(this.purposeCode, 1, 4, 'purposeCode');

      if(this._type === TransactionTypes.DirectDebit) {
        assert_valid_sepa_id(this.mandateId, 35, 'mandateId', CHARSET_VALIDATION_ENABLED);
        assert_date(this.mandateSignatureDate, 'mandateSignatureDate');
      }

      assert_length(this[pullFrom + 'Name'], null, 70, pullFrom + 'Name');
      assert_length(this[pullFrom + 'Street'], null, 70, pullFrom + 'Street');
      assert_length(this[pullFrom + 'City'], null, 70, pullFrom + 'City');
      assert_length(this[pullFrom + 'Country'], null, 2, pullFrom + 'Country');
      assert_iban(this[pullFrom + 'IBAN'], pullFrom + 'IBAN');
      assert_fixed(this[pullFrom + 'BIC'].length, [0, 8, 11], pullFrom + 'BIC');
      var countryMatches = (this[pullFrom + 'BIC'].length === 0 || this[pullFrom + 'BIC'].substr(4, 2) === this[pullFrom + 'IBAN'].substr(0, 2));
      var includedTerritoryCodes = {
        'FI': ['AX'],
        'FR': [ 'GF', 'GP', 'MQ', 'RE', 'PF', 'TF', 'YT', 'NC', 'BL', 'MF', 'PM', 'WF'],
        'GB': ['IM', 'JE', 'GG']
      };
      var countryIncludesOtherTerritory = Object.keys(includedTerritoryCodes).includes(this[pullFrom + 'IBAN'].substr(0, 2));
      countryMatches = countryMatches || countryIncludesOtherTerritory && includedTerritoryCodes[this[pullFrom + 'IBAN'].substr(0, 2)].includes(this[pullFrom + 'BIC'].substr(4, 2));
      assert(countryMatches, 'country mismatch in BIC/IBAN');

      assert_length(this.remittanceInfo, null, 140, 'remittanceInfo');

      // validate structured remittance information
      if (this.structuredRemittanceInfo.reference) {
        assert_length(this.structuredRemittanceInfo.typeCode, null, 35, 'typeCode');
        assert_length(this.structuredRemittanceInfo.issuer, null, 35, 'issuer');
        assert_length(this.structuredRemittanceInfo.reference, null, 35, 'reference');
      }

      // validate amendment information
      if (this.amendment) {
        if (this.amendment.originalCreditorSchemeId) {
          assert_cid(this.amendment.originalCreditorSchemeId, 'amendment.originalCreditorSchemeId');
        }
      }

    },

    _toXml: function() {
      if (VALIDATIONS_ENABLED) {
        this.validate();
      }

      const pullFrom = this._type === TransactionTypes.Transfer ? 'creditor' : 'debtor';
      const receiverNodeName = this._type === TransactionTypes.Transfer ? 'Cdtr' : 'Dbtr';

      const txInf = new _SepaXmlNode(this._type);

      const pmtId = _addSingleChild(txInf, 'PmtId');
      _addSingleChild(pmtId,'InstrId', this.id);
      _addSingleChild(pmtId,'EndToEndId', this.end2endId);

      if (this._type === TransactionTypes.DirectDebit) {
        _addSingleChild(txInf,'InstdAmt', this.amount.toFixed(2))
          .setAttribute('Ccy', this.currency);

        const mandate = _addNestedChildren(txInf, ['DrctDbtTx', 'MndtRltdInf']);
        _addSingleChild(mandate, 'MndtId', this.mandateId);
        _addSingleChild(mandate, 'DtOfSgntr', toLocalCalendarDateString(this.mandateSignatureDate));

        // Add amendment information - always include AmdmntInd to indicate amendment status
        // Amendment is automatically detected from the presence of originalCreditorSchemeId
        // Backward compatibility: use stored _paymentInfoOriginalCreditorId if no transaction-level amendment
        const effectiveOriginalCreditorId = (this.amendment && this.amendment.originalCreditorSchemeId)
          ? this.amendment.originalCreditorSchemeId
          : this._paymentInfoOriginalCreditorId;

        if (effectiveOriginalCreditorId) {
          _addSingleChild(mandate, 'AmdmntInd', 'true');

          const other = _addNestedChildren(mandate, ['AmdmntInfDtls', 'OrgnlCdtrSchmeId', 'Id', 'PrvtId', 'Othr']);

          // Add original creditor scheme ID (for ICS migration)
          _addSingleChild(other, 'Id', effectiveOriginalCreditorId);
          _addNestedChildren(other, ['SchmeNm', 'Prtry'], 'SEPA');
        } else {
          // Explicitly set to false when no amendment (bank compatibility)
          _addSingleChild(mandate, 'AmdmntInd', 'false');
        }
      }
      else {  // not DirectDebit
        _addNestedChildren(txInf, ['Amt', 'InstdAmt'], this.amount.toFixed(2))
          .setAttribute('Ccy', this.currency);
      }

      if (this[pullFrom + 'BIC']) {
        const bicNodeName = getPainXMLVersion(this._painFormat) >= 8 ? 'BICFI' : 'BIC';
        _addNestedChildren(txInf, [receiverNodeName + 'Agt', 'FinInstnId', bicNodeName], this[pullFrom + 'BIC']);
      } else {
        // If no BIC is provided and we have a DirectDebit document, we must set Othr/Id to NOTPROVIDED
        // If we have a Transfer document, we must skip the agent element (cf. https://github.com/kewisch/sepa.js/issues/207)
        if (this._type === TransactionTypes.DirectDebit) {
          _addNestedChildren(txInf, [receiverNodeName + 'Agt', 'FinInstnId', 'Othr', 'Id'], 'NOTPROVIDED');
        }
      }

      const receiver = _addSingleChild(txInf, receiverNodeName);
      _addSingleChild(receiver, 'Nm', this[pullFrom + 'Name']);

      if (this[pullFrom + 'Street'] && this[pullFrom + 'City'] && this[pullFrom + 'Country']) {
        const pstlAdr = _addSingleChild(receiver, 'PstlAdr');
        _addSingleChild(pstlAdr, 'Ctry', this[pullFrom + 'Country']);
        _addSingleChild(pstlAdr, 'AdrLine', this[pullFrom + 'Street']);
        _addSingleChild(pstlAdr, 'AdrLine', this[pullFrom + 'City']);
      }

      _addNestedChildren(txInf, [receiverNodeName + 'Acct', 'Id', 'IBAN'], this[pullFrom + 'IBAN']);

      const remittance = _addSingleChild(txInf, 'RmtInf');
      if (this.structuredRemittanceInfo.reference) {
        const cdorPrtry = _addNestedChildren(remittance, ['Strd', 'CdtrRefInf', 'Tp', 'CdorPrtry']);
        _addSingleChild(cdorPrtry, 'Cd', this.structuredRemittanceInfo.typeCode);
        _addSingleChild(cdorPrtry, 'Issr', this.structuredRemittanceInfo.issuer);
        _addSingleChild(cdorPrtry, 'Ref', this.structuredRemittanceInfo.reference);
      } else {
        _addSingleChild(remittance, 'Ustrd', this.remittanceInfo);
      }

      if (this.purposeCode) {
        _addNestedChildren(txInf, ['Purp', 'Cd'], this.purposeCode);
      }

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
   * Checks whether the given ascii code corresponds to an uppercase letter
   *
   * @param {number} charCode
   */
  function isUppercaseLetter(charCode) {
    return (charCode >= 65 && charCode <= 90);
  }

  /**
   * Checks whether the given ascii code corresponds to a digit
   *
   * @param {number} charCode
   */
  function isDigit(charCode) {
    return charCode >= 48 && charCode <= 57;
  }

  /**
   * Checks if an IBAN is valid (no country specific checks are done).
   *
   * @param iban        The IBAN to check.
   * @return            True, if the IBAN is valid.
   */
  function validateIBAN(iban) {
    // the first two positions are used for the country code and must be letters
    if (!isUppercaseLetter(iban.charCodeAt(0)) || !isUppercaseLetter(iban.charCodeAt(1))) {
      return false;
    }
    // positions three and four are used for the checksum and must be digits
    if (!isDigit(iban.charCodeAt(2)) || !isDigit(iban.charCodeAt(3))) {
      return false;
    }
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
  function assert_iban(str, member) {
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

  /**
   * Checks whether the given string is a valid SEPA id.
   *
   * @param {string} str - The id to check
   * @param {number} maxLength - The maximum length of the id
   * @param {string} member - The name of the field that is validated
   * @param {boolean} validateCharset - If the character set should be validated
   */
  function assert_valid_sepa_id(str, maxLength, member, validateCharset) {
    assert_length(str, null, maxLength, member);

    if (validateCharset) {
      if (str && !str.match(/([A-Za-z0-9]|[+|?|/|\-|:|(|)|.|,|' ]){1,35}/)) {
        throw new Error(`${member} contains characters which are not in the SEPA character set (found: "${str}")`);
      }
    }

    if (str && str.length > 1 && str.charAt(0) === '/') {
      throw new Error(`${member} is an id and hence must not start with a "/". (found "${str}"`);
    }

    if (str && str.match(/\/\//)) {
      throw new Error(`${member} is an id and hence must not contain "//". (found "${str}"`);
    }
  }

  /**
   * Formats the date as an ISO 8601 calendar date string without a timezone. (YYYY-MM-DD)
   *
   * @param date {Date} The date to convert.
   */
  function toLocalCalendarDateString(date) {
    const year = String(date.getFullYear()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Formats the date as an ISO 8601 date-time string without a timezone. (YYYY-MM-DD'T'HH:MM:SS)
   *
   * @param date {Date} The date to convert.
   */
  function toLocalDateTimeString(date) {
    const calendarDate = toLocalCalendarDateString(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${calendarDate}T${hours}:${minutes}:${seconds}`;
  }

  // --- Module Exports follow --- //

  exports.Document               = SepaDocument;
  exports.validateIBAN           = validateIBAN;
  exports.checksumIBAN           = checksumIBAN;
  exports.validateCreditorID     = validateCreditorID;
  exports.checksumCreditorID     = checksumCreditorID;
  exports.setIDSeparator         = setIDSeparator;
  exports.enableValidations      = enableValidations;

  // exported for unit tests but should not be used outside of this library.
  exports._SepaXmlNode            = _SepaXmlNode;

})(typeof exports === 'undefined' ? this.SEPA = {} : exports);
