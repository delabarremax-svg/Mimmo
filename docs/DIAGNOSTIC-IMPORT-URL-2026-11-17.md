# Diagnostic de l’import URL — 17 novembre 2026

## Périmètre et résultat

Dépôt `delabarremax-svg/Mimmo`, PR 7 ouverte et non fusionnée, code examiné
`8c0b222eaaed62e5535c5943e3d91b5db46f9095`. Branche indépendante :
`audit/url-import-20261117`, basée sur ce code existant. Aucun nouveau produit,
aucune modification du lecteur ou de l’application, de l’aperçu privé, de Supabase
ou d’une démonstration. Aucun déploiement, aucune fusion, aucune dépense.
Budget plafond déclaré par le fondateur : 300 €, sans autorisation de dépense.

Les **219 tests existants passent**. Ils ne prouvent pas le fonctionnement sur
les portails réels. Une sonde supplémentaire reproduit 11 limites ou défauts avec
des réponses contrôlées, séparément des consultations de pages réelles. Elle ne
corrige pas encore le comportement : ce rapport constitue le diagnostic initial.

## Chaîne réellement utilisée

`ListingImport` → POST authentifié `/api/import-listing` → liste de domaines
opérateur → robots.txt → téléchargement HTML → JSON-LD/métadonnées/texte principal
→ propositions sourcées → relecture → sauvegarde privée existante.

Il n’y a pas de service payant de lecture distant raccordé. Le téléchargement se
fait dans le Worker Cloudflare. Le contrat `AuthorizedListingProvider` existe,
mais la route ne passe aucun fournisseur. L’ancien `/api/extract` utilise encore
un autre parseur JSON-LD, moins strict. La démonstration non connectée ne réalise
pas la même lecture distante que l’espace comptes.

`LISTING_ALLOWED_HOSTS` est **vide dans la configuration versionnée** et la route
utilise une liste vide en son absence. Une URL externe non autorisée produit
`authorization_required`, `attempted:false`, **zéro requête**. Les variables
Cloudflare distantes n’ont pas été consultées dans cet audit : il ne faut pas
confondre configuration du dépôt et état distant vérifié au 17 novembre.
Les deux pages fictives MIMMO constituent une exception interne explicite,
insuffisante pour qualifier un portail immobilier.

## Causes identifiées et corrections gratuites possibles

| Cause                               | Preuve / effet                                                                                   | Correction limitée à l’existant                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Absence de source réelle configurée | Refus avant réseau, sans blocage démontré de la plateforme                                       | Définir une petite liste de sources effectivement autorisées, pas une ouverture générale                                                               |
| Toutes les redirections refusées    | Canonicalisation HTTPS/www/URL finale confondue avec erreur réseau                               | Quelques sauts manuels bornés, validation HTTPS/domaine à chaque étape, règles robots sur la cible ; aucune redirection libre                          |
| Mauvais découpage de groupes robots | Groupe Mimmo avec `Disallow:` vide fusionné avec le groupe suivant `*` interdit                  | Corriger les frontières et tester règles vides, groupes et priorités ; ne pas ignorer robots                                                           |
| Objets de biens mélangés            | Une surface de 99 m² d’un bien recommandé apparaît sous l’URL du bien principal                  | Choisir le bien ciblé via URL canonique/`mainEntity`/identifiant ; exclure recommandations et simulateurs ; s’abstenir si ambigu                       |
| Offre locative traitée comme vente  | `Apartment` + offre `LeaseOut` à 900 EUR devient `price:900`                                     | Vérifier le type de transaction avant de renseigner le prix d’achat                                                                                    |
| Formats structurés trop étroits     | Prix `245 000,00` ignoré ; offre liée par `@id` non résolue                                      | Normalisation française stricte et résolution bornée du graphe JSON-LD ; pas de conversion ambiguë                                                     |
| Structure HTML trop restrictive     | Fiche en `<div>` sans `<main>/<article>` : aucun champ textuel ; DPE explicite dans `alt` ignoré | Repli borné sur le conteneur de fiche et attributs textuels explicitement porteurs de la classe ; aucune lecture d’une lettre dans une échelle entière |
| Faux « plusieurs biens »            | Un `RealEstateListing` contenant une seule `House` compte double                                 | Dédupliquer enveloppe et bien réel                                                                                                                     |
| Deux parseurs divergents            | L’ancien parseur accepte le prix d’un `Product` publicitaire                                     | Réutiliser le parseur strict commun, préserver les contrats des deux routes                                                                            |
| Critère de réussite insuffisant     | Sept champs annexes suffisent à `extracted` même sans prix, ville ni surface                     | Évaluer les cinq champs demandés, leur sens et leur certitude ; garder `partial` si un champ manque                                                    |
| Diagnostic d’échec peu précis       | Délai, DNS, redirection et autres exceptions regroupés ; 8 s par requête et 1 Mo de HTML         | Codes distincts, bornes conservées, message correspondant à l’étape réelle ; pas de logs contenant les données privées                                 |

