# Import d’annonces V1 — 6 novembre 2026

Branche `feat/listing-import`, PR 7 basée sur la PR 6.
Aperçu privé des comptes mis à jour avec autorisation explicite :
[publication et recette iPhone](DEPLOIEMENT-IMPORT-PRIVE-2026-11-06.md). Les comptes réels, confirmation,
sauvegarde et reconnexion ont été validés sur iPhone par le fondateur avant cette
mission. Aucune PR fusionnée ; seule la publication privée des comptes a été
autorisée et réalisée. Aucune donnée de Paris ou Londres modifiée pendant cette opération.

## Trois parcours intégrés

1. **Source accessible et autorisée.** API même origine authentifiée
   `POST /api/import-listing`, contrôle de la source, robots.txt puis HTML borné.
   Extraction JSON-LD immobilier, métadonnées explicites et texte principal.
   Titre, prix EUR, commune, surface métrique, pièces, description, DPE et charges
   lorsque présents. Liens d’images identifiés dans les données structurées ;
   pas de chargement tiers automatique, copie ni analyse des photos.
2. **Source refusée, absente des autorisations, indisponible ou protégée.**
   Lien conservé en brouillon ; repli immédiatement ouvert vers texte, captures
   ou PDF. L’interface indique si une vérification distante a réellement été
   tentée. Aucun faux succès de lecture ni donnée dérivée du nom de l’URL.
3. **Fichiers ou texte fournis.** OCR français local des images ; PDF.js lit le
   texte avec ses lignes et pages. Les pages scannées ou essentiellement images
   sont rendues puis lues par OCR, sans ressaisie systématique. Les champs sont
   proposés automatiquement, avec fichier/page/extrait. Correction et validation
   explicites avant un unique enregistrement dans le compte. Les résultats d’une
   lecture terminée après changement de source sont ignorés.

« Analyse structurée » désigne ici le relevé déterministe des champs et des
contradictions, pas une analyse IA des risques ou un diagnostic technique.
L’IA reste désactivée. Les absences et erreurs OCR ne sont pas comblées par des
hypothèses cachées. Les valeurs modifiées sont distinguées comme personnelles.

## Exemples fictifs hébergés dans nos assets

- `public/import-examples/appartement-fictif.html` : données structurées,
  DPE/charges et illustration fictive identifiée.
- `public/import-examples/maison-fictive.html` : métadonnées et texte HTML.
- `example.css` et `illustration-fictive.svg` appartiennent à ce jeu de test.

La lecture automatisée est explicitement autorisée dans chaque page. Ces fichiers
sont servis dans notre environnement local et dans l’aperçu privé des comptes,
mis à jour avec autorisation le 6 novembre. Leur accès privé a été vérifié.

Le lecteur n’accorde l’exception interne qu’à ces deux chemins exacts sur
**l’origine de la requête MIMMO**, sans identifiants, query ni fragment. Il utilise
le binding ASSETS du Worker ; aucun cookie utilisateur ou mot de passe de
protection n’est transmis à un site tiers. Cette exception ne permet pas de lire
une autre route, un document privé ni une URL d’un autre domaine.

Dans l’espace comptes, « Essayer l’appartement fictif MIMMO » ou « Essayer la
maison fictive MIMMO » renseigne le lien. Le statut fictif reste dans le dossier
et dans le PDF bancaire, même si l’utilisateur renomme son projet.

Dans l’aperçu privé des comptes, les chemins sont :

- `/import-examples/appartement-fictif.html`
- `/import-examples/maison-fictive.html`
  sur l’origine de l’aperçu comptes déjà existant, avec sa protection inchangée.
  Aucune nouvelle application publique ou ressource payante n’est nécessaire.

## Réglage Cloudflare des exemples

Lors de la publication privée autorisée, Cloudflare a renvoyé les URL `.html`
vers des URL sans extension (307). Le lecteur refuse intentionnellement les
redirections. `assets.html_handling: "none"` sur le seul Worker comptes conserve
donc les deux chemins exacts autorisés et évite ce changement automatique.
Le Worker privé résout explicitement `/` vers `/index.html`, en conservant la
query de retour Auth, car ce mode désactive aussi la résolution implicite de l’accueil.
Un test vérifie accueil, retour Auth et chemin d’exemple avec ce routage exact.
Aucun assouplissement des contrôles URL ni changement des autres Workers.

## Sources réelles : état exact

Aucun portail réel n’a été qualifié comme source autorisée. Le fondateur a confirmé
ne pas disposer encore d’une agence partenaire ; cela ne bloque pas les trois
parcours et les tests sur nos propres pages fictives.

