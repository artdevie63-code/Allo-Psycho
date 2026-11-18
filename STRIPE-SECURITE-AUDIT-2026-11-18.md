# Allo Psycho — Audit de précommercialisation Stripe et confidentialité
Date : 18 novembre 2026
Périmètre : Cloudflare Workers `allo-psycho-test`, branche GitHub `migration-cloudflare-pages`, Supabase `piezzrqryhzvrimeqwgi`, compte Stripe Artdevie63.

**Décision : NON VALIDÉ pour l'ouverture de paiements réels.**
Les tests manuels des pages, TCC, jeux, audios, IA et statut Premium sont positifs, MAIS ne prouvent pas un paiement et un renouvellement de bout en bout. Ce rapport n'implique ni modification du domaine, ni modification de Vercel, ni déploiement de fonctions Supabase en production.

## Constatations vérifiées (lecture seule)

1. **Stripe Checkout redirige vers Vercel.** La fonction Supabase déployée `stripe-checkout` fixe `appUrl = "https://allo-psycho-v920-mistral-stripe.vercel.app"`; les URL success et cancel utilisent cette adresse. Un paiement lancé sur `workers.dev` quitterait l'application Cloudflare.
2. **Le portail Stripe n'utilise pas la même configuration.** `stripe-portal` choisit `APP_URL` avec repli `https://allopsycho.fr`. Un retour sur le mauvais domaine risque de perdre la session anonyme et de rendre le statut Premium incohérent.
3. **L'essai de 10 jours est géré dans `premium-access`, non dans Checkout.** `stripe-checkout` crée un abonnement sans `trial_period_days` ni `trial_end`. Ainsi, un utilisateur qui clique sur S'abonner pendant son essai peut être facturé immédiatement ; le texte « Après les 10 jours d'essai » ne garantit pas un différé de prélèvement.
4. **Aucun parcours facturation de bout en bout prouvé.** Stripe test comporte deux prix actifs (9,99 €/mois et 84,99 €/an), un endpoint webhook actif et zéro session Checkout trouvée au moment du contrôle. Supabase a zéro ligne dans `stripe_subscriptions` ; les événements enregistrés ne prouvent pas la création, le paiement et l'attribution d'un abonnement.
5. **Prix test en dur comme valeurs de secours.** `stripe-checkout` contient les identifiants des prix *test* en fallback. Les prix live 9,99 €/mois et 84,99 €/an existent, mais les variables d'environnement live ne sont pas vérifiées. Il faut supprimer le fallback et échouer explicitement si la configuration du mode ciblé manque.
6. **Webhooks.** Signature Stripe vérifiée sur corps brut ; doublons détectés via `stripe_events` et les événements subscription/invoice gérés. Cependant, l'insertion de l'événement intervient après traitement : la gestion des traitements concurrents, rejoués et hors ordre doit être testée. `past_due` est considéré comme actif : la politique de délai de grâce doit être explicite. Aucun abonnement persistant n'est actuellement confirmé.
7. **Accès anonymous/session.** Les identités Supabase sont anonymes ; les données conservées localement et les sessions par origine navigateur ne se transfèrent pas automatiquement entre `workers.dev`, `vercel.app` et `app.allopsycho.fr`. Un utilisateur peut perdre l'accès apparent à son achat en changeant de navigateur/domaine/appareil : établir un mécanisme de restauration/connexion fiable avant ventes.
8. **RLS.** Les tables `premium_entitlements`, `stripe_subscriptions`, `stripe_events`, `ai_daily_usage`, etc. ont RLS actif sans politique de lecture publique ; c'est une protection voulue pour les accès via fonctions service_role. Les règles `audio_candidates` reposent sur la table `admin_users`, mais l'avertissement Supabase « anonymous sign-ins » doit être examiné par rôle et politique. Ne pas ouvrir des règles générales.
9. **Protection des mots de passe compromis** signalée désactivée par l'audit Supabase : vérifier l'applicabilité aux comptes actuels, surtout si de futurs comptes permanents sont activés.
10. **Confidentialité thérapeutique.** `ai-support` envoie à Groq : message courant, jusqu'à 16 entrées d'historique, contexte (objectif, humeur, routine) et mémoire locale résumée. Aucun test des paramètres Zero Data Retention (ZDR), clauses RGPD, localisation de traitement et transferts internationaux n'a été effectué sur le compte Groq. Le fait que l'historique soit local ne signifie pas que son contenu n'est pas transmis.
11. **Journalisation.** En cas d'erreur Groq, `ai-support` consigne `raw.slice(0,1200)` dans les logs : ce détail pourrait contenir des informations sensibles envoyées par un tiers. Remplacer par codes d'erreur et identifiants techniques sans message libre, après validation.
12. **Santé/RGPD.** Qualifier juridiquement les finalités et les données traitées, les rôles responsables/sous-traitants, les bases légales et l'application potentielle de la certification HDS. Ne pas présumer qu'un hébergement gratuit généraliste suffit aux données recueillies dans un contexte de santé psychologique. Revue juridique et contractuelle requise.

