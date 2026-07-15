const mongoose = require("mongoose");
const logger = require("../utils/logger");

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/Chatapp";
  
  try {
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10, // Optimize connection pooling
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    logger.info("Successfully connected to MongoDB.");
  } catch (error) {
    logger.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

module.exports = {
  connectDB
};
