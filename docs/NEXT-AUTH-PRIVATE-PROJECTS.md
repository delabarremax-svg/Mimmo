# Prochaine étape : comptes MIMMO et projets privés

## Proposition pour le fondateur

Conserver l’interface React et l’hébergement Cloudflare déjà en place. Ajouter un vrai compte MIMMO avec connexion par email, puis enregistrer chaque projet dans une base PostgreSQL privée. Les projets doivent rester accessibles après fermeture de Safari et sur un autre appareil connecté au même compte. La connexion protégeant aujourd’hui la démonstration n’est pas un compte utilisateur MIMMO.

Supabase Auth + PostgreSQL avec RLS est la cible proposée en mission 1. Cette étape confirme cette direction, sans créer de compte fournisseur, souscrire une offre ni appliquer une migration. Le choix du fournisseur, de la région européenne, des conditions de données et d’un éventuel budget doit être validé avant activation. Les limites et les capacités d’envoi email doivent être vérifiées au moment de la configuration ; aucune promesse de production gratuite illimitée.

## Architecture

Safari → API HTTPS sur le Worker MIMMO → Supabase Auth / PostgREST / PostgreSQL. La session est gérée par le serveur : cookie HttpOnly, Secure, SameSite=Lax, durée limitée et rotation. L’API vérifie les jetons émis par Supabase (signature/JWKS, issuer, audience, expiration et utilisateur) et transmet le jeton de cet utilisateur à la base. Les clés privilégiées restent dans les secrets serveur ; elles ne doivent pas être utilisées pour les opérations CRUD ordinaires, afin de conserver l’isolation RLS.

L’implémentation doit suivre le flux PKCE/SSR supporté par Supabase, avec bibliothèque maintenue et tests réels, plutôt qu’un protocole d’authentification maison. Stocker les éléments de session nécessaires uniquement dans des cookies protégés, appliquer contrôle d’origine et protection CSRF aux écritures, rate limiting aux tentatives de connexion et URLs de retour explicitement autorisées. Aucun token de session dans le localStorage ou les URLs applicatives. Supabase utilise ici des appels HTTPS : pas de connexion TCP directe depuis Cloudflare Workers.

## Découpage livrable

1. **Connexion réelle** : demander un lien email, ouvrir ce lien dans Safari, établir la session, afficher le compte connecté, se déconnecter. Prévoir les erreurs de lien expiré, les limites d’email et les retours de connexion. Tester le lien ouvert dans un autre navigateur. Ne pas montrer « connecté » tant que le serveur n’a pas confirmé l’identité.
2. **Projets persistants** : implémenter `PropertyRepository` via API authentifiée ; lecture, création, modification et suppression. `owner_id` dérive exclusivement de la session vérifiée, jamais du formulaire. Utiliser transactions pour le projet et les faits, contrôle de concurrence/version pour éviter l’écrasement d’une modification depuis un autre appareil.
3. **Retour visuel fiable** : distinguer « brouillon », « enregistrement en cours », « enregistré sur votre compte », « échec, réessayer ». Garder le brouillon en mémoire tant que le serveur n’a pas accusé réception. Si le réseau disparaît, ne jamais afficher une confirmation fictive. Ne pas transférer automatiquement les brouillons de démonstration à un compte : proposer explicitement leur reprise après connexion.
4. **Photos privées** : bucket privé, objets rattachés au propriétaire et au projet, limites de poids/résolution, contrôle MIME et traitement serveur, URL signée courte durée, suppression synchronisée. Sans ce service, les photos restent temporaires. La photo actuelle est fournie par l’utilisateur ; elle ne prouve ni l’état ni l’identité du bien.
5. **Vie privée** : export et suppression du compte et des projets, rétention documentée, journaux sans valeurs immobilières ni identifiants de connexion, sauvegardes et procédure de restauration adaptées à l’offre réellement retenue. Définir les responsabilités et les documents RGPD.

## Modèle à stabiliser avant migration

Le schéma de mission 1 est une proposition non exécutée. Compléter la table projets par une version de modification, l’historique des observations et leur attribution. Par donnée : champ, valeur, statut, source, auteur, date de saisie, référence de l’annonce ou du document. Conserver les valeurs contradictoires séparément ; l’écran ne doit pas transformer un désaccord en valeur vérifiée. La vérification documentaire reste un privilège serveur contrôlé.

Les statuts et leurs couleurs sont déjà matérialisés dans l’interface. La saisie progressive et les états de brouillon sont séparés de la synthèse des faits enregistrés, ce qui permet de brancher une persistance réelle sans réinventer le parcours. Les contrats de mission 1 doivent devenir des adaptateurs testés, pas rester des interfaces promettant une fonctionnalité inexistante.

## Critères de validation avant ouverture privée

- Un utilisateur anonyme ne lit ou n’écrit aucun projet, fait ou fichier.
- Alice et Bob créent chacun un bien ; aucun échange d’ID, token invalide ou URL d’objet ne permet à l’autre de le lire, modifier ou supprimer.
- Les tests RLS s’exécutent contre une base de test réelle avec leurs rôles, pas uniquement contre un mock.
- Un rechargement de Safari et un autre appareil retrouvent les projets du compte ; une déconnexion ne laisse pas leurs données affichées.
- Un lien expiré, une session révoquée, une coupure réseau et un conflit d’écriture produisent un état explicite sans perte silencieuse.
- Une saisie client ne peut pas créer le statut « vérifiée par document ». Les URLs signées expirent ; supprimer un projet rend ses photos inaccessibles.
- Tester les retours de liens email sur Safari iPhone réel et l’accessibilité au clavier/VoiceOver.

## Préparation des interactions financières — étape ultérieure

La fiche réserve une place à la simulation, clairement marquée indisponible. Ne pas afficher de rendement ni de valeurs par défaut qui ressembleraient à un résultat sur le bien.

Après validation d’un périmètre de calcul : formulaires/sliders synchronisés, hypothèses explicites (prix, frais, travaux, loyer, charges), moteur de fonctions pures versionné, montants en centimes/règles d’arrondi, résultats recalculés immédiatement avec provenance des entrées. Toute donnée manquante bloque les indicateurs qui en dépendent ; les estimations restent distinguées des données vérifiées. Tests de référence et cas limites avant activation. Aucun simulateur, module de financement, DPE, copropriété ou travaux avancé n’est développé dans cette PR.

## Points nécessitant une validation du fondateur

Activation du fournisseur d’identité et de données, région et conditions de traitement, email de connexion et éventuel domaine, limites/budget et politique de sauvegarde. La pull request UX et son aperçu privé peuvent être testés sans ces choix. Le fondateur valide ensuite la fusion ; aucune fusion automatique.
