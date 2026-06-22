import sodium from 'libsodium-wrappers-sumo';
import { fromBase64, toBase64, cryptoReady } from './encoding';

/**
 * Hand-implement the Extended Triple Diffie-Hellman (X3DH) handshake protocol.
 * 
 * Cryptographic tradeoff notes:
 * 1. Deterministic Identity Key Derivation:
 *    Because the user's long-term Identity Key (IK) is derived deterministically from their password,
 *    changing their password will result in a different Identity Key being generated.
 *    This will break all existing E2EE ratcheting sessions established with their contacts (as their identity signature
 *    and DH2 components will change). This is a deliberate trade-off to avoid storing private keys (even encrypted)
 *    on the server and to allow simple recovery on new devices.
 */

/**
 * Alice (initiator) starts an E2EE session with Bob.
 * Verifies Bob's prekey bundle, generates an ephemeral X25519 key, and calculates the shared secret.
 * 
 * @param {object} aliceKeys - Alice's decrypted keys { identitySecretKey (base64), identityPublicKey (base64) }
 * @param {object} bobBundle - Bob's public bundle { identityPublicKey, signedPrekey: { publicKey, signature }, oneTimePrekey: { keyId, publicKey } | null }
 * @returns {Promise<{ sharedSecret: Uint8Array, handshakePayload: object }>}
 */
export async function initiateSession(aliceKeys, bobBundle) {
    await cryptoReady;

    const bobIK_raw = fromBase64(bobBundle.identityPublicKey);
    const bobSPK_raw = fromBase64(bobBundle.signedPrekey.publicKey);
    const bobSPKSig_raw = fromBase64(bobBundle.signedPrekey.signature);

    // 1. Verify Bob's signed prekey signature using Bob's long-term identity public key (Ed25519)
    const isSigValid = sodium.crypto_sign_verify_detached(bobSPKSig_raw, bobSPK_raw, bobIK_raw);
    if (!isSigValid) {
        throw new Error("X3DH Handshake Failed: Bob's Signed Prekey signature is invalid!");
    }

    // 2. Convert Bob's Identity Public Key from Ed25519 to X25519 (Curve25519) for ECDH scalarmult
    const bobIK_X25519 = sodium.crypto_sign_ed25519_pk_to_curve25519(bobIK_raw);

    // 3. Generate Alice's Ephemeral Keypair (X25519)
    const ekA = sodium.crypto_box_keypair();

    // 4. Convert Alice's Identity Private Key from Ed25519 to X25519 (Curve25519)
    const aliceIK_sec_raw = fromBase64(aliceKeys.identitySecretKey);
    const aliceIK_X25519_sec = sodium.crypto_sign_ed25519_sk_to_curve25519(aliceIK_sec_raw);

    // 5. Perform the step-by-step DH scalar multiplications
    // DH1 = DH(IK_A, SPK_B)
    const DH1 = sodium.crypto_scalarmult(aliceIK_X25519_sec, bobSPK_raw);

    // DH2 = DH(EK_A, IK_B)
    const DH2 = sodium.crypto_scalarmult(ekA.privateKey, bobIK_X25519);

    // DH3 = DH(EK_A, SPK_B)
    const DH3 = sodium.crypto_scalarmult(ekA.privateKey, bobSPK_raw);

    // DH4 = DH(EK_A, OPK_B) (if OPK is present in Bob's bundle)
    let DH4 = null;
    const hasOPK = !!bobBundle.oneTimePrekey;
    if (hasOPK) {
        const bobOPK_raw = fromBase64(bobBundle.oneTimePrekey.publicKey);
        DH4 = sodium.crypto_scalarmult(ekA.privateKey, bobOPK_raw);
    }

    // 6. Concatenate DH values in sequence: DH1 || DH2 || DH3 [|| DH4]
    const concatLength = 32 * (hasOPK ? 4 : 3);
    const concat = new Uint8Array(concatLength);
    concat.set(DH1, 0);
    concat.set(DH2, 32);
    concat.set(DH3, 64);
    if (hasOPK) {
        concat.set(DH4, 96);
    }

    // 7. Derive the shared secret via KDF (crypto_generichash)
    const sharedSecret = sodium.crypto_generichash(32, concat);

    // 8. Construct the handshake initialization payload
    const handshakePayload = {
        aliceIdentityPublicKey: aliceKeys.identityPublicKey, // Ed25519 public key base64
        aliceEphemeralPublicKey: toBase64(ekA.publicKey),    // X25519 public key base64
        oneTimePrekeyId: hasOPK ? bobBundle.oneTimePrekey.keyId : null
    };

    return { sharedSecret, handshakePayload };
}

/**
 * Bob (receiver) completes an E2EE session with Alice using her handshake initialization payload.
 * 
 * @param {object} bobKeys - Bob's decrypted keys { identitySecretKey (base64), signedPrekeySecretKey (base64) }
 * @param {object} handshakePayload - Payload sent by Alice { aliceIdentityPublicKey, aliceEphemeralPublicKey, oneTimePrekeyId }
 * @param {string|null} opkSecretKeyBase64 - Bob's consumed OPK private key (base64) or null if none was used
 * @returns {Promise<Uint8Array>} The derived identical shared secret
 */
