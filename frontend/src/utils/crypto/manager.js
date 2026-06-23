import sodium from 'libsodium-wrappers-sumo';
import { DoubleRatchet, Header } from 'double-ratchet-ts';
import { fromBase64, toBase64, cryptoReady } from './encoding';
import { saveKeys, getKeys, saveSessionState, getSessionState, getFullSessionRecord, deleteSessionState, openDatabase, acquireSessionLock, getCurrentUsername } from './keydb';
import { initiateSession, receiveSession, computeSafetyNumber } from './x3dh';
import { getBackendUrl } from '../config';

export { computeSafetyNumber };

/**
 * Tradeoff comments as requested:
 * 
 * 1. sessionStorage Tradeoff:
 *    The derived 32-byte master key is stored in sessionStorage.
 *    CRITICAL SECURITY WARNING: sessionStorage survives page refreshes but is readable by any JS executing on the page
 *    (including third-party scripts, malicious packages, or via XSS vulnerability).
 *    A higher-security alternative is to keep the master key in-memory only (e.g. React state/Context),
 *    which means it dies on page refresh and requires re-entering the password, but prevents persistent XSS key theft.
 * 
 * 2. Deterministic Identity Key Derivation:
 *    Because the user's Identity Key is derived deterministically from crypto_pwhash(password, username),
 *    changing the password will generate a different Identity Key. This will silently break all existing
 *    E2EE sessions with contacts since the long-term signature/ECDH binding will change.
 */

// Memory cache for the decrypted master key during the active session.
let inMemoryMasterKey = null;

/**
 * Set the master key in memory and sessionStorage.
 * @param {Uint8Array} key 
 */
export function setMasterKey(key) {
    inMemoryMasterKey = key;
    // sessionStorage survives refresh but is accessible to page JS; a higher-security alternative is in-memory only.
    sessionStorage.setItem("nexus_master_key", toBase64(key));
}

/**
 * Retrieve the master key from memory or sessionStorage.
 * @returns {Uint8Array|null}
 */
export function getMasterKey() {
    if (inMemoryMasterKey) return inMemoryMasterKey;
    const sessionVal = sessionStorage.getItem("nexus_master_key");
    if (sessionVal) {
        inMemoryMasterKey = fromBase64(sessionVal);
        return inMemoryMasterKey;
    }
    return null;
}

/**
 * Derives a 64-byte master secret from the user's password and username (padded/hashed to a 16-byte salt).
 * Returns first 32 bytes as masterKey and second 32 bytes as identitySeed.
 * 
 * @param {string} password 
 * @param {string} username 
 * @returns {Promise<{ masterKey: Uint8Array, identitySeed: Uint8Array }>}
 */
export async function deriveKeysFromPassword(password, username) {
    await cryptoReady;
    
    // Hash username to a stable 16-byte salt for crypto_pwhash
    const usernameHash = sodium.crypto_generichash(16, username.toLowerCase());
    
    // Perform password hashing (KDF)
    const masterSecret = sodium.crypto_pwhash(
        64,
        password,
        usernameHash,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
    );

    const masterKey = masterSecret.slice(0, 32);
    const identitySeed = masterSecret.slice(32, 64);

    return { masterKey, identitySeed };
}

/**
 * Symmetric encryption helper using the master key.
 */
function encryptData(dataBytes, masterKey) {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(dataBytes, nonce, masterKey);
    return {
        nonce: toBase64(nonce),
        ciphertext: toBase64(ciphertext)
    };
}

/**
 * Symmetric decryption helper using the master key.
 */
function decryptData(encryptedObj, masterKey) {
    const nonce = fromBase64(encryptedObj.nonce);
    const ciphertext = fromBase64(encryptedObj.ciphertext);
    return sodium.crypto_secretbox_open_easy(ciphertext, nonce, masterKey);
}

/**
 * Generates initial E2EE prekey materials and saves the encrypted private keys in IndexedDB.
 * Returns the public key bundle to upload to the server.
 * 
 * @param {string} password 
 * @param {string} username 
 * @returns {Promise<object>} The public prekey bundle
 */
