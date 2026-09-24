// The two MRM bank accounts a client can pay into. The full bank details live
// on the server (server/utils/paymentAccounts.js) and print on the statement.
export const PAYMENT_ACCOUNTS = [
  { key: 'gst', label: 'With GST', account: 'Samraj Music Rights MGMT Pvt Ltd', bank: 'HDFC Bank · A/c 59239000012345' },
  { key: 'non-gst', label: 'Without GST', account: 'Kangabeat Entertainment Pvt. Ltd.', bank: 'State Bank of India · A/c 33087387276' },
];
