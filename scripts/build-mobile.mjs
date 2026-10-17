// Builds the packaged mobile client for Capacitor into ./mobile.
// The Android app ships these screens locally; all money requests still go to
// the published server over HTTPS (see API_BASE in pawch-backend.js).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("mobile/assets", { recursive: true });

let html = readFileSync("public/pawchpay.html", "utf8");
html = html
  .replace('src="/pawch-backend.js"', 'src="./pawch-backend.js"')
  .replace(/src="\/__l5e\/assets-v1\/[^"]*pawchpay-logo-transparent\.png"/, 'src="./assets/logo.png"');
writeFileSync("mobile/index.html", html);

copyFileSync("public/pawch-backend.js", "mobile/pawch-backend.js");
copyFileSync("src/assets/pawchpay-logo-transparent.png", "mobile/assets/logo.png");

console.log("mobile/ bundle written");
