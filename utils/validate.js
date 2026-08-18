const PPAU_REGEX = /^PPAU-PRO-(\d{4})-(\d{5})$/i;

function isValidPpauRegNo(val) {
  return PPAU_REGEX.test(String(val || '').trim());
}

function normalizePpauRegNo(val) {
  return String(val || '').trim().toUpperCase();
}

module.exports = { isValidPpauRegNo, normalizePpauRegNo, PPAU_REGEX };
