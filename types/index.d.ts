/**
 * This is sepa.js. Its module exports the following class and functions:
 *
 * SEPA.Document               -- class for creating SEPA XML Documents
 *
 * SEPA.validateIBAN           -- function to validate an IBAN
 *
 * SEPA.checksumIBAN           -- function to calculate the IBAN checksum
 *
 * SEPA.validateCreditorID     -- function to validate a creditor id
 *
 * SEPA.checksumCreditorID     -- function to calculate the creditor id checksum
 *
 * SEPA.setIDSeparator         -- function to customize the ID separator when needed (defaults to '.')
 *
 * SEPA.enableValidations      -- function to enable/disable fields validation
 */
declare module "sepa" {
  enum TransactionTypes {
    DirectDebit = "DrctDbtTxInf",
    Transfer = "CdtTrfTxInf",
  }

  enum PaymentInfoTypes {
    DirectDebit = "DD",
    Transfer = "TRF",
  }

  enum SEPATypes {
    "pain.001.001.02" = "pain.001.001.02",
    "pain.001.001.03" = "CstmrCdtTrfInitn",
    "pain.001.001.08" = "CstmrCdtTrfInitn",
    "pain.001.001.09" = "CstmrCdtTrfInitn",
    "pain.008.001.02" = "CstmrDrctDbtInitn",
    "pain.008.001.08" = "CstmrDrctDbtInitn",
  }

  /**
   * Wrapper class for the SEPA <GrpHdr> element.
   */
  class SepaGroupHeader {
    private _painFormat: string;
    id: string;
    created: Date | string;
    transactionCount: number;
    initiatorName: string;
    controlSum: number;
    batchBooking: boolean;
    grouping: string;

    constructor(painFormat: string);

    /**
     * Serialize this document to a DOM Element.
     *
     * @return      The DOM <GrpHdr> Element.
     */
    toXML(doc: XMLDocument): Element;

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString(): string;
  }

  /**
   * Generic Transaction class
   */
  class SepaTransaction {
    static TransactionTypes: typeof TransactionTypes;

    private _painFormat: string;
    /** Generic Transaction Type */
    private _type: TransactionTypes;

    /** The unique transaction id */
    id: string;
    /** The End-To-End id */
    end2endId: string;
    /** The currency to transfer */
    currency: string;
    /** The amount to transfer */
    amount: number;
    /** (optional) The purpose code to use */
    purposeCode: string | null;
    /** The mandate id of the debtor */
    mandateId: string;
    /** The signature date of the mandate */
    mandateSignatureDate: Date | string | null;

    /** Name of the debtor */
    debtorName: string;
    /** Street of the debtor */
    debtorStreet: string | null;
    /** City of the debtor */
    debtorCity: string | null;
    /** Country of the debtor */
    debtorCountry: string | null;
    /** IBAN of the debtor */
    debtorIBAN: string;
    /** BIC of the debtor */
    debtorBIC: string;

    /** Unstructured Remittance Info */
    remittanceInfo: string;
    /** Structured Remittance Info */
    structuredRemittanceInfo: {
      typeCode: string;
      issuer: string;
      reference: string;
    };

    /** Name of the creditor */
    creditorName: string;
    /** Street of the creditor */
    creditorStreet: string | null;
    /** City of the creditor */
    creditorCity: string | null;
    /** Country of the creditor */
    creditorCountry: string | null;
    /** IBAN of the creditor */
    creditorIBAN: string;
    /** BIC of the creditor */
    creditorBIC: string;

    constructor(painFormat: string);
    validate(): void;
    toXML(doc: XMLDocument): Element;
  }

  /**
   * Wrapper class for the SEPA <PmtInf> Element
   */
  class SepaPaymentInfo {
    static PaymentInfoTypes: typeof PaymentInfoTypes;

    _painFormat: string;
    /** Transaction array */
    _payments: SepaTransaction[];
    id: string;
    /** SEPA payment method. */
    method: string;
    /** If true, booking will appear as one entry on your statement */
    batchBooking: boolean;
    /** Grouping, defines structure handling for XML file */
    grouping: string;
    /** Sum of all payments, will be automatically set */
    controlSum: number;
    /** Instrumentation code:
     * 'CORE' - Standard Transfer
     * 'COR1' - Expedited Transfer
     * 'B2B'  - Business Transfer
     */
    localInstrumentation: "CORE" | "COR1" | "B2B";
    /**
     * 'FRST' - First transfer
     * 'RCUR' - Subsequent transfer
     * 'OOFF' - One Off transfer
     * 'FNAL' - Final transfer
     */
    sequenceType: "FRST" | "RCUR" | "OOFF" | "FNAL";
    /** Requested collection date */
    collectionDate: Date | string | null;
    /** Execution date of the SEPA order */
    requestedExecutionDate: Date | string | null;

