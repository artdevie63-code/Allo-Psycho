# Allo Psycho — sécurité, confidentialité et préparation conformité

Cette version est **privacy-first / anonymous-first**. Elle ne constitue pas à elle seule une certification HIPAA ou SOC 2.

## Données utilisateur
- Authentification anonyme Supabase : aucun e-mail n'est requis.
- Les données sensibles (journal, humeur, TCC, conversations) ne sont pas persistées dans `localStorage`.
- La persistance cloud utilise des tables avec RLS propriétaire (`auth.uid()`).
- L'analyse IA de tendances est volontaire, limitée à un échantillon récent et nécessite le consentement IA.
- Les MP3 personnels utilisent le bucket privé `user-audios`, séparé du bucket public `audios` réservé aux contenus partagés.

## Audio
- Audio principal attendu : `audios/seance1.mp3` dans le bucket public Supabase `audios`.
- Fallback PWA local : `assets/audio/seance1.mp3`.
- Le lecteur teste la capacité de lecture avec un délai maximal avant de basculer vers le fallback.

## IA DeepSeek
- Secret requis : `DEEPSEEK_API_KEY` uniquement dans les secrets Supabase Edge Functions.
- La clé ne doit jamais être placée dans `index.html`, Git, un manifest PWA ou le navigateur.
- Fonction : `supabase/functions/ai-support/index.ts`.
- Les réponses récentes servent à réduire les redites ; l'IA est décrite comme coach/compagnon de bien-être, pas comme thérapeute humain ou médecin.

## Sécurité de crise
La détection locale et serveur interrompt le coaching ordinaire lorsque des expressions indiquent un risque suicidaire, automutilation, violence, sang/saignement important ou danger immédiat.
- Idées suicidaires : 3114, puis 15/112 si danger immédiat.
- Blessure grave / mutilation / saignement : 15 ou 112.
- Intervention police/gendarmerie urgente : 17 ou 112.
La détection par mots-clés est volontairement prudente et ne remplace pas une évaluation humaine.

## Avant production
1. Activer Anonymous Sign-Ins dans Supabase Auth.
2. Exécuter et revoir `supabase/schema.sql` sur une base de staging.
3. Vérifier `audios` = public uniquement pour les contenus génériques ; `user-audios` = privé.
4. Définir `DEEPSEEK_API_KEY` dans les secrets Edge Functions.
5. Déployer `ai-support` et tester les erreurs/rate limits.
6. Tester les RLS avec deux comptes anonymes distincts.
7. Mettre en place rate limiting/CAPTCHA pour les sign-ins anonymes afin d'éviter les abus.
8. Configurer journaux d'audit, alertes, sauvegardes, rotation de secrets et réponse aux incidents.
9. Pour HIPAA : déterminer si l'application traite réellement des ePHI, signer les BAA nécessaires avec les fournisseurs éligibles, réaliser l'analyse de risques et mettre en place les procédures administratives/physiques/techniques requises.
10. Pour SOC 2 : définir le périmètre, les contrôles, les preuves, la gestion des accès, changements, incidents, fournisseurs et continuité, puis passer par un audit/attestation indépendant.


## Version 4 — parcours personnalisé, DeepSeek et sécurité de crise
- Le secret IA attendu est `DEEPSEEK_API_KEY`, exclusivement dans les secrets Supabase Edge Functions.
- Le navigateur appelle uniquement `ai-support`; il ne contacte pas DeepSeek directement.
- L'audio partagé par défaut est `audios/seance1.mp3` dans le bucket public `audios`, avec fallback PWA `assets/audio/seance1.mp3`.
- Les MP3 personnels restent séparés dans le bucket privé `user-audios` avec politiques RLS/Storage par `auth.uid()`.
- Les profils peuvent enregistrer `primary_goal` et `routine_preference` afin de personnaliser plans et routines sans collecter d'e-mail.
- La détection de crise interrompt le coaching en cas d'idées suicidaires, automutilation, sang, violence, menace ou danger immédiat. En France, l'interface propose 3114 pour la prévention du suicide, 15/112 pour urgence médicale et 17 lorsqu'une intervention police/gendarmerie est nécessaire.
- Ces garde-fous sont une couche de sécurité applicative, pas une garantie clinique. Une revue professionnelle, des tests de faux positifs/faux négatifs et une gouvernance d'incident restent requis avant production.