## Correctifs à préparer sans changer la production existante

- Séparer environnements `test` et `live` et vérifier la cohérence `STRIPE_SECRET_KEY`, ID mensuel/annuel et secret webhook pour chacun. Ne jamais copier de secret dans GitHub.
- Remplacer les URLs fixes par une URL applicative serveur explicitement autorisée, distincte par environnement, et garder la production existante intacte jusqu'à une bascule planifiée.
- Décider la sémantique de l'essai (10 jours avant débit *ou* 10 jours d'accès gratuit avant souscription volontaire) et harmoniser présentation, Checkout et gestion serveur.
- Installer une récupération de compte/identité compatible avec pseudonymat ; sauvegarder la continuité des droits Premium et des données localement stockées.
- Durcir la gestion webhook contre concurrence/doublons/hors ordre et définir clairement annulation, impayés, `past_due`, réabonnement et remboursement.
- Minimiser les données envoyées à l'IA ; examiner Groq ZDR et accords contractuels ; supprimer la journalisation d'éventuels contenus personnels.
- Vérifier les exigences RGPD/HDS, les consentements, la documentation, les durées de conservation, les sous-traitants et les demandes d'effacement.

## Recette test réellement nécessaire avant feu vert

En environnement **Stripe TEST uniquement**, avec un utilisateur Supabase de test :
1. Consulter l'état essai gratuit et sa date d'expiration ; vérifier absence de facturation non annoncée.
2. Démarrer Checkout mensuel ; vérifier montant, devise, URL de retour et absence de Stripe Tax non prévue.
3. Terminer avec carte Stripe de test ; confirmer session complète, `checkout.session.completed`, ligne `stripe_subscriptions`, et accès Premium après réouverture.
4. Répéter le parcours annuel ; valider 84,99 €, cadence annuelle et absence de double souscription.
5. Simuler renouvellement réussi, renouvellement impayé, passage `past_due`, annulation immédiate/fin de période, réouverture et événement dupliqué/hors ordre.
6. Vérifier le portail, retour à l'application, déconnexion/reconnexion, changement de navigateur et restauration de l'accès.
7. Vérifier dans Stripe les livraisons des webhooks et les codes HTTP sans exposer d'informations personnelles.
8. Vérifier purge des logs, paramètres Groq ZDR et conformité avant utilisateurs réels.

## État à la clôture

- **Validé** : disponibilité interface, TCC/jeux, audios, réponse IA et écran Premium (tests déclarés par l'utilisatrice), architecture des fonctions Supabase active, existence des tarifs et endpoints Stripe dans test/live.
- **Non validé** : prélèvement de bout en bout, activation après paiement, restauration d'accès, renouvellements et annulations, redirections Cloudflare, sécurité clinique/RGPD/HDS.
- **Aucun paiement, aucun test sur données de patient, aucun changement de secrets, base, webhook, domaine ou production effectués.**
