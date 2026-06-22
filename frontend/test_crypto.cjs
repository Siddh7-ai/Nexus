const sodium = require('libsodium-wrappers-sumo');
const { toBase64, fromBase64 } = require('./frontend/src/utils/crypto/encoding.js');

async function test() {
    await sodium.ready;
    const spk = sodium.crypto_box_keypair();
    const pub1 = spk.publicKey;
    const pub2 = sodium.crypto_scalarmult_base(spk.privateKey);
    console.log("pub1 (from keypair):", Buffer.from(pub1).toString('hex'));
    console.log("pub2 (from scalarmult):", Buffer.from(pub2).toString('hex'));
    console.log("Match?", Buffer.compare(pub1, pub2) === 0);
}
test();
