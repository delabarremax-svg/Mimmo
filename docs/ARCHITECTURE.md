# Architecture MIMMO — mission 1

## Livré et limites

React + TypeScript + Vite : interface responsive compilée en fichiers statiques. Zod valide les URL. Les règles de provenance sont des fonctions de domaine testées, séparées de l’interface. Aucun fetch d’annonce, aucun appel IA, aucune clé, aucune authentification ni persistance. Les données restent uniquement dans l’état React : rafraîchir ou fermer l’application les efface. Cette version sert à valider le parcours, pas à conserver de vraies données privées.

Les seules illustrations représentent un dossier vide. Pas de faux bien, prix, DPE, score, rendement ou résultat IA. Les données des tests sont des fixtures synthétiques, jamais affichées dans l’application.

## Architecture cible

Navigateur React → API HTTPS authentifiée → PostgreSQL / stockage objet privé / file de jobs → extraction et IA côté serveur. Hébergement statique indépendant du fournisseur ; API déployable séparément. Supabase Auth + PostgreSQL avec RLS constitue la cible proposée, sans abonnement ni ressource créée. Les contrats TypeScript dans `src/services/contracts.ts` définissent les points d’intégration, pas des services fonctionnels.

- Identité : Supabase Auth réel, connexion par lien email ou OIDC. L’API valide le jeton et l’utilisateur ; aucune identité fournie par le navigateur ne fait autorité. Pour sessions en cookie : HttpOnly, Secure, SameSite et protection CSRF.
- Données privées : `owner_id` issu de l’identité authentifiée. RLS sur toutes les tables ; vérifier l’isolation avec deux utilisateurs et un client anonyme avant mise en service. Migration proposée dans `database/001_foundations.sql`, non appliquée. La clé service reste côté serveur et ne doit jamais commencer par `VITE_`.
- Documents : bucket privé, accès contrôlé par propriétaire, URL signée de courte durée, limite de taille, contrôle MIME, analyse antivirus, statut de quarantaine. Métadonnées en base ; aucun fichier dans GitHub. Aucun upload dans cette version.
- Provenance : par champ, valeur, statut, référence de source, horodatage et éventuel document. « Extraite » signifie ici recopiée manuellement avec référence. Une saisie personnelle reste une estimation non vérifiée. Contradictions : conserver les valeurs et sources en désaccord ; futur modèle d’observations historiques plutôt qu’écrasement. Seul le serveur de vérification peut produire « vérifiée », après contrôle du document lié.
- Extraction : worker serveur avec allowlist de portails, refus des adresses privées/loopback et redirections vers ces adresses, limitation des requêtes et tailles, respect des règles des portails. L’URL n’est actuellement jamais téléchargée : pas de SSRF dans le parcours présent.
- IA : jobs asynchrones, budget plafonné après accord du fondateur, données minimisées, textes d’annonces traités comme contenu non fiable, réponses structurées validées, résultats sourcés et versionnés. L’IA ne transforme pas une estimation en vérification.
- Finances : fonctions pures, montants en centimes et règles d’arrondi explicites, hypothèses sourcées et version du moteur, tests de référence. Aucun calcul financier implémenté à ce stade.

## Avant une production privée

Implémenter Auth + API et repository persistant ; tester RLS et stockage avec deux comptes ; prévoir export/suppression, sauvegardes et restauration, rétention, journalisation sans données sensibles, limitation de débit et suivi d’erreurs. Définir les besoins RGPD et l’hébergement européen. La migration proposée ne suffit pas à déclarer un service sécurisé.

## Décisions nécessitant le fondateur

Le choix et l’ouverture de comptes d’hébergement, l’activation de services payants, la politique de données et tout déploiement public. La pile locale et les changements GitHub sont inclus dans la mission autorisée. L’ancien projet Bubble n’est pas concerné.
