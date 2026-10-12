# MIMMO — obtenir la démonstration privée depuis un iPhone

## Ce qui est prêt

Le code de main a été vérifié au commit `63d2d75` (fusion de la mission 1). La mission 2 ajoute un déploiement manuel Cloudflare Workers, une protection **serveur** par identifiant/mot de passe et une amélioration des champs pour Safari iOS. Aucun compte Cloudflare, aucun site public et aucun abonnement n’ont été créés.

Sites a été examiné : accès ChatGPT privé possible sur cette plateforme, mais les scripts de publication requis ne sont pas installés dans cet environnement. Aucun site Sites n’a été créé. GitHub Pages seul ne fournit pas la protection souhaitée pour ce dépôt public. Cloudflare Workers Free est la voie préparée, indépendante de Sites.

## Les seules manipulations à faire dans Safari

### 1. Mettre la configuration sur main

Ouvrir la PR « Mission 2 : démonstration HTTPS privée » du dépôt [MIMMO](https://github.com/delabarremax-svg/Mimmo/pulls). Choisir **Merge pull request**, puis **Confirm merge**. Cette action ne déploie rien : le workflow n’est déclenché que manuellement.

### 2. Créer le compte gratuit Cloudflare

Ouvrir [le tableau de bord Cloudflare](https://dash.cloudflare.com/sign-up), créer le compte et vérifier l’email. Utiliser **Workers Free**, sans souscrire Workers Paid, sans acheter de domaine et sans ajouter de service payant. Aucun domaine personnel n’est nécessaire : Cloudflare fournit une adresse `workers.dev` avec HTTPS.

Dans **Workers & Pages**, configurer le sous-domaine gratuit `workers.dev` si l’onboarding le demande. Ne pas créer un exemple Hello World public. Si le sous-domaine n’est pas proposé, ouvrir les paramètres du compte Workers et rechercher `workers.dev` ; les intitulés du tableau de bord peuvent évoluer.

Copier **Account ID / ID de compte** depuis le compte ou la page Workers & Pages. C’est un identifiant de 32 caractères ; ce n’est pas une clé secrète.

### 3. Créer une autorisation limitée

Ouvrir [API Tokens](https://dash.cloudflare.com/profile/api-tokens), **Create Token** → **Create Custom Token**.

- Nom : `MIMMO demonstration`.
- Permissions de compte : **Workers Scripts — Edit** et **Account Settings — Read** (ou l’équivalent Workers Editor si le tableau de bord utilise les nouveaux intitulés).
- Account Resources : **Include → Specific account → ton compte de démonstration uniquement**.
- Aucune permission Zone, DNS, facturation, R2, base de données ou IA nécessaire.
- Préférer un compte Cloudflare dédié à cette démonstration si tu héberges d’autres Workers ; l’autorisation peut porter sur les Workers du compte.
- Ne pas restreindre par IP : l’adresse du runner GitHub varie.

Créer puis copier le token. Il sera affiché une seule fois. **Ne le colle pas dans le chat, une issue, un commentaire ou un fichier du dépôt.**

### 4. Enregistrer trois secrets dans GitHub

Ouvrir [les secrets Actions du dépôt](https://github.com/delabarremax-svg/Mimmo/settings/secrets/actions) → **New repository secret**, trois fois :

| Name                    | Secret à coller                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | L’ID de compte copié à l’étape 2                                                |
| `CLOUDFLARE_API_TOKEN`  | Le token de l’étape 3                                                           |
| `DEMO_PASSWORD`         | Un nouveau mot de passe aléatoire de 20 à 256 caractères, sans espace ni accent |

Utiliser un mot de passe généré dans l’app Mots de passe de l’iPhone ; ne pas réutiliser celui de GitHub, Cloudflare ou de ta messagerie. Conserver ce mot de passe dans ton gestionnaire. L’identifiant de la démonstration sera **mimmo**. Les clés de déploiement restent dans GitHub Secrets et le mot de passe est transféré dans un secret serveur Cloudflare ; rien n’est inséré dans le JavaScript livré à Safari.

### 5. Lancer le bouton de démonstration

Ouvrir [GitHub Actions](https://github.com/delabarremax-svg/Mimmo/actions) → **Démonstration privée MIMMO** → **Run workflow**.

Sélectionner **main**, cocher **Mon compte Cloudflare est en Workers Free, sans option payante**, puis **Run workflow**. Ne cocher que si ce point a réellement été vérifié dans Cloudflare. Aucun passage au plan payant n’est exécuté par le workflow.

Après réussite (coche verte), ouvrir l’exécution et son **Summary / Résumé**. Le lien **Ouvrir MIMMO dans Safari** contient l’adresse HTTPS réelle. Safari demande l’identifiant **mimmo** et le mot de passe de `DEMO_PASSWORD`. Si les contrôles d’accès ne réussissent pas, le workflow ne présente pas le lien comme validé.

Sur un petit écran, utiliser au besoin **aA → Version pour ordinateur** pour les pages GitHub ou Cloudflare. Cela n’installe aucun logiciel et ne demande aucun terminal.

## Test à faire sur l’iPhone

1. Ouvrir la démonstration, entrer les identifiants.
2. Ajouter l’URL d’une annonce. Aucune extraction n’est faite : une fiche vide est créée.
3. Renseigner un champ, sa provenance et sa source ; enregistrer et revenir à Mes biens.
4. Recharger Safari : les biens disparaissent. Le bandeau explique cette limite à tout moment.
5. Ouvrir le lien dans une nouvelle session privée sans identifiants : l’application doit demander l’accès. Safari peut retenir les identifiants pendant une session ; il n’y a pas de bouton de déconnexion Basic Auth. Fermer toutes les fenêtres privées pour terminer cette session.

## Protection et limites

La porte d’accès Basic Auth est réelle et exécutée dans le Worker avant **tous** les fichiers grâce à `assets.run_worker_first: true`. Sans mot de passe valide : 401. Secret absent ou trop court : 503. Cela protège une démonstration partagée, pas des comptes utilisateurs SaaS ; toute personne ayant le mot de passe a accès. Aucune fenêtre d’accès anonyme n’est créée pendant le premier déploiement : sans secret, le Worker refuse les fichiers. Les URL de versions de prévisualisation sont désactivées.

Le navigateur ne transmet ni bien ni document au serveur. Pas d’IA, de cookies applicatifs, d’analytics, de localStorage, de sessionStorage, de persistance ou de clé API dans le bundle. Les fichiers de démonstration ne contiennent aucun bien réel. Cloudflare reçoit les requêtes et les identifiants de protection sous HTTPS, et peut conserver des métadonnées de fonctionnement conformément à ses conditions ; cela ne constitue pas une sauvegarde immobilière. La journalisation Worker est désactivée. Cache navigateur interdit, indexation interdite et politique CSP limitant les connexions appliqués côté serveur.

Les tests locaux ne prouvent pas un déploiement réel. Le workflow, après publication privée, vérifie le refus anonyme de l’HTML et des fichiers JS/CSS puis leur disponibilité avec les identifiants. Un essai Safari réel reste nécessaire.

## Coût et arrêt

[Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) : quota de 100 000 requêtes Worker par jour ; chaque fichier et tentative d’accès compte puisque l’authentification s’exécute avant les assets. Au dépassement du quota gratuit, la démonstration peut devenir indisponible. Le workflow n’active aucun abonnement payant. GitHub Actions reste dans les conditions de ton compte et du dépôt public ; aucune option de facturation n’est modifiée.

Pour arrêter : Cloudflare → Workers & Pages → `mimmo-demo-privee` → supprimer le Worker. Pour changer le mot de passe : modifier `DEMO_PASSWORD` dans GitHub puis relancer le workflow. Pour révoquer le déploiement : supprimer le token dans Cloudflare et le secret correspondant dans GitHub ; cela ne supprime pas un Worker déjà en ligne.

## Si le bouton échoue

- Vérifier que la PR est fusionnée et la branche main sélectionnée.
- Vérifier les trois noms de secrets exactement, l’ID de 32 caractères, les permissions et l’expiration du token.
- Vérifier qu’un sous-domaine `workers.dev` est configuré dans le compte Cloudflare et que l’email est confirmé.
- Échec de contrôle après déploiement : ne pas supprimer la protection ; consulter l’état du Worker et relancer après correction.
- Copier dans ce chat seulement le nom de l’étape en échec et le message d’erreur sans aucune clé ni mot de passe.

## Vérifications effectuées pendant la mission

31 tests unitaires et d’interface réussis, TypeScript et build de production réussis, packaging Wrangler en mode `--dry-run` réussi (aucun upload), parcours Chromium tactile à 320/390/430 px sans débordement ni erreur JavaScript, champs à 16 px, disparition des saisies au rechargement. Le runtime Cloudflare local HTTPS a également été vérifié : HTML, JS et CSS renvoient 401 sans identifiants et 200 après authentification ; le parcours mobile passe aussi derrière cette protection et sa CSP. Un certificat de développement local a été utilisé uniquement pour ces essais, sans modifier la vérification TLS du futur lien Cloudflare. Le code de protection a 15 tests couvrant HTML/assets, identifiants erronés, secret absent, méthodes interdites et en-têtes de sécurité. Safari iOS et déploiement distant non encore validés.
