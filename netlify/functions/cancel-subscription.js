// ════════════════════════════════════════════════════════════════
// HAN Cancel Subscription — Netlify Function
// Cancels a user's active Stripe subscription at period end.
//
// Required env vars:
//   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
//   SESSION_SECRET      — for verifying session tokens
//   SHEETS_URL          — Google Apps Script web app URL
//   GAS_ADMIN_SECRET    — shared secret for GAS calls
//
// POST /api/cancel-subscription
// Headers: { Authorization: 'Bearer <session-token>' }
// Body: {} (email is inferred from session)
// Returns: { success: true, cancelAt: '<ISO date>' }
// ════════════════════════════════════════════════════════════════

const https  = require('https');
const crypto = require('crypto');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SESSION_SECRET    = process.env.SESSION_SECRET;
const SHEETS_URL        = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET  = process.env.GAS_ADMIN_SECRET;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

// ── Verify session token ──────────────────────────────────────────
function verifySession(token) {
  if (!token || !SESSION_SECRET) return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [b64Email, expiry, sig] = parts;
  if (Date.now() > parseInt(expiry, 10)) return null;

  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${b64Email}:${expiry}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;

  return Buffer.from(b64Email, 'base64').toString('utf8');
}

// ── Raw Stripe API calls ──────────────────────────────────────────
function stripeGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Stripe-Version': '2023-10-16',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(new Error('Could not parse Stripe response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function stripePost(path, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2023-10-16',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(new Error('Could not parse Stripe response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Call GAS to get subscription ID for an email ─────────────────
async function getSubscriptionFromGAS(email) {
  const params = new URLSearchParams({
    action: 'getSubscriptionInfo',
    email,
    secret: GAS_ADMIN_SECRET,
  });
  const url = `${SHEETS_URL}?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  return data; // { subscriptionId, status, graduationDate }
}

// ── Call GAS to mark subscription as cancelled ───────────────────
async function markCancelledInGAS(email) {
  const params = new URLSearchParams({
    action: 'cancelPremiumUser',
    email,
    secret: GAS_ADMIN_SECRET,
  });
  await fetch(`${SHEETS_URL}?${params.toString()}`);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  if (!STRIPE_SECRET_KEY) {
    return json(503, { error: 'Stripe not configured.' });
  }

  // Authenticate user via session token
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const email = verifySession(token);
  if (!email) {
    return json(401, { error: 'Invalid or expired session.' });
  }

  try {
    // Look up subscription ID from GAS
    const info = await getSubscriptionFromGAS(email);
    if (!info || !info.subscriptionId) {
      return json(404, { error: 'No active subscription found.' });
    }

    const subId = info.subscriptionId;

    // Verify subscription is still active in Stripe
    const subResult = await stripeGet(`/v1/subscriptions/${subId}`);
    if (subResult.status !== 200) {
      return json(404, { error: 'Subscription not found in Stripe.' });
    }

    const sub = subResult.data;
    if (sub.status === 'canceled') {
      // Already cancelled — sync GAS status
      await markCancelledInGAS(email);
      return json(200, { success: true, alreadyCancelled: true });
    }

    // Cancel at end of current billing period (not immediately)
    const cancelResult = await stripePost(`/v1/subscriptions/${subId}`, {
      'cancel_at_period_end': 'true',
    });

    if (cancelResult.status !== 200) {
      console.error('Stripe cancel error:', JSON.stringify(cancelResult.data));
      return json(502, { error: cancelResult.data?.error?.message || 'Failed to cancel subscription.' });
    }

    const cancelAt = new Date(cancelResult.data.current_period_end * 1000).toISOString();

    // Update GAS to reflect pending cancellation
    if (SHEETS_URL) {
      const params = new URLSearchParams({
        action:    'updateSubscriptionStatus',
        email,
        status:    'cancel_at_period_end',
        secret:    GAS_ADMIN_SECRET,
      });
      await fetch(`${SHEETS_URL}?${params.toString()}`);
    }

    console.log(`Subscription ${subId} set to cancel at period end for ${email}`);
    return json(200, { success: true, cancelAt });

  } catch (e) {
    console.error('Cancel subscription error:', e.message);
    return json(500, { error: 'Failed to cancel. Please try again.' });
  }
};
