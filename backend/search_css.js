const fs = require("fs");
const path = require("path");

const cssPath = path.join(__dirname, "../frontend/src/App.css");
const css = fs.readFileSync(cssPath, "utf8");

const lines = css.split("\n");
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes("placeholder") || line.toLowerCase().includes("editable") || line.toLowerCase().includes("composer-textarea")) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
