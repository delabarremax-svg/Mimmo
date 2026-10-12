# Prévisualisation et déploiement

La mission 2 fournit une voie concrète : [démonstration Cloudflare HTTPS privée, depuis Safari iPhone](DEMO-IPHONE.md). Configuration dans `deploy/wrangler.json`, protection serveur dans `deploy/worker.ts`, lancement manuel dans `.github/workflows/private-demo.yml`. Aucun déploiement automatique au push et aucune publication anonyme. Les instructions ci-dessous décrivent aussi la prévisualisation locale initiale.

## Première prévisualisation depuis un iPhone

Le parcours peut être servi localement avec `npm run dev` (port 5173) et accessible via l’adresse LAN d’un ordinateur sur le même Wi-Fi. Depuis un iPhone seul : préparer une instance de prévisualisation HTTPS privée avec un hébergeur choisi par le fondateur ; envoyer ensuite le lien réel. Ne pas présenter une URL GitHub ni localhost comme lien vers l’application.

Aucune instance d’hébergement, aucun abonnement ni déploiement n’est créé par le code du projet. La CI utilise uniquement les vérifications ; son déclenchement consomme éventuellement le quota GitHub déjà existant, sans créer un produit payant.

## Artefact

`npm ci` puis `npm run build`. Répertoire publié : `dist/`. L’application utilise un seul chemin et une navigation en mémoire ; aucune règle de réécriture n’est nécessaire. Les routes et biens ne survivent pas au rechargement. Pas de pré-rendu SEO ni de compte SaaS à ce stade.

Configurer sur l’hébergeur :

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

HSTS après configuration correcte du domaine et HTTPS. Cache long uniquement sur assets fingerprintés ; pas sur index.html. Les en-têtes sont une instruction, pas une protection appliquée par Vite. Le serveur de développement peut nécessiter une CSP différente pour son websocket : ne pas le publier comme serveur production.

Aucune variable d’environnement nécessaire actuellement. Toute variable `VITE_*` est publique dans le bundle ; n’y mettre aucune clé secrète. Les futurs secrets seront gérés par le backend et le gestionnaire de secrets de l’hébergeur.

## Validation avant mise en service

Vérifier à 390 px et 320 px : navigation, saisie URL, fiche manquante, source, sauvegarde temporaire, retour liste, rafraîchissement. Tester Safari iOS et clavier virtuel. Les tests DOM automatisés ne remplacent pas cette validation navigateur. Tester ensuite les règles RLS en base, la vérification JWT, l’accès aux objets et l’isolation des utilisateurs avant d’activer des données privées.

## Retour arrière

Revenir au précédent artefact statique. Aucun changement en base n’est actuellement exécuté. Les migrations futures doivent être validées sur une base de test avec sauvegarde préalable.
