# Import d’annonces — publication privée du 6 novembre 2026

Autorisation explicite du fondateur : mettre à jour uniquement l’aperçu privé des
comptes avec la PR 7, sans fusion, sans changer les autres démonstrations ni Londres,
et sans option payante.

Adresse : https://mimmo-v1-comptes-privee.delabarre-max.workers.dev
Protection extérieure et compte applicatif existants conservés. Aucun secret lu
ou affiché ; la clé de session existante est conservée par le script de publication.

## Révision et vérifications

Code applicatif : `2bf0390` (PR 7). Branche de publication isolée :
`ops/approved-listing-import-20261106`, sans fusion vers `main` ni les autres PR.
La publication est limitée à un nom de Worker et un projet Paris épinglés.
Aucune migration ou écriture sur les biens n’est exécutée pendant l’opération.

La première vérification distante a révélé les redirections automatiques `.html`
de Cloudflare. La correction utilise `html_handling: none` et une résolution
explicite de l’accueil vers `/index.html`, en conservant les paramètres Auth.
Un test de régression couvre ces trois routes. Aucun contrôle des sources tierces
n’a été relâché.

## Résultats confirmés

[Publication et contrôles réussis](https://github.com/delabarremax-svg/Mimmo/actions/runs/42207921706).

- 196 tests réussis, audit npm et compilation comptes réussis.
- Recette locale : lecture HTTP des deux annonces autorisées et refus 403 ;
  véritable OCR image/PDF scanné avec API simulée, revue/correction/reprise mobile.
- Révision publiée comparée octet par octet aux HTML/JS/CSS compilés autorisés.
- Deux exemples réellement lus depuis l’aperçu protégé : huit champs présents
  pour chacun. PDF worker, OCR worker et langue française identiques aux fichiers
  compilés, accès anonyme refusé (401).
- Accueil comptes vérifié à 320/390/430px dans Chrome mobile : pas de débordement
  ni erreur JavaScript. Retours confirmation/récupération vérifiés avec codes
  volontairement invalides, sans envoyer d’email.
- Trois autres démonstrations : HTML/JS/CSS identiques avant/après et accès
  anonyme toujours refusé. Aucun appel de modification au projet Londres.
- Aucun compte de test, bien ou fichier distant créé/supprimé ; aucun changement
  de schéma ou de configuration Supabase. SESSION_KEY existante conservée.
- Aucune fusion et aucune option payante activée.

La vérification distante des exemples lit leurs vrais fichiers publiés avec le
parseur réel ; elle n’utilise pas une session personnelle ni ne sauvegarde dans
un compte. La recette suivante reste nécessaire pour ce dernier passage.

## Recette iPhone

Ouvrir Safari et l’adresse ci-dessus ; utiliser la protection habituelle puis son
compte MIMMO existant. Actualiser la page si l’ancien écran d’ajout reste affiché.

1. Ajouter un bien, choisir « Essayer l’appartement fictif MIMMO » puis « Lire
   l’annonce ». Vérifier Lille, 155 000 €, 51 m², 3 pièces, DPE D et charges
   1 080 €/an. Les sources et la mention fictive doivent apparaître. Enregistrer
   seulement après relecture. La maison fictive offre un second format HTML.
2. Ajouter un autre bien à partir d’une véritable URL Leboncoin, SeLoger ou
   Bien’ici. Aucune autorisation partenaire n’étant configurée, le repli vers
   captures/PDF/texte doit apparaître sans prétendre avoir lu le portail.
3. Dans ce repli, sélectionner une capture lisible de l’annonce depuis Photos.
   Attendre la fin de l’OCR, puis comparer les propositions avec les chiffres
   visibles. Examiner la source (nom du fichier/page) et les contradictions.
   Corriger si nécessaire puis « Enregistrer dans mes biens ». Le texte extrait
   n’est pas à retaper ; une donnée non reconnue reste manquante. Un PDF peut
   être sélectionné via Fichiers pour tester l’autre format.
4. Revenir à Mes biens, actualiser, puis se déconnecter et se reconnecter.
   Retrouver la fiche, les valeurs corrigées et les sources. Ne pas supprimer
   les biens existants pour réaliser cette recette.

Les tests automatiques de sauvegarde du nouveau parcours utilisent une API
simulée et PostgreSQL embarqué. La sauvegarde/reconnexion réelle du compte avait
été validée par le fondateur avant PR 7 ; les nouvelles métadonnées et l’OCR
sur une vraie capture iPhone nécessitent cette recette personnelle. Aucun mot de
passe ou email de confirmation ne doit être transmis dans la conversation.

OCR dans le navigateur, sans fournisseur IA ni transfert du fichier à un service
OCR tiers. Les informations validées et leurs extraits sont enregistrés dans le
compte privé. Les fichiers originaux ne sont pas déposés automatiquement. Aucun
portail partenaire ni analyse IA européenne n’est activé par cette publication.
