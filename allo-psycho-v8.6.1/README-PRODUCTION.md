# Allo Psycho V8.6 — conversation IA adaptative

Correctifs IA :
- vrai historique local affiché et envoyé avec les bons rôles ;
- dernier message utilisateur prioritaire et présent une seule fois ;
- envoi concurrent bloqué pendant qu'une réponse est en cours ;
- session anonyme Supabase créée automatiquement si nécessaire ;
- suppression du faux fallback conversationnel local répétitif ;
- mode « réponses courtes » réellement transmis au serveur ;
- ai-support V6.2 : adaptation au type de tour, TCC moins mécanique, anti-répétition et seconde génération si une réponse ressemble trop aux précédentes ;
- mémoire de travail traitée comme contexte secondaire, jamais comme parole de l'utilisateur ;
- DeepSeek V4 Pro conservé en réflexion `high`.

IMPORTANT : cette version modifie `supabase/functions/ai-support/index.ts`.
Il faut donc redéployer la fonction Edge `ai-support`.
`premium-access` n'a pas besoin d'être redéployée.


## V8.6.1
- Audio gratuit Gymnopédie n°1 : rechargement automatique lors du passage Premium ↔ gratuit et seconde source de secours.
- Besoin « Calme » : ouverture directe de « Ma routine douce ».
- Cohérence cardiaque : suppression de la mesure tension Avant / Après.
- Décharge conserve la mesure Avant / Après.
- Aucune modification de `ai-support` par rapport à V6.2.
- Attribution audio gratuit : Erik Satie, arrangement/interprétation Kevin MacLeod, CC BY 3.0.
