// 1. Load environment variables
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const index = trimmed.indexOf("=");
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        const val = trimmed.substring(index + 1).trim();
        if (key) {
          process.env[key] = val;
        }
      }
    }
  });
}

const { validateEnv } = require("./config/env");
const { connectDB } = require("./config/db");
const logger = require("./utils/logger");

// Validate configurations & connect database
validateEnv();
connectDB();

const app = require("./app");
const { initSockets } = require("./sockets/chatSocket");
const { startSLABreachChecker } = require("./jobs/slaJob");
const { startPythonASR, cleanUpProcess } = require("./services/asrService");

const server = http.createServer(app);

// 2. Initialize Socket.io with max 10MB payload size limit
const io = new Server(server, {
  maxHttpBufferSize: 1e7,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.set("io", io);

// Bind Socket.io events
initSockets(io);

// Start background SLA breach check
const slaIntervalId = startSLABreachChecker(io);

// Auto-spawn Python speech recognition microservice if enabled ASR
startPythonASR();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server successfully started on port ${PORT}`);
});

// 3. Graceful Shutdown & Connection Draining handler
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting production-grade connection draining shutdown...`);

  // Stop background intervals
  clearInterval(slaIntervalId);
  logger.info("[Shutdown] SLA Checker background job halted.");

  // Stop ASR Python microservice
  cleanUpProcess();
  logger.info("[Shutdown] Python ASR process stopped.");

  // Close socket connections
  io.close(() => {
    logger.info("[Shutdown] All active WebSockets closed.");
  });

  // Stop HTTP server accepting new connections
  server.close(async () => {
    logger.info("[Shutdown] Express HTTP server stopped.");
    
    // Close database connections
    const mongoose = require("mongoose");
    try {
      await mongoose.connection.close();
      logger.info("[Shutdown] MongoDB database connection closed.");
      process.exit(0);
    } catch (dbErr) {
      logger.error("[Shutdown] Error during database connection termination:", dbErr);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error("[Shutdown] Graceful connection draining timed out. Force exiting...");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
