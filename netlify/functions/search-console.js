// netlify/functions/search-console.js
// Proxy OAuth pour Google Search Console API
// Variables d'environnement Netlify requises :
//   GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN

const https = require('https');

async function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': u.hostname === 'oauth2.googleapis.com'
          ? 'application/x-www-form-urlencoded'
          : 'application/json',
        'Content-Length': data.length,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GSC_CLIENT_ID,
    client_secret: process.env.GSC_CLIENT_SECRET,
    refresh_token: process.env.GSC_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await post('https://oauth2.googleapis.com/token', params.toString());
  if (!res.body.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(res.body));
  return res.body.access_token;
}

async function querySearchConsole(token, siteUrl, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return post(url + `?access_token=${token}`, body);
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  try {
    const { siteUrl, startDate, endDate, dimensions, rowLimit } = JSON.parse(event.body || '{}');

    if (!siteUrl || !startDate || !endDate) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'siteUrl, startDate, endDate requis' }) };
    }

    const token = await getAccessToken();

    // Debug: test a simple query first
    const testQuery = await querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['date'], rowLimit: 5 });
    console.log('GSC debug - siteUrl:', siteUrl, 'status:', testQuery.status, 'response:', JSON.stringify(testQuery.body).substring(0, 500));

    // If test returned an error, return it for debugging
    if (testQuery.body.error) {
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GSC API error: ' + JSON.stringify(testQuery.body.error), debug: { siteUrl, startDate, endDate } }),
      };
    }

    // Fetch multiple dimension queries in parallel
    const [queries, pages, countries, dates] = await Promise.all([
      querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 50 }),
      querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 25 }),
      querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['country'], rowLimit: 10 }),
      querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['date'], rowLimit: 90 }),
    ]);

    // Quick wins: pos 6-15, impressions > 30
    const allQueries = await querySearchConsole(token, siteUrl, {
      startDate, endDate, dimensions: ['query'], rowLimit: 500
    });

    const quickWins = (allQueries.body.rows || [])
      .filter(r => r.position >= 6 && r.position <= 15 && r.impressions >= 30)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: queries.body.rows || [],
        pages: pages.body.rows || [],
        countries: countries.body.rows || [],
        dates: dates.body.rows || [],
        quickWins,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
