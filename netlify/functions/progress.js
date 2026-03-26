// ════════════════════════════════════════════════════════════════
// HAN Progress — Netlify Function
// Proxies save/load/reset between client and Google Apps Script.
// ════════════════════════════════════════════════════════════════

const SHEETS_URL = process.env.SHEETS_URL;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

async function callGAS(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('GAS returned ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text }; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!SHEETS_URL) {
    return json(500, { error: 'SHEETS_URL not configured' });
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return json(400, { error: 'Invalid JSON' }); }

  const { action, email, data } = body;
  if (!action || !email) return json(400, { error: 'action and email are required' });

  try {
    if (action === 'save') {
      // POST to GAS doPost (data too large for URL params)
      const res = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify({ action: 'saveProgress', email, data }),
      });
      const text = await res.text();
      let result;
      try { result = JSON.parse(text); } catch (e) { result = { raw: text }; }
      return json(200, result);
    }

    if (action === 'load') {
      const params = new URLSearchParams({ action: 'loadProgress', email });
      const result = await callGAS(SHEETS_URL + '?' + params.toString());
      return json(200, result);
    }

    if (action === 'reset') {
      const params = new URLSearchParams({ action: 'resetProgress', email });
      const result = await callGAS(SHEETS_URL + '?' + params.toString());
      return json(200, result);
    }

    return json(400, { error: 'Unknown action' });

  } catch (e) {
    return json(500, { error: 'Server error: ' + e.message });
  }
};
