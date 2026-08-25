# Groq Free — activation du compagnon IA

Seule la fonction `supabase/functions/ai-support/index.ts` a été modifiée.

1. Créer une clé API sur le plan Groq Free.
2. Supabase → Edge Functions → Secrets : ajouter `GROQ_API_KEY`.
3. Supabase → Edge Functions → `ai-support` → `index.ts` : remplacer par la version de ce package, puis Deploy.
4. `DEEPSEEK_API_KEY` n'est plus utilisée par cette fonction. Elle peut rester présente ou être supprimée plus tard.
5. Aucun fallback payant n'est configuré. Si le quota Free est atteint, l'application renvoie `GQ-429`.
