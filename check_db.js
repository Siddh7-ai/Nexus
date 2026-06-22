const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/nexus').then(async () => {
    const Message = require('./backend/models/Message.js');
    const msg = await Message.findOne({ 'senderCiphertext': { $ne: null } }).sort({createdAt: -1});
    console.log('msg.senderCiphertext:', msg ? msg.senderCiphertext : 'Not found');
    process.exit(0);
}).catch(console.error);
