const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const keyRoutes = require("./routes/keyRoutes");
const nexTaskRoutes = require("./routes/nexTaskRoutes");
const directRoutes = require("./routes/directRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Disable x-powered-by signature header
app.disable("x-powered-by");

// Setup secure helmet headers & CSP policies
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
        mediaSrc: ["'self'", "data:", "blob:", "http:", "https:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(cors());

// 1. Health Status check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 2. Register API Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/nextask", nexTaskRoutes);
app.use("/", directRoutes);

// 3. Serve Frontend Build Assets
app.use(express.static(path.join(__dirname, "../../frontend/dist")));

// 4. Catch-all fallback route to serve the built React application (SPA)
app.get("*all", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../../frontend/dist/index.html"));
  }
});

// 5. Global Error Handler Middleware
app.use(errorHandler);

module.exports = app;