export async function generateAndStoreKeys(password, username) {
    await cryptoReady;

    const { masterKey, identitySeed } = await deriveKeysFromPassword(password, username);
    setMasterKey(masterKey);

    // 1. Generate Ed25519 long-term Identity Keypair deterministically from seed
    const identityKeypair = sodium.crypto_sign_seed_keypair(identitySeed);

    // 2. Generate X25519 Signed Prekey and sign its public key
    const spk = sodium.crypto_box_keypair();
    const spkSignature = sodium.crypto_sign_detached(spk.publicKey, identityKeypair.privateKey);

    // 3. Generate 20 X25519 One-time Prekeys
    const opks = [];
    const opksPublic = [];
    for (let i = 0; i < 20; i++) {
        const opk = sodium.crypto_box_keypair();
        const keyId = Math.floor(Math.random() * 1000000000).toString();
        opks.push({
            keyId,
            publicKey: toBase64(opk.publicKey),
            secretKey: toBase64(opk.privateKey)
        });
        opksPublic.push({
            keyId,
            publicKey: toBase64(opk.publicKey)
        });
    }

    // 4. Encrypt private keys using the master key
    const encryptedIK = encryptData(identityKeypair.privateKey, masterKey);
    const encryptedSPK = encryptData(spk.privateKey, masterKey);
    const encryptedOPKs = encryptData(sodium.from_string(JSON.stringify(opks)), masterKey);

    // 5. Store in IndexedDB
    await saveKeys(username, {
        encryptedIdentityPrivateKey: encryptedIK,
        encryptedSignedPrekeyPrivateKey: encryptedSPK,
        encryptedOneTimePrekeys: encryptedOPKs,
        identityPublicKey: toBase64(identityKeypair.publicKey),
        signedPrekeyPublicKey: toBase64(spk.publicKey)
    });

    // 6. Return public bundle
    return {
        identityPublicKey: toBase64(identityKeypair.publicKey),
        signedPrekey: {
            publicKey: toBase64(spk.publicKey),
            signature: toBase64(spkSignature)
        },
        oneTimePrekeys: opksPublic
    };
}

/**
 * Loads and decrypts the user's private keys from IndexedDB.
 * @param {string} username 
 * @returns {Promise<object|null>} Decrypted private keys
 */
export async function loadDecryptedKeys(username) {
    const masterKey = getMasterKey();
    if (!masterKey) return null;

    const dbKeys = await getKeys(username);
    if (!dbKeys) return null;

    try {
        const identitySecretKeyBytes = decryptData(dbKeys.encryptedIdentityPrivateKey, masterKey);
        const signedPrekeySecretKeyBytes = decryptData(dbKeys.encryptedSignedPrekeyPrivateKey, masterKey);
        const opksBytes = decryptData(dbKeys.encryptedOneTimePrekeys, masterKey);

        const opksList = JSON.parse(sodium.to_string(opksBytes));

        return {
            identityPublicKey: dbKeys.identityPublicKey,
            identitySecretKey: toBase64(identitySecretKeyBytes),
            signedPrekeySecretKey: toBase64(signedPrekeySecretKeyBytes),
            oneTimePrekeys: opksList // Array of { keyId, publicKey, secretKey }
        };
    } catch (error) {
        console.error("Error decrypting local keys:", error);
        return null;
    }
}

/**
 * Encrypt a text message (with optional attachments) for transmission using Double Ratchet.
 * Establishes a session if none exists.
 * 
 * @param {string} partnerUsername 
 * @param {string} privateChatId 
 * @param {string} text - Message text
 * @param {object|null} attachment - Attachment details (fileUrl, fileName, etc.)
 * @param {string} token - User's JWT token
 * @returns {Promise<object>} The encrypted msgData structure to send via socket
 */
