# Déploiement Allo Psycho V9.0

## 1. Supabase
Redéployer :
- `supabase/functions/ai-support/index.ts`
- `supabase/functions/premium-access/index.ts`

Ne pas modifier les secrets existants.

## 2. GitHub / Vercel
Remplacer le contenu de l’ancienne version par l’ensemble du dossier V9.0 :
- `index.html`
- `privacy.html`
- `sw.js`
- `manifest.json`
- `assets/`
- autres fichiers utiles du projet

Vercel redéploie ensuite depuis GitHub.

## 3. Accès privés
Les codes Propriétaire et Testeur sont fournis dans un fichier séparé de ce ZIP.
Ne jamais ajouter ce fichier de codes à GitHub.
