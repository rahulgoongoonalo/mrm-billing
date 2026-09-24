// The two bank accounts a client can be asked to pay into. Which one applies is
// set per client (Client.paymentAccount) and printed on their statement.

const PAYMENT_ACCOUNTS = {
  gst: {
    label: 'With GST',
    rows: [
      ['Account name', 'Samraj Music Rights MGMT Pvt Ltd'],
      ['Bank name', 'HDFC Bank'],
      ['Current account no.', '59239000012345'],
      ['IFSC', 'HDFC0000321'],
      ['SWIFT code', 'HDFCINBB'],
      ['Address', 'Krishna Kunj, V.L. Mehta Road, JVPD Scheme, Mumbai - 400056, Maharashtra, India'],
    ],
  },
  'non-gst': {
    label: 'Without GST',
    rows: [
      ['Account name', 'Kangabeat Entertainment Pvt. Ltd.'],
      ['Bank name', 'State Bank of India'],
      ['Current account no.', '33087387276'],
      ['IFSC', 'SBIN0060278'],
      ['SWIFT code', 'SBININBB832'],
      ['Branch', 'Chakala Road, Andheri East, Mumbai - 400099'],
    ],
  },
};

const PAYMENT_ACCOUNT_KEYS = Object.keys(PAYMENT_ACCOUNTS);

module.exports = { PAYMENT_ACCOUNTS, PAYMENT_ACCOUNT_KEYS };
