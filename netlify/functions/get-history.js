/**
 * Get Conversation History
 *
 * Proxies a history fetch to Google Apps Script (GAS) and returns
 * the last 20 questions asked by the given email.
 *
 * Usage: GET /api/get-history?email=user@example.com
 *
 * Google Apps Script (GAS) update required:
 * Add these two actions to your GAS doGet handler:
 *
 *   if (e.parameter.action === 'saveHistory') {
 *     var email    = e.parameter.email;
 *     var topic    = e.parameter.topic    || 'General';
 *     var question = e.parameter.question || '';
 *     var ts       = e.parameter.ts       || new Date().toISOString();
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('History');
 *     if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('History');
 *     sheet.appendRow([email, topic, question, ts]);
 *     return ContentService.createTextOutput(JSON.stringify({ ok: true }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 *
 *   if (e.parameter.action === 'getHistory') {
 *     var email = e.parameter.email;
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('History');
 *     if (!sheet) {
 *       return ContentService.createTextOutput(JSON.stringify({ history: [] }))
 *         .setMimeType(ContentService.MimeType.JSON);
 *     }
 *     var data = sheet.getDataRange().getValues();
 *     var result = [];
 *     for (var i = data.length - 1; i >= 1; i--) {
 *       if (data[i][0] === email) {
 *         result.push({ topic: data[i][1], question: data[i][2], ts: data[i][3] });
 *         if (result.length >= 20) break;
 *       }
 *     }
 *     return ContentService.createTextOutput(JSON.stringify({ history: result }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 */

const https = require('https');

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzxhN5aEo2THjbhPENpyLb6OuKwTb2V7vxs_4-Zt13Po3e7euE3ciywAMFTyOoAOzadwA/exec';

function fetchGAS(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = SHEETS_URL + '?' + query;

    function doRequest(url, redirectsLeft) {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { Accept: 'application/json' }
      };

      const req = https.request(options, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
          doRequest(res.headers.location, redirectsLeft - 1);
          return;
        }
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ history: [] });
          }
        });
      });

      req.on('error', reject);
      req.end();
    }

    doRequest(fullUrl, 5);
  });
}

exports.handler = async (event) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // POST — save a history entry (avoids no-cors browser redirect issues)
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (!body.email) return { statusCode: 400, headers: corsHeaders, body: 'Missing email' };
      await fetchGAS({
        action:   'saveHistory',
        email:    body.email,
        topic:    body.topic    || 'General',
        question: (body.question || '').substring(0, 300),
        ts:       body.ts       || new Date().toISOString()
      });
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  const email = (event.queryStringParameters || {}).email || '';
  if (!email) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing email' })
    };
  }

  try {
    const data = await fetchGAS({ action: 'getHistory', email });
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message, history: [] })
    };
  }
};
