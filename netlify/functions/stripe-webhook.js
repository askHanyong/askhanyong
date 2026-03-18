/**
 * Stripe Webhook Handler
 *
 * Setup required:
 * 1. In Stripe Dashboard → Webhooks, add endpoint:
 *    https://askhanyong.com/api/stripe-webhook
 *    Listen for: checkout.session.completed
 * 2. Copy the webhook signing secret into Netlify env var: STRIPE_WEBHOOK_SECRET
 *
 * Google Apps Script (GAS) update required:
 * Add a 'savePremium' action to your GAS doPost/doGet handler:
 *
 *   if (e.parameter.action === 'savePremium') {
 *     var email = e.parameter.email;
 *     var ts = e.parameter.ts;
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Premium');
 *     // Check if already exists
 *     var data = sheet.getDataRange().getValues();
 *     for (var i = 1; i < data.length; i++) {
 *       if (data[i][0] === email) {
 *         return ContentService.createTextOutput(JSON.stringify({ok:true}))
 *           .setMimeType(ContentService.MimeType.JSON);
 *       }
 *     }
 *     sheet.appendRow([email, ts]);
 *     return ContentService.createTextOutput(JSON.stringify({ok:true}))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 */

const crypto = require('crypto');
const https  = require('https');

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzxhN5aEo2THjbhPENpyLb6OuKwTb2V7vxs_4-Zt13Po3e7euE3ciywAMFTyOoAOzadwA/exec';

function verifyStripeSignature(payload, sigHeader, secret) {
  // Stripe signature format: t=TIMESTAMP,v1=HMAC,...
  const parts = {};
  sigHeader.split(',').forEach(part => {
    const [k, v] = part.split('=');
    if (k && v) parts[k] = v;
  });

  if (!parts.t || !parts.v1) return false;

  const signedPayload = parts.t + '.' + payload;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedSig, 'hex');
  const received = Buffer.from(parts.v1, 'hex');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

function callGAS(params) {
  return new Promise((resolve) => {
    const query = new URLSearchParams(params).toString();
    const url = new URL(SHEETS_URL + '?' + query);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ ok: true, body }));
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sigHeader = event.headers['stripe-signature'];

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Webhook secret not configured' }) };
  }

  if (!sigHeader) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing stripe-signature header' }) };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    console.error('Invalid Stripe signature');
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email || session.customer_email || '';

    if (email) {
      console.log('Payment completed for:', email);
      await callGAS({
        action: 'savePremium',
        email,
        ts: new Date().toISOString()
      });
    } else {
      console.warn('checkout.session.completed with no email');
    }
  }

  // Always return 200 to acknowledge receipt to Stripe
  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};
