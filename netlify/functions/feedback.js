// ════════════════════════════════════════════════════════════════
// HAN Feedback — Netlify Function
// Receives user feedback (text + optional photo attachments as
// base64 data-URLs) and forwards to Google Apps Script for storage.
// Photos are saved to Google Drive; metadata goes to a Feedback sheet.
// ════════════════════════════════════════════════════════════════

const SHEETS_URL       = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET = process.env.GAS_ADMIN_SECRET;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }

  const { type, subject, message, name, email, page, photos } = body;

  if (!type || !subject || !message) {
    return json(400, { error: 'type, subject, and message are required.' });
  }
  if (message.trim().length < 10) {
    return json(400, { error: 'Please provide more detail (at least 10 characters).' });
  }
  if (photos && photos.length > 3) {
    return json(400, { error: 'Maximum 3 photos allowed.' });
  }

  if (!SHEETS_URL) {
    console.error('feedback.js: SHEETS_URL env var is not set');
    return json(500, { error: 'Server configuration error.' });
  }

  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        action:  'saveFeedback',
        secret:  GAS_ADMIN_SECRET,
        type:    type.trim(),
        subject: subject.trim(),
        message: message.trim(),
        name:    (name  || '').trim(),
        email:   (email || '').trim().toLowerCase(),
        page:    page || '',
        photos:  photos || [],
        ts:      new Date().toISOString(),
      }),
    });

    const text = await res.text();
    let result;
    try { result = JSON.parse(text); } catch (e) { result = { raw: text }; }

    if (result && result.error) return json(500, { error: result.error });
    return json(200, { success: true });

  } catch (e) {
    console.error('feedback.js error:', e.message);
    return json(500, { error: 'Failed to save feedback. Please try again.' });
  }
};
