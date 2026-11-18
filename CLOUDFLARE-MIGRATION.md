# Allo Psycho — préparation de migration Cloudflare Pages

Cette branche **ne change pas la production** et ne touche ni au DNS, ni aux clés API, ni aux fonctions Supabase. Le dossier public `dist/` est généré par `scripts/build-cloudflare.sh`.

## Réglages Cloudflare Pages (intégration GitHub)
- Dépôt : `artdevie63-code/Allo-Psycho`
- Branche de déploiement pour le test : `migration-cloudflare-pages` (ne pas sélectionner `main` avant validation)
- Framework preset : `None`
- Root directory : `/`
- Build command : `bash scripts/build-cloudflare.sh`
- Build output directory : `dist`
- Aucun secret Groq, Supabase service_role ou Stripe ne doit être ajouté au frontend : les API passent par les Edge Functions Supabase.

## Pourquoi un build spécifique ?
Le dépôt contient un ZIP source et des fichiers Supabase serveur, **qui ne doivent pas être servis publiquement**. La commande construit une liste explicite des fichiers publiables (HTML, PWA, icônes, MP3 existants) et ajoute des en-têtes de sécurité conservateurs.

## Recette AVANT la bascule du domaine
1. Comparer le rendu avec l'application Vercel de référence.
2. Tester installation PWA, service worker, navigateur iOS/Android, audios et liens.
3. Vérifier authentification anonyme, consentement IA, quotas de 12 messages/jour, appels `ai-support`.
4. Tester 10 jours d'essai, abonnement mensuel/annuel, Checkout Stripe, portail et webhook en **mode TEST**, retour succès/annulation, mise à jour Premium, puis test de paiement LIVE autorisé avant lancement.
5. Vérifier les URL de retour configurées dans les fonctions Stripe Supabase ; ne pas considérer le changement d'hôte comme neutre.
6. Vérifier sauvegarde/export des données locales avant toute bascule : `localStorage` de `pages.dev`, `vercel.app` et `allopsycho.fr` ne se partage pas.
7. Faire contrôler sécurité, traitement des données psychologiques, RGPD et éventuelles exigences HDS.
8. Une fois ces tests réussis, associer `app.allopsycho.fr` au projet Cloudflare et changer uniquement les enregistrements DNS requis.
9. Conserver Vercel en solution de retour jusqu'à validation du domaine, certificat TLS et paiements réels.

## Points de vigilance
- `CURRENT-VERSION.md` indique Stripe en mode **TEST** au 14/11/2026 : ne pas présenter ce montage comme déjà commercialisable.
- Le code contient `ai-support` sur Supabase, mais les fonctions Stripe réellement déployées et leurs secrets ne figurent pas dans ce dépôt : elles doivent être vérifiées dans Supabase.
- Ne pas déployer un domaine en production avant la vérification de conformité et la validation de l'accès Premium.
