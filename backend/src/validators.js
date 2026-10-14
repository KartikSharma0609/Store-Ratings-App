const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['ADMIN', 'USER', 'OWNER'];

const validName = (s) => typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 60;
const validAddress = (s) => typeof s === 'string' && s.trim().length >= 1 && s.length <= 400;
const validEmail = (s) => typeof s === 'string' && s.length <= 255 && EMAIL_RE.test(s.trim());
const validPassword = (s) =>
  typeof s === 'string' && s.length >= 8 && s.length <= 16 && /[A-Z]/.test(s) && /[^A-Za-z0-9]/.test(s);
const validRating = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

function userError(b = {}) {
  if (!validName(b.name)) return 'Name must be 20 to 60 characters.';
  if (!validEmail(b.email)) return 'Enter a valid email address.';
  if (!validAddress(b.address)) return 'Address is required and must be at most 400 characters.';
  if (!validPassword(b.password))
    return 'Password must be 8 to 16 characters with at least one uppercase letter and one special character.';
  return null;
}

module.exports = { ROLES, validName, validAddress, validEmail, validPassword, validRating, userError };
