# Correction gratuite de l’import URL — 17 novembre 2026

Branche dédiée : `fix/url-import-reliability`, issue de l’audit et de la PR 7.
Ce travail corrige le parcours existant. Aucun déploiement, fusion, modification
Supabase, activation de service, dépense ou changement de l’aperçu privé.
La liste de domaines autorisés reste inchangée ; aucune plateforme n’est ajoutée
sans qualification de ses droits d’accès.

## Corrections effectuées

### Le bien ciblé et ses sources

Le parseur indexe le graphe JSON-LD borné, résout les références `@id` et choisit
le bien lié à `WebPage.mainEntity`, à l’URL demandée ou à sa canonique de même
origine. Les paramètres de suivi connus sont ignorés pour cette comparaison,
mais les paramètres pouvant identifier le bien restent significatifs. Une seule
annonce enveloppant une `House` n’est plus comptée comme deux biens.

Plusieurs candidats non départageables produisent un résultat ambigu **sans
attribution de leurs valeurs**. Les recommandations ne complètent plus les champs
absents du bien choisi. Les définitions d’offres contradictoires sous un même
identifiant ne sont pas résolues arbitrairement selon leur ordre d’apparition.
Les cartes et rubriques de recommandations/financement sont écartées ; si du texte
provenant d’une autre fiche reste non segmenté, l’extraction DOM s’abstient.

Chaque proposition conserve URL source, méthode et extrait. L’identité déclarée
du bien est ajoutée dans les extraits JSON-LD lorsqu’elle existe. Après redirection,
les preuves désignent l’URL finale effectivement lue ; le lien saisi reste celui
du projet. Aucune proposition n’est marquée « vérifiée par document ».

### Les montants et les cinq champs demandés

- Vente/location distinguées par les indications explicites de la fiche, les
  fonctions de l’offre et les spécifications de période. `LeaseOut` alimente le
  loyer, jamais le prix d’achat. Transaction inconnue/incompatible : montant
  incertain, sans prix imposé ni import qualifié complet.
- Prix HAI/FAI distingué du net vendeur et des honoraires. Net/honoraires sont
  conservés comme **mentions sourcées dans les caractéristiques existantes**,
  pas comme prix alternatifs ou nouveaux champs financiers. Aucun total HAI
  n’est inventé par addition de montants dont le sens serait incertain.
- Formats français stricts (`245 000,00`, espaces insécables) normalisés. Les
  nombres corrompus ou formats ambigus restent ignorés.
- Repli HTML borné sur une fiche comportant un seul titre immobilier, avec prise
  en compte des tableaux et libellés sur deux lignes. Ville dans un libellé ou
  dans des formulations explicites telles que « village de Verlinghem ».
- Surfaces habitable, Carrez et au sol restent distinctes. Une `floorSize`
  générique identifiée explicitement comme surface au sol ne remplace pas une
  autre surface habitable. Aucun calcul pour reconstituer une surface absente.
- DPE lu depuis une valeur structurée explicite, du texte ou un libellé alternatif
  exact. Ni GES, ni bornes A/G, ni première lettre d’une échelle A–G ne deviennent
  une classe DPE. Aucune classe n’est déduite des seuls kWh.
- Le statut complet nécessite prix, ville, surface, pièces **et** DPE, sans
  variantes fiables non résolues. Des champs annexes ne compensent plus l’absence
  de prix ou de surface.

Les deux routes distantes `/api/import-listing` et `/api/extract` utilisent le
**même parseur**. L’ancienne route conserve son contrat à six champs et omet les
propositions incertaines, puisqu’elle ne sait pas les représenter. Le lecteur de
JSON collé manuellement, hors parcours URL, n’est pas présenté comme une lecture
HTTP réelle ni comme un nouvel accès à une plateforme.

### Redirections et robots.txt

- Au maximum trois sauts HTTPS, destination réautorisée à chaque saut ; refus
  d’un domaine non autorisé, identifiants URL, IP, localhost, ports non standard
  et retour vers HTTP. Pas de suivi automatique libre.
- Règles robots vérifiées avant chaque chemin de fiche, y compris après une
  redirection de même origine ou vers un autre domaine autorisé. Les redirections
  du fichier robots sont elles aussi bornées et autorisées.
- Groupes robots vides séparés correctement ; sélection du groupe d’agent le
  plus spécifique, priorité des règles, wildcards et fin de chaîne conservées.
  Comparaison UTF-8/octets échappés sans décoder les slashs réservés. Le glob ne
  repose plus sur une regex susceptible de retour arrière exponentiel.
- Refus de CAPTCHA, 403/429 et règles interdites maintenu. Pas de tentative
  alternative, de cookie transmis, de proxy rotatif ni de résolution de challenge.
