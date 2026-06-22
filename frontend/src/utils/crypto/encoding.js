import sodium from 'libsodium-wrappers-sumo';

/**
 * Promise that resolves when libsodium is fully initialized and ready.
 */
export const cryptoReady = sodium.ready;

/**
 * Converts a Uint8Array binary buffer to a base64 string using libsodium's robust base64 encoding.
 * @param {Uint8Array} buffer - The binary buffer to encode.
 * @returns {string} The base64 encoded string.
 */
export function toBase64(buffer) {
    return sodium.to_base64(buffer);
}

/**
 * Converts a base64 encoded string back to a Uint8Array binary buffer using libsodium's base64 decoding.
 * @param {string} base64Str - The base64 encoded string.
 * @returns {Uint8Array} The decoded Uint8Array binary buffer.
 */
export function fromBase64(base64Str) {
    return sodium.from_base64(base64Str);
}
