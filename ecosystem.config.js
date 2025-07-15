module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/server.js',
      exec_mode: 'cluster',
      instances: 'max',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
