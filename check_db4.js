const { MongoClient } = require('mongodb');

async function run() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    try {
        await client.connect();
        const db = client.db('Chatapp');
        const msgs = await db.collection('messages').find({ senderCiphertext: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(2).toArray();
        console.log("Raw messages from DB:");
        msgs.forEach(msg => {
            console.log(JSON.stringify(msg, null, 2));
        });
    } finally {
        await client.close();
    }
}

run().catch(console.error);
