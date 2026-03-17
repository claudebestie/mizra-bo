export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { base64 } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            {
              type: 'text',
              text: `Analyse ce devis/contrat et retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) avec ces champs :
{
  "name": "nom du contact principal (prénom + nom)",
  "email": "email du client",
  "phone": "téléphone si présent sinon vide",
  "company": "nom de l'entreprise cliente",
  "package": "description courte de la prestation principale (max 80 caractères)",
  "total": nombre (montant total en chiffres, sans symbole monétaire, partie one-time seulement si mixte),
  "source": "il" si montant en NIS/₪ ou "fr" si en EUR/€,
  "paymethod": "mode de paiement principal",
  "paystatus": "En attente",
  "notes": "résumé des conditions clés : acompte, solde, récurrent si applicable (max 200 caractères)",
  "instalments": [
    {"label": "Acompte", "amount": nombre, "date": "YYYY-MM-DD", "status": "En attente"},
    {"label": "Solde", "amount": nombre, "date": "YYYY-MM-DD", "status": "En attente"}
  ]
}
Si pas de paiement en plusieurs fois détectable, mets instalments à null. Pour les dates, déduis-les depuis la date du document. Retourne uniquement le JSON.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
