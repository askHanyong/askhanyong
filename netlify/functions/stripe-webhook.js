// ════════════════════════════════════════════════════════════════
// HAN Stripe Webhook — Netlify Function
// Handles subscription lifecycle events:
//   checkout.session.completed    → record subscription + grant access
//   invoice.paid                  → renew / confirm access each month
//   customer.subscription.deleted → revoke access (auto or manual cancel)
//   customer.subscription.updated → sync status changes
//
// Environment variables to set in Netlify dashboard:
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret
//   SHEETS_URL             — your Google Apps Script web app URL
//   GAS_ADMIN_SECRET       — same value as ADMIN_SECRET in your GAS
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET;
const SHEETS_URL       = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET = process.env.GAS_ADMIN_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Stripe sends raw JSON body — get it as a string for signature verification
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  // Verify Stripe webhook signature
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
  const obj = stripeEvent.data.object;

  // ── checkout.session.completed ─────────────────────────────────
  // Fires when the student completes the Stripe Checkout flow.
  // Records email, customer ID, subscription ID, and graduation date.
  if (stripeEvent.type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') {
      // Not a subscription checkout — ignore
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    const email          = (obj.customer_details?.email || obj.customer_email || '').toLowerCase().trim();
    const customerId     = obj.customer || '';
    const subscriptionId = obj.subscription || '';
    const name           = obj.customer_details?.name || '';

    // Graduation info stored in subscription metadata via checkout params
    const meta            = obj.metadata || {};
    const graduationMonth = meta.graduation_month || '';
    const graduationYear  = meta.graduation_year  || '';

    if (email && SHEETS_URL) {
      try {
        const params = new URLSearchParams({
          action:          'addPremiumUser',
          email,
          name,
          customerId,
          subscriptionId,
          graduationMonth,
          graduationYear,
          status:          'active',
          tier:            'subscriber',
          secret:          GAS_ADMIN_SECRET,
        });
        await fetch(`${SHEETS_URL}?${params.toString()}`);
        console.log('Subscription recorded for:', email, 'grad:', graduationMonth, graduationYear);
      } catch (err) {
        console.error('Failed to record subscription in Sheets:', err.message);
      }
    }
  }

  // ── invoice.paid ───────────────────────────────────────────────
  // Fires every month on successful renewal. Keeps the user active
  // in the Premium sheet even though they're already recorded.
  else if (stripeEvent.type === 'invoice.paid') {
    if (obj.billing_reason === 'subscription_create') {
      // Already handled by checkout.session.completed — skip
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    const email      = (obj.customer_email || '').toLowerCase().trim();
    const customerId = obj.customer || '';
    const subId      = obj.subscription || '';

    if (email && SHEETS_URL) {
      try {
        const params = new URLSearchParams({
          action:         'updateSubscriptionStatus',
          email,
          customerId,
          subscriptionId: subId,
          status:         'active',
          secret:         GAS_ADMIN_SECRET,
        });
        await fetch(`${SHEETS_URL}?${params.toString()}`);
        console.log('Subscription renewed for:', email);
      } catch (err) {
        console.error('Failed to update renewal in Sheets:', err.message);
      }
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────
  // Fires when a subscription is fully cancelled — whether by:
  //   • Stripe's automatic cancel_at (graduation date reached), OR
  //   • the user manually cancelling via our cancel endpoint.
  // Revokes premium access immediately.
  else if (stripeEvent.type === 'customer.subscription.deleted') {
    const subId      = obj.id || '';
    const customerId = obj.customer || '';
    const meta       = obj.metadata || {};
    // email may be in metadata if set during checkout
    const email      = (meta.email || '').toLowerCase().trim();

    if (SHEETS_URL) {
      try {
        const params = new URLSearchParams({
          action:         'cancelPremiumUser',
          email,
          customerId,
          subscriptionId: subId,
          secret:         GAS_ADMIN_SECRET,
        });
        await fetch(`${SHEETS_URL}?${params.toString()}`);
        console.log('Subscription cancelled for customer:', customerId, 'sub:', subId);
      } catch (err) {
        console.error('Failed to cancel subscription in Sheets:', err.message);
      }
    }
  }

  // ── customer.subscription.updated ─────────────────────────────
  // Fires when subscription status changes (e.g. set to cancel_at_period_end).
  else if (stripeEvent.type === 'customer.subscription.updated') {
    const subId      = obj.id || '';
    const customerId = obj.customer || '';
    const status     = obj.cancel_at_period_end ? 'cancel_at_period_end' : (obj.status || 'active');
    const meta       = obj.metadata || {};
    const email      = (meta.email || '').toLowerCase().trim();

    if (SHEETS_URL) {
      try {
        const params = new URLSearchParams({
          action:         'updateSubscriptionStatus',
          email,
          customerId,
          subscriptionId: subId,
          status,
          secret:         GAS_ADMIN_SECRET,
        });
        await fetch(`${SHEETS_URL}?${params.toString()}`);
        console.log('Subscription status updated:', status, 'customer:', customerId);
      } catch (err) {
        console.error('Failed to update subscription status in Sheets:', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

// ── Manual Stripe signature verification ─────────────────────────
// (avoids needing the stripe npm package)
function verifyStripeSignature(payload, header, secret) {
  const parts  = header.split(',');
  const tPart  = parts.find(p => p.startsWith('t='));
  const v1Part = parts.find(p => p.startsWith('v1='));

  if (!tPart || !v1Part) throw new Error('Malformed stripe-signature header');

  const timestamp = tPart.split('=')[1];
  const v1        = v1Part.split('=')[1];
  const signed    = `${timestamp}.${payload}`;
  const expected  = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Signature mismatch');
  }
}
