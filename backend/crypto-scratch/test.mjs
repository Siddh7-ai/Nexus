import sodium from 'libsodium-wrappers';
import assert from 'assert';

(async () => {
    // 1. Initialize libsodium
    await sodium.ready;
    console.log("=== 1. libsodium initialized successfully ===");

    // 2. Generate an X25519 keypair for Alice
    // Box keypairs are X25519 curve keypairs used for Diffie-Hellman key agreement
    const aliceKeypair = sodium.crypto_box_keypair();
    const alicePublicKeyBase64 = sodium.to_base64(aliceKeypair.publicKey);
    console.log("\n=== 2. Generated Alice's X25519 Keypair ===");
    console.log("Alice's Public Key (Safe to expose/store in MongoDB) [base64]:", alicePublicKeyBase64);
    // Note: aliceKeypair.privateKey is Alice's long-term private key which MUST NEVER leave the client.

    // 3. Generate a second keypair representing Bob (the other party)
    const bobKeypair = sodium.crypto_box_keypair();
    const bobPublicKeyBase64 = sodium.to_base64(bobKeypair.publicKey);
    console.log("\n=== 3. Generated Bob's X25519 Keypair ===");
    console.log("Bob's Public Key (Safe to expose/store in MongoDB) [base64]:", bobPublicKeyBase64);

    // 4. Perform raw Diffie-Hellman key agreement (Scalar Multiplication)
    // Alice computes: DH(Alice Private Key, Bob Public Key)
    const aliceSharedSecret = sodium.crypto_scalarmult(aliceKeypair.privateKey, bobKeypair.publicKey);
    // Bob computes: DH(Bob Private Key, Alice Public Key)
    const bobSharedSecret = sodium.crypto_scalarmult(bobKeypair.privateKey, aliceKeypair.publicKey);

    console.log("\n=== 4. Diffie-Hellman Key Agreement ===");
    console.log("Alice's derived raw shared secret [base64]:", sodium.to_base64(aliceSharedSecret));
    console.log("Bob's derived raw shared secret [base64]:  ", sodium.to_base64(bobSharedSecret));

    // Assert both derived raw shared secrets are identical
    assert.deepStrictEqual(aliceSharedSecret, bobSharedSecret);
    console.log("Assertion PASSED: Both parties arrived at the exact same shared secret independently!");

    // 5. Derive a symmetric encryption key from the shared secret using a KDF (Key Derivation Function)
    // Why use a KDF step instead of using the raw Diffie-Hellman shared secret directly?
    // - The raw DH shared secret is a point on an elliptic curve, meaning its bits are not uniformly distributed.
    //   Some bit patterns are mathematically impossible, which violates the assumption of many symmetric ciphers
    //   that the key is completely random and uniform.
    // - Running the shared secret through a cryptographic hash function (KDF) stretches and hashes the bits, 
    //   producing a uniformly distributed, pseudo-random symmetric key of the exact required length.
    // - It also allows separating different keys (e.g., encryption keys vs authentication keys) by hashing the
    //   secret with context info or salt, preventing any key reuse/correlation issues.
    const keyLength = sodium.crypto_secretbox_KEYBYTES; // 32 bytes
    const derivedKeyAlice = sodium.crypto_generichash(keyLength, aliceSharedSecret);
    const derivedKeyBob = sodium.crypto_generichash(keyLength, bobSharedSecret);

    assert.deepStrictEqual(derivedKeyAlice, derivedKeyBob);
    console.log("\n=== 5. Derived Symmetric Keys ===");
    console.log("Derived Symmetric Key (32 bytes) [base64]:", sodium.to_base64(derivedKeyAlice));

    // 6. Encrypt a test string with sodium.crypto_secretbox_easy (XSalsa20-Poly1305)
    // Nonce reuse vulnerability explanation:
    // - The XSalsa20 cipher is a stream cipher. It generates a pseudo-random keystream based on the key and the nonce.
    // - The ciphertext is computed by XORing the plaintext with the keystream.
    // - If the same key and the same nonce are reused to encrypt two different plaintexts (P1 and P2), the keystream is identical.
    // - An attacker who intercepts both ciphertexts (C1 = P1 XOR Keystream, C2 = P2 XOR Keystream) can XOR the two ciphertexts together:
    //   C1 XOR C2 = (P1 XOR Keystream) XOR (P2 XOR Keystream) = P1 XOR P2.
    // - This completely eliminates the keystream, leaving the plaintexts XORed together. With basic frequency analysis or known plaintext,
    //   an attacker can easily recover the full plaintext of both messages.
    // - In addition, Poly1305 uses the same keystream to derive the authentication tag. Nonce reuse allows an attacker to forge valid tags,
    //   breaking integrity/authenticity guarantees as well.
    // - Therefore, every single message MUST use a completely unique, freshly generated random nonce.
    const plaintext = "Nexus Messenger E2EE Cryptography Proof of Concept!";
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES); // 24 bytes random nonce
    const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, derivedKeyAlice);

    console.log("\n=== 6. Encrypted Test Payload ===");
    console.log("Original Plaintext: ", plaintext);
    console.log("Nonce [base64]:     ", sodium.to_base64(nonce));
    console.log("Ciphertext [base64]:", sodium.to_base64(ciphertext));

    // 7. Decrypt the ciphertext on Bob's side
    const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, derivedKeyBob);
    const decryptedString = sodium.to_string(decrypted);

    console.log("\n=== 7. Decrypted Test Payload ===");
    console.log("Decrypted Plaintext:", decryptedString);
    assert.strictEqual(plaintext, decryptedString);
    console.log("Assertion PASSED: Decrypted payload matches original plaintext!");

    // 8. Deliberately corrupt one byte of the ciphertext and show decryption fails loudly
    console.log("\n=== 8. Tampering Detection (Authenticated Encryption) ===");
    const corruptedCiphertext = new Uint8Array(ciphertext);
    corruptedCiphertext[0] ^= 0x01; // Flip the first bit of the first byte of the ciphertext

    console.log("Attempting to decrypt tampered/corrupted ciphertext...");
    try {
        sodium.crypto_secretbox_open_easy(corruptedCiphertext, nonce, derivedKeyBob);
        console.error("FAIL: Decrypted corrupted ciphertext without throwing an error!");
        process.exit(1);
    } catch (err) {
        console.log("SUCCESS: Decryption failed loudly as expected! Error message:", err.message || err);
    }

    console.log("\n=== ALL STANDALONE CRYPTO PRIMITIVE TESTS PASSED! ===");
})();
