import sodium from 'libsodium-wrappers-sumo';
import { fromBase64, toBase64, cryptoReady } from './encoding';
import { getVaultPinData, saveVaultPinData, getFullSessionRecord } from './keydb';
import { getMasterKey } from './manager';
import { getBackendUrl } from '../config';

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
 * Derive PIN key using crypto_pwhash
 * @param {string} pinString 
 * @param {Uint8Array} saltBytes 
 * @returns {Promise<Uint8Array>}
 */
export async function derivePinKey(pinString, saltBytes) {
    await cryptoReady;
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pinString);

    const pinDerivedKey = sodium.crypto_pwhash(
        32,
        pinBytes,
        saltBytes,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
    );
    return pinDerivedKey;
}

/**
 * Setup or re-setup a Vault PIN.
 * @param {string} pinString 
 * @param {Uint8Array} vaultKey 
 * @param {string} pinType - "4digit" | "6digit" | "custom"
 * @param {string} myUsername 
 * @param {string} privateChatId 
 * @returns {Promise<void>}
 */
export async function setupVaultPin(pinString, vaultKey, pinType, myUsername, privateChatId) {
    await cryptoReady;
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pinString);

    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const pinDerivedKey = await derivePinKey(pinString, salt);

    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(vaultKey, nonce, pinDerivedKey);

    const pinHash = sodium.crypto_generichash(32, pinBytes);

    const pinId = `vault_pin_${myUsername.toLowerCase()}_${privateChatId.toLowerCase()}`;
    const pinData = {
        salt: toBase64(salt),
        encryptedVaultKey: {
            nonce: toBase64(nonce),
            ciphertext: toBase64(ciphertext)
        },
        pinType,
        pinHash: toBase64(pinHash)
    };

    await saveVaultPinData(pinId, pinData);

    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (token && !token.startsWith("guest:")) {
        try {
            const response = await fetch(`${getBackendUrl()}/api/vault-pin/${pinId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(pinData)
            });
            if (!response.ok) {
                console.error("Failed to synchronize vault PIN to server");
            }
        } catch (e) {
            console.error("Error synchronizing vault PIN to server:", e);
        }
    }
}

/**
 * Verifies PIN hash without decrypting the vault key
 * @param {string} pinString 
 * @param {object} pinData 
 * @returns {Promise<boolean>}
 */
export async function verifyVaultPin(pinString, pinData) {
    await cryptoReady;
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pinString);
    const enteredHash = sodium.crypto_generichash(32, pinBytes);
    const storedHash = fromBase64(pinData.pinHash);

    return sodium.memcmp(enteredHash, storedHash);
}

/**
 * Decrypts the vault key with a PIN derived key
 * @param {string} pinString 
 * @param {object} pinData 
 * @returns {Promise<Uint8Array|null>}
 */
export async function decryptVaultKeyWithPin(pinString, pinData) {
    await cryptoReady;
    const saltBytes = fromBase64(pinData.salt);
    const pinDerivedKey = await derivePinKey(pinString, saltBytes);

    const nonce = fromBase64(pinData.encryptedVaultKey.nonce);
    const ciphertext = fromBase64(pinData.encryptedVaultKey.ciphertext);

    try {
        const decryptedVaultKey = sodium.crypto_secretbox_open_easy(ciphertext, nonce, pinDerivedKey);
        return decryptedVaultKey;
    } catch (e) {
        console.error("Vault key decryption with PIN failed:", e);
        return null;
    }
}

/**
 * Symmetric encryption helper using the vault key
 * @param {object} plaintextPayload 
 * @param {Uint8Array} vaultKey 
 * @returns {Promise<object>}
 */
export async function encryptVaultItem(plaintextPayload, vaultKey) {
    await cryptoReady;
    const payloadBytes = sodium.from_string(JSON.stringify(plaintextPayload));
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(payloadBytes, nonce, vaultKey);
    return {
        nonce: toBase64(nonce),
        ciphertext: toBase64(ciphertext)
    };
}

/**
 * Symmetric decryption helper using the vault key
 * @param {object} encryptedObj 
 * @param {Uint8Array} vaultKey 
 * @returns {Promise<object>}
 */
export async function decryptVaultItem(encryptedObj, vaultKey) {
    await cryptoReady;
    const nonce = fromBase64(encryptedObj.nonce);
    const ciphertext = fromBase64(encryptedObj.ciphertext);
    const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, vaultKey);
    return JSON.parse(sodium.to_string(decryptedBytes));
}

/**
 * Retrieves the raw vault key from IndexedDB sessions store (encrypted with master key) and decrypts it.
 * @param {string} privateChatId 
 * @returns {Promise<Uint8Array|null>}
 */
export async function getVaultKeyFromSession(privateChatId) {
    await cryptoReady;
    const record = await getFullSessionRecord(privateChatId);
    if (!record || !record.encryptedVaultKey) return null;

    const masterKey = getMasterKey();
    if (!masterKey) return null;

    try {
        const decryptedBytes = decryptData(record.encryptedVaultKey, masterKey);
        return decryptedBytes;
    } catch (e) {
        console.error("Decrypting vault key from session record failed:", e);
        return null;
    }
}