export async function encryptOutgoingMessage(partnerUsername, privateChatId, text, attachment, token) {
    await cryptoReady;
    const myUsername = getCurrentUsername();
    if (!myUsername) throw new Error("Local username not set");

    const release = await acquireSessionLock(privateChatId);
    try {
        // Load active session state
        let sessionBlob = await getSessionState(privateChatId);
        let session = null;
        let handshakePayload = null;
        let partnerIdentityPublicKey = null;
        let myIdentityPublicKey = null;

        if (sessionBlob) {
            session = DoubleRatchet.initSessionStateBlob(sessionBlob);
        } else {
            // No session exists, initiate X3DH handshake
            console.log(`Initiating E2EE handshake with ${partnerUsername}...`);
            
            // 1. Fetch partner's bundle
            const response = await fetch(`${getBackendUrl()}/api/keys/bundle/${partnerUsername}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch prekey bundle for ${partnerUsername}`);
            }
            const partnerBundle = await response.json();

            // 2. Load my keys
            const myKeys = await loadDecryptedKeys(myUsername);
            if (!myKeys) throw new Error("Failed to load and decrypt local private keys. Please login again.");

            // 3. Initiate handshake
            const handshakeResult = await initiateSession(myKeys, partnerBundle);
            const { sharedSecret } = handshakeResult;
            handshakePayload = handshakeResult.handshakePayload;

            // 4. Capture keys for verification
            partnerIdentityPublicKey = partnerBundle.identityPublicKey;
            myIdentityPublicKey = myKeys.identityPublicKey;

            // 5. Initialize Double Ratchet session
            const remotePublicKey = fromBase64(partnerBundle.signedPrekey.publicKey);
            session = await DoubleRatchet.init("NexusMessenger", 20, 20, sharedSecret, remotePublicKey, undefined);
        }

        // Prepare plaintext payload object containing message and optional file metadata
        const payload = {
            text: text || "",
            fileUrl: attachment ? attachment.fileUrl : null,
            fileName: attachment ? attachment.fileName : null,
            fileSize: attachment ? attachment.fileSize : null,
            fileType: attachment ? attachment.fileType : null,
            fileQuality: attachment ? attachment.fileQuality : null
        };
        const plaintextBytes = sodium.from_string(JSON.stringify(payload));

        // Encrypt using the Double Ratchet session
        const encrypted = await session.encrypt(plaintextBytes);

        // Save updated session state
        const newSessionBlob = DoubleRatchet.sessionStateBlob(session.sessionState);
        await saveSessionState(privateChatId, newSessionBlob, partnerIdentityPublicKey, myIdentityPublicKey);

        // Encrypt a copy for the sender using their own master key
        let senderCiphertext = null;
        const masterKey = getMasterKey();
        if (masterKey) {
            senderCiphertext = encryptData(plaintextBytes, masterKey);
        }

        // Return the message body format expected by the backend
        return {
            text: toBase64(encrypted.cipher),
            ratchetHeader: {
                publicKey: toBase64(encrypted.header.publicKey),
                messageNumber: encrypted.header.messageNumber,
                numberOfMessagesInPreviousSendingChain: encrypted.header.numberOfMessagesInPreviousSendingChain
            },
            handshakePayload,
            senderCiphertext
        };
    } finally {
        release();
    }
}

/**
 * Decrypts a single message using Double Ratchet (and handles X3DH receiver setup if handshake payload is present).
 * 
 * @param {object} msg - The raw DB Message object
 * @param {string} myUsername 
 * @param {string} token 
 * @returns {Promise<object>} The decrypted message payload
 */
