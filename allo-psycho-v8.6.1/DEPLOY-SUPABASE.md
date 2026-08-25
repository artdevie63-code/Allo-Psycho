# Déploiement Supabase — Allo Psycho v4

1. Authentication → activer **Anonymous Sign-Ins**.
2. SQL Editor → exécuter/revoir `supabase/schema.sql`. Les nouvelles colonnes `primary_goal` et `routine_preference` sont ajoutées avec `IF NOT EXISTS`.
3. Storage → vérifier que `audios` est **public** et contient exactement `seance1.mp3` à la racine.
4. Storage → vérifier que `user-audios` est **privé**.
5. Edge Functions → Secrets → ajouter `DEEPSEEK_API_KEY` (jamais dans `index.html`).
6. CLI : `supabase functions deploy ai-support`.
7. Tester avec deux utilisateurs anonymes distincts que les RLS empêchent toute lecture croisée des données personnelles.
8. Tester `https://<project-ref>.supabase.co/storage/v1/object/public/audios/seance1.mp3` dans un navigateur.

L'application possède aussi `assets/audio/seance1.mp3` comme secours PWA local.
