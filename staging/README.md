# Allo Psycho — Stripe staging et continuité d'accès

## État actuel
- **AUCUN Stripe staging backend isolé n'a encore été déployé.**
- `staging/stripe-checkout/index.ts` est une **préparation GitHub**, jamais une fonction déployée. Elle refuse une clé `sk_live_`, exige un `STAGING_APP_URL` précis et valide le montant et l'intervalle des deux prix Stripe test. Elle ne résout pas encore la politique d'essai : l'intégrer **après** validation de la règle commerciale.
- La fonction Stripe sur Supabase `piezzrqryhzvrimeqwgi` est partagée avec l'application Vercel actuelle ; la modifier affecterait aussi la production historique.
- Les fichiers de `staging/` ne sont pas exportés par `scripts/build-cloudflare.sh` et ne doivent jamais apparaître dans `dist/`.

## Prérequis pour un environnement Stripe réellement isolé

1. Créer un **projet Supabase de test indépendant** uniquement après consultation de son coût et approbation. Ne pas utiliser la base actuelle pour des simulations modifiant les abonnements.
2. Copier seulement le schéma minimal nécessaire (tables, RLS, RPC de quota, functions et paramètres de test), **jamais** les comptes, journaux ni données de patients réels.
3. Configurer uniquement les secrets `sk_test_`, `whsec_` **du webhook test**, les prix test et le projet Supabase de test ; aucun secret dans GitHub.
4. Créer un endpoint Stripe en **mode test** pointant sur le webhook du projet isolé, distinct du webhook actif de production.
5. Créer un frontend de prévisualisation distinct ou un branchement explicite entre l'URL Cloudflare test et le Supabase de test. Ne pas modifier la configuration du site Vercel.
6. Vérifier en mode test les prix mensuel (999 centimes EUR) et annuel (8499 centimes EUR), le double abonnement, les doublons webhooks et les cas d'échec. Ne pas utiliser le compte ni la carte d'un véritable patient.

## Décision fonctionnelle sur l'essai gratuit

Le code existant donne 10 jours d'accès Premium via `premium-access` ; Stripe Checkout crée un abonnement sans `trial_end` ni `trial_period_days`. Avant d'activer une facturation commerciale, choisir et tester une politique **unique** :
- Essai de 10 jours sans carte, puis souscription volontaire : Checkout facture normalement à la souscription ; l'interface doit dire « Essai gratuit sans carte de 10 jours, puis abonnement payant si vous choisissez de souscrire ». Aucune conversion automatique.
- Ou essai de 10 jours avec carte avant prélèvement : Stripe doit appliquer exactement la période restante (pas 10 jours supplémentaires), avec présentation claire de la date et du montant du premier prélèvement, politique d'annulation et consentement requis.

Aucune de ces deux variantes n'est validée dans `staging/stripe-checkout/index.ts` : **ne pas déployer la facturation commerciale**.

## Restauration des abonnements : exigence bloquante

Actuellement `signInAnonymously` produit une identité liée au stockage du navigateur. Le passage de `workers.dev` à `app.allopsycho.fr`, une suppression des cookies/données ou un autre appareil peut recréer une identité et séparer l'utilisateur de son droit Stripe.

Solution de conception à valider :
- Proposer avant paiement la **création facultative d'un moyen de récupération privé**, par exemple une authentification par lien magique envoyé à un courriel (le courriel n'est pas affiché publiquement).
- Lier l'identité existante au compte récupérable de manière sécurisée, sans écraser les journaux locaux ; utiliser les mécanismes officiels Supabase de liaison/upgrade d'utilisateur anonyme.
- Ne jamais considérer un email ou un `customer_id` fourni par le navigateur comme preuve suffisante du droit Premium.
- Vérifier toute restauration côté serveur à partir d'une session authentifiée, de l'identité liée, de la correspondance Stripe validée et du statut de facturation.
- Prévoir sauvegarde locale/export des journaux pour migration de domaine, import explicite par l'utilisateur et chiffrement approprié selon l'analyse de risques.
- Tester sur deux navigateurs et après changement de domaine avant toute vente ; éviter de traiter des données patients réelles dans les tests.

## Données psychologiques et IA : mesures nécessaires

- Le navigateur peut stocker journal, humeurs, parcours TCC et historique via `localStorage`. Cela **n'est pas du chiffrement**, et l'utilisateur peut perdre ces données en vidant le stockage.
- Lors d'un appel IA, `ai-support` envoie au service Groq message, contexte, mémoire locale et jusqu'à 16 messages récents. Minimiser, documenter et rendre transparent ce transfert.
- Vérifier contrat de sous-traitance, lieu de traitement, politique de conservation et éventuel Zero Data Retention Groq **dans le compte concerné**.
- Éviter de consigner des réponses brutes d'erreur Groq, susceptibles de reprendre des données sensibles ; conserver des codes et métriques techniques sans contenu personnel.
- Valider notices d'information, droits d'accès/effacement, durées de conservation, bases légales et applicabilité HDS avec un spécialiste approprié.

## Recette de paiement de bout en bout (mode test uniquement)

- [ ] Vérifier essai 10 jours et sa date de fin, sans débit inattendu
- [ ] Session Checkout mensuelle : 9,99 €/mois, EUR, bon client et bon retour Cloudflare
- [ ] Carte Stripe test : session `complete`, événement signé, ligne `stripe_subscriptions`, Premium après actualisation
- [ ] Refaire en annuel : 84,99 €/an, cadence annuelle
- [ ] Tester l'échec de paiement et le renouvellement, annulation immédiate/fin de période, reprise
- [ ] Tester la double livraison du même webhook et les événements hors ordre
- [ ] Tester portail de gestion, réouverture du navigateur et changement d'appareil/domaine
- [ ] Confirmer que les données psychologiques ne sont ni dans les métadonnées Stripe ni dans les logs du prestataire
- [ ] Réaliser le contrôle sécurité/RGPD/HDS avant toute mise en production

## Règles de non-régression
- Ne modifier ni `main`, ni Vercel, ni DNS de `app.allopsycho.fr`, ni les fonctions Supabase partagées sans validation spécifique.
- Ne jamais placer de clés secrètes, d'identifiants patients ni de données sensibles dans GitHub.
