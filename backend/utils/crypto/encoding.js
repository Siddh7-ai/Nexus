const sodium = require('libsodium-wrappers');

/**
 * Promise that resolves when libsodium is fully initialized and ready.
 */
const cryptoReady = sodium.ready;

/**
 * Converts a Uint8Array binary buffer to a base64 string using libsodium.
 * @param {Uint8Array} buffer 
 * @returns {string}
 */
function toBase64(buffer) {
    return sodium.to_base64(buffer);
}

/**
 * Converts a base64 string back to a Uint8Array binary buffer using libsodium.
 * @param {string} base64Str 
 * @returns {Uint8Array}
 */
function fromBase64(base64Str) {
    return sodium.from_base64(base64Str);
}

module.exports = {
    cryptoReady,
    toBase64,
    fromBase64
};
