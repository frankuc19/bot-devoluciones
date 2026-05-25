module.exports = {
  apps: [{
    name:        'bot-devoluciones',
    script:      'panel/server.js',
    watch:       false,
    max_restarts: 10,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
