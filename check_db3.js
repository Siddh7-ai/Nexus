const { MongoClient } = require('mongodb');

async function run() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    try {
        await client.connect();
        const db = client.db('nexus');
        const msgs = await db.collection('messages').find({ ratchetHeader: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(2).toArray();
        console.log("Messages with ratchetHeader:");
        msgs.forEach(msg => {
            console.log(JSON.stringify(msg, null, 2));
        });
    } finally {
        await client.close();
    }
}

run().catch(console.error);
