const { cryptoReady, toBase64, fromBase64 } = require('../utils/crypto/encoding');
const assert = require('assert');

(async () => {
    await cryptoReady;
    console.log("=== Verification of encoding.js helpers ===");

    const originalData = new Uint8Array([78, 101, 120, 117, 115]); // "Nexus" in ASCII
    const base64Str = toBase64(originalData);
    console.log("Original Buffer: ", originalData);
    console.log("Encoded Base64:  ", base64Str);

    const decodedBuffer = fromBase64(base64Str);
    console.log("Decoded Buffer:  ", decodedBuffer);

    assert.deepStrictEqual(originalData, decodedBuffer);
    console.log("Assertion PASSED: Decoded buffer matches original buffer exactly!");
})();
