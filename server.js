const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const checker = require('./whatsapp');

// External API base URL
const EXTERNAL_API = 'https://weak-deloris-nothing672434-fe85179d.koyeb.app';

const app = express();
const PORT = process.env.PORT || 3000;

// ===== DATABASE SETUP =====
const db = new Database(path.join(__dirname, 'otpbot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_months INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    badge TEXT,
    is_popular INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS numbers_pool (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    flag TEXT,
    status TEXT DEFAULT 'available',
    allocated_to TEXT,
    allocated_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    number_id TEXT,
    plan_id TEXT,
    ip_address TEXT NOT NULL,
    email TEXT,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'active',
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (number_id) REFERENCES numbers_pool(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS used_numbers (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    used_by_ip TEXT,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    number_id TEXT,
    number TEXT NOT NULL,
    sender TEXT,
    message TEXT,
    otp_code TEXT,
    country TEXT,
    flag TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (number_id) REFERENCES numbers_pool(id)
  );

  CREATE TABLE IF NOT EXISTS refund_requests (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    resolution TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  );

  CREATE TABLE IF NOT EXISTS revenue_log (
    id TEXT PRIMARY KEY,
    purchase_id TEXT,
    amount REAL NOT NULL,
    type TEXT DEFAULT 'purchase',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ===== SEED DEFAULT PLANS =====
const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get();
if (existingPlans.count === 0) {
  const insertPlan = db.prepare(`INSERT INTO plans (id, name, duration_months, price, description, badge, is_popular) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertPlan.run(uuidv4(), 'Starter', 1, 49, 'Perfect for trying out the service. Get one premium number for 30 days.', '🚀', 0);
  insertPlan.run(uuidv4(), 'Standard', 3, 99, 'Best value for regular users. Save 33% compared to monthly.', '⭐', 1);
  insertPlan.run(uuidv4(), 'Pro', 6, 149, 'For power users who need long-term numbers. Save 50%.', '💎', 0);
  insertPlan.run(uuidv4(), 'Annual', 12, 249, 'Maximum savings with a full year. Save 58% vs monthly.', '👑', 0);
}

// ===== SYNC NUMBERS FROM EXTERNAL API =====
async function syncNumbersFromAPI() {
  try {
    const res = await fetch(EXTERNAL_API + '/api/numbers');
    const data = await res.json();
    if (!data.numbers || !data.numbers.length) return console.log('No numbers from external API');

    const insertNum = db.prepare(`INSERT OR IGNORE INTO numbers_pool (id, number, country, country_code, flag, status) VALUES (?, ?, ?, ?, ?, 'available')`);
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM numbers_pool').get().count;

    const txn = db.transaction(() => {
      let added = 0;
      for (const n of data.numbers) {
        // Map country codes: Ivory Coast = CI (225), Venezuela = VE (58), Vietnam = VN (84)
        let cc = n.countryCode === '225' ? 'CI' : n.countryCode === '58' ? 'VE' : n.countryCode === '84' ? 'VN' : n.countryCode;
        let country = n.country;
        if (country === 'Venezuela, Bolivarian Republic of') country = 'Venezuela';
        if (country === 'Ivory coast') country = 'Ivory Coast';
        const result = insertNum.run(n.id, n.number, country, cc, n.flag);
        if (result.changes > 0) added++;
      }
      console.log(`📡 Synced ${added} new numbers from API (total in pool: ${existingCount + added})`);
    });
    txn();
  } catch (e) {
    console.error('Failed to sync numbers from external API:', e.message);
  }
}
syncNumbersFromAPI().then(async () => {
  // After numbers are synced, sync OTP quality data
  await checker.syncOTPHistory();
  checker.updateDatabaseQuality(db);
});

// Re-sync quality data every 10 minutes
setInterval(async () => {
  await checker.syncOTPHistory();
  checker.updateDatabaseQuality(db);
}, 10 * 60 * 1000);

// ===== SEED ADMIN USER =====
const existingAdmin = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get();
if (existingAdmin.count === 0) {
  db.prepare(`INSERT INTO users (id, email, password_hash, is_admin) VALUES (?, ?, ?, 1)`).run(uuidv4(), 'admin@otpbot.com', 'admin123');
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Strict rate limiter for purchase endpoints
const purchaseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, error: 'Too many purchase attempts. Try again later.' },
});

// Helper: get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection.remoteAddress;
}

// ===== AUTH HELPERS =====
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware — attaches req.user if valid token
function userAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Login required.' });
  }
  const token = authHeader.slice(7);
  const session = db.prepare(`
    SELECT s.*, u.id as uid, u.email FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
  }
  req.user = { id: session.uid, email: session.email };
  next();
}

// Optional auth — doesn't fail if no token
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = db.prepare(`
      SELECT s.*, u.id as uid, u.email FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
    if (session) req.user = { id: session.uid, email: session.email };
  }
  next();
}

// ===== API ROUTES =====

// POST /api/register — Create account
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ success: false, error: 'Email already registered. Please login.' });
  }

  const userId = uuidv4();
  const ip = getClientIP(req);
  db.prepare('INSERT INTO users (id, email, password_hash, ip_address) VALUES (?, ?, ?, ?)')
    .run(userId, email, hashPassword(password), ip);

  // Auto-login: create session
  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30 day session
  db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, token, expires.toISOString());

  res.json({ success: true, token, user: { id: userId, email } });
});

// POST /api/login — Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  }

  // Create session
  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), user.id, token, expires.toISOString());

  res.json({ success: true, token, user: { id: user.id, email: user.email } });
});

// POST /api/logout — Logout
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

// GET /api/me — Get current user + all their purchases
app.get('/api/me', userAuth, (req, res) => {
  const purchases = db.prepare(`
    SELECT p.*, np.number, np.country, np.flag, pl.name as plan_name
    FROM purchases p
    JOIN numbers_pool np ON p.number_id = np.id
    JOIN plans pl ON p.plan_id = pl.id
    WHERE p.user_id = ? AND p.status = 'active' AND p.expires_at > datetime('now')
    ORDER BY p.purchased_at DESC
  `).all(req.user.id);

  res.json({ success: true, user: req.user, purchases });
});

// GET /api/plans — List all plans
app.get('/api/plans', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY duration_months ASC').all();
  res.json({ success: true, plans });
});

// GET /api/countries — List available countries with counts
app.get('/api/countries', (req, res) => {
  const countries = db.prepare(`
    SELECT country, country_code, flag, COUNT(*) as available
    FROM numbers_pool WHERE status = 'available'
    GROUP BY country_code ORDER BY country ASC
  `).all();
  res.json({ success: true, countries });
});

// POST /api/purchase — Purchase a number (requires login, allows multiple)
app.post('/api/purchase', purchaseLimiter, userAuth, async (req, res) => {
  const { plan_id, country_code } = req.body;
  const ip = getClientIP(req);
  const userId = req.user.id;

  if (!plan_id || !country_code) {
    return res.status(400).json({ success: false, error: 'Missing required fields: plan_id, country_code' });
  }

  // Get plan
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(400).json({ success: false, error: 'Invalid plan selected.' });
  }

  // Auto-assign priority: Unknown (fresh) > Likely (active) > Verified (already used for WhatsApp)
  let number = null;

  // 1st: Fresh unknown numbers
  number = db.prepare(`
    SELECT * FROM numbers_pool 
    WHERE status = 'available' AND country_code = ? AND (quality = 'unknown' OR quality IS NULL)
    AND number NOT IN (SELECT number FROM used_numbers)
    ORDER BY RANDOM() LIMIT 1
  `).get(country_code);

  // 2nd: Likely numbers
  if (!number) {
    number = db.prepare(`
      SELECT * FROM numbers_pool 
      WHERE status = 'available' AND country_code = ? AND quality = 'likely'
      AND number NOT IN (SELECT number FROM used_numbers)
      ORDER BY RANDOM() LIMIT 1
    `).get(country_code);
  }

  // 3rd: Verified (last resort)
  if (!number) {
    number = db.prepare(`
      SELECT * FROM numbers_pool 
      WHERE status = 'available' AND country_code = ?
      AND number NOT IN (SELECT number FROM used_numbers)
      ORDER BY RANDOM() LIMIT 1
    `).get(country_code);
  }

  if (!number) {
    return res.status(400).json({ success: false, error: 'No numbers available for this country.' });
  }

  // Process purchase
  const purchaseId = uuidv4();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + plan.duration_months);

  const transaction = db.transaction(() => {
    db.prepare(`INSERT INTO purchases (id, user_id, number_id, plan_id, ip_address, email, amount, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`).run(
      purchaseId, userId, number.id, plan_id, ip, req.user.email, plan.price, expiresAt.toISOString()
    );
    db.prepare("UPDATE numbers_pool SET status = 'allocated', allocated_to = ?, allocated_at = datetime('now'), expires_at = ? WHERE id = ?").run(
      userId, expiresAt.toISOString(), number.id
    );
    db.prepare('INSERT INTO revenue_log (id, purchase_id, amount, type) VALUES (?, ?, ?, ?)').run(
      uuidv4(), purchaseId, plan.price, 'purchase'
    );
  });

  transaction();

  const quality = number.quality || checker.getNumberQuality(number.number);

  res.json({
    success: true,
    purchase: {
      id: purchaseId,
      number: number.number,
      country: number.country,
      flag: number.flag,
      plan: plan.name,
      amount: plan.price,
      quality: quality,
      expires_at: expiresAt.toISOString()
    }
  });
});

// GET /api/purchase/check — Check active purchases for logged-in user
app.get('/api/purchase/check', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({ success: true, has_active: false });
  }

  const purchases = db.prepare(`
    SELECT p.*, np.number, np.country, np.flag, pl.name as plan_name
    FROM purchases p
    JOIN numbers_pool np ON p.number_id = np.id
    JOIN plans pl ON p.plan_id = pl.id
    WHERE p.user_id = ? AND p.status = 'active' AND p.expires_at > datetime('now')
    ORDER BY p.purchased_at DESC
  `).all(req.user.id);

  if (purchases.length > 0) {
    res.json({ success: true, has_active: true, purchases, purchase: purchases[0] });
  } else {
    res.json({ success: true, has_active: false });
  }
});

// GET /api/number/:id/status — Check number status
app.get('/api/number/:id/status', (req, res) => {
  const number = db.prepare('SELECT * FROM numbers_pool WHERE id = ?').get(req.params.id);
  if (!number) {
    return res.status(404).json({ success: false, error: 'Number not found' });
  }

  // Simulate a status check (in production, integrate with Twilio or similar)
  const isExpired = number.expires_at && new Date(number.expires_at) < new Date();
  const status = {
    id: number.id,
    number: number.number,
    country: number.country,
    allocation_status: number.status,
    is_active: number.status === 'allocated' && !isExpired,
    is_receiving_sms: Math.random() > 0.1, // 90% chance working (simulated)
    expires_at: number.expires_at,
    last_checked: new Date().toISOString()
  };

  res.json({ success: true, status });
});

// GET /api/number/:id/otps — Get OTPs from the real external API
app.get('/api/number/:id/otps', async (req, res) => {
  try {
    // Get the number from our pool
    const numRecord = db.prepare('SELECT * FROM numbers_pool WHERE id = ?').get(req.params.id);
    if (!numRecord) return res.status(404).json({ success: false, error: 'Number not found' });

    // Fetch OTPs from external API
    const apiRes = await fetch(EXTERNAL_API + '/api/otps?limit=100');
    const apiData = await apiRes.json();

    if (apiData.success && apiData.otps) {
      // Filter only OTPs matching this number
      const matching = apiData.otps.filter(o => o.number === numRecord.number);
      const otps = matching.map(o => ({
        id: o.id,
        number_id: numRecord.id,
        number: o.number,
        sender: o.sender,
        message: o.message,
        otp_code: o.otp,
        country: o.country,
        flag: o.flag,
        received_at: o.timestamp || o.time
      }));
      return res.json({ success: true, otps });
    }
    res.json({ success: true, otps: [] });
  } catch (e) {
    console.error('OTP fetch error:', e.message);
    // Fallback to local DB
    const otps = db.prepare('SELECT * FROM otps WHERE number_id = ? ORDER BY received_at DESC LIMIT 50').all(req.params.id);
    res.json({ success: true, otps });
  }
});

// POST /api/refund — Request refund
app.post('/api/refund', userAuth, (req, res) => {
  const { purchase_id, reason } = req.body;

  if (!purchase_id || !reason) {
    return res.status(400).json({ success: false, error: 'Missing purchase_id or reason' });
  }

  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ? AND user_id = ?").get(purchase_id, req.user.id);
  if (!purchase) {
    return res.status(404).json({ success: false, error: 'Purchase not found.' });
  }

  const existing = db.prepare("SELECT * FROM refund_requests WHERE purchase_id = ? AND status = 'pending'").get(purchase_id);
  if (existing) {
    return res.status(400).json({ success: false, error: 'You already have a pending refund request.' });
  }

  const refundId = uuidv4();
  db.prepare('INSERT INTO refund_requests (id, purchase_id, reason) VALUES (?, ?, ?)').run(refundId, purchase_id, reason);

  res.json({ success: true, refund_id: refundId, message: 'Refund request submitted. We will process it within 24 hours.' });
});

// POST /api/replace-number — Replace a specific number
app.post('/api/replace-number', userAuth, (req, res) => {
  const { purchase_id } = req.body;

  // Find the purchase — either by ID or most recent
  let purchase;
  if (purchase_id) {
    purchase = db.prepare(`
      SELECT p.*, np.number, np.country_code
      FROM purchases p
      JOIN numbers_pool np ON p.number_id = np.id
      WHERE p.id = ? AND p.user_id = ? AND p.status = 'active'
    `).get(purchase_id, req.user.id);
  } else {
    purchase = db.prepare(`
      SELECT p.*, np.number, np.country_code
      FROM purchases p
      JOIN numbers_pool np ON p.number_id = np.id
      WHERE p.user_id = ? AND p.status = 'active' AND p.expires_at > datetime('now')
      ORDER BY p.purchased_at DESC LIMIT 1
    `).get(req.user.id);
  }

  if (!purchase) {
    return res.status(404).json({ success: false, error: 'No active purchase found.' });
  }

  const transaction = db.transaction(() => {
    db.prepare("UPDATE purchases SET status = 'replaced' WHERE id = ?").run(purchase.id);
    db.prepare("INSERT OR IGNORE INTO used_numbers (id, number, reason) VALUES (?, ?, 'whatsapp_already_registered')")
      .run(uuidv4(), purchase.number);
    db.prepare("UPDATE numbers_pool SET status = 'available', allocated_to = NULL WHERE id = ?")
      .run(purchase.number_id);
    db.prepare('INSERT INTO revenue_log (id, purchase_id, amount, type) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), purchase.id, 0, 'replacement');
  });

  transaction();

  res.json({
    success: true,
    message: 'Number replaced! You can purchase a new number.',
    country_code: purchase.country_code
  });
});


// ===== ADMIN ROUTES =====

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const authKey = req.headers['x-admin-key'];
  if (authKey === 'admin-secret-key-2026') {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

// GET /api/admin/dashboard — Dashboard stats
app.get('/api/admin/dashboard', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(DISTINCT ip_address) as count FROM purchases').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM revenue_log').get().total;
  const activePurchases = db.prepare("SELECT COUNT(*) as count FROM purchases WHERE status = 'active' AND expires_at > datetime('now')").get().count;
  const totalNumbers = db.prepare('SELECT COUNT(*) as count FROM numbers_pool').get().count;
  const availableNumbers = db.prepare("SELECT COUNT(*) as count FROM numbers_pool WHERE status = 'available'").get().count;
  const usedNumbers = db.prepare('SELECT COUNT(*) as count FROM used_numbers').get().count;
  const pendingRefunds = db.prepare("SELECT COUNT(*) as count FROM refund_requests WHERE status = 'pending'").get().count;
  const totalPurchases = db.prepare('SELECT COUNT(*) as count FROM purchases').get().count;

  // Revenue by month (last 12 months)
  const revenueByMonth = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as revenue, COUNT(*) as count
    FROM revenue_log
    WHERE created_at >= datetime('now', '-12 months')
    GROUP BY month ORDER BY month ASC
  `).all();

  // Recent purchases
  const recentPurchases = db.prepare(`
    SELECT p.*, np.number, np.country, np.flag, pl.name as plan_name
    FROM purchases p
    JOIN numbers_pool np ON p.number_id = np.id
    JOIN plans pl ON p.plan_id = pl.id
    ORDER BY p.purchased_at DESC LIMIT 20
  `).all();

  // Country distribution
  const countryDist = db.prepare(`
    SELECT np.country, np.flag, COUNT(*) as count
    FROM purchases p
    JOIN numbers_pool np ON p.number_id = np.id
    GROUP BY np.country ORDER BY count DESC
  `).all();

  res.json({
    success: true,
    stats: { totalUsers, totalRevenue, activePurchases, totalNumbers, availableNumbers, usedNumbers, pendingRefunds, totalPurchases },
    revenueByMonth,
    recentPurchases,
    countryDist
  });
});

// GET /api/admin/users — List all users/purchases
app.get('/api/admin/users', adminAuth, (req, res) => {
  const purchases = db.prepare(`
    SELECT p.*, np.number, np.country, np.flag, pl.name as plan_name
    FROM purchases p
    JOIN numbers_pool np ON p.number_id = np.id
    JOIN plans pl ON p.plan_id = pl.id
    ORDER BY p.purchased_at DESC
  `).all();
  res.json({ success: true, purchases });
});

// GET /api/admin/numbers — All numbers with status
app.get('/api/admin/numbers', adminAuth, (req, res) => {
  const numbers = db.prepare('SELECT * FROM numbers_pool ORDER BY country ASC').all();
  const usedNums = db.prepare('SELECT * FROM used_numbers ORDER BY used_at DESC').all();
  res.json({ success: true, numbers, usedNumbers: usedNums });
});

// GET /api/admin/refunds — Pending refund requests
app.get('/api/admin/refunds', adminAuth, (req, res) => {
  const refunds = db.prepare(`
    SELECT r.*, p.email, p.ip_address, p.amount, np.number, np.country
    FROM refund_requests r
    JOIN purchases p ON r.purchase_id = p.id
    JOIN numbers_pool np ON p.number_id = np.id
    ORDER BY r.created_at DESC
  `).all();
  res.json({ success: true, refunds });
});

// POST /api/admin/refund/:id/resolve — Resolve a refund
app.post('/api/admin/refund/:id/resolve', adminAuth, (req, res) => {
  const { resolution, action } = req.body; // action: 'refund' | 'replace' | 'reject'
  const refund = db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(req.params.id);

  if (!refund) {
    return res.status(404).json({ success: false, error: 'Refund request not found' });
  }

  const transaction = db.transaction(() => {
    db.prepare("UPDATE refund_requests SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?").run(
      `${action}: ${resolution}`, req.params.id
    );

    if (action === 'refund') {
      // Mark purchase as refunded
      db.prepare("UPDATE purchases SET status = 'refunded' WHERE id = ?").run(refund.purchase_id);
      // Free the number
      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(refund.purchase_id);
      if (purchase) {
        db.prepare("UPDATE numbers_pool SET status = 'available', allocated_to = NULL WHERE id = ?").run(purchase.number_id);
      }
      // Log negative revenue
      db.prepare('INSERT INTO revenue_log (id, purchase_id, amount, type) VALUES (?, ?, ?, ?)').run(
        uuidv4(), refund.purchase_id, -(purchase?.amount || 0), 'refund'
      );
    }
  });

  transaction();
  res.json({ success: true, message: 'Refund request resolved.' });
});

// ===== NUMBER QUALITY ADMIN ROUTES =====

// GET /api/admin/quality — Get number quality stats
app.get('/api/admin/quality', adminAuth, (req, res) => {
  const status = checker.getStatus();
  const dbStats = db.prepare(`
    SELECT quality, COUNT(*) as count 
    FROM numbers_pool WHERE status = 'available' 
    GROUP BY quality
  `).all();
  res.json({ success: true, ...status, db_quality: dbStats });
});

// POST /api/admin/quality/sync — Force re-sync OTP history
app.post('/api/admin/quality/sync', adminAuth, async (req, res) => {
  try {
    await checker.syncOTPHistory();
    checker.updateDatabaseQuality(db);
    const status = checker.getStatus();
    res.json({ success: true, message: 'Quality data synced!', ...status });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/quality/check — Check a specific number's quality
app.post('/api/admin/quality/check', adminAuth, (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false, error: 'Number required' });
  const quality = checker.getNumberQuality(number);
  res.json({ success: true, number, quality });
});

// Health check
app.get('/api/health', (req, res) => {
  const qStatus = checker.getStatus();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    quality_sync: qStatus.last_sync,
    verified_numbers: qStatus.verified,
  });
});

// Catch-all: serve index.html for SPA routing
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`\n🚀 OTPBot Premium Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard at http://localhost:${PORT}/#admin`);
  console.log(`💾 Database: otpbot.db`);
  console.log(`� Number quality auto-syncs every 10 minutes\n`);
});
