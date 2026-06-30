import sodium from 'libsodium-wrappers-sumo';
import drModule from 'double-ratchet-ts';
const { DoubleRatchet, Header } = drModule;

function fromBase64(base64Str) {
    return sodium.from_base64(base64Str);
}
function toBase64(buffer) {
    return sodium.to_base64(buffer);
}

// Replicate initiateSession logic
async function initiateSession(aliceKeys, bobBundle) {
    const bobIK_raw = fromBase64(bobBundle.identityPublicKey);
    const bobSPK_raw = fromBase64(bobBundle.signedPrekey.publicKey);
    const bobSPKSig_raw = fromBase64(bobBundle.signedPrekey.signature);

    // 1. Verify Bob's signed prekey signature
    const isSigValid = sodium.crypto_sign_verify_detached(bobSPKSig_raw, bobSPK_raw, bobIK_raw);
    if (!isSigValid) {
        throw new Error("X3DH Handshake Failed: Bob's Signed Prekey signature is invalid!");
    }

    // 2. Convert Bob's Identity Public Key from Ed25519 to X25519
    const bobIK_X25519 = sodium.crypto_sign_ed25519_pk_to_curve25519(bobIK_raw);

    // 3. Generate Alice's Ephemeral Keypair
    const ekA = sodium.crypto_box_keypair();

    // 4. Convert Alice's Identity Private Key from Ed25519 to X25519
    const aliceIK_sec_raw = fromBase64(aliceKeys.identitySecretKey);
    const aliceIK_X25519_sec = sodium.crypto_sign_ed25519_sk_to_curve25519(aliceIK_sec_raw);

    // 5. DH calculations
    const DH1 = sodium.crypto_scalarmult(aliceIK_X25519_sec, bobSPK_raw);
    const DH2 = sodium.crypto_scalarmult(ekA.privateKey, bobIK_X25519);
    const DH3 = sodium.crypto_scalarmult(ekA.privateKey, bobSPK_raw);

    let DH4 = null;
    const hasOPK = !!bobBundle.oneTimePrekey;
    if (hasOPK) {
        const bobOPK_raw = fromBase64(bobBundle.oneTimePrekey.publicKey);
        DH4 = sodium.crypto_scalarmult(ekA.privateKey, bobOPK_raw);
    }

    const concatLength = 32 * (hasOPK ? 4 : 3);
    const concat = new Uint8Array(concatLength);
    concat.set(DH1, 0);
    concat.set(DH2, 32);
    concat.set(DH3, 64);
    if (hasOPK) {
        concat.set(DH4, 96);
    }

    const sharedSecret = sodium.crypto_generichash(32, concat);

    const handshakePayload = {
        aliceIdentityPublicKey: aliceKeys.identityPublicKey,
        aliceEphemeralPublicKey: toBase64(ekA.publicKey),
        oneTimePrekeyId: hasOPK ? bobBundle.oneTimePrekey.keyId : null
    };

    return { sharedSecret, handshakePayload };
}

// Replicate receiveSession logic
async function receiveSession(bobKeys, handshakePayload, opkSecretKeyBase64 = null) {
    const aliceIK_raw = fromBase64(handshakePayload.aliceIdentityPublicKey);
    const aliceEK_raw = fromBase64(handshakePayload.aliceEphemeralPublicKey);

    const aliceIK_X25519 = sodium.crypto_sign_ed25519_pk_to_curve25519(aliceIK_raw);

    const bobIK_sec_raw = fromBase64(bobKeys.identitySecretKey);
    const bobIK_X25519_sec = sodium.crypto_sign_ed25519_sk_to_curve25519(bobIK_sec_raw);

    const bobSPK_sec_raw = fromBase64(bobKeys.signedPrekeySecretKey);

    const DH1 = sodium.crypto_scalarmult(bobSPK_sec_raw, aliceIK_X25519);
    const DH2 = sodium.crypto_scalarmult(bobIK_X25519_sec, aliceEK_raw);
    const DH3 = sodium.crypto_scalarmult(bobSPK_sec_raw, aliceEK_raw);

    let DH4 = null;
    const hasOPK = !!handshakePayload.oneTimePrekeyId && !!opkSecretKeyBase64;
    if (hasOPK) {
        const bobOPK_sec_raw = fromBase64(opkSecretKeyBase64);
        DH4 = sodium.crypto_scalarmult(bobOPK_sec_raw, aliceEK_raw);
    }

    const concatLength = 32 * (hasOPK ? 4 : 3);
    const concat = new Uint8Array(concatLength);
    concat.set(DH1, 0);
    concat.set(DH2, 32);
    concat.set(DH3, 64);
    if (hasOPK) {
        concat.set(DH4, 96);
    }

    const sharedSecret = sodium.crypto_generichash(32, concat);

    return { sharedSecret };
}

