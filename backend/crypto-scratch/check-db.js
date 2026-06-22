const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    username: String,
    text: String,
    room: String,
    privateChatId: String,
    ratchetHeader: mongoose.Schema.Types.Mixed,
    handshakePayload: mongoose.Schema.Types.Mixed,
    createdAt: Date
});

const Message = mongoose.model("Message", messageSchema);

async function checkDatabase() {
    console.log("Connecting to MongoDB...");
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/Chatapp");
        console.log("Connected successfully!");

        console.log("\n=== Retrieving the last 10 private E2EE messages ===");
        const messages = await Message.find({ privateChatId: { $ne: null } })
            .sort({ createdAt: -1 })
            .limit(10);

        if (messages.length === 0) {
            console.log("No private messages found in the database yet.");
        } else {
            messages.forEach((msg, idx) => {
                console.log(`\nMessage #${idx + 1}`);
                console.log(`ID:            ${msg._id}`);
                console.log(`Sender:        ${msg.username}`);
                console.log(`Chat ID:       ${msg.privateChatId}`);
                console.log(`Raw Text (DB): ${msg.text}`);
                console.log(`E2EE Ratchet:  ${msg.ratchetHeader ? "YES" : "NO"}`);
                if (msg.ratchetHeader) {
                    console.log(`- Message #:   ${msg.ratchetHeader.messageNumber}`);
                    console.log(`- DH Ratchet:  ${msg.ratchetHeader.publicKey}`);
                }
                console.log(`Handshake:     ${msg.handshakePayload ? "YES" : "NO"}`);
            });
        }
    } catch (err) {
        console.error("Database check failed:", err);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB.");
    }
}

checkDatabase();
