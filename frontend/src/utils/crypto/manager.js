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
    // Store in both sessionStorage and localStorage for persistent login support
    sessionStorage.setItem("nexus_master_key", toBase64(key));
    localStorage.setItem("nexus_master_key", toBase64(key));
}

/**
 * Retrieve the master key from memory, sessionStorage, or localStorage.
 * @returns {Uint8Array|null}
 */
export function getMasterKey() {
    if (inMemoryMasterKey) return inMemoryMasterKey;
    const sessionVal = sessionStorage.getItem("nexus_master_key") || localStorage.getItem("nexus_master_key");
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

    // 6. Return public bundle and encrypted private keys
    return {
        identityPublicKey: toBase64(identityKeypair.publicKey),
        signedPrekey: {
            publicKey: toBase64(spk.publicKey),
            signature: toBase64(spkSignature)
        },
        oneTimePrekeys: opksPublic,
        encryptedIdentityPrivateKey: encryptedIK,
        encryptedSignedPrekeyPrivateKey: encryptedSPK,
        encryptedOneTimePrekeys: encryptedOPKs
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
        let vaultKey = null;

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
            vaultKey = handshakeResult.vaultKey;
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
        let encryptedVaultKey = null;
        if (vaultKey) {
            const masterKey = getMasterKey();
            if (masterKey) {
                encryptedVaultKey = encryptData(vaultKey, masterKey);
            }
        }
        await saveSessionState(privateChatId, newSessionBlob, partnerIdentityPublicKey, myIdentityPublicKey, encryptedVaultKey);
        syncSessionToServer(privateChatId);

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
 * Asynchronously backs up the decrypted incoming message plaintext by re-encrypting it
 * with the user's master key and sending it to the server's backup endpoint.
 */
function backupReceiverCiphertext(msg, decryptedPayload, token) {
    if (!msg || !msg._id || msg.receiverCiphertext) return;
    const masterKey = getMasterKey();
    if (!masterKey) return;

    try {
        const payloadBytes = sodium.from_string(JSON.stringify(decryptedPayload));
        const encrypted = encryptData(payloadBytes, masterKey);

        // Non-blocking fire-and-forget request
        fetch(`${getBackendUrl()}/api/messages/${msg._id}/backup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ receiverCiphertext: encrypted })
        }).then(res => {
            if (!res.ok) {
                console.error(`Failed to save receiver backup: status ${res.status}`);
            }
        }).catch(err => {
            console.error("Error saving receiver backup to API:", err);
        });
    } catch (err) {
        console.error("Error preparing receiver backup ciphertext:", err);
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
                syncSessionToServer(privateChatId);

                // Perform receiver backup (non-blocking)
                backupReceiverCiphertext(msg, decryptedPayload, token);

                return decryptedPayload;
            } catch (error) {
                console.warn("Decryption failed with existing session, checking for handshake payload...", error);
                // Fall through to handshake setup if handshakePayload exists (handles session reset/device change)
                if (!msg.handshakePayload) throw error;
            }
        }

        // No session or decryption failed: check if a handshake payload exists
        if (!msg.handshakePayload) {
            throw new Error("Decryption failed: Session out of sync.");
        }

        console.log(`[E2EE] Receiving handshake from ${partnerUsername}...`);
        const myKeys = await loadDecryptedKeys(myUsername);
        if (!myKeys) throw new Error("Failed to load and decrypt local private keys. Please login again.");
        console.log("[E2EE Debug] Local identity public key:", myKeys.identityPublicKey);
        console.log("[E2EE Debug] Handshake payload received:", JSON.stringify(msg.handshakePayload));

        // Retrieve my one-time prekey private key if Alice consumed one
        let opkPrivateKeyBase64 = null;
        let foundOpk = null;
        const requestedOpkId = msg.handshakePayload.oneTimePrekeyId;
        if (requestedOpkId && myKeys.oneTimePrekeys) {
            foundOpk = myKeys.oneTimePrekeys.find(k => k.keyId === requestedOpkId);
            if (foundOpk) {
                opkPrivateKeyBase64 = foundOpk.secretKey;
                console.log("[E2EE Debug] Found matching OPK private key in IndexedDB for ID:", requestedOpkId);
            } else {
                console.warn(`[E2EE Warning] Consumed OPK ${requestedOpkId} not found in local IndexedDB. Proceeding with DH1-DH3 fallback.`);
            }
        } else {
            console.log("[E2EE Debug] No OPK was consumed for this handshake.");
        }

        // Calculate the identical shared secret
        const { sharedSecret, vaultKey } = await receiveSession(myKeys, msg.handshakePayload, opkPrivateKeyBase64);
        console.log("[E2EE Debug] Receiver shared secret first 5 bytes:", toBase64(sharedSecret.slice(0, 5)));

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
        console.log("[E2EE Debug] Decryption successful!");

        // Remove consumed OPK from my local list ONLY after successful decryption
        if (foundOpk) {
            const updatedOPKs = myKeys.oneTimePrekeys.filter(k => k.keyId !== requestedOpkId);
            const masterKey = getMasterKey();
            const encryptedOPKs = encryptData(sodium.from_string(JSON.stringify(updatedOPKs)), masterKey);
            const dbKeys = await getKeys(myUsername);
            await saveKeys(myUsername, {
                ...dbKeys,
                encryptedOneTimePrekeys: encryptedOPKs
            });
            console.log("[E2EE Debug] Safely deleted consumed OPK from IndexedDB.");
        }

        // Save the new session state
        let encryptedVaultKey = null;
        if (vaultKey) {
            const masterKey = getMasterKey();
            if (masterKey) {
                encryptedVaultKey = encryptData(vaultKey, masterKey);
            }
        }
        await saveSessionState(privateChatId, DoubleRatchet.sessionStateBlob(session.sessionState), msg.handshakePayload.aliceIdentityPublicKey, myKeys.identityPublicKey, encryptedVaultKey);
        syncSessionToServer(privateChatId);

        // Perform receiver backup (non-blocking)
        backupReceiverCiphertext(msg, decryptedPayload, token);

        return decryptedPayload;
    } catch (err) {
        // Fallback: Try to decrypt using receiverCiphertext backup if it exists
        if (msg.receiverCiphertext) {
            const masterKey = getMasterKey();
            if (masterKey) {
                try {
                    const decryptedBytes = decryptData(msg.receiverCiphertext, masterKey);
                    return JSON.parse(sodium.to_string(decryptedBytes));
                } catch (fallbackErr) {
                    console.error("Fallback receiverCiphertext decryption failed:", fallbackErr);
                }
            }
        }
        throw err;
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

function getDecryptedMessageKey(messageId, myUsername) {
    const username = myUsername || getCurrentUsername();
    const prefix = username ? `${username.toLowerCase()}_` : "";
    return prefix + messageId;
}

/**
 * Saves a decrypted message payload (encrypted with the master key) to IndexedDB decrypted_messages cache.
 * @param {string} messageId 
 * @param {object} decryptedPayload 
 * @param {string} [myUsername]
 * @returns {Promise<void>}
 */
export async function saveDecryptedMessage(messageId, decryptedPayload, myUsername) {
    await cryptoReady;
    const masterKey = getMasterKey();
    if (!masterKey) return;

    const payloadBytes = sodium.from_string(JSON.stringify(decryptedPayload));
    const encrypted = encryptData(payloadBytes, masterKey);
    const key = getDecryptedMessageKey(messageId, myUsername);

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
 * @param {string} [myUsername]
 * @returns {Promise<object|null>}
 */
export async function getDecryptedMessage(messageId, myUsername) {
    await cryptoReady;
    const masterKey = getMasterKey();
    if (!masterKey) return null;

    const key = getDecryptedMessageKey(messageId, myUsername);
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
        const cached = await getDecryptedMessage(msg._id, myUsername);
        if (cached) {
            return cached;
        }

        // 3. Perform the actual cryptographic decryption
        const decryptedPayload = await decryptIncomingMessage(msg, myUsername, token);

        // 4. Save to IndexedDB cache (fire-and-forget)
        saveDecryptedMessage(msg._id, decryptedPayload, myUsername).catch(err => {
            console.error("Failed to save to IndexedDB cache:", err);
        });
        return decryptedPayload;
    })();

    ongoingDecryptions.set(msg._id, decryptPromise);

    try {
        return await decryptPromise;
    } finally {
        ongoingDecryptions.delete(msg._id);
    }
}

/**
 * Retrieves the vault key from the existing E2EE session.
 * If no session exists, it establishes it using the partner's prekey bundle (X3DH handshake)
 * and initializes the Double Ratchet state in IndexedDB.
 * This ensures that a vault key is always available when configuring the Shared Vault PIN.
 * 
 * @param {string} privateChatId 
 * @param {string} partnerUsername 
 * @param {string} token 
 * @returns {Promise<Uint8Array>} The 32-byte E2EE vault key
 */
export async function getOrCreateVaultKey(privateChatId, partnerUsername, token) {
    await cryptoReady;
    const myUsername = getCurrentUsername();
    if (!myUsername) throw new Error("Local username not set");

    console.log(`Deriving static shared vault key for ${partnerUsername}...`);
    
    // Fetch partner's bundle
    const response = await fetch(`${getBackendUrl()}/api/keys/bundle/${partnerUsername}`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch prekey bundle for ${partnerUsername}`);
    }
    const partnerBundle = await response.json();
    const partnerIK_raw = fromBase64(partnerBundle.identityPublicKey);
    const partnerIK_X25519 = sodium.crypto_sign_ed25519_pk_to_curve25519(partnerIK_raw);

    // Load my keys
    const myKeys = await loadDecryptedKeys(myUsername);
    if (!myKeys) throw new Error("Failed to load and decrypt local private keys. Please login again.");

    const myIK_sec_raw = fromBase64(myKeys.identitySecretKey);
    const myIK_X25519_sec = sodium.crypto_sign_ed25519_sk_to_curve25519(myIK_sec_raw);

    // Compute static ECDH shared secret: DH(IK_my, IK_partner)
    const staticSharedSecret = sodium.crypto_scalarmult(myIK_X25519_sec, partnerIK_X25519);

    // Derive vault key via KDF
    const vaultKey = sodium.crypto_kdf_derive_from_key(
        32,
        1,
        "vaultkey", // exactly 8 chars
        staticSharedSecret
    );

    return vaultKey;
}

/**
 * Backs up the encrypted session state to the server (non-blocking).
 */
export async function syncSessionToServer(chatId) {
    try {
        const token = sessionStorage.getItem("token") || localStorage.getItem("token");
        if (!token || token.startsWith("guest:")) return;

        const record = await getFullSessionRecord(chatId);
        if (!record) return;

        const masterKey = getMasterKey();
        if (!masterKey) return;

        // Encrypt the entire record JSON string
        const encrypted = encryptData(sodium.from_string(JSON.stringify(record)), masterKey);

        // Upload in background
        fetch(`${getBackendUrl()}/api/keys/backup/session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                chatId,
                nonce: encrypted.nonce,
                ciphertext: encrypted.ciphertext
            })
        }).catch(err => console.error("Error syncing session backup to server:", err));
    } catch (err) {
        console.error("Failed to sync session backup:", err);
    }
}

/**
 * Restores E2EE keys and sessions from server backup and saves them to IndexedDB.
 */
export async function restoreBackupFromServer(username, token) {
    await cryptoReady;
    try {
        const response = await fetch(`${getBackendUrl()}/api/keys/backup`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) {
            console.log("No backup found or error fetching backup.");
            return false;
        }

        const backup = await response.json();
        
        // Restore keys if they exist in backup
        if (backup.identityPublicKey && backup.encryptedIdentityPrivateKey?.ciphertext) {
            await saveKeys(username, {
                encryptedIdentityPrivateKey: backup.encryptedIdentityPrivateKey,
                encryptedSignedPrekeyPrivateKey: backup.encryptedSignedPrekeyPrivateKey,
                encryptedOneTimePrekeys: backup.encryptedOneTimePrekeys,
                identityPublicKey: backup.identityPublicKey,
                signedPrekeyPublicKey: backup.signedPrekey?.publicKey
            });
            console.log("[E2EE Backup] Restored cryptographic keys to local IndexedDB successfully.");
        } else {
            console.log("[E2EE Backup] No key backup exists on server.");
            return false;
        }

        // Restore sessions if they exist in backup
        if (Array.isArray(backup.encryptedSessions) && backup.encryptedSessions.length > 0) {
            const masterKey = getMasterKey();
            if (!masterKey) {
                console.warn("[E2EE Backup] Master key not loaded. Cannot restore sessions yet.");
                return true; // Keys were restored
            }

            for (const encSession of backup.encryptedSessions) {
                try {
                    const decryptedBytes = decryptData(encSession, masterKey);
                    const record = JSON.parse(sodium.to_string(decryptedBytes));
                    
                    const prefix = `${username.toLowerCase()}_`;
                    const cleanChatId = record.chatId.startsWith(prefix) ? record.chatId.slice(prefix.length) : record.chatId;

                    await saveSessionState(
                        cleanChatId,
                        record.sessionBlob,
                        record.partnerIdentityPublicKey,
                        record.myIdentityPublicKey,
                        record.encryptedVaultKey
                    );
                } catch (err) {
                    console.error(`[E2EE Backup] Failed to decrypt and restore session for ${encSession.chatId}:`, err);
                }
            }
            console.log(`[E2EE Backup] Restored ${backup.encryptedSessions.length} sessions to local IndexedDB.`);
        }
        
        return true;
    } catch (err) {
        console.error("Error restoring backup from server:", err);
        return false;
    }
}

