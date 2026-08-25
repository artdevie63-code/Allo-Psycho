# Allo Psycho V9.1.0 — déploiement final

## 1. Supabase — Secrets
Conserver `GROQ_API_KEY`.
`DEEPSEEK_API_KEY` n'est plus utilisée par `ai-support` V9.1.0. Tu peux la supprimer après validation du fonctionnement Groq.

## 2. Supabase — ai-support
Edge Functions → ai-support → index.ts
Remplacer tout par `supabase/functions/ai-support/index.ts`, puis Deploy.

## 3. Supabase — premium-access
Edge Functions → premium-access → index.ts
Remplacer tout par `supabase/functions/premium-access/index.ts`, puis Deploy.

## 4. Frontend
Déployer les fichiers V9.1.0 sur GitHub/Vercel.

## 5. Tests essentiels
- Compagnon IA : envoyer « Bonjour », puis 4 à 6 échanges différents.
- Autorisation IA : cocher/décocher dans Profil et vérifier la prise en compte immédiate.
- Mémoire IA : réinitialiser puis vérifier qu'un ancien sujet n'est plus utilisé comme contexte.
- Testeur : activer le code Testeur sur Android ; Premium permanent sans Admin.
- Propriétaire : activer le code Propriétaire sur iPhone ; Premium permanent + Admin.
- Décharge Android : toucher plusieurs bulles, vérifier compteur/énergie/onde.
- iPhone/Android : vérifier qu'aucune page ne déborde horizontalement.
- Installation PWA : Android via bouton système si disponible ; iOS via Partager → Sur l'écran d'accueil.


## V9.1.2
- `premium-access` corrigé pour l'accès Propriétaire/Admin :
  - suppression de l'upsert `onConflict:user_id`;
  - lecture préalable de `admin_users`;
  - insertion simple si l'utilisateur n'est pas déjà admin;
  - diagnostics `PA-OWNER-ADMIN-READ` et `PA-OWNER-ADMIN-INSERT`.
- Aucun changement sur `ai-support`, Groq, Décharge, la mise en page mobile, la PWA ou les données locales.
