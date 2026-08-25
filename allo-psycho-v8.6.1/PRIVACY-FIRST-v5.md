# Allo Psycho V5 — Privacy First

## Données conservées uniquement sur le terminal
Profil/pseudonyme, journal, humeurs, exercices TCC, routines, historique local du chat et MP3 personnels ne sont plus écrits dans les tables patient Supabase. Les textes sont conservés dans le stockage local du navigateur ; les MP3 personnels utilisent IndexedDB.

## Supabase
Supabase reste utilisé pour les contenus génériques (bibliothèque audio publique), l'administration et un identifiant d'authentification anonyme pouvant servir de jeton technique pour les appels autorisés. Les anciennes tables patient peuvent rester présentes mais la V5 ne les alimente plus.

## IA
L'utilisation de l'IA est volontaire et soumise au choix IA du profil. Le message saisi est transmis à la fonction `ai-support`, avec uniquement un contexte minimal : style de réponse, objectif général, rythme de routine et dernier libellé d'humeur. Le prénom/pseudonyme, le journal complet et l'historique local ne sont pas transmis automatiquement.

## Audio
Source principale exacte :
https://sqsuqcpmsaqnlfortbhc.supabase.co/storage/v1/object/public/audios/seance1.mp3

Un fallback local `assets/audio/seance1.mp3` est inclus. Un lien de diagnostic est affiché dans l'interface pour tester directement l'objet Supabase.

## Limites
Le stockage local peut être supprimé par l'utilisateur, le navigateur, une réinitialisation du terminal ou une désinstallation. L'export local doit être utilisé si l'utilisateur souhaite conserver une copie.

## Analyse des schémas répétitifs
La V5 réalise l'analyse des tendances directement dans le navigateur à partir des humeurs, notes et exercices locaux. Le bouton d'analyse des tendances n'interroge plus Supabase pour lire un historique patient.
