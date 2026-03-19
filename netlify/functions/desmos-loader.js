// Serves the Desmos calculator script via redirect, injecting the API key
// from the DESMOS_API_KEY environment variable.
//
// Set DESMOS_API_KEY in your Netlify dashboard → Site settings → Environment variables.
// Obtain a production key at: https://www.desmos.com/api/v1.8/docs/index.html#document-making-a-table
// (contact partnerships@desmos.com for commercial / production access)
//
// Falls back to the Desmos trial key if the variable is not set —
// the trial key works but displays a "Powered by Desmos" banner on every graph.

const TRIAL_KEY = 'dcb31709b452b1cf9dc26972add0fda6';
const DESMOS_VERSION = 'v1.8';

exports.handler = async function () {
  const key = (process.env.DESMOS_API_KEY || '').trim() || TRIAL_KEY;
  const isTrial = key === TRIAL_KEY;

  return {
    statusCode: 302,
    headers: {
      Location: `https://www.desmos.com/api/${DESMOS_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`,
      // Cache for 1 hour in CDN; re-validate so a key rotation takes effect quickly
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      // Expose trial status so the client can warn the developer in the console
      'X-Desmos-Key-Type': isTrial ? 'trial' : 'production',
    },
    body: '',
  };
};