export async function decryptIncomingMessage(msg, myUsername, token) {
    await cryptoReady;
    
    // Handle deleted messages immediately (don't attempt E2EE decryption)
    if (msg.isDeleted) {
        return {
            text: msg.text || "This message was deleted",
            fileUrl: null,
            fileName: null,
            fileSize: null,
            fileType: null,
            fileQuality: null,
            isDeleted: true
        };
    }
    
    // If it has no E2EE header, it is a plaintext legacy message
    if (!msg.ratchetHeader) {
        return {
            text: msg.text,
            fileUrl: msg.fileUrl || null,
            fileName: msg.fileName || null,
            fileSize: msg.fileSize || null,
            fileType: msg.fileType || null,
            fileQuality: msg.fileQuality || null
        };
    }

    const partnerUsername = msg.username;
    const privateChatId = msg.privateChatId;
    if (!privateChatId) throw new Error("E2EE only supported for 1:1 chats");

    // If message is from self, decrypt using own master key
    if (msg.username?.toLowerCase() === myUsername?.toLowerCase()) {
        if (msg.senderCiphertext) {
            const masterKey = getMasterKey();
            if (!masterKey) throw new Error("Master key not loaded. Please log in again.");
            const decryptedBytes = decryptData(msg.senderCiphertext, masterKey);
            return JSON.parse(sodium.to_string(decryptedBytes));
        } else {
            throw new Error("Decryption failed: Message sent by self but no sender ciphertext found");
        }
    }

    const release = await acquireSessionLock(privateChatId);
    try {
        let sessionBlob = await getSessionState(privateChatId);
        let session = null;

        const reconstructedMsg = {
            cipher: fromBase64(msg.text),
            header: new Header(
                fromBase64(msg.ratchetHeader.publicKey),
                msg.ratchetHeader.numberOfMessagesInPreviousSendingChain,
                msg.ratchetHeader.messageNumber
            )
        };

        if (sessionBlob) {
            session = DoubleRatchet.initSessionStateBlob(sessionBlob);
            try {
                // Attempt to decrypt with existing session
                const decryptedBytes = await session.decrypt(reconstructedMsg);
                const decryptedPayload = JSON.parse(sodium.to_string(decryptedBytes));
                
                // Save updated session
                await saveSessionState(privateChatId, DoubleRatchet.sessionStateBlob(session.sessionState));
                return decryptedPayload;
            } catch (error) {
                console.warn("Decryption failed with existing session, checking for handshake payload...", error);
                // Fall through to handshake setup if handshakePayload exists (handles session reset/device change)
                if (!msg.handshakePayload) throw error;
            }
        }

        // No session or decryption failed: check if a handshake payload exists
        if (!msg.handshakePayload) {
            if (sessionBlob) {
                console.warn("Session is permanently corrupted. Deleting local session state.");
                await deleteSessionState(privateChatId);
            }
            throw new Error("Decryption failed: Session out of sync. The corrupted session has been reset. The next message sent will establish a new secure session.");
        }

        console.log(`Receiving E2EE handshake from ${partnerUsername}...`);
        const myKeys = await loadDecryptedKeys(myUsername);
        if (!myKeys) throw new Error("Failed to load and decrypt local private keys. Please login again.");

        // Retrieve my one-time prekey private key if Alice consumed one
        let opkPrivateKeyBase64 = null;
        const requestedOpkId = msg.handshakePayload.oneTimePrekeyId;
        if (requestedOpkId && myKeys.oneTimePrekeys) {
            const foundOpk = myKeys.oneTimePrekeys.find(k => k.keyId === requestedOpkId);
            if (foundOpk) {
                opkPrivateKeyBase64 = foundOpk.secretKey;
                
                // Remove consumed OPK from my local list to preserve forward secrecy
                const updatedOPKs = myKeys.oneTimePrekeys.filter(k => k.keyId !== requestedOpkId);
                const masterKey = getMasterKey();
                const encryptedOPKs = encryptData(sodium.from_string(JSON.stringify(updatedOPKs)), masterKey);
                
                const dbKeys = await getKeys(myUsername);
                await saveKeys(myUsername, {
                    ...dbKeys,
                    encryptedOneTimePrekeys: encryptedOPKs
                });
            } else {
                console.warn(`Consumed OPK ${requestedOpkId} not found in local IndexedDB. Proceeding with DH1-DH3 fallback.`);
            }
        }

        // Calculate the identical shared secret
        const sharedSecret = await receiveSession(myKeys, msg.handshakePayload, opkPrivateKeyBase64);

        // Initialize my Double Ratchet receiver session
        const spkPrivateKey = fromBase64(myKeys.signedPrekeySecretKey);
        const mySPKKeyPair = {
            publicKey: sodium.crypto_scalarmult_base(spkPrivateKey),
            privateKey: spkPrivateKey
        };
        session = await DoubleRatchet.init("NexusMessenger", 20, 20, sharedSecret, undefined, mySPKKeyPair);

        // Decrypt the message
        const decryptedBytes = await session.decrypt(reconstructedMsg);
        const decryptedPayload = JSON.parse(sodium.to_string(decryptedBytes));

        // Save the new session state
        await saveSessionState(privateChatId, DoubleRatchet.sessionStateBlob(session.sessionState), msg.handshakePayload.aliceIdentityPublicKey, myKeys.identityPublicKey);

        return decryptedPayload;
    } finally {
        release();
    }
}

/**
 * Checks server key status, and if one-time prekeys are low (< 5), generates and uploads 20 new ones.
 * @param {string} username 
 * @param {string} token 
 */
export async function replenishOneTimePrekeysIfNeeded(username, token) {
    await cryptoReady;
    
    try {
        const response = await fetch(`${getBackendUrl()}/api/keys/status`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) return;

        const status = await response.json();
        if (status.identityPublicKeyExists && status.oneTimePrekeysCount < 5) {
            console.log(`Remaining one-time prekeys (${status.oneTimePrekeysCount}) is low. Replenishing...`);
            
            const myKeys = await loadDecryptedKeys(username);
            if (!myKeys) return;

            // Generate 20 new X25519 one-time prekeys
            const newOpks = [];
            const opksPublic = [];
            for (let i = 0; i < 20; i++) {
                const opk = sodium.crypto_box_keypair();
                const keyId = Math.floor(Math.random() * 1000000000).toString();
                newOpks.push({
                    keyId,
                    publicKey: toBase64(opk.publicKey),
                    secretKey: toBase64(opk.privateKey)
                });
                opksPublic.push({
                    keyId,
                    publicKey: toBase64(opk.publicKey)
                });
            }

            const masterKey = getMasterKey();
            if (!masterKey) return;

            // Combine existing with new
            const combinedOPKs = [...(myKeys.oneTimePrekeys || []), ...newOpks];
            const encryptedOPKs = encryptData(sodium.from_string(JSON.stringify(combinedOPKs)), masterKey);

            const dbKeys = await getKeys(username);
            await saveKeys(username, {
                ...dbKeys,
                encryptedOneTimePrekeys: encryptedOPKs
            });

            // Upload the public parts to the server
            const replenishRes = await fetch(`${getBackendUrl()}/api/keys/replenish`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ oneTimePrekeys: opksPublic })
            });

            if (replenishRes.ok) {
                console.log("One-time prekeys replenished successfully on the server.");
            }
        }
    } catch (err) {
        console.error("Error checking or replenishing one-time prekeys:", err);
    }
}

