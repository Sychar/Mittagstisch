const path = require("node:path");
const backendDir = __dirname;

module.exports = {
  apps: [
    {
      name: "mittagstisch-api",
      cwd: backendDir,
      script: path.join(backendDir, "dist/server.js"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(backendDir, ".playwright-browsers")
      }
    }
  ]
};
