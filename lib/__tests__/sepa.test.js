const Sepa = require('../sepa');

const SEPA_TYPE = 'pain.001.001.03'; // Customer Credit Transfer Initiation V3

describe('SEPA lib', () => {

  it('should build a valid simple sepa XML', async () => {
    const doc = new Sepa.Document(SEPA_TYPE);

    doc.grpHdr.id = 'ID_1';
    doc.grpHdr.created = new Date();
    doc.grpHdr.initiatorName = 'SPENDESK';
    const xmlString = doc.toString();
    expect(xmlString).toMatch(/<\?xml version="1.0" encoding="UTF-8"\?>/);
    // Correctly build the initiatorName
    expect(xmlString).toMatch(/SPENDESK/);
  });
});