- Délai réseau global de 15 secondes, robots 64 ko, HTML 1 Mo, graphe et arbre
  bornés. Codes distincts pour réseau, délai, boucle/limite de redirection,
  refus d’accès, 404 et structure non exploitable. Aucun détail sensible du fetch
  n’est renvoyé à l’utilisateur.

L’authentification, les quotas par utilisateur, la sauvegarde privée et les règles
RLS ne sont pas changés. Les deux exemples MIMMO restent explicitement fictifs ;
leur indication de vente est clarifiée pour le lecteur désormais plus strict.

## Résultats de vérification

- Suite complète : **275 tests**, dont **56 nouveaux**, tous réussis.
- TypeScript et compilations application normale, comptes et démonstration V1.
- Contrôle Worker en `--dry-run` uniquement : compilation, sans publication.
- Audit npm : aucune vulnérabilité signalée au moment du contrôle.
- Régression navigateur Chromium avec API simulée : OCR réel de captures
  synthétiques et PDF scanné, relecture/sauvegarde/reprise simulée, formats
  320/390/430/1280 px. Cela ne valide pas une agence réelle ou Safari iPhone.
- Les tests existants de confidentialité/PostgreSQL embarqué restent dans la
  suite ; aucune écriture n’a lieu dans le compte réel du fondateur.

| Nature du test                              | Ce qui est réellement validé                                                                                                 | Ce qui ne l’est pas                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| HTML/JSON-LD représentatifs et fetch simulé | Ciblage, références, transaction, montants, DPE, refus et limites                                                            | Réponse actuelle d’un portail                                                 |
| Vraies requêtes HTTP locales                | Réponse/streaming/redirection, règles robots et refus avant accès ; origine fictive routée vers notre propre serveur de test | HTTP/TLS externe d’une agence ou accès depuis Cloudflare                      |
| Deux courts extraits d’annonces réelles     | Prix, ville, surface, pièces, DPE retrouvés dans chacun, avec URL de provenance                                              | HTML original, DOM de la page, fraîcheur courante ou autorisation de collecte |
| URL réelle importée intégralement           | **Aucune validée dans cette correction**                                                                                     | Validation de bout en bout encore nécessaire                                  |

Les extraits factuels proviennent des pages examinées le 17 novembre :
[GNI575751](https://www.groupenationalimmobilier.fr/annonce/appartement-vente-2-pieces-caluire-et-cuire-44m2/GNI575751)
et [Verlinghem, fiche 288](https://www.verlinghem-immo.fr/annonce-immobiliere-vente-appartement-f2-verlinghem-235000%E2%82%AC-verlinghem-immobilier-agence-immobiliere-verlinghem-288).
La seconde peut être restituée depuis un cache. Les valeurs sont celles annoncées
par les sources, pas des informations immobilières certifiées.

## Limites restantes et conditions avant publication

1. L’environnement n’autorise toujours pas les requêtes HTTP directes vers les
   agences examinées. Le diagnostic a identifié un refus du proxy, pas un refus
   anti-bot démontré de ces agences. Aucun contournement n’est tenté.
2. Aucun domaine réel n’est ajouté à la configuration. Accès public et robots
   permissif ne suffisent pas à qualifier les droits d’intégration dans MIMMO.
3. Les sites exclusivement JavaScript, formats non reconnus, champs absents ou
   pages ambiguës peuvent produire un résultat partiel. Cette version préfère
   laisser un champ vide plutôt qu’attribuer une valeur d’un autre bien.
4. Des gabarits HTML ne permettent pas d’isoler la fiche de manière générique :
   leur compatibilité devra être testée sur leurs octets réels avant activation.
5. L’ancien résultat privé reste en place. Revue de PR puis validation explicite
   requises avant toute fusion ou publication.

Prochaine recette : qualifier quelques sources autorisées, obtenir leur accès
réseau de test, puis faire passer le même lecteur sur plusieurs vraies URL,
y compris DPE absent, location, redirection et refus. Une fiche fiable est
possible seulement pour les sources compatibles dont les données sont présentes.
Aucun achat, abonnement, IA ou budget supplémentaire n’est nécessaire pour
examiner cette PR. **0 € engagé ; plafond de 300 € non consommé par cette mission.**

## Commandes

`npm test`, `npm run typecheck`, `npm run build`, `npm run build:accounts`,
`npm run build:v1-demo`. Le test HTTP local est inclus dans `npm test`.
Après compilation comptes : `MIMMO_CHROMIUM=/usr/bin/chromium node scripts/check-listing-import.mjs`.

Le script historique `diagnose-url-import.ts` a été adapté pour comparer les cas
initialement reproduits au parseur courant ; il distingue toujours extraits et
HTTP réel. Les tests de non-régression sont les vérifications de référence.