    /** Id assigned to the creditor */
    creditorId: string;
    /** Name of the creditor */
    creditorName: string;
    /** Street of the creditor */
    creditorStreet: string | null;
    /** City of the creditor */
    creditorCity: string | null;
    /** Country of the creditor */
    creditorCountry: string | null;
    /** IBAN of the creditor */
    creditorIBAN: string;
    /** BIC of the creditor */
    creditorBIC: string;

    /** Id assigned to the debtor for Transfer payments */
    debtorId: string;
    /** Name of the debtor */
    debtorName: string;
    /** Street of the debtor */
    debtorStreet: string | null;
    /** City of the debtor */
    debtorCity: string | null;
    /** Country of the debtor */
    debtorCountry: string | null;
    /** IBAN of the debtor */
    debtorIBAN: string;
    /** BIC of the debtor */
    debtorBIC: string;

    /** SEPA order priority */
    instructionPriority: "HIGH" | "NORM";

    /** Number of transactions in this payment info block */
    readonly transactionCount: number;

    constructor(painFormat: string);

    /**
     * Normalize fields like the control sum or transaction count. This will
     * _NOT_ be called when serialized to XML and must be called manually.
     */
    normalize(): void;

    /**
     * Adds a transaction to this payment. The transaction id will be prefixed
     * by the payment info id.
     *
     * @param pmt       The Transaction to add.
     */
    addTransaction(transaction: SepaTransaction): void;

    createTransaction(): SepaTransaction;
    validate(): void;

    /**
     * Serialize this document to a DOM Element.
     *
     * @return      The DOM <PmtInf> Element.
     */
    toXML(doc: XMLDocument): Element;

    /**
     * Serialize this element to an XML string.
     *
     * @return      The XML string of this element.
     */
    toString(): string;
  }

  export class Document {
    static Types: typeof SEPATypes;

    /** Pain Format used */
    private _painFormat: string;
    /** SEPA Document type setting, contains the root element */
    private _type: SEPATypes;
    /** Payment Info array */
    private _paymentInfo: SepaPaymentInfo[];
    /** Xml version */
    private _xmlVersion: string;
    /** Xml encoding */
    private _xmlEncoding: string;
    /** Group Header object */
    grpHdr: SepaGroupHeader;

    constructor(painFormat?: string);

    /**
     * Adds a Sepa.PaymentInfo block to this document. Its id will be
     * automatically prefixed with the group header id.
     *
     * @param pi        The payment info block.
     */
    addPaymentInfo(pi: SepaPaymentInfo): void;

    /**
     * Factory method for PI
     */
    createPaymentInfo(): SepaPaymentInfo;

    /**
     * Normalize fields like the control sum or transaction count. This will be
     * called automatically when serialized to XML.
     */
    normalize(): void;

    /**
     * Serialize this document to a DOM Document.
     *
     * @return      The DOM Document.
     */
    toXML(): XMLDocument;

    /**
     * Serialize this document to an XML string.
     *
     * @return String     The XML string of this document.
     */
    toString(): string;
  }

  /**
   * Checks if an IBAN is valid (no country specific checks are done).
   *
   * @param iban        The IBAN to check.
   * @return            True, if the IBAN is valid.
   */
  export function validateIBAN(iban: string): boolean;

  /**
   * Calculates the checksum for the given IBAN. The input IBAN should pass 00
   * as the checksum digits, a full iban with the corrected checksum will be
   * returned.
   *
   * Example: DE00123456781234567890 -> DE87123456781234567890
   */
  export function checksumIBAN(iban: string): string;

  /**
   * Checks if a Creditor ID is valid (no country specific checks are done).
   *
   * @param creditorID        The Creditor ID to check.
   * @return            True, if the Creditor IDis valid.
   */
  export function validateCreditorID(creditorID: string): boolean;

  /**
   * Calculates the checksum for the given Creditor ID. The input Creditor ID
   * should pass 00 as the checksum digits, a full Creditor ID with the
   * corrected checksum will be returned.
   *
   * Example: DE00ZZZ09999999999 -> DE98ZZZ09999999999
   */
  export function checksumCreditorID(creditorID: string): string;

  export function setIDSeparator(separator: string): void;

  /**
   * Controls the validation that is conducted when SepaDocuments are serialized.
   *
   * @param {boolean} enabled - Whether the validation should be conducted
   * @param {boolean} [charsetValidationsEnabled=true] - If validation is enabled, whether fields
   *    should be checked for the limited SEPA character set. You want to set this to false, e.g.,
   *    if you are using this library to handle communication within Greece or Finnland, where
   *    more characters are allowed.
   */
  export function enableValidations(
    enabled: boolean,
    charsetValidationsEnabled?: boolean
  ): void;
}
