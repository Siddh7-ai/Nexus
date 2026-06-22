const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/Chatapp');
        const db = mongoose.connection.db;
        const result = await db.collection('messages').deleteMany({});
        console.log(`Deleted ${result.deletedCount} messages.`);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