La détection de protection par simple présence de `challenge-platform` mérite
également un contrôle de faux positifs ; elle n’est pas qualifiée ici sur un
site réel. Les pages rendues uniquement par JavaScript ne sont pas exécutées.
Un navigateur automatisé ne doit pas devenir un moyen de contourner un refus.

## Restrictions de plateformes : distinctes des bugs

Conditions consultées le 17 novembre 2026 :

- [Leboncoin, section 10.2](https://www.leboncoin.fr/dc/cgu) : restrictions sur
  l’extraction et les robots, exception d’autorisation expresse préalable.
- [SeLoger, section 9](https://www.seloger.com/Conditions_Generales_d_Utilisation.html) :
  opposition explicite à la fouille et à l’extraction automatisée.
- [Bien’ici, conditions d’utilisation](https://www.bienici.com/informations-legales) :
  restriction des systèmes automatisés à des fins commerciales non autorisées.

Une page publique, un HTTP 200 ou un robots.txt permissif ne constituent pas à
eux seuls une autorisation d’intégration dans MIMMO. CAPTCHA, authentification,
refus robots et restrictions contractuelles restent des limites de compatibilité.
Ni proxy rotatif, ni contournement de challenge, ni cookie emprunté ne sont proposés.

## Vérifications sur deux annonces réelles

Consultation de recherche au 17 novembre 2026. Il s’agit de valeurs annoncées par
les pages, pas d’une certification du bien ou du DPE. La page Verlinghem peut être
restituée depuis un cache ; son prix actuel n’est pas confirmé par une requête
HTTP directe. Les nombres contenus dans les URL ne servent jamais de référence.

| Page                                                                                                                                                                                |  Prix affiché | Ville            |           Surface annoncée | Pièces | DPE |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | ---------------- | -------------------------: | -----: | --- |
| [GNI575751](https://www.groupenationalimmobilier.fr/annonce/appartement-vente-2-pieces-caluire-et-cuire-44m2/GNI575751)                                                             |     185 000 € | Caluire-et-Cuire | 43,57 m² habitables/Carrez |      2 | C   |
| [Verlinghem, fiche 288](https://www.verlinghem-immo.fr/annonce-immobiliere-vente-appartement-f2-verlinghem-235000%E2%82%AC-verlinghem-immobilier-agence-immobiliere-verlinghem-288) | 220 000 € HAI | Verlinghem       |           50 m² habitables |      2 | C   |

Les courts extraits factuels de ces pages sont passés au parseur textuel existant :
**5/5 champs retrouvés** pour le premier ; **3/5** pour le second, qui manque le
prix et la ville. Ce second exemple comporte aussi un prix hors frais d’agence
à 214 000 € : il ne doit pas remplacer le prix HAI. La première page mélange
une surface arrondie de 44 m² dans le titre, des pièces individuelles, des coûts
d’énergie, une simulation bancaire et des biens recommandés : le périmètre de
la fiche est essentiel avant toute extraction.

**Limite importante : ces résultats ne sont pas des imports HTTP complets.**
L’outil de recherche a restitué le contenu public ; le HTML original n’a pas été
récupéré par le lecteur MIMMO. Le contrôle direct de robots.txt a échoué avec
`CONNECT tunnel failed, response 403`, code HTTP final `000` : refus du proxy
réseau de l’environnement, **pas une réponse 403 démontrée du site immobilier**.
Aucun autre chemin réseau n’a été utilisé pour contourner ce refus. Un troisième
site, Imogroup, n’a pas été accessible via l’outil de recherche ; sa cause reste
inconnue, sans diagnostic abusif d’anti-bot.

L’autorisation d’automatisation de ces deux agences n’est pas qualifiée. Aucune
URL réelle ne peut donc être annoncée comme validée de bout en bout dans MIMMO.
Il reste à obtenir un chemin de test réseau autorisé et à qualifier la source,
puis à tester les octets HTML réels avec le Worker. Cela ne nécessite pas de
modifier l’aperçu privé ou d’accéder au compte personnel du fondateur.

## Coûts et options

| Option                                           | Coût connu                                                                            | Limites et décision                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corriger lecteur et parseur existants            | Aucun nouveau service payant                                                          | Priorité ; cela ne donne aucun droit supplémentaire sur les portails                                                                                                  |
| HTML/flux d’une agence qui l’autorise            | Peut être gratuit ; à convenir avec la source                                         | Fiabilité élevée sur un périmètre réduit ; disponibilité et conditions à vérifier                                                                                     |
| API Stream Estate à l’usage                      | Tarif public annoncé 0,01 €/item ; 1000 items = 10 €, 10 000 = 100 € arithmétiquement | Vérifier définition d’item, facturation de la recherche par URL, taxes, fraîcheur, champs réellement disponibles et droits de restitution ; aucun compte/essai activé |
| Abonnement Stream Estate Starter                 | 99 €/mois, 15 000 items inclus, dépassement annoncé 0,003 €/item                      | 297 € pour trois mois au tarif affiché avant taxes/dépassements : ne convient pas comme engagement durable avec un budget total de 300 €                              |
| Accord direct avec un portail / autre API métier | Sur devis, non chiffrable ici                                                         | Aucune garantie de compatibilité ou d’accès universel sans contrat                                                                                                    |

Sources primaires : [tarifs](https://stream.estate/pricing),
[présentation des champs de l’API](https://stream.estate/real-estate-data-api),
[documentation de recherche par URL](https://next.docs.stream.estate/api-reference/property/lookupPropertyByUrl),
[conditions](https://stream.estate/terms). Le fournisseur annonce un accès par URL
et des données structurées ; aucun appel authentifié n’a confirmé cette couverture
pour nos exemples. **Payer un agrégateur ne prouve pas les droits d’utilisation
nécessaires à MIMMO** : le contrat doit les préciser. Une IA seule ne récupère pas
une page inaccessible et peut ajouter du risque ; elle n’est pas nécessaire à la
première correction et aucune activation IA n’est proposée pour cet audit.

Budget : 0 € engagé pendant l’audit. Aucun abonnement ne doit être pris sur la
seule base de ce tableau. Le plafond de 300 € est une contrainte totale, pas une
autorisation de dépense ni un budget mensuel.

## Plan de correction priorisé

1. **P0 — empêcher les mauvaises attributions** : rattacher les champs au seul bien
   ciblé, distinguer vente/location et HAI/net vendeur, ne jamais compléter un champ
   à partir des recommandations. Source, extrait, méthode et identité du bien pour
   chaque valeur ; ambiguïté ou absence = champ non renseigné.
2. **P1 — fiabiliser la lecture autorisée** : réparer robots, gérer les seules
   redirections sûres, séparer les causes d’échec. Conserver authentification,
   quotas, délais, limites et refus des domaines non autorisés.
3. **P1 — unifier et compléter le parseur** : JSON-LD lié, formats français,
   conteneur de fiche, libellés/attributs DPE explicites et même logique aux deux
   points d’entrée existants. Aucune nouvelle fonctionnalité ou refonte visuelle.
4. **P2 — recette réelle bloquante** : qualifier une petite liste de sources,
   permettre leur accès depuis l’environnement de test et vérifier prix, ville,
   surface, pièces et DPE sur plusieurs vraies URL. Tester aussi redirection,
   location, DPE absent, recommandations et refus explicite. Aucun faux succès.
5. **P3 — intégration préparée** : tests de régression et contrôles de sauvegarde
   avec données de test isolées ; présenter la correction pour validation avant
   toute publication. Envisager une API à l’usage seulement si le périmètre gratuit
   ne suffit pas et après accord explicite sur le fournisseur et un plafond ferme.

Le lecteur générique ne doit pas promettre toutes les URL : la promesse réaliste
est une **fiche sourcée sans ressaisie pour les sources compatibles qualifiées**,
avec résultat partiel explicite dès qu’un champ n’est pas réellement disponible.

## Reproduire cet audit sans accès à une plateforme

`npm ci`, puis `npm test` pour les 219 tests existants.

Bundler `scripts/diagnose-url-import.ts` avec esbuild (platform=node, format=esm),
puis exécuter le fichier produit dans `work`. La sonde ne fait aucun appel HTTP
réel et écrit `work/url-import-diagnostic.json`. Les cas artificiels de reproduction
et les deux courts extraits factuels réels y sont identifiés séparément. Une issue
reproduite n’est pas un test de correction réussi.
