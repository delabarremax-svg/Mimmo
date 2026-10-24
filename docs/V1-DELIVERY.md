# V1 intégrée MIMMO

## Contrat produit

Réutiliser intégralement les PR 3 et 4 sans les fusionner. Garder les Workers
`mimmo-demo-privee` et `mimmo-demo-ux`, et Supabase Londres, inchangés.
Base cible : Mimmo-Paris, `nfhkfjtyfojiwajvbukk`, eu-west-3, Free.
Branche de travail : `feat/integrated-v1`, dépendante de `feat/private-accounts`.

## Architecture et séquence

1. Socle existant : React/Vite/TypeScript, API même origine sur Cloudflare,
   Supabase Auth et RLS. Ajouter récupération de mot de passe, vérifier les
   sessions et leurs erreurs, réserver un Worker V1 distinct protégé côté serveur.
2. Dossier d'investissement : hypothèses financières, postes de travaux,
   observations datées avec document/page/extrait, comparables de marché.
   Sauvegarder dans l'agrégat versionné existant sans modifier les six faits
   existants. Valider les schémas côté serveur et les limites de taille.
3. Import : données structurées d'une annonce autorisée ; jamais de contournement
   d'un blocage. En l'absence d'autorisation de collecte, coller texte/JSON-LD,
   ajouter captures ou renseigner les champs. Proposition d'extraction revue
   par l'utilisateur, conflits conservés et jamais validés automatiquement.
4. Documents : bucket privé et politiques propriétaire/projet, contrôle MIME,
   taille et accès. Extraction de texte avec références de pages ; connecteur IA
   structuré côté serveur uniquement. Ne pas annoncer d'analyse d'image ou de
   PDF tant que le fournisseur n'est pas connecté et testé. Analyse de texte
   explicite par règles disponible sans coût, sans diagnostic automatique.
5. Moteur financier pur/versionné : centimes, mensualités, assurance, vacance,
   charges, rendement brut/net avant impôt, cash-flow et scénario prudent.
   Hypothèses requises, coût global et trésorerie initiale visibles ; aucune
   fiscalité ou accord bancaire inventé.
6. Synthèse : risques sourcés, vérifications, négociation conditionnelle,
   progression calculée sur pièces et étapes réelles. Dossier imprimable/PDF
   avec toutes les hypothèses et les limites, jamais un accord de prêt.
7. Validation intégrée : tests financiers de référence, import hostile,
   documents/permissions, sauvegarde et conflits, comptes, parcours mobile et
   accessibilité. Fixture de démonstration identifiée et chargée explicitement,
   jamais présentée comme annonce ou estimation réelle.
8. Livraison : PR en brouillon, contrôle CI, aperçu V1 distinct privé après
   vérification de protection et des moyens de déploiement. Aucune fusion.

## Critères de livraison

Un compte crée plusieurs biens, récupère l'accès, retrouve ses dossiers après
reconnexion, ne voit jamais ceux d'autrui. Un bien passe de l'import aux sources,
risques, travaux, simulation et dossier PDF. Les tâches indisponibles indiquent
leur état réel et une solution de repli. Zéro résultat IA fictif.

## Blocages observés

- Les requêtes RLS distantes avec écritures/ROLLBACK expirent dans l'intégration
  (`Invalid or expired requestState`). Audit en lecture seule OK ; aucun test
  distant d'écriture n'est annoncé réussi.
- Aucun secret Cloudflare, clé de session ni fournisseur IA n'est injecté dans
  l'environnement. Les secrets GitHub existants ne sont pas lisibles et ne
  doivent jamais être extraits. Ne pas déclencher les workflows de démonstration.
- Aucun service SMTP dédié ni conditions de collecte de portail validées.
  La récupération email, l'analyse visuelle et l'extraction distante devront
  être testées avant qualification de V1 complète.
- L'accès réseau local nécessite les permissions réseau de l'environnement.
  Installation et tests locaux désormais opérationnels avec ces permissions.

## Coûts

Développement local et ressources existantes Free uniquement. Aucun abonnement,
appel IA facturable, branche Supabase payante ou autre dépense autorisée.
