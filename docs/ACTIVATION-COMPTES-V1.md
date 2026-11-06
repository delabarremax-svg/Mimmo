# Test privé des comptes — modèles Supabase par défaut

**Mise à jour du 6 novembre 2026 : ne plus modifier les modèles d'emails.**
La PR 6 adapte MIMMO au lien `ConfirmationURL` standard de Supabase. Aucun SMTP
personnalisé, domaine, abonnement ou clé à fournir pour le test privé du fondateur.
La correction est préparée ; l'aperçu déployé ne la contient pas encore.

## Unique écran de configuration à vérifier, si pas déjà enregistré

Projet **Mimmo-Paris** uniquement :
https://supabase.com/dashboard/project/nfhkfjtyfojiwajvbukk/auth/url-configuration

**Site URL** :
`https://mimmo-v1-comptes-privee.delabarre-max.workers.dev`

**Redirect URLs** (deux adresses exactes) :

- `https://mimmo-v1-comptes-privee.delabarre-max.workers.dev/api/confirm`
- `https://mimmo-v1-comptes-privee.delabarre-max.workers.dev/api/recover`

Enregistrer seulement si nécessaire. Garder confirmation email activée et modèles
Supabase inchangés. Ne pas activer SMTP ni modifier le projet de Londres.
Les outils connectés n'exposent pas ce réglage Auth ; aucune clé ne doit être
transmise pour tenter de le contourner.

## Parcours de recette, après déploiement privé autorisé

1. Sur l'iPhone, ouvrir **Safari**, hors navigation privée, à l'adresse comptes
   ci-dessus. Utiliser la protection habituelle : identifiant `mimmo`, mot de
   passe de démonstration déjà choisi. Aucune création de compte ne sera faite
   à votre place avec une adresse supposée.
2. Créer le compte avec **l'adresse déjà membre de l'organisation Supabase Mimmo**
   et un mot de passe choisi sur le formulaire (12 caractères minimum).
3. Ouvrir l'email Supabase puis **ouvrir le lien dans ce même Safari**.
   Si Mail ouvre un autre navigateur ou une fenêtre intégrée, utiliser son
   option « Ouvrir dans Safari ». Ne transmettre le lien à personne.
   MIMMO confirme l'email puis propose la connexion par mot de passe.
4. Ajouter une annonce à laquelle vous avez accès ; saisir ou extraire depuis
   votre texte/capture. Enregistrer un titre distinctif et sa source, puis les
   hypothèses et le dossier. Attendre le message de réussite.
5. Se déconnecter : aucun dossier ne doit rester visible. Fermer et rouvrir Safari,
   se reconnecter avec le même email/mot de passe : titre, source, observations
   et hypothèses doivent être retrouvés. Les saisies non enregistrées ne sont
   pas une preuve de persistance.
6. Pour la récupération, demander le lien depuis **Mot de passe oublié ?**, puis
   ouvrir le dernier email dans ce même Safari, définir le nouveau mot de passe,
   se reconnecter et retrouver le bien. Ne pas répéter les demandes en boucle.

Le mailer intégré limite actuellement l'envoi à **2 emails par heure**, destinés
aux membres existants de l'organisation. Confirmation + récupération peuvent donc
consommer tout le quota d'essai ; des demandes précédentes peuvent nécessiter
l'attente du renouvellement. Aucun envoi de test distant automatique n'est lancé
pour éviter de consommer ce quota. Ne pas ajouter de clients comme administrateurs
Supabase pour contourner cette restriction. L'ouverture aux utilisateurs externes
nécessitera une solution email adaptée et un accord séparé sur tout coût.

## Ce qui est réellement vérifié

- Code et vrai SDK Supabase testés contre un fournisseur HTTP synthétique : PKCE
  S256, lien standard de vérification Supabase, redirection par `code`, échange
  serveur, vérification d'identité, session de récupération séparée et courte.
- Cookie de confirmation chiffré, Secure/HttpOnly/SameSite=Lax, borné et expirant ;
  aucun jeton de session ni vérificateur en localStorage. État par requête, jamais
  un client partagé entre utilisateurs. Dernière demande du même type prioritaire.
- Liens expirés, rejeu, mauvais navigateur, cookie altéré et confusion inscription/
  récupération refusés. Les anciens retours `token_hash` restent compatibles.
- Une ancienne URL de flux implicite n'est pas interprétée comme une autorisation ;
  le fragment est effacé à la redirection. Demander un nouveau lien après mise à jour.
- RLS propriétaire et sauvegarde testés en PostgreSQL ; vérification HTTP/iPhone
  avec l'email réel encore à réaliser. Ne pas présenter les mocks HTTP comme une
  confirmation de réception d'email, de persistance distante ou d'isolation réelle.

Après l'essai, indiquer seulement quelles étapes ont réussi ou le message affiché.
Ne transmettre aucun email complet, lien de confirmation, jeton ou mot de passe.
L'assistant contrôlera Paris en lecture seule sans afficher le contenu des biens.
L'isolation de deux comptes réels et des fichiers reste une recette distincte.

L'IA reste désactivée ; lecture PDF/OCR locale, calcul financier déterministe et
sauvegarde ne dépendent d'aucun appel IA facturable.

Sources Supabase consultées :

- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://supabase.com/docs/guides/auth/auth-smtp
