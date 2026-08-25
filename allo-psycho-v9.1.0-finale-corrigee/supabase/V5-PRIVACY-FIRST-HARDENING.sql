-- Allo Psycho V5 Privacy First
-- Option recommandé après passage définitif en V5.
-- Empêche les clients anon/authenticated de lire/écrire les anciennes tables patient.
-- Ne supprime aucune donnée existante : vérifiez et purgez séparément si nécessaire.

revoke all on table public.patient_profiles from anon, authenticated;
revoke all on table public.patient_journal from anon, authenticated;
revoke all on table public.patient_moods from anon, authenticated;
revoke all on table public.patient_tcc from anon, authenticated;
revoke all on table public.patient_chat_messages from anon, authenticated;

alter table public.patient_profiles enable row level security;
alter table public.patient_journal enable row level security;
alter table public.patient_moods enable row level security;
alter table public.patient_tcc enable row level security;
alter table public.patient_chat_messages enable row level security;

-- Pour supprimer d'anciennes données de test, faites-le manuellement après sauvegarde/validation.
