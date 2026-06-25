import { getBackendUrl } from '../config';

const DB_NAME = "nexus_crypto_db";
const DB_VERSION = 3;

/**
 * Open or initialize the IndexedDB database.
 * Creates stores: 'key_material', 'sessions', 'decrypted_messages', and 'vault_pins'.
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
            if (!db.objectStoreNames.contains("vault_pins")) {
                db.createObjectStore("vault_pins", { keyPath: "pinId" });
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

export function getCurrentUsername() {
    // Try sessionStorage first
    let username = sessionStorage.getItem("username") || localStorage.getItem("username");
    if (username) return username;

    // Try parsing the token from sessionStorage/localStorage
    let token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (!token) {
        const guestProfileStr = localStorage.getItem("guestProfile");
        if (guestProfileStr) {
            try {
                const profile = JSON.parse(guestProfileStr);
                if (profile && profile.username) {
                    token = `guest:${profile.username}`;
                }
            } catch (e) {}
        }
    }

    if (token) {
        if (token.startsWith("guest:")) {
            return token.split(":")[1];
        }
        try {
            const base64Url = token.split(".")[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split("")
                    .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                    .join("")
            );
            const parsed = JSON.parse(jsonPayload);
            return parsed?.username || null;
        } catch (e) {
            return null;
        }
    }
    return null;
}

function getSessionKey(chatId) {
    const myUsername = getCurrentUsername();
    const prefix = myUsername ? `${myUsername.toLowerCase()}_` : "";
    return prefix + chatId.toLowerCase();
}

/**
 * Saves the Double Ratchet session blob string and cached identity public keys for verification.
 * @param {string} chatId - Target privateChatId (e.g. "user1_user2")
 * @param {string} sessionBlob 
 * @param {string} [partnerIdentityPublicKey]
 * @param {string} [myIdentityPublicKey]
 * @returns {Promise<void>}
 */
export async function saveSessionState(chatId, sessionBlob, partnerIdentityPublicKey = null, myIdentityPublicKey = null, encryptedVaultKey = null) {
    const db = await openDatabase();
    const key = getSessionKey(chatId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const getRequest = store.get(key);

        getRequest.onsuccess = (e) => {
            const existing = e.target.result || {};
            const record = {
                chatId: key,
                sessionBlob,
                partnerIdentityPublicKey: partnerIdentityPublicKey || existing.partnerIdentityPublicKey || null,
                myIdentityPublicKey: myIdentityPublicKey || existing.myIdentityPublicKey || null,
                encryptedVaultKey: encryptedVaultKey || existing.encryptedVaultKey || null
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
    const key = getSessionKey(chatId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readonly");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.get(key);

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
    const key = getSessionKey(chatId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readonly");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.get(key);

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
    const key = getSessionKey(chatId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Map to hold lock queues per chatId
const sessionLocks = new Map();

/**
 * Acquire a promise-based queue lock for a specific chatId.
 * Returns a function to release the lock.
 * 
 * @param {string} chatId 
 * @returns {Promise<function>} release function
 */
export async function acquireSessionLock(chatId) {
    const key = getSessionKey(chatId);
    
    // Get existing queue or initialize a new one
    if (!sessionLocks.has(key)) {
        sessionLocks.set(key, Promise.resolve());
    }
    
    const currentQueue = sessionLocks.get(key);
    
    let release;
    const nextPromise = new Promise((resolve) => {
        release = resolve;
    });
    
    // Update the map with the new promise chain link
    sessionLocks.set(key, currentQueue.then(() => nextPromise).catch(() => nextPromise));
    
    // Wait for the previous chain link to resolve
    await currentQueue;
    
    return () => {
        release();
    };
}

/**
 * Caches identity public keys in the session record without modifying the sessionBlob.
 * 
 * @param {string} chatId 
 * @param {string} partnerIdentityPublicKey 
 * @param {string} myIdentityPublicKey 
 * @returns {Promise<void>}
 */
export async function cacheSessionIdentityKeys(chatId, partnerIdentityPublicKey, myIdentityPublicKey) {
    const db = await openDatabase();
    const key = getSessionKey(chatId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("sessions", "readwrite");
        const store = transaction.objectStore(transaction.objectStoreNames[0] || "sessions");
        const getRequest = store.get(key);

        getRequest.onsuccess = (e) => {
            const existing = e.target.result;
            if (!existing) {
                const record = {
                    chatId: key,
                    sessionBlob: null,
                    partnerIdentityPublicKey,
                    myIdentityPublicKey
                };
                const putRequest = store.put(record);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                existing.partnerIdentityPublicKey = partnerIdentityPublicKey || existing.partnerIdentityPublicKey;
                existing.myIdentityPublicKey = myIdentityPublicKey || existing.myIdentityPublicKey;
                const putRequest = store.put(existing);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * Saves E2EE Vault PIN data for a private chat in IndexedDB.
 * @param {string} pinId - e.g. "vault_pin_${myUsername}_${chatId}"
 * @param {object} data - { salt, encryptedVaultKey: { nonce, ciphertext }, pinType, pinHash }
 * @returns {Promise<void>}
 */
export async function saveVaultPinData(pinId, data) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("vault_pins", "readwrite");
        const store = transaction.objectStore("vault_pins");
        const request = store.put({ pinId, ...data });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves E2EE Vault PIN data from IndexedDB.
 * @param {string} pinId
 * @returns {Promise<object|null>}
 */
export async function getVaultPinData(pinId) {
    const db = await openDatabase();
    const localData = await new Promise((resolve, reject) => {
        const transaction = db.transaction("vault_pins", "readonly");
        const store = transaction.objectStore("vault_pins");
        const request = store.get(pinId);

        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = () => reject(request.error);
    });

    if (localData) {
        return localData;
    }

    // Fallback: fetch from server
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (token && !token.startsWith("guest:")) {
        try {
            const response = await fetch(`${getBackendUrl()}/api/vault-pin/${pinId}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (response.ok) {
                const serverData = await response.json();
                if (serverData) {
                    // Cache in IndexedDB for subsequent requests
                    await saveVaultPinData(pinId, serverData);
                    return { pinId, ...serverData };
                }
            }
        } catch (e) {
            console.error("Error fetching vault PIN from server:", e);
        }
    }

    return null;
}
