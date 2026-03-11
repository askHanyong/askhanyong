const crypto = require('crypto');

// Environment variables to set in Netlify dashboard:
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret
//   SHEETS_URL             — your Google Apps Script web app URL
//   GAS_ADMIN_SECRET       — same value as ADMIN_SECRET in your GAS (default: hanyong-admin-2024)

const WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;
const SHEETS_URL      = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET = process.env.GAS_ADMIN_SECRET || 'hanyong-admin-2024';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Stripe sends raw JSON body — get it as a string for signature verification
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  // Verify Stripe webhook signature (no stripe npm package needed — uses Node crypto)
  const sig = event.headers['stripe-signature'];
  if (!sig || !WEBHOOK_SECRET) {
    console.error('Missing stripe-signature header or STRIPE_WEBHOOK_SECRET env var');
    return { statusCode: 400, body: 'Webhook configuration error' };
  }

  try {
    verifyStripeSignature(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const stripeEvent = JSON.parse(rawBody);

  // Handle successful payment events
  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'invoice.paid'
  ) {
    const obj = stripeEvent.data.object;
    const email = obj.customer_details?.email || obj.customer_email || null;
    const customerId = obj.customer || '';
    const name = obj.customer_details?.name || '';

    if (email && SHEETS_URL) {
      try {
        const params = new URLSearchParams({
          action:     'addPremiumUser',
          email,
          name,
          customerId,
          secret:     GAS_ADMIN_SECRET,
        });
        await fetch(`${SHEETS_URL}?${params.toString()}`);
        console.log('Premium user recorded:', email);
      } catch (err) {
        console.error('Failed to record premium user in Sheets:', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

// Manual Stripe signature verification using Node's built-in crypto
// (avoids needing the stripe npm package)
function verifyStripeSignature(payload, header, secret) {
  const parts      = header.split(',');
  const tPart      = parts.find(p => p.startsWith('t='));
  const v1Part     = parts.find(p => p.startsWith('v1='));

  if (!tPart || !v1Part) throw new Error('Malformed stripe-signature header');

  const timestamp  = tPart.split('=')[1];
  const v1         = v1Part.split('=')[1];
  const signed     = `${timestamp}.${payload}`;
  const expected   = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Signature mismatch');
  }
}
