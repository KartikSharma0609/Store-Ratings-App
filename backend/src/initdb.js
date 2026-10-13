require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { validPassword } = require('./validators');

async function initDb() {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  if (!validPassword(password)) throw new Error('ADMIN_PASSWORD breaks the password rules.');
  await pool.query(
    `INSERT INTO users (name, email, address, password_hash, role)
     VALUES ('System Administrator', $1, 'Head Office', $2, 'ADMIN') ON CONFLICT (email) DO NOTHING`,
    [email, await bcrypt.hash(password, 10)]);
  console.log(`Database ready. Admin login: ${email}`);
}

module.exports = { initDb };

if (require.main === module) {
  initDb().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
