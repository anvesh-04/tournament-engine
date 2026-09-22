const crypto = require("crypto");

/**
 * Generates a readable temporary password for an invited account.
 *
 * crypto.randomBytes rather than Math.random: this value is the only thing
 * standing between a stranger and that account until the invitee changes it.
 * base64url keeps it copy-pasteable and free of characters that get mangled
 * when someone reads it out or pastes it from an email client.
 */
function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 URL-safe characters
}

module.exports = { generateTemporaryPassword };
