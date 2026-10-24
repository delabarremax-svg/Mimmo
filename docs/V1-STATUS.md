# État de livraison V1

## Fonctionnel et testé localement

- Base des PR 3 et 4 réutilisée, aucune fusion.
- Dossier multi-biens : faits et provenance, observations DPE/diagnostics/PV AG,
  source, page, extrait, points de vigilance par règles, sauvegarde versionnée.
- Texte et JSON-LD : extraction de champs à relire, conservation des désaccords.
  Import HTTPS serveur limité à une liste de sources autorisées (vide par défaut),
  respect conservateur de robots.txt, taille/temps limités, aucune redirection.
- PDF : lecture locale du texte page par page. Capture : OCR français local.
  Bibliothèques et données OCR servies par l'application, pas de CDN d'exécution.
  Fichiers scannés/illisibles : capture ou transcription assistée.
- Marché : fourchette calculée à partir de comparables ajoutés par l'utilisateur,
  sources et dates visibles, confiance faible explicite. Aucun loyer inventé.
- Travaux : quantités et prix sourcés, artisans/soi-même, provision paramétrable.
- Finances : prix/frais/travaux/mobilier/apport, crédit et assurance, charges,
  vacance et gestion, cash-flow avant impôt, rendements et scénario prudent.
- PDF bancaire multipage réel avec faits, hypothèses, risques et références.
- Récupération de mot de passe : API et interface, cookie de récupération dédié,
  vérification d'identité et révocation. Tests SDK simulés, email réel non testé.
- Documents privés : API et migration additive appliquée sur Mimmo-Paris ;
  tests PostgreSQL embarqués pour isolation et refus des chemins étrangers.
- Une intégration expérimentale Cloudflare Workers AI est préparée pour
  l'aperçu fictif privé uniquement : texte et vision, consentement d'envoi,
  deux appels/minute/IP, citations et chiffres contrôlés, résultats toujours
  hypothétiques. Aucun modèle nécessitant une offre payante ni AI Gateway.
  La preuve d'inférence distante doit être obtenue par le contrôle de publication.

## Validation

103 tests réussis ensemble localement et dans GitHub Actions, puis ajout d'un
test transactionnel RLS et d'un test d'échec de révocation. TypeScript et
builds comptes/démo réussis ; packaging Wrangler V1 en dry-run réussi.
Chromium mobile à 320/390/430 px et bureau 1280 px : pas de débordement, pas
d'erreur JS. PDF téléchargé, relu dans PDF.js et pdftotext. OCR français d'une
capture fictive contrôlé. Même parcours passé derrière le Worker local HTTPS,
sa protection Basic et sa CSP (certificat auto-signé accepté uniquement en local).
Safari iPhone réel reste à tester.

Mimmo-Paris : migration `v1_private_documents` appliquée après tests PostgreSQL
locaux ; bucket privé de 10 Mo, RLS propriétaire/projet ; aucun utilisateur,
bien ou document fictif enregistré. Projet de Londres inchangé.

## Bloque la qualification de V1 complète

1. L'IA expérimentale doit passer le contrôle distant sur un texte et une image
   fictifs. Elle n'est pas activée sur l'espace de comptes réels. Selon la
   documentation Cloudflare consultée, Workers Free inclut 10 000 neurones/jour
   et refuse les opérations au-delà, sans passage automatique à une offre payante.
   Traitement IA non garanti exclusivement dans l'UE : consentement explicite,
   minimisation des données et validation avant utilisation de documents réels.
2. Pas de fournisseur de marché connecté ni d'autorisation de collecte de
   portail. Les comparables documentés sont saisis par l'utilisateur.
3. Le blocage des tests SQL distants a été résolu avec un script transactionnel
   autonome testé préalablement en PostgreSQL local. Neuf groupes de contrôles
   ont réussi sur Mimmo-Paris : sauvegarde/lecture/mise à jour/version, versions
   périmées, vérification forgée, transfert de propriétaire, refus croisés
   Alice/Bob, bien propre à Bob, accès anonyme et suppression par le propriétaire.
   Le ROLLBACK a laissé zéro utilisateur, bien, identité, session ou document.
   Le parcours HTTP de deux comptes avec vrais emails reste à valider.
4. Configuration Supabase Auth à finaliser : Site URL, redirections et modèles
   d'emails de confirmation/récupération (lien token_hash côté serveur), JWT
   900 secondes. Les outils connectés n'exposent pas la modification de ces
   paramètres. Aucun secret ne doit transiter dans le chat.
5. Envoi email Supabase intégré restreint : destinataires et quotas à contrôler.
   SMTP dédié éventuel à autoriser avant ouverture à des utilisateurs externes.
6. Le script `deploy-v1-accounts.mjs` prépare l'espace de comptes privé séparé.
   La clé de session est générée par le runner au premier déploiement et
   conservée dans Cloudflare, jamais lue, affichée ni remplacée aux suivants.
   La clé Supabase publishable est publique par conception, sans privilège
   administratif ; elle configure uniquement le Worker, sans clé service_role.
   Le parcours réel de confirmation/récupération reste à valider.
7. Avant données importantes : restauration, rétention des fichiers orphelins,
   protection antivirus et documents de confidentialité à compléter.

## Démonstration privée

Le workflow `Aperçu V1 privé MIMMO` ne cible que `feat/integrated-v1`, sans accès
aux forks et avec lecture seule du dépôt. Il teste, compile, puis publie uniquement
`mimmo-v1-privee`, distinct des deux démonstrations existantes. Il réutilise les
secrets Cloudflare et le mot de passe de démonstration déjà configurés. Les assets
HTML/JS/CSS/PDF/OCR sont protégés côté serveur et vérifiés après publication.

Ce mode charge explicitement deux projets fictifs ; il ne simule pas de connexion
réelle et n'enregistre rien dans Supabase. Il sert à tester le dossier de bout en
bout, avec des limites annoncées. Aucun appel IA facturable ni option payante.

## Prochaine décision produit indispensable

Aperçu fictif publié et protection vérifiée :
https://mimmo-v1-privee.delabarre-max.workers.dev
Identifiant `mimmo`, mot de passe de démonstration déjà choisi.

Espace comptes privé préparé et protections vérifiées :
https://mimmo-v1-comptes-privee.delabarre-max.workers.dev
La configuration des emails Supabase reste nécessaire au parcours de connexion.

Choisir les fournisseurs IA et données de marché et leur plafond de coût avant
activation. L'application peut être testée sans eux, mais ne sera pas présentée
comme une V1 complète tant que ces intégrations et les comptes réels ne sont
pas validés.

Documentation examinée pour l'option gratuite :
https://developers.cloudflare.com/workers-ai/platform/pricing/
https://developers.cloudflare.com/workers-ai/platform/data-usage/
