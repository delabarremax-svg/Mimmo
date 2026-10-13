# MIMMO

« Tu as trouvé un bien ? Découvre ce que l’annonce ne te dit pas. »

## Mission 1

Accueil, Mes biens, saisie d’une URL, fiche éditable avec provenance par information. React, TypeScript, Vite. Aucun bien fictif préchargé. Extraction automatique indisponible : saisie manuelle explicitement proposée.

**Aperçu en mémoire uniquement** : pas de compte, pas de sauvegarde privée ; recharger efface les saisies. Aucun document à téléverser, aucune IA ni simulation financière active.

## Démonstration privée depuis un iPhone

La mission 2 prépare un déploiement HTTPS Cloudflare Workers Free, protégé côté serveur par mot de passe. Aucun hébergement n’est activé automatiquement. [Guide sans terminal pour iPhone](docs/DEMO-IPHONE.md) : compte gratuit, trois secrets GitHub, puis bouton manuel dans Actions. L’accès privé ne remplace pas les futurs comptes SaaS. Les saisies disparaissent au rechargement.

## Parcours guidé et proposition de comptes privés

[Présentation de l’aperçu UX](docs/UX-PREVIEW.md) : photos locales temporaires, tableau de bord fondé sur les saisies, étapes guidées, brouillons, recherche et filtres. Aucun résultat d’analyse ni pourcentage fictif. [Prochaine étape : comptes et sauvegarde privée](docs/NEXT-AUTH-PRIVATE-PROJECTS.md). Le Worker d’aperçu UX est distinct de la démonstration initiale ; la PR reste à valider avant fusion.

## Démarrer

Node.js 22.12+ ou 24 LTS et npm.

```sh
npm ci
npm run dev
```

Ouvrir http://localhost:5173. Sur iPhone, un ordinateur et l’iPhone connectés au même Wi-Fi permettent d’ouvrir `http://ADRESSE_LOCALE_DE_L_ORDINATEUR:5173`. Un lien localhost ne fonctionne pas depuis un autre appareil. Autoriser le port seulement sur le réseau local de confiance. Cette instruction n’ouvre ni ne publie automatiquement l’application.

Depuis un environnement cloud, il faut une prévisualisation privée HTTPS accessible au fondateur : aucun lien d’hébergement n’est créé automatiquement. Le fondateur peut demander son activation depuis ce chat ; le développeur doit vérifier l’accès privé et les éventuels coûts avant de lancer le service. Le dépôt GitHub permet déjà de consulter le code et les instructions depuis l’iPhone, mais n’est pas l’application.

## Vérification

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

La dernière commande sert la compilation sur le port 4173. Les tests couvrent le parcours interactif et la validation des données/provenances. La compilation ne prouve pas la sécurité du futur backend. Voir [l’architecture](docs/ARCHITECTURE.md).

## Déployer ultérieurement

1. Choisir avec le fondateur un hébergement et son budget ; aucune dépense automatique.
2. Pour cet aperçu : `npm ci && npm run build`, publier uniquement `dist/` sur un hébergement statique **privé**, avec authentification d’accès fournie par l’hébergeur. Ce contrôle d’accès ne constitue pas l’authentification SaaS MIMMO.
3. Configurer HTTPS et les en-têtes recommandés dans [DEPLOYMENT.md](docs/DEPLOYMENT.md), sans injection de secrets dans le bundle.
4. Pour les données persistantes : terminer et tester le backend décrit dans ARCHITECTURE.md avant utilisation réelle.
5. Toute publication publique demande l’accord du fondateur. Aucun déploiement effectué par cette mission.
