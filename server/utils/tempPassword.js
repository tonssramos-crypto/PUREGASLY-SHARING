const crypto = require('crypto');

// Random 10-character password with at least one letter and one number.
// Skips look-alike characters (0/O, 1/l/I) so it is easy to read out loud.
function generateTempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;

  const chars = [letters[crypto.randomInt(letters.length)], digits[crypto.randomInt(digits.length)]];
  while (chars.length < 10) {
    chars.push(all[crypto.randomInt(all.length)]);
  }

  // Shuffle so the letter and number are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generateTempPassword };
