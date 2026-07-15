const { spawn } = require("child_process");
const path = require("path");
const logger = require("../utils/logger");

let pythonProcess = null;

function startPythonASR() {
  if ((process.env.TRANSCRIPTION_MODE || "local") !== "server") return;

  logger.info("[Python ASR] Spawning Python ASR microservice process...");
  const pythonExec = "C:\\Users\\Raulji Siddharthsinh\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
  const scriptPath = path.join(__dirname, "../../transcription_server.py");

  const pathDelimiter = process.platform === "win32" ? ";" : ":";
  const customEnv = {
    ...process.env,
    PATH: `${path.join(__dirname, "../..")}${pathDelimiter}${process.env.PATH || ""}`
  };

  pythonProcess = spawn(pythonExec, [scriptPath], {
    cwd: path.join(__dirname, "../.."),
    env: customEnv
  });

  pythonProcess.stdout.on("data", (data) => {
    logger.info(`[Python ASR stdout]: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    logger.error(`[Python ASR stderr]: ${data.toString().trim()}`);
  });

  pythonProcess.on("close", (code) => {
    logger.info(`[Python ASR Process] exited with code ${code}`);
  });
}

function cleanUpProcess() {
  if (pythonProcess) {
    logger.info("[Python ASR] Stopping Python ASR process...");
    pythonProcess.kill();
    pythonProcess = null;
  }
}

module.exports = {
  startPythonASR,
  cleanUpProcess
};
