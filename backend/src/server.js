require('dotenv').config();
const pool = require('./db');
const { createApp } = require('./app');
const { initDb } = require('./initdb');

const port = process.env.PORT || 4000;
initDb()
  .then(() => createApp(pool).listen(port, () => console.log(`API listening on :${port}`)))
  .catch((e) => { console.error('Startup failed:', e); process.exit(1); });
