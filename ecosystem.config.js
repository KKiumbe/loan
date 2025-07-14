module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/server.js',
      exec_mode: 'cluster', // enables load balancing across CPU cores
      instances: 'max',     // spawn as many instances as CPU cores
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'api-worker',
      script: './dist/worker.js',
      exec_mode: 'fork',    // one instance is usually fine for worker
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'api-scheduler',
      script: './dist/cron.js',
      exec_mode: 'fork',    // one instance for cron tasks
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