export async function receiveSession(bobKeys, handshakePayload, opkSecretKeyBase64 = null) {
    await cryptoReady;

    const aliceIK_raw = fromBase64(handshakePayload.aliceIdentityPublicKey);
    const aliceEK_raw = fromBase64(handshakePayload.aliceEphemeralPublicKey);

    // 1. Convert Alice's Identity Public Key from Ed25519 to X25519 (Curve25519)
    const aliceIK_X25519 = sodium.crypto_sign_ed25519_pk_to_curve25519(aliceIK_raw);

    // 2. Convert Bob's Identity Private Key from Ed25519 to X25519 (Curve25519)
    const bobIK_sec_raw = fromBase64(bobKeys.identitySecretKey);
    const bobIK_X25519_sec = sodium.crypto_sign_ed25519_sk_to_curve25519(bobIK_sec_raw);

    const bobSPK_sec_raw = fromBase64(bobKeys.signedPrekeySecretKey);

    // 3. Perform identical step-by-step DH scalar multiplications
    // DH1 = DH(SPK_B, IK_A) => Bob computes DH using his signed prekey private key and Alice's identity public key
    const DH1 = sodium.crypto_scalarmult(bobSPK_sec_raw, aliceIK_X25519);

    // DH2 = DH(IK_B, EK_A) => Bob computes DH using his identity private key and Alice's ephemeral public key
    const DH2 = sodium.crypto_scalarmult(bobIK_X25519_sec, aliceEK_raw);

    // DH3 = DH(SPK_B, EK_A) => Bob computes DH using his signed prekey private key and Alice's ephemeral public key
    const DH3 = sodium.crypto_scalarmult(bobSPK_sec_raw, aliceEK_raw);

    // DH4 = DH(OPK_B, EK_A) => Bob computes DH using his one-time prekey private key and Alice's ephemeral public key
    let DH4 = null;
    const hasOPK = !!handshakePayload.oneTimePrekeyId && !!opkSecretKeyBase64;
    if (hasOPK) {
        const bobOPK_sec_raw = fromBase64(opkSecretKeyBase64);
        DH4 = sodium.crypto_scalarmult(bobOPK_sec_raw, aliceEK_raw);
    }

    // 4. Concatenate DH values in identical sequence: DH1 || DH2 || DH3 [|| DH4]
    const concatLength = 32 * (hasOPK ? 4 : 3);
    const concat = new Uint8Array(concatLength);
    concat.set(DH1, 0);
    concat.set(DH2, 32);
    concat.set(DH3, 64);
    if (hasOPK) {
        concat.set(DH4, 96);
    }

    // 5. Derive the shared secret via KDF (crypto_generichash)
    return sodium.crypto_generichash(32, concat);
}

/**
 * Computes the 60-digit decimal safety number and hex hash for out-of-band verification.
 * 
 * SECURITY WARNING & ATTACK DEFENSE:
 * Comparing safety numbers out-of-band (e.g. reading them aloud on a voice call, or scanning QR codes in-person)
 * is the ONLY way to detect a Man-In-The-Middle (MITM) attack. If a malicious server substitutes its own public keys
 * during the X3DH handshake to intercept/decrypt the chat traffic, the derived session keys and identity public keys
 * on Alice's and Bob's devices will differ.
 * Consequently, their calculated safety numbers will not match. This verification must NOT be performed over the
 * same message channel being verified.
 * 
 * @param {string} username1 
 * @param {string} identityPublicKey1 - base64 Ed25519 public key
 * @param {string} username2 
 * @param {string} identityPublicKey2 - base64 Ed25519 public key
 * @returns {Promise<{ formattedDec: string, hexHash: string }>}
 */
export async function computeSafetyNumber(username1, identityPublicKey1, username2, identityPublicKey2) {
    await cryptoReady;

    const u1 = username1.toLowerCase();
    const u2 = username2.toLowerCase();

    const key1 = fromBase64(identityPublicKey1);
    const key2 = fromBase64(identityPublicKey2);

    // Concatenate keys in deterministic order based on lexicographical username sorting
    const concat = new Uint8Array(64);
    if (u1 < u2) {
        concat.set(key1, 0);
        concat.set(key2, 32);
    } else {
        concat.set(key2, 0);
        concat.set(key1, 32);
    }

    // Hash the concatenated keys
    const hash = sodium.crypto_generichash(32, concat);

    // Format the first 24 bytes as 12 groups of 5-digit decimal strings (zero-padded)
    const groups = [];
    for (let i = 0; i < 24; i += 2) {
        const val = (hash[i] << 8) | hash[i + 1];
        groups.push(val.toString().padStart(5, "0"));
    }

    return {
        formattedDec: groups.join(" "),
        hexHash: sodium.to_hex(hash)
    };
}
