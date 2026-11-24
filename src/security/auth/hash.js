'use strict';
/**
 * Password hashing using argon2id.
 *
 * WHY argon2id specifically:
 *   argon2id is the OWASP-recommended variant — it combines
 *   the side-channel resistance of argon2i with the GPU-attack
 *   resistance of argon2d. Using the library defaults gives
 *   memory=65536 KB, iterations=3, parallelism=4 which meets
 *   OWASP minimums as of 2024.
 *
 * WHY not bcrypt:
 *   bcrypt truncates passwords at 72 bytes. argon2id has no
 *   such limit and is more resistant to modern GPU attacks.
 *
 * Satisfies: TH9 (brute-force login mitigation).
 */

const argon2 = require('argon2');

/**
 * Hash a plaintext password.
 * @param {string} password
 * @returns {Promise<string>} argon2id hash string
 */
async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Verify a plaintext password against a stored hash.
 * @param {string} hash    - stored argon2id hash
 * @param {string} password - plaintext candidate
 * @returns {Promise<boolean>}
 */
async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // argon2.verify throws on malformed hash — treat as mismatch.
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
