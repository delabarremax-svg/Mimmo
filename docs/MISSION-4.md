# Mission 4 — comptes et projets privés

## État et choix

Mission construite sur la PR 3, sans fusion et sans modification des Workers de démonstration existants. Le build standard reste un aperçu en mémoire. `npm run build:accounts` active l’espace avec comptes ; seul `deploy/wrangler-accounts.json` doit servir ce build. Aucun déploiement effectué pendant le développement.

React existant → API Worker même origine → Supabase Auth et PostgREST → PostgreSQL/RLS. Email + mot de passe (12 caractères minimum), confirmation email, validation de l’utilisateur par le service Auth, renouvellement par SDK officiel. Ce premier parcours remplace la proposition de lien magique PKCE : aucune session transmise au JavaScript, pas de protocole OAuth maison. La confirmation email utilise un token de confirmation, pas un access token.

Cookie `__Host-mimmo`, AES-GCM avec IV aléatoire, HttpOnly/Secure/SameSite=Lax, échéance absolue 30 jours. La clé de chiffrement doit être aléatoire et conservée côté Worker. Son remplacement déconnecte tous les comptes. Les access tokens expirent selon Supabase ; déconnexion révoque les refresh tokens et retire le cookie. Un access token volé reste potentiellement valide jusqu’à sa courte expiration : régler celle-ci à 15 minutes. Aucune clé service-role nécessaire. Contrôle Origin et JSON pour les écritures, limite native Cloudflare de 10 tentatives de connexion par minute/IP, erreurs sans données ni mots de passe journalisés.

`private_projects` contient un agrégat JSON par bien, propriétaire imposé par `auth.uid()`, RLS pour lecture/suppression, écritures exclusivement par fonction SQL transactionnelle contrôlant propriétaire et version. Une version périmée renvoie un conflit explicite ; aucun écrasement silencieux. Le SQL de mission 1 n’est pas requis : appliquer uniquement `002_private_projects.sql` dans un nouveau projet dédié. Futurs documents : conserver métadonnées séparées, bucket privé et contrôle propriétaire ; futures extractions/analyses : jobs serveur avec résultats sourcés, jamais une clé IA navigateur. Aucun module métier avancé implémenté.

## Activation — une seule fois, avant le test iPhone

L’environnement fourni ne contient pas de projet ni d’identifiants Supabase. Cette étape fournisseur reste nécessaire ; les tests locaux ne constituent pas une activation. Ne pas envoyer de secrets dans le chat.

1. Créer ou sélectionner un projet **Supabase Free dédié**, en région européenne. Ne choisir aucune option payante. Valider les conditions de traitement des données. Conserver le mot de passe de base dans un gestionnaire de mots de passe.
2. Dans SQL Editor, exécuter `database/002_private_projects.sql`. Dans Authentication, activer email/password et **Confirm email** ; mettre l’expiration JWT à 900 secondes. Pour le pilote, l’envoi email Supabase possède des restrictions de destinataires et quotas : vérifier celles de l’offre ; un SMTP adapté sera nécessaire avant une ouverture générale. Ne pas souscrire de service pour contourner un quota.
3. Choisir l’URL dédiée du Worker `mimmo-comptes-preview` dans le sous-domaine Cloudflare existant. Dans Supabase, définir cette URL comme Site URL et ajouter `https://<hôte>/api/confirm` aux Redirect URLs. Dans le modèle **Confirm signup**, utiliser le lien : `{{ .SiteURL }}/api/confirm?token_hash={{ .TokenHash }}`. Cela évite tout jeton de session dans l’URL du navigateur. Après confirmation, se connecter avec le mot de passe.
4. Dans GitHub → Settings → Secrets and variables → Actions, ajouter `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (clé publique publishable, **jamais service_role**), `MIMMO_SESSION_KEY` (32 octets aléatoires minimum, générés par un gestionnaire de mots de passe). Réutiliser les secrets Cloudflare déjà configurés. Ces valeurs sont injectées exclusivement dans le Worker. Le build client n’en reçoit aucune.
5. Après validation du fournisseur et de cette PR, lancer manuellement le workflow **Aperçu comptes MIMMO (manuel)** sur `feat/private-accounts`. Il crée uniquement `mimmo-comptes-preview`, vérifie le refus anonyme et fournit son vrai lien HTTPS. Aucun lancement automatique, aucune fusion, aucune modification de plan. GitHub peut ne proposer le workflow manuel qu’après présence du fichier sur la branche par défaut ; dans ce cas un mainteneur exécute `npm ci`, `npm run build:accounts`, puis `node scripts/deploy-accounts.mjs` depuis la branche avec les mêmes variables serveur, sans les afficher. Ne pas fusionner simplement pour rendre le bouton visible.

## Test depuis Safari iPhone

1. Ouvrir le lien HTTPS fourni par l’exécution réussie. Choisir **Créer un compte**, saisir email et mot de passe, confirmer l’email, puis se connecter.
2. Ajouter l’URL d’une annonce. Compléter une étape avec la provenance. Attendre **Modifications enregistrées sur votre compte**.
3. Fermer Safari, le rouvrir, retourner au même lien : vérifier le bien dans **Mes biens** et ses informations. Refaire la connexion si Safari a supprimé ses cookies. Tester également sur un autre appareil.
4. Modifier le même bien depuis deux appareils : la seconde sauvegarde fondée sur une ancienne version doit annoncer un conflit. Copier le brouillon avant de recharger.
5. Couper le réseau pendant une sauvegarde : message d’échec, brouillon encore visible, aucune fausse confirmation. Rétablir le réseau et réessayer.
6. Se déconnecter, créer un deuxième compte : les biens du premier doivent être absents. Revenir au premier et supprimer un bien via la confirmation explicite ; recharger pour vérifier sa disparition.
7. Vérifier clavier, zoom, VoiceOver et retour de confirmation email sur Safari iOS réel. Ces contrôles ne sont pas remplacés par les tests automatisés.

## Limites à connaître

Les **photos restent locales et temporaires**, clairement annoncées. Liens, faits, sources et statuts sont persistants ; aucune annonce n’est téléchargée ni analysée automatiquement. Aucune donnée de démonstration n’est transférée vers un compte. Les brouillons non enregistrés ne survivent pas à une fermeture forcée ; Safari peut ne pas afficher beforeunload. Mot de passe oublié, export et suppression autonome du compte restent à ajouter avant ouverture générale ; pour le pilote, suppression par l’administrateur Supabase (cascade des projets), sur demande vérifiée.

Sauvegarde applicative persistante ne signifie pas sauvegarde de secours garantie. Vérifier la rétention réelle du plan choisi, mettre en place des exports chiffrés et tester une restauration avant de confier des données importantes. Aucun engagement de sauvegardes automatiques Supabase Free ni de disponibilité illimitée. Définir les mentions RGPD, rétention et support avant ouverture à des utilisateurs externes.

## Vérification développeur

`npm test` exécute notamment de vraies règles PostgreSQL dans PGlite, avec rôles authentifié/anonyme et deux identités ; tests SDK simulés pour cookies/refresh/révocation et parcours React simulant API, reprise, suppression et déconnexion. PGlite n’est pas un Supabase distant : refaire les parcours d’isolation contre l’instance réelle avant ouverture du pilote. `npm run build` vérifie le mode démo ; `npm run build:accounts` vérifie le mode comptes ; packaging `wrangler deploy --config deploy/wrangler-accounts.json --dry-run` sans publication.
