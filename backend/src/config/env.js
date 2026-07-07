const logger = require("../utils/logger");

const REQUIRED_ENV_VARS = ["MONGO_URI", "JWT_SECRET"];

function validateEnv() {
  const missing = [];
  
  REQUIRED_ENV_VARS.forEach((key) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    logger.warn(`[Nexus Config] Missing environment variables: ${missing.join(", ")}. Falling back to default values for development.`);
    if (!process.env.MONGO_URI) {
      process.env.MONGO_URI = "mongodb://localhost:27017/Chatapp";
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "mysecretkey";
    }
  } else {
    logger.info("[Nexus Config] Environment variables validated successfully.");
  }
}

module.exports = {
  validateEnv
};
