module.exports = {
  apps: [
    {
      name: "api",
      script: "./dist/server.js",
      exec_mode: "cluster",
      instances: "max",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "runner",
      script: "./dist/runner.js", // compiled TS version of src/runner.ts
      exec_mode: "fork",          // single instance is enough for jobs
      instances: 1,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