La liste opérateur `LISTING_ALLOWED_HOSTS` reste vide par défaut. Ni le client ni
le corps de la requête ne peuvent accorder une autorisation. Une URL Leboncoin,
SeLoger, Bien’ici ou d’une agence sans autorisation configurée déclenche le repli,
sans prétendre avoir lu l’annonce.

Les CGU de Leboncoin et SeLoger consultées s’opposent à la collecte automatisée
sans autorisation. Bien’ici reste à qualifier pour une intégration partenaire.
Il n’y a ni proxy de contournement, ni CAPTCHA résolu, ni cookies de plateforme,
ni navigateur furtif, ni API privée découverte ou clé empruntée.

Sources examinées :

- https://www.leboncoin.fr/dc/cgu
- https://www.seloger.com/Conditions_Generales_d_Utilisation.html
- https://www.bienici.com/informations-legales

## Contrat partenaire et sécurité

`AuthorizedListingProvider` définit un connecteur serveur : identifiant, domaines
explicitement autorisés et lecture avec signal de délai. Il peut servir une API
ou un flux partenaire sans modifier la relecture ou le modèle de sauvegarde.
Aucun connecteur ni abonnement n’est activé. Les réponses passent par des schémas
stricts, bornés, sans champ `verified` ni contrôle de propriétaire. Les autorisations,
accès et conditions du fournisseur devront être vérifiés avant raccordement.

Le lecteur HTML refuse identifiants URL, IP, localhost, ports et suffixes internes,
et n’accède qu’aux domaines exacts configurés. HTTPS obligatoire hors assets
internes connus. Refus des redirections, limites de temps et de corps, aucune
transmission Cookie/Authorization. Robots : groupes applicables, règles les plus
spécifiques, wildcards et priorités Allow prises en compte ; refus avant HTML
si nécessaire. Les pages de protection ne sont pas interprétées comme annonces.
Le parseur HTML ne lance aucun script.

Enregistrement : agrégat `private_projects` et RPC propriétaire/version existants.
Aucun nouvel accès de base, aucune migration. Les six faits restent compatibles ;
DPE et charges sont des observations sourcées. `listingImport` conserve les preuves,
les références d’images, l’origine et le résultat de lecture. Données importées
bornées ; aucune conversion de charges vers la simulation sans connaître la période.
Les originaux des captures/PDF ne sont pas déposés automatiquement lors de l’import.

## Limites matérielles annoncées

Fichier de 10 Mio maximum, image 16 mégapixels maximum, PDF 50 pages maximum.
OCR de 10 pages scannées par fichier, rasterisation mobile bornée à 1600 pixels
sur le plus grand côté. Les autres pages sont indiquées à compléter, pas cachées.
Les chiffres OCR restent à contrôler. Les formats opaques, chiffrés ou illisibles
proposent une capture ou un fichier plus court. Pas de confiance calibrée inventée.

## Validation

- Tests unitaires extraction de champs, unités, prix/loyer/charges, contradictions,
  types JSON-LD sans rapport ignorés, HTML non exécuté et tailles bornées.
- API : authentification obligatoire, quotas par identité, aucun enregistrement
  pendant la lecture, source autorisée côté serveur uniquement et jeton utilisateur
  seul transmis à la RPC. Métadonnées de vérification forgées refusées.
- PostgreSQL réel embarqué : import avec preuves/DPE sauvegardé par Alice, invisible
  et non modifiable/supprimable par Bob. Les tests restent locaux.
- HTTP réel local : deux pages fictives servies par notre serveur et lues par le
  vrai lecteur, huit champs relevés sur chacune ; refus HTTP 403 volontaire testé.
  Ceci ne vaut pas un test d’un portail ou d’une agence réelle.
- Navigateur Chromium local à 320/390/430/1280px : relecture, correction, sauvegarde
  simulée d’API et reprise ; capture et PDF scanné lus par le vrai moteur OCR,
  sources fichier/page conservées. Aucune requête externe ni écriture distante.
- Les tests Safari iPhone et l’enregistrement réel de ces nouvelles métadonnées
  dans le compte attendent la recette personnelle sur l’aperçu désormais publié.

Commandes : `npm test`, `npm run build:accounts`,
`node scripts/check-listing-import.mjs` (après build comptes),
bundle puis exécution de `scripts/check-listing-network.ts` pour l’HTTP local.
La CI effectue les tests et builds sans publier.

## Proposition de recette iPhone

Dans l’aperçu privé publié : se connecter au compte existant, essayer les
exemples fictifs depuis « Ajouter un bien », vérifier prix/surface/DPE/charges,
corriger une valeur et enregistrer. Tester ensuite une URL de portail : repli
annoncé, capture ou PDF, remplissage automatique et relecture. Se déconnecter puis
se reconnecter et retrouver les sources/pages. Vérifier la mention fictive dans
le dossier/PDF d’exemple. Ne jamais utiliser ces données pour une décision réelle.
