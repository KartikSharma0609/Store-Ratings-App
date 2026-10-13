const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const v = require('./validators');
const { listClauses } = require('./query');

const SORTABLE = {
  users: ['name', 'email', 'address', 'role'],
  stores: ['name', 'email', 'address', 'rating'],
  public: ['name', 'address', 'rating'],
};

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function createApp(pool, secret = process.env.JWT_SECRET) {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET is required and must be at least 32 characters');
  const app = express();
  app.set('trust proxy', 1); // one proxy hop (nginx) so rate limits see the real client IP
  app.use(helmet());
  // Same-origin by default (nginx / Vite proxy). Set CORS_ORIGIN=https://site1,https://site2 to allow others.
  app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
  app.use(express.json({ limit: '10kb' }));

  // Registered before the rate limiter so container health checks are never throttled.
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const limiter = (limit) => rateLimit({
    windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a few minutes and try again.' },
  });
  app.use('/api', limiter(1000));
  app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/password'], limiter(30));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const fail = (res, code, message) => res.status(code).json({ message });

  const auth = (...roles) => (req, res, next) => {
    const h = req.headers.authorization || '';
    try {
      req.user = jwt.verify(h.replace(/^Bearer /, ''), secret);
    } catch {
      return fail(res, 401, 'Please sign in.');
    }
    if (roles.length && !roles.includes(req.user.role)) return fail(res, 403, 'Not allowed.');
    next();
  };

  const createUser = async (b, role) => {
    const err = v.userError(b);
    if (err) return { error: err };
    const hash = await bcrypt.hash(b.password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, address, password_hash, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, address, role`,
        [b.name.trim(), b.email.trim().toLowerCase(), b.address.trim(), hash, role]
      );
      return { user: rows[0] };
    } catch (e) {
      if (e.code === '23505') return { error: 'That email is already registered.', code: 409 };
      throw e;
    }
  };

  // ---------- auth ----------
  app.post('/api/auth/signup', wrap(async (req, res) => {
    const r = await createUser(req.body, 'USER');
    if (r.error) return fail(res, r.code || 400, r.error);
    res.status(201).json(r.user);
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
    const u = rows[0];
    const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok)
      return fail(res, 401, 'Invalid email or password.');
    const token = jwt.sign({ id: u.id, role: u.role }, secret, { expiresIn: '8h' });
    res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
  }));

  app.put('/api/auth/password', auth(), wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!v.validPassword(newPassword))
      return fail(res, 400, 'Password must be 8 to 16 characters with at least one uppercase letter and one special character.');
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash)))
      return fail(res, 400, 'Current password is incorrect.');
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), req.user.id]);
    res.json({ message: 'Password updated.' });
  }));

  // ---------- admin ----------
  const admin = auth('ADMIN');

  app.get('/api/admin/stats', admin, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM stores)::int AS stores,
              (SELECT COUNT(*) FROM ratings)::int AS ratings`
    );
    res.json(rows[0]);
  }));

  app.post('/api/admin/users', admin, wrap(async (req, res) => {
    const role = req.body && req.body.role;
    if (!v.ROLES.includes(role)) return fail(res, 400, 'Role must be ADMIN, USER or OWNER.');
    const r = await createUser(req.body, role);
    if (r.error) return fail(res, r.code || 400, r.error);
    res.status(201).json(r.user);
  }));

  app.get('/api/admin/users', admin, wrap(async (req, res) => {
    const params = [];
    const tail = listClauses(req.query, ['name', 'email', 'address', 'role'], SORTABLE.users, params);
    const { rows } = await pool.query(
      `SELECT * FROM (SELECT id, name, email, address, role FROM users) t ${tail}`, params);
    res.json(rows);
  }));

  app.get('/api/admin/users/:id', admin, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.address, u.role,
              CASE WHEN u.role = 'OWNER'
                   THEN (SELECT ROUND(AVG(r.rating), 1)::float FROM stores s
                         JOIN ratings r ON r.store_id = s.id WHERE s.owner_id = u.id) END AS rating
       FROM users u WHERE u.id = $1`, [Number(req.params.id) || 0]);
    if (!rows[0]) return fail(res, 404, 'User not found.');
    res.json(rows[0]);
  }));

  app.post('/api/admin/stores', admin, wrap(async (req, res) => {
    const { name, email, address, ownerId } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) return fail(res, 400, 'Store name is required (max 60 characters).');
    if (!v.validEmail(email)) return fail(res, 400, 'Enter a valid store email.');
    if (!v.validAddress(address)) return fail(res, 400, 'Address is required and must be at most 400 characters.');
    if (ownerId) {
      const o = await pool.query("SELECT 1 FROM users WHERE id = $1 AND role = 'OWNER'", [Number(ownerId)]);
      if (!o.rows[0]) return fail(res, 400, 'Owner must be an existing user with the OWNER role.');
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO stores (name, email, address, owner_id) VALUES ($1, $2, $3, $4) RETURNING id, name, email, address, owner_id',
        [name.trim(), email.trim().toLowerCase(), address.trim(), ownerId ? Number(ownerId) : null]);
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'That store email or owner is already in use.');
      throw e;
    }
  }));

  app.get('/api/admin/stores', admin, wrap(async (req, res) => {
    const params = [];
    const tail = listClauses(req.query, ['name', 'email', 'address'], SORTABLE.stores, params);
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT s.id, s.name, s.email, s.address, COALESCE(ROUND(AVG(r.rating), 1), 0)::float AS rating
         FROM stores s LEFT JOIN ratings r ON r.store_id = s.id GROUP BY s.id) t ${tail}`, params);
    res.json(rows);
  }));

  // ---------- normal user ----------
  app.get('/api/stores', auth('USER'), wrap(async (req, res) => {
    const params = [req.user.id];
    const where = [];
    if (req.query.search) {
      params.push(`%${String(req.query.search)}%`);
      where.push(`(name ILIKE $${params.length} OR address ILIKE $${params.length})`);
    }
    const col = SORTABLE.public.includes(req.query.sort) ? req.query.sort : 'name';
    const dir = req.query.order === 'desc' ? 'DESC' : 'ASC';
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT s.id, s.name, s.address, COALESCE(ROUND(AVG(r.rating), 1), 0)::float AS rating,
                (SELECT rating FROM ratings WHERE store_id = s.id AND user_id = $1) AS my_rating
         FROM stores s LEFT JOIN ratings r ON r.store_id = s.id GROUP BY s.id) t
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${col} ${dir}, id`, params);
    res.json(rows);
  }));

  app.put('/api/stores/:id/rating', auth('USER'), wrap(async (req, res) => {
    const rating = req.body && req.body.rating;
    if (!v.validRating(rating)) return fail(res, 400, 'Rating must be a whole number from 1 to 5.');
    const storeId = Number(req.params.id) || 0;
    const s = await pool.query('SELECT 1 FROM stores WHERE id = $1', [storeId]);
    if (!s.rows[0]) return fail(res, 404, 'Store not found.');
    await pool.query(
      `INSERT INTO ratings (user_id, store_id, rating) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, store_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = now()`,
      [req.user.id, storeId, rating]);
    res.json({ storeId, rating });
  }));

  // ---------- store owner ----------
  app.get('/api/owner/dashboard', auth('OWNER'), wrap(async (req, res) => {
    const s = await pool.query('SELECT id, name FROM stores WHERE owner_id = $1', [req.user.id]);
    if (!s.rows[0]) return res.json({ store: null, average: 0, raters: [] });
    const avg = await pool.query('SELECT COALESCE(ROUND(AVG(rating), 1), 0)::float AS average FROM ratings WHERE store_id = $1', [s.rows[0].id]);
    const raters = await pool.query(
      `SELECT u.id, u.name, u.email, r.rating FROM ratings r JOIN users u ON u.id = r.user_id
       WHERE r.store_id = $1 ORDER BY r.updated_at DESC`, [s.rows[0].id]);
    res.json({ store: s.rows[0], average: avg.rows[0].average, raters: raters.rows });
  }));

  app.use((req, res) => fail(res, 404, 'Not found.'));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    fail(res, 500, 'Something went wrong. Try again.');
  });
  return app;
}

module.exports = { createApp };
