# Mizra — Back Office

Interface d'administration interne pour gérer les commandes, messages, audits et onboarding clients.

**URL de production :** https://bo.getmizra.com  
**Stack :** HTML statique + Supabase (live)

## Déploiement

Ce repo est connecté à Vercel. Chaque push sur `main` redéploie automatiquement.

```bash
git add index.html
git commit -m "Update BO"
git push
```

## Sections

- **Messages** — contact_leads (messages reçus via le site)
- **Audits** — audit_requests (demandes d'audit SEO)
- **Commandes** — orders (commandes clients)
- **Onboarding** — onboarding (clients post-paiement en setup)
- **Stats** — bilans jour / semaine / mois / année

## Supabase — colonnes requises

Exécuter dans SQL Editor si pas encore fait :

```sql
ALTER TABLE contact_leads ADD COLUMN IF NOT EXISTS seen boolean DEFAULT false, ADD COLUMN IF NOT EXISTS done boolean DEFAULT false;
ALTER TABLE audit_requests ADD COLUMN IF NOT EXISTS seen boolean DEFAULT false, ADD COLUMN IF NOT EXISTS done boolean DEFAULT false, ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seen boolean DEFAULT false, ADD COLUMN IF NOT EXISTS done boolean DEFAULT false;
ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS seen boolean DEFAULT false, ADD COLUMN IF NOT EXISTS done boolean DEFAULT false, ADD COLUMN IF NOT EXISTS internal_notes text;
```

## Accès

Protégé par mot de passe Vercel. Confidentiel — ne pas rendre public.
