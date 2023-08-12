module.exports = {
  apps: [{
    name: "Satori",
    script: "./index.js",
    log_date_format: "YYYY-MM-DD HH:mm Z",
    time: true,
    autorestart: true,
    cron_restart: "0 0 * * *"
  }]
}