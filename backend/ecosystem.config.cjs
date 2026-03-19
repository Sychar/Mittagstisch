module.exports = {
  apps: [
    {
      name: "mittagstisch-api",
      cwd: "/srv/mittagstisch/backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
