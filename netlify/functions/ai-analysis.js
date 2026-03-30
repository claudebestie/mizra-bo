// netlify/functions/ai-analysis.js
// Analyse IA des données Meta Ads + Search Console via Claude API
// Variables d'environnement Netlify requises :
//   ANTHROPIC_API_KEY

const https = require('https');

async function callClaude(messages) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: `Tu es l'analyste marketing senior de Lancio (lancio.fr), agence web française — sites professionnels en 48h, €650–€1500.

CONTEXTE BUSINESS (déjà en place, NE PAS recommander) :
- Site lancio.fr live avec pages services par secteur (restaurants, cafés, salons, avocats, cliniques, etc.)
- Blog actif avec articles SEO publiés automatiquement chaque semaine (FR + HE)
- Meta titles et descriptions optimisés sur toutes les pages
- Google My Business configuré
- FAQ présente sur la homepage
- Pages programmatiques SEO (ex: "restaurant-website-builder")
- Portfolio avec exemples par secteur
- Système de landing pages dynamiques pour outreach

INSTRUCTIONS D'ANALYSE :
- Ne recommande JAMAIS des choses basiques déjà faites (meta titles, FAQ, GMB, blog, landing pages)
- Concentre-toi sur l'OPTIMISATION de l'existant : scaling, A/B tests, nouveaux angles
- Analyse les RATIOS et TENDANCES, pas juste les chiffres bruts
- Compare aux benchmarks du secteur (agences web : CTR Meta ~1-2%, CPC ~0.5-2€, CTR organique ~2-5%)
- Si le CTR Meta est >2%, c'est BON — dis-le et recommande de scaler
- Si le CPC est <0.20€, c'est EXCELLENT — recommande d'augmenter le budget
- Donne des recommandations AVANCÉES : retargeting, lookalike audiences, scaling vertical, nouveaux formats créa
- Sois précis : "Augmente le budget de X€ à Y€" plutôt que "Augmente le budget"

Format de réponse : JSON UNIQUEMENT avec ces clés :
{
  "score": (number 1-10),
  "resume": (string, 2 phrases max),
  "alertes": (array of strings, max 3, VRAIS problèmes uniquement),
  "recommandations": (array of objects: {priorite: "haute|moyenne|basse", action: string, impact: string, detail: string}),
  "quick_wins": (array of strings, max 5, actions concrètes et avancées pour cette semaine)
}
Ne réponds QUE avec le JSON, sans backticks ni texte avant/après.`,
      messages,
    }));

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': body.length,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
    const { metaData, gscData, period } = JSON.parse(event.body || '{}');

    // Build analysis prompt
    const metaSummary = metaData ? `
META ADS (période: ${period}):
- Dépenses totales: ${metaData.spend}€
- Impressions: ${metaData.impressions}
- Clics: ${metaData.clicks}
- CTR moyen: ${metaData.ctr}%
- CPC moyen: ${metaData.cpc}€
- Portée: ${metaData.reach} personnes
- Campagnes actives: ${metaData.activeCampaigns}/${metaData.totalCampaigns}
- Top campagne: ${metaData.topCampaign?.name || 'N/A'} (CTR: ${metaData.topCampaign?.ctr || 'N/A'}%)
- Pire campagne: ${metaData.worstCampaign?.name || 'N/A'} (CTR: ${metaData.worstCampaign?.ctr || 'N/A'}%)` : 'META ADS: Données non disponibles';

    const gscSummary = gscData ? `
GOOGLE SEARCH CONSOLE (période: ${period}):
- Clics organiques: ${gscData.totalClicks}
- Impressions: ${gscData.totalImpressions}
- CTR moyen: ${gscData.avgCtr}%
- Position moyenne: ${gscData.avgPosition}
- Top requête: "${gscData.topQuery?.query || 'N/A'}" (${gscData.topQuery?.clicks || 0} clics)
- Pages indexées avec trafic: ${gscData.pagesWithTraffic}
- Quick wins disponibles: ${gscData.quickWinsCount} requêtes en position 6-15` : 'SEARCH CONSOLE: Données non disponibles';

    const prompt = `Voici les données marketing de Lancio.fr pour la période ${period}:\n${metaSummary}\n${gscSummary}\n\nAnalyse ces données et donne tes recommandations.`;

    const result = await callClaude([{ role: 'user', content: prompt }]);

    if (result.body.error) throw new Error(result.body.error.message);

    const text = result.body.content[0].text;
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      // Fallback si le JSON n'est pas propre
      const match = text.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : { error: 'Parse error', raw: text };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis, generatedAt: new Date().toISOString() }),
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
