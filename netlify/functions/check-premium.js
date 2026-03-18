/**
 * Check Premium Status
 *
 * Proxies a premium check to Google Apps Script (GAS) and returns
 * whether the given email is in the Premium sheet.
 *
 * Usage: GET /api/check-premium?email=user@example.com
 *
 * Google Apps Script (GAS) update required:
 * Add a 'checkPremium' action to your GAS doGet handler:
 *
 *   if (e.parameter.action === 'checkPremium') {
 *     var email = e.parameter.email;
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Premium');
 *     var data = sheet.getDataRange().getValues();
 *     var isPremium = false;
 *     for (var i = 1; i < data.length; i++) {
 *       if (data[i][0] === email) { isPremium = true; break; }
 *     }
 *     return ContentService.createTextOutput(JSON.stringify({ premium: isPremium }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 */

const https = require('https');

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzxhN5aEo2THjbhPENpyLb6OuKwTb2V7vxs_4-Zt13Po3e7euE3ciywAMFTyOoAOzadwA/exec';

function fetchGAS(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = SHEETS_URL + '?' + query;

    // GAS redirects, so we follow redirects manually using a recursive helper
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
            // GAS might return non-JSON; treat as not premium
            resolve({ premium: false });
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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const email = (event.queryStringParameters || {}).email || '';
  if (!email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ premium: false, error: 'Missing email' }) };
  }

  try {
    const result = await fetchGAS({ action: 'checkPremium', email });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ premium: result.premium === true })
    };
  } catch (err) {
    console.error('check-premium error:', err.message);
    // Fail open: return not premium rather than breaking the app
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ premium: false })
    };
  }
};
