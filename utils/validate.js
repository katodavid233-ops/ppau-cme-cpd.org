const PPAU_REGEX = /^PPAU-PRO-(\d{4})-(\d{5})$/i;
const AHPC_REGEX = /^\d+$/;

function isValidPpauRegNo(val) {
  return PPAU_REGEX.test(String(val || '').trim());
}

function normalizePpauRegNo(val) {
  return String(val || '').trim().toUpperCase();
}

function isValidAhpcRegNo(val) {
  return AHPC_REGEX.test(String(val || '').trim());
}

module.exports = { isValidPpauRegNo, normalizePpauRegNo, isValidAhpcRegNo, PPAU_REGEX };