function getDecryptedMessageKey(messageId) {
    const myUsername = getCurrentUsername();
    const prefix = myUsername ? `${myUsername.toLowerCase()}_` : "";
    return prefix + messageId;
}

/**
 * Saves a decrypted message payload (encrypted with the master key) to IndexedDB decrypted_messages cache.
 * @param {string} messageId 
 * @param {object} decryptedPayload 
 * @returns {Promise<void>}
 */
export async function saveDecryptedMessage(messageId, decryptedPayload) {
    await cryptoReady;
    const masterKey = getMasterKey();
    if (!masterKey) return;

    const payloadBytes = sodium.from_string(JSON.stringify(decryptedPayload));
    const encrypted = encryptData(payloadBytes, masterKey);
    const key = getDecryptedMessageKey(messageId);

    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("decrypted_messages", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "decrypted_messages");
        const request = store.put({ messageId: key, encrypted });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves and decrypts a cached message payload from IndexedDB.
 * @param {string} messageId 
 * @returns {Promise<object|null>}
 */
export async function getDecryptedMessage(messageId) {
    await cryptoReady;
    const masterKey = getMasterKey();
    if (!masterKey) return null;

    const key = getDecryptedMessageKey(messageId);
    try {
        const db = await openDatabase();
        const record = await new Promise((resolve, reject) => {
            const transaction = db.transaction("decrypted_messages", "readonly");
            const store = transaction.objectStore(transaction.objectStoreNames[0] || "decrypted_messages");
            const request = store.get(key);
            request.onsuccess = (event) => resolve(event.target.result || null);
            request.onerror = () => reject(request.error);
        });

        if (!record || !record.encrypted) return null;

        const decryptedBytes = decryptData(record.encrypted, masterKey);
        return JSON.parse(sodium.to_string(decryptedBytes));
    } catch (error) {
        console.error("Error retrieving decrypted message from cache:", error);
        return null;
    }
}

// In-memory cache of ongoing decryption promises to prevent parallel Double Ratchet decryption races
const ongoingDecryptions = new Map();

/**
 * Checks cache first, and if not present, decrypts incoming message and caches it.
 * Coordinated in-memory to ensure only one decryption executes concurrently per messageId.
 * 
 * @param {object} msg 
 * @param {string} myUsername 
 * @param {string} token 
 * @returns {Promise<object>} The decrypted message payload
 */
export async function decryptAndCacheMessage(msg, myUsername, token) {
    await cryptoReady;
    
    // Handle deleted messages immediately (don't attempt E2EE decryption)
    if (msg.isDeleted) {
        return {
            text: msg.text || "This message was deleted",
            fileUrl: null,
            fileName: null,
            fileSize: null,
            fileType: null,
            fileQuality: null,
            isDeleted: true
        };
    }

    if (!msg._id) {
        // Fallback for temporary messages or messages without a DB ID
        return decryptIncomingMessage(msg, myUsername, token);
    }

    // 1. Check in-memory ongoing decryptions map
    if (ongoingDecryptions.has(msg._id)) {
        return ongoingDecryptions.get(msg._id);
    }

    const decryptPromise = (async () => {
        // 2. Check IndexedDB decrypted message cache
        const cached = await getDecryptedMessage(msg._id);
        if (cached) {
            return cached;
        }

        // 3. Perform the actual cryptographic decryption
        const decryptedPayload = await decryptIncomingMessage(msg, myUsername, token);

        // 4. Save to IndexedDB cache
        await saveDecryptedMessage(msg._id, decryptedPayload);
        return decryptedPayload;
    })();

    ongoingDecryptions.set(msg._id, decryptPromise);

    try {
        return await decryptPromise;
    } finally {
        ongoingDecryptions.delete(msg._id);
    }
}
