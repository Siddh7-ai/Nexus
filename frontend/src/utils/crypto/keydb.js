const DB_NAME = "nexus_crypto_db";
const DB_VERSION = 2;

/**
 * Open or initialize the IndexedDB database.
 * Creates stores: 'key_material', 'sessions', and 'decrypted_messages'.
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("key_material")) {
                db.createObjectStore("key_material", { keyPath: "username" });
            }
            if (!db.objectStoreNames.contains("sessions")) {
                db.createObjectStore("sessions", { keyPath: "chatId" });
            }
            if (!db.objectStoreNames.contains("decrypted_messages")) {
                db.createObjectStore("decrypted_messages", { keyPath: "messageId" });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error("IndexedDB open error:", event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Saves encrypted key materials for a user in IndexedDB.
 * @param {string} username 
 * @param {object} keys - { encryptedIdentityPrivateKey, encryptedSignedPrekeyPrivateKey, encryptedOneTimePrekeys, identityPublicKey, signedPrekeyPublicKey }
 * @returns {Promise<void>}
 */
export async function saveKeys(username, keys) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("key_material", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "key_material");
        const request = store.put({ username: username.toLowerCase(), ...keys });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves the encrypted key materials for a user from IndexedDB.
 * @param {string} username 
 * @returns {Promise<object|null>}
 */
export async function getKeys(username) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("key_material", "readonly");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "key_material");
        const request = store.get(username.toLowerCase());

        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Saves the Double Ratchet session blob string and cached identity public keys for verification.
 * @param {string} chatId - Target privateChatId (e.g. "user1_user2")
 * @param {string} sessionBlob 
 * @param {string} [partnerIdentityPublicKey]
 * @param {string} [myIdentityPublicKey]
 * @returns {Promise<void>}
 */
export async function saveSessionState(chatId, sessionBlob, partnerIdentityPublicKey = null, myIdentityPublicKey = null) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const getRequest = store.get(chatId.toLowerCase());

        getRequest.onsuccess = (e) => {
            const existing = e.target.result || {};
            const record = {
                chatId: chatId.toLowerCase(),
                sessionBlob,
                partnerIdentityPublicKey: partnerIdentityPublicKey || existing.partnerIdentityPublicKey || null,
                myIdentityPublicKey: myIdentityPublicKey || existing.myIdentityPublicKey || null
            };
            const putRequest = store.put(record);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * Retrieves the Double Ratchet session blob string for a contact.
 * @param {string} chatId 
 * @returns {Promise<string|null>}
 */
export async function getSessionState(chatId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readonly");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.get(chatId.toLowerCase());

        request.onsuccess = (event) => {
            const res = event.target.result;
            resolve(res ? res.sessionBlob : null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves the full session record (including public keys) from IndexedDB.
 * @param {string} chatId 
 * @returns {Promise<object|null>}
 */
export async function getFullSessionRecord(chatId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readonly");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.get(chatId.toLowerCase());

        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Deletes a session state (e.g. if we want to reset a session).
 * @param {string} chatId 
 * @returns {Promise<void>}
 */
export async function deleteSessionState(chatId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.delete(chatId.toLowerCase());

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
