import { DoubleRatchet, Header } from "double-ratchet-ts";
import sodium from 'libsodium-wrappers';

(async () => {
    await sodium.ready;
    console.log("=== Testing double-ratchet-ts ===");

    const sharedSecret = new Uint8Array(32).fill(7);
    const info = "NexusTestSession";

    // Initialize Bob
    const bob = await DoubleRatchet.init(info, 20, 20, sharedSecret, undefined, undefined);
    console.log("Bob initialized.");

    // Bob sends public key to Alice
    const bobPubKey = bob.publicKey();
    console.log("Bob's public key (base64):", sodium.to_base64(bobPubKey));

    // Initialize Alice with Bob's public key
    const alice = await DoubleRatchet.init(info, 20, 20, sharedSecret, bobPubKey, undefined);
    console.log("Alice initialized.");

    // Alice encrypts a message
    const msgText = "Secret message text!";
    const msgBytes = sodium.from_string(msgText);
    const encrypted = await alice.encrypt(msgBytes);

    console.log("\nEncrypted Message Object:", encrypted);
    console.log("Keys of encrypted:", Object.keys(encrypted));
    console.log("Keys of encrypted.header:", Object.keys(encrypted.header));
    if (encrypted.header.dh) {
        console.log("Keys of encrypted.header.dh:", Object.keys(encrypted.header.dh));
    }
    console.log("Header Previous Chain Length (PN):", encrypted.header.pn);

    // Rebuild encrypted payload as a plain JS object to simulate network transport serialization
    const serializedMessage = {
        text: sodium.to_base64(encrypted.cipher),
        ratchetHeader: {
            publicKey: sodium.to_base64(encrypted.header.publicKey),
            messageNumber: encrypted.header.messageNumber,
            numberOfMessagesInPreviousSendingChain: encrypted.header.numberOfMessagesInPreviousSendingChain
        }
    };

    console.log("\nSimulated Network Serialized Object:", serializedMessage);

    const reconstructed = {
        cipher: sodium.from_base64(serializedMessage.text),
        header: new Header(
            sodium.from_base64(serializedMessage.ratchetHeader.publicKey),
            serializedMessage.ratchetHeader.numberOfMessagesInPreviousSendingChain,
            serializedMessage.ratchetHeader.messageNumber
        )
    };

    // Bob decrypts the reconstructed plain object
    const decryptedBytes = await bob.decrypt(reconstructed);
    const decryptedText = sodium.to_string(decryptedBytes);
    console.log("\nDecrypted Message Text:", decryptedText);

    if (decryptedText === msgText) {
        console.log("\nSUCCESS: Double Ratchet encryption/decryption worked perfectly!");
    } else {
        console.error("\nFAIL: Decrypted message does not match!");
    }
})();