async function testFlow() {
    await sodium.ready;
    console.log("Sodium ready!");

    // Helper to generate deterministically derived identity key from seed
    const aliceSeed = sodium.randombytes_buf(32);
    const aliceIdentityKeypair = sodium.crypto_sign_seed_keypair(aliceSeed);
    const aliceKeys = {
        identityPublicKey: toBase64(aliceIdentityKeypair.publicKey),
        identitySecretKey: toBase64(aliceIdentityKeypair.privateKey)
    };

    const bobSeed = sodium.randombytes_buf(32);
    const bobIdentityKeypair = sodium.crypto_sign_seed_keypair(bobSeed);
    const bobSPK = sodium.crypto_box_keypair();
    const bobSPKSignature = sodium.crypto_sign_detached(bobSPK.publicKey, bobIdentityKeypair.privateKey);

    const bobOPKs = [];
    for (let i = 0; i < 5; i++) {
        const opk = sodium.crypto_box_keypair();
        bobOPKs.push({
            keyId: `opk_${i}`,
            publicKey: toBase64(opk.publicKey),
            secretKey: toBase64(opk.privateKey)
        });
    }

    const bobKeys = {
        identityPublicKey: toBase64(bobIdentityKeypair.publicKey),
        identitySecretKey: toBase64(bobIdentityKeypair.privateKey),
        signedPrekeySecretKey: toBase64(bobSPK.privateKey),
        oneTimePrekeys: bobOPKs
    };

    const bobBundle = {
        identityPublicKey: toBase64(bobIdentityKeypair.publicKey),
        signedPrekey: {
            publicKey: toBase64(bobSPK.publicKey),
            signature: toBase64(bobSPKSignature)
        },
        oneTimePrekey: {
            keyId: bobOPKs[0].keyId,
            publicKey: bobOPKs[0].publicKey
        }
    };

    console.log("Alice initiating...");
    const aliceRes = await initiateSession(aliceKeys, bobBundle);
    console.log("Bob receiving...");
    const bobRes = await receiveSession(bobKeys, aliceRes.handshakePayload, bobOPKs[0].secretKey);

    console.log("Alice secret:", toBase64(aliceRes.sharedSecret));
    console.log("Bob secret:  ", toBase64(bobRes.sharedSecret));

    if (toBase64(aliceRes.sharedSecret) === toBase64(bobRes.sharedSecret)) {
        console.log("SUCCESS: Shared secrets match!");
    } else {
        console.error("FAIL: Shared secrets do NOT match!");
        process.exit(1);
    }

    console.log("Initializing Double Ratchet...");
    const bobSPKKeyPair = {
        publicKey: sodium.crypto_scalarmult_base(fromBase64(bobKeys.signedPrekeySecretKey)),
        privateKey: fromBase64(bobKeys.signedPrekeySecretKey)
    };

    const aliceSession = await DoubleRatchet.init(
        "NexusMessenger",
        20,
        20,
        aliceRes.sharedSecret,
        fromBase64(bobBundle.signedPrekey.publicKey),
        undefined
    );

    const bobSession = await DoubleRatchet.init(
        "NexusMessenger",
        20,
        20,
        bobRes.sharedSecret,
        undefined,
        bobSPKKeyPair
    );

    console.log("Alice encrypting...");
    const plaintext = "Hello Bob!";
    const plaintextBytes = sodium.from_string(plaintext);
    const encrypted = await aliceSession.encrypt(plaintextBytes);

    console.log("Bob decrypting...");
    const transportMsg = {
        cipher: encrypted.cipher,
        header: new Header(
            encrypted.header.publicKey,
            encrypted.header.numberOfMessagesInPreviousSendingChain,
            encrypted.header.messageNumber
        )
    };

    try {
        const decryptedBytes = await bobSession.decrypt(transportMsg);
        console.log("SUCCESS: Decrypted message:", sodium.to_string(decryptedBytes));
    } catch (e) {
        console.error("FAIL: Decryption threw error:", e);
        process.exit(1);
    }
}

testFlow();
