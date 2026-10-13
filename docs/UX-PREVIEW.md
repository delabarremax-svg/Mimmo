# Aperçu privé du parcours guidé

Cette PR conserve la palette, le fond clair et les cartes arrondies. Elle ajoute : accueil avec reprise des projets, cartes photo et repères essentiels, recherche/filtres, tableau de bord fondé sur les champs enregistrés, provenance avec libellés/icônes/couleurs, étapes de saisie, brouillons préservés entre étapes et avertissement avant abandon. Les transitions respectent la préférence de mouvement réduit. Les champs sont à 16 px sur iPhone.

Les photos sont choisies localement (JPG/PNG/WebP, 10 Mo et 40 mégapixels maximum), décodées dans le navigateur et affichées via des URLs blob. Aucun envoi serveur, aucune photo immobilière fictive, aucun document sécurisé simulé. Les références blob sont libérées au remplacement/retrait/fermeture de l’application. HEIC doit être converti si Safari ne le fournit pas déjà en JPG. Les photos et les biens disparaissent au rechargement ; avantunload est un avertissement complémentaire que Safari iOS ne garantit pas dans tous les cas.

Les comptes sont uniquement préparés dans [NEXT-AUTH-PRIVATE-PROJECTS.md](NEXT-AUTH-PRIVATE-PROJECTS.md). Le nombre de champs renseignés n’est pas un pourcentage d’analyse. Les alertes reflètent uniquement une provenance contradictoire déclarée ou une donnée manquante. Aucun rendement, score ou diagnostic n’est inventé.

## Tester depuis un iPhone sans fusionner

Le workflow `Aperçu privé UX MIMMO` est limité à une pull request de la branche `feat/guided-property-experience` provenant de ce même dépôt. Il refuse les forks, n’a que la permission GitHub contents:read et utilise les secrets déjà configurés pour la démonstration. Il ne fusionne jamais la PR.

Il publie le Worker **mimmo-demo-ux**, distinct de **mimmo-demo-privee**, avec la même protection serveur et le même DEMO_PASSWORD. Aucune modification de plan ni service payant : le plan Free a été confirmé par le fondateur lors de l’exécution réussie 38390246372. Quota gratuit Cloudflare partagé entre les deux Workers. Les tentatives anonymes consomment aussi ce quota. La prévisualisation de versions Cloudflare est désactivée.

Après réussite, le résumé de l’exécution fournit le lien HTTPS réellement vérifié : HTML/JS/CSS refusés sans identifiants et servis avec authentification. Identifiant **mimmo**, mot de passe déjà choisi. Le mot de passe ne doit jamais apparaître dans un commentaire ni dans le bundle.

Les secrets restent nécessaires pour le déploiement, pas pour lancer les tests locaux. Si la publication est refusée, conserver la protection et signaler le blocage ; ne pas modifier le Worker de démonstration existant pour contourner l’erreur. Pour arrêter cet aperçu : supprimer `mimmo-demo-ux` dans Cloudflare ; cela ne supprime pas la démonstration initiale.

## Parcours de validation

Ajouter un lien → donner un nom/provenance/source → enregistrer l’étape → passer au logement → revenir à l’étape précédente et vérifier le brouillon → tableau de bord → ajouter une photo → retourner à Mes biens et utiliser la recherche/filtres. Vérifier une donnée marquée contradictoire, la lecture de sa source, une tentative de quitter avec brouillon et le rechargement qui efface les projets. Tester Safari iOS réel/VoiceOver avant de parler de compatibilité entièrement validée.

## Vérifications de cette PR
40 tests automatisés réussis (parcours initial, validation des faits, protection serveur, étapes/brouillons, filtres/contradictions et limites des photos). Compilation TypeScript/Vite réussie ; packaging Wrangler UX en dry-run réussi sans upload. Parcours Chromium tactile testé à 320, 390 et 430 px, et bureau à 1280 px : aucune erreur JavaScript ni débordement horizontal, photo locale décodée/affichée/agrandie, avertissement de brouillon et disparition des projets au rechargement. Le parcours à 390 px est également passé derrière le runtime Cloudflare local HTTPS et sa CSP, y compris les photos blob. HTML, JS et CSS refusés sans identifiants (401) et accessibles avec identifiants (200). Le certificat auto-signé de développement n’est toléré que dans les tests locaux ; le futur lien Cloudflare conserve une vérification TLS normale. Safari iOS réel/VoiceOver restent à vérifier par le fondateur.
