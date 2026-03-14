// ════════════════════════════════════════════════════════════════
// HAN Auth — Netlify Function
// Handles email/password registration and login.
// Passwords are hashed with Node's built-in crypto (scrypt).
// User data is stored in Google Sheets via GAS.
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const SHEETS_URL      = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET = process.env.GAS_ADMIN_SECRET;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Password utilities ────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const inputHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
  } catch (e) {
    return false;
  }
}

// ── GAS fetch helper (handles GAS redirects) ─────────────────────
async function callGAS(params) {
  const url = SHEETS_URL + '?' + new URLSearchParams(params).toString();
  // GAS web apps redirect — follow up to 5 redirects manually
  let response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error('GAS returned ' + response.status);
  const text = await response.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text }; }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  // Fail fast with a clear message if env vars are missing
  if (!SHEETS_URL) {
    console.error('auth.js: SHEETS_URL env var is not set');
    return json(500, { error: 'Server configuration error: SHEETS_URL missing. Please contact support.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }

  const { action } = body;

  // ── REGISTER ────────────────────────────────────────────────────
  if (action === 'register') {
    const { name, email, country, password } = body;

    if (!name || !email || !country || !password) {
      return json(400, { error: 'All fields are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return json(400, { error: 'Password must be at least 8 characters.' });
    }

    try {
      // Check if email already exists
      const existing = await callGAS({ action: 'getUser', email, secret: GAS_ADMIN_SECRET });
      if (existing && existing.found) {
        return json(409, { error: 'An account with this email already exists. Please sign in.' });
      }
    } catch (e) {
      // Non-critical — continue with registration
    }

    try {
      const hashedPassword = hashPassword(password);
      await callGAS({
        action: 'registerUser',
        name:           name.trim(),
        email:          email.toLowerCase().trim(),
        country,
        hashedPassword,
        authMethod:     'email',
        secret:         GAS_ADMIN_SECRET,
        ts:             new Date().toISOString(),
      });

      return json(200, {
        success: true,
        user: { name: name.trim(), email: email.toLowerCase().trim(), country },
      });
    } catch (e) {
      console.error('Register error:', e.message);
      return json(500, { error: 'Registration failed: ' + e.message });
    }
  }

  // ── LOGIN ───────────────────────────────────────────────────────
  if (action === 'login') {
    const { email, password } = body;

    if (!email || !password) {
      return json(400, { error: 'Email and password are required.' });
    }

    try {
      const user = await callGAS({
        action: 'getUser',
        email:  email.toLowerCase().trim(),
        secret: GAS_ADMIN_SECRET,
      });

      if (!user || !user.found) {
        return json(401, { error: 'No account found with that email. Please register first.' });
      }

      if (!user.hashedPassword) {
        // Google OAuth user — no password stored
        return json(401, { error: 'This account was created with Google Sign-In. Please use the Google button to sign in.' });
      }

      if (!verifyPassword(password, user.hashedPassword)) {
        return json(401, { error: 'Incorrect password. Please try again.' });
      }

      return json(200, {
        success: true,
        user: { name: user.name, email: user.email, country: user.country || '' },
      });
    } catch (e) {
      console.error('Login error:', e.message);
      return json(500, { error: 'Login failed. Please try again.' });
    }
  }

  return json(400, { error: 'Unknown action.' });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
