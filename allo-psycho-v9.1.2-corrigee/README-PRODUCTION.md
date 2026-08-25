# Allo Psycho V9.0 — production finale

Correctifs principaux :
- sauvegarde locale renforcée par un miroir IndexedDB sur le même appareil ;
- restauration locale avant l’initialisation de l’interface ;
- Journal, TCC et humeur ne se réinitialisent plus si l’écriture locale échoue ;
- compagnon IA : session anonyme vérifiée et rafraîchie avant appel, retry unique si nécessaire ;
- `ai-support` crée l’essai si le chat est ouvert avant la page Premium ;
- `premium_required` n’est plus renvoyé comme panne HTTP ;
- moteur Décharge réécrit pour Android/mobile avec Pointer Events, touch et click de secours ;
- Décharge : 60 secondes fixes ;
- mesures Avant / Après supprimées ;
- options d’affichage simplifiées : seul le PIN local reste visible ;
- Profil, À propos et footer pointent vers `privacy.html` ;
- un seul champ d’activation accepte les codes Premium classiques et les deux accès privés :
  - Propriétaire : Admin + Premium permanent ;
  - Testeur : Premium permanent sans Admin ;
- aucun UUID ni code privé n’est inclus dans le ZIP ;
- aucun logo personnalisé ajouté pour le moment.

Déploiement Supabase requis :
- `premium-access`
- `ai-support`

Les deux fichiers prêts à copier se trouvent également à la racine des livrables séparés fournis dans la conversation.


## Correctif V9.0.1 — consentement et mémoire IA
- la case d’autorisation IA est enregistrée immédiatement lorsqu’elle change ;
- `callAI()` resynchronise le consentement depuis le profil local avant de bloquer l’accès ;
- la mémoire IA est supprimée de localStorage ET du miroir IndexedDB ;
- une réinitialisation crée un point de coupure : les anciens échanges restent visibles localement mais ne sont plus envoyés à l’IA ;
- le compagnon repart du prochain message après réinitialisation.


## Correctif V9.0.3 — installation PWA
- ajout d’un vrai bouton « Installer Allo Psycho » ;
- Android/Chromium : capture de `beforeinstallprompt` puis `prompt()` sur clic utilisateur ;
- iOS/iPadOS : aide intégrée « Partager → Sur l’écran d’accueil → Ajouter » ;
- fallback manuel sur les navigateurs qui ne fournissent pas `beforeinstallprompt` ;
- l’interface d’installation disparaît automatiquement en mode standalone ou après `appinstalled` ;
- ajout d’un `id` explicite dans le manifest et maintien des icônes 192/512.


## Correctif V9.0.4 — Android/iOS + Décharge
- Décharge : suppression des gestionnaires pointer/touch/click concurrents ;
- interaction déléguée sur `pointerdown`, avec fallback `touchstart` seulement si PointerEvent est absent ;
- cibles plus grandes et légèrement plus lentes sur téléphone ;
- mise en page mobile resserrée : cartes, formulaires, grilles, jeux et modales ne peuvent plus élargir la page ;
- navigation principale horizontale et défilable sur téléphone ;
- aucune modification de la logique Premium ni du fournisseur IA Groq.


## V9.1.0 — finale consolidée
- responsive téléphone renforcé iOS/Android ;
- Décharge réécrit avec de vrais boutons statiques et un seul événement `click`, afin d'éviter les problèmes tactiles Android ;
- Groq Free uniquement pour le compagnon IA, modèle `qwen/qwen3.6-27b` ;
- contexte IA réduit pour préserver le quota gratuit ;
- pas de retry inutile sur 401/403/404/413/422/429 ;
- retry unique seulement pour réponse vide, réseau ou 5xx ;
- diagnostics `GQ-*` conservés ;
- Premium Testeur/Propriétaire conserve `source:"code"` en base pour éviter les contraintes SQL historiques.


## V9.1.2 — correctif Admin
- correction de l'activation Propriétaire/Admin dans `premium-access`;
- remplace l'upsert dépendant d'une contrainte unique par un `select` puis `insert`;
- le code Testeur reste inchangé;
- aucun autre module n'a été modifié.
