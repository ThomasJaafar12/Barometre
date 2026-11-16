# Audit d’accessibilité du Baromètre territorial Urssaf

**10 novembre 2026 · RGAA 4.1.2 · Version locale `1ad395a`**

Les quatre pages du Baromètre ont été examinées. Les principaux obstacles concernent les deux pages détaillées : plusieurs valeurs historiques ne sont lisibles qu’au pointeur, le choix d’un territoire fait perdre le focus clavier et certains filtres débordent à 320 pixels. La synthèse propose déjà des tableaux par période et un parcours clavier des graphiques : c’est le modèle à étendre aux pages détaillées.

Des non-conformités sont établies sur ce périmètre. L’évaluation reste partielle : elle ne fournit ni taux de conformité RGAA ni résultat utilisable tel quel dans une déclaration d’accessibilité.

## Référentiel et périmètre

Le cadre français est fixé par l’[article 47 de la loi du 11 février 2005](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000037388867) et le [décret n° 2019-768 du 24 juillet 2019, dans sa version consolidée](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000038811937/2026-08-28). La DINUM publie les [critères et tests du RGAA 4.1.2](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/) et indique que la version 5 est en préparation. La [méthode d’évaluation](https://accessibilite.numerique.gouv.fr/obligations/evaluation-conformite/) impose de statuer sur tous les critères applicables à l’échantillon représentatif et de vérifier la restitution sur des technologies d’assistance lorsqu’un test le requiert.

| Page de la publication locale | États examinés |
| --- | --- |
| `index.html` | Accueil, titres, lien d’accès rapide, destinations des cartes de rubrique. |
| `barometre_bref.html` | France entière, Île-de-France, Mayotte ; curseur d’un graphique et ouverture de son tableau. |
| `barometre_emploi.html` | Carte d’entrée, sélecteur ouvert, France entière, Île-de-France, Mayotte ; courbe des effectifs et filtres des indépendants. |
| `barometre_entreprises.html` | Mêmes états territoriaux ; courbe des DPAE et filtres de procédures collectives. |

La commande `python scripts/verify_publication.py` a confirmé que `dist/` correspond aux rendus du projet. Les essais ont porté sur le paquet servi en HTTP sur la boucle locale, dans Edge 154.0.4258.62 sur Windows, à 1 440 et 320 pixels CSS. Ils combinent inspection des sources, mesure des contrastes avec axe-core 4.10.3, essais au clavier et au pointeur, et lecture de l’arbre d’accessibilité du navigateur. Le scan couvre 15 combinaisons page/état par largeur. Les polices distantes ont été neutralisées pour stabiliser les mesures. Les scans ont été effectués avec la préférence de mouvement réduit ; la vidéo et les essais ciblés complémentaires ont aussi été vérifiés avec les réglages de mouvement par défaut. Aucun site public, lecteur d’écran ou appareil mobile physique n’a été testé. Les fichiers internes de préparation qui ne sont pas publiés dans le paquet sont hors périmètre.

## Écarts à corriger

### A1 — Des valeurs historiques manquent dans les alternatives aux graphiques

**Priorité haute · RGAA 1.6, 1.7 et 7.3 · Emploi et Entreprises**

Choisir Île-de-France. Au survol du graphique des effectifs, le point T1 2020 indique **4,78 millions** et **−0,6 %** sur un an. Dans la courbe des DPAE, mars 2020 indique **446 554 tous contrats** et **146 712 CDI et CDD longs**, avec leurs glissements annuels. Les zones de survol ne reçoivent pas le focus et n’ont pas de commande clavier. Les tableaux détaillés observés présentent des classements sectoriels ou des types de contrat, sans reprendre l’historique des courbes par période. Le nom et la description des graphiques Entreprises identifient le sujet, mais ne donnent pas les valeurs de la série. Les courbes de masse salariale, de procédures collectives et de délais de paiement utilisent les mêmes mécanismes de rendu ; inclure chacune au retest.

**Correction et retest.** Ajouter, au voisinage de chaque graphique, un tableau HTML par période qui se met à jour avec le territoire et les filtres. Inclure les séries, unités et variations pertinentes ; distinguer les zéros des données indisponibles. Si l’infobulle reste une fonctionnalité de lecture, offrir aussi un parcours des périodes au clavier, par exemple sur le modèle de la synthèse. Vérifier que les valeurs des deux exemples se retrouvent sans souris, dans la même unité et avec les bons filtres.

Sources : [courbes Emploi](barometre_builder/template_fragments/chapters/sector.js#L274), [courbes Entreprises](barometre_builder/template_fragments/chapters/quarterly.js#L169), [tableaux de la synthèse](barometre_builder/templates/brief.js#L210).

### A2 — Le sélecteur de territoire perd le focus après validation

**Priorité haute · RGAA 7.1, 12.8 · Emploi et Entreprises**

À l’ouverture avec Entrée, le focus reste sur le bouton ; Flèche bas ne rejoint aucune option. Tab permet d’atteindre « France entière » et Entrée valide, mais le focus revient alors à `BODY`. Le Tab suivant atteint un filtre du chapitre, sans passer par le titre du nouveau contenu. De plus, le composant déclare un rôle `listbox` avec des options imbriquées dans des listes ordinaires et y place aussi le bouton « Retour à la carte ». Axe signale les relations ARIA de ce composant à l’état ouvert. La qualité de l’annonce reste à vérifier avec un lecteur d’écran.

**Correction et retest.** Privilégier un `select` natif avec groupes d’options, et un bouton distinct pour le retour à la carte. Si le sélecteur personnalisé est conservé, corriger sa structure et gérer le focus, les flèches et Échap selon le modèle choisi. Après validation, laisser le focus sur un contrôle stable et annoncer le résultat, ou placer le focus sur le titre du contenu révélé. Tester l’ouverture, le choix d’une région, la fermeture et le retour à la carte au clavier, puis avec un lecteur d’écran. Le fait que Tab permette déjà de sélectionner une option évite de qualifier tout le sélecteur d’inutilisable au clavier.

Source : [construction du sélecteur](barometre_builder/templates/details.js#L330) et [gestion des touches](barometre_builder/templates/details.js#L1384).

### A3 — La carte et les courbes Emploi perdent leur nom accessible

**Priorité haute · RGAA 1.1, test 1.1.5 · Emploi et Entreprises**

L’arbre d’accessibilité d’Edge expose la carte régionale et le graphique des effectifs comme des images sans nom. Le constat touche aussi la courbe de masse salariale dans le scan du DOM. Au rendu, D3 supprime les enfants SVG, dont les éléments `title` et `desc` référencés par `aria-labelledby`. Les graphiques Entreprises reconstruisent ces éléments ; le graphique DPAE conserve ainsi son nom.

**Correction et retest.** Limiter le nettoyage au groupe qui porte le dessin, ou recréer les références et leurs cibles après chaque rendu. Donner à chaque graphique un nom qui indique la mesure et son périmètre. Pour la carte, conserver un nom si elle transmet de l’information, ou la masquer aux technologies d’assistance uniquement après avoir vérifié que le sélecteur et les données adjacentes couvrent les mêmes usages. Retester après changement de territoire, de filtre et de taille de fenêtre.

Sources : [nettoyage de la carte](barometre_builder/templates/details.js#L618), [rendu Emploi](barometre_builder/template_fragments/chapters/sector.js#L88), [rendu Entreprises](barometre_builder/template_fragments/chapters/quarterly.js#L26).

### A4 — Des filtres sortent de la zone visible à 320 pixels

**Priorité haute · RGAA 10.11, test 10.11.1 · Emploi et Entreprises**

À 320 pixels CSS, ouvrir l’Île-de-France. Sur Entreprises, le groupe « Nature de procédure » occupe 234 pixels pour 523 pixels de contenu : atteindre « Liquidations » exige de défiler horizontalement à l’intérieur du groupe. Sur Emploi, le filtre des indépendants atteint 684 pixels dans une section de 286 pixels qui masque le débordement horizontal. « Chiffre d’affaires déclaré » se trouve entièrement hors de la largeur visible dans l’état initial. La largeur du document reste à 320 pixels : mesurer seulement le défilement de la page ne détecte pas le défaut.

**Correction et retest.** Faire revenir les boutons à la ligne ou proposer un contrôle natif compact. Supprimer le débordement de la section à la source. Vérifier que chaque filtre est lisible et activable au toucher et au clavier à 320 pixels CSS sans déplacement latéral. Appliquer le même contrôle aux autres filtres ; évaluer séparément les éventuelles exceptions pour les tableaux et graphiques.

Source : [styles mobiles des filtres](barometre_builder/templates/details.css#L4030) et [masquage du débordement](barometre_builder/templates/details.css#L4123).

### A5 — Le contraste de plusieurs textes est insuffisant

**Priorité haute · RGAA 3.2 · Synthèse, Emploi et Entreprises**

| Texte | Couleurs mesurées | Ratio | Minimum |
| --- | --- | ---: | ---: |
| Titre « Baromètre économique », détail à 1 440 px | Blanc sur `#2EBFC9` | 2,23:1 | 3:1 |
| Date de publication, détail à 1 440 px | `#164C8E` sur `#2EBFC9` | 3,82:1 | 4,5:1 |
| « Effectifs salariés », synthèse | Blanc sur `#0284C7` | 4,09:1 | 4,5:1 |
| « Déclarations préalables à l’embauche », synthèse | `#78350F` sur `#F59E0B` | 4,22:1 | 4,5:1 |
| « National » et « Actuelles », sélecteur de territoire | Blanc sur `#FF007F` et sur `#0084FF` | 3,77:1 et 3,65:1 | 4,5:1 |

**Correction et retest.** Corriger les couleurs dans les styles partagés pour toutes les occurrences. Mesurer les états normal, survol, focus et sélection. Mesurer aussi les textes sur photos, dégradés et vidéo, et les éléments graphiques qui portent une information : le scan automatique ne tranche pas ces cas.

### A6 — La vidéo de fond démarre en boucle sans commande

**Priorité haute · RGAA 13.8, test 13.8.1 · Emploi et Entreprises**

Sur Emploi, après le choix de l’Île-de-France, la vidéo visible dure **7,2 secondes**, démarre automatiquement et boucle. Deux mesures espacées d’environ 5,8 secondes montrent qu’elle continue à jouer. Elle n’a ni commandes natives ni commande de pause ou de masquage dans la page. Le script de lecture est commun aux deux pages détaillées et n’est pas conditionné par la préférence de mouvement réduit.

**Correction et retest.** Si la vidéo est décorative, la remplacer par une image fixe. Si elle est conservée, ajouter une commande visible et utilisable au clavier pour arrêter ou masquer le mouvement, et proposer par défaut l’image fixe en mode mouvement réduit. Vérifier aussi si les médias transmettent une information à restituer : le signal automatique sur les sous-titres ne suffit pas à établir une non-conformité multimédia pour une vidéo décorative ou sans parole.

Sources : [élément vidéo](barometre.template.html#L64) et [déclenchement de la lecture](barometre_builder/templates/details.js#L944).

### A7 — Les pages détaillées n’ont pas d’accès rapide au contenu

**Priorité moyenne · RGAA 12.7 · Emploi et Entreprises**

Les deux pages détaillées ouvrent sur les liens de navigation, l’en-tête et la carte, sans lien d’évitement. De plus, leur unique élément `main` est masqué à l’arrivée, jusqu’au choix d’un territoire. La zone principale ne couvre donc pas le parcours d’entrée. La synthèse comporte déjà un lien vers son contenu principal ; l’accueil propose un lien vers les rubriques.

**Correction et retest.** Définir une zone principale stable qui contient le parcours d’entrée et les données révélées. Placer en début de page un lien visible à la prise de focus et vérifier sa destination à l’arrivée, après sélection et après retour à la carte.

Source : [navigation et zone de contenu du gabarit détaillé](barometre.template.html#L14).

## Obligations de publication

Le paquet local ne contient ni mention d’état sur l’accueil, ni page Accessibilité, ni lien vers une déclaration, un schéma pluriannuel ou le plan d’action de l’année. Si le Baromètre est publié comme un service autonome soumis à l’article 47, ces éléments doivent être accessibles selon les [règles de publication de la DINUM](https://accessibilite.numerique.gouv.fr/obligations/mentions-et-pages-obligatoires/). Si le Baromètre est intégré à un site Urssaf plus large, vérifier que la déclaration de ce site couvre le Baromètre et qu’elle est atteignable depuis chacune de ses pages.

Si aucun audit valide ne couvre le service, la mention prévue par le référentiel est **« Accessibilité : non conforme »**. La [déclaration d’accessibilité](https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/) doit notamment préciser le périmètre couvert, les contenus non accessibles, les moyens de contact pour signaler une difficulté ou demander une alternative, et les voies de recours.

## Vérifications qui restent nécessaires

| Thème RGAA | Contrôles effectués ou à compléter |
| --- | --- |
| 1. Images | Noms des SVG contrôlés dans les états cités. Examiner les alternatives de toutes les cartes, séries et illustrations, y compris les données départementales. |
| 2. Cadres | Aucun cadre repéré dans les quatre pages locales ; vérifier le mode d’intégration en production. |
| 3. Couleurs | Écarts mesurés sur des fonds unis. Vérifier l’information donnée par la couleur seule, notamment la variation dans les cartes et le treemap, et le contraste des tracés et indicateurs de focus. |
| 4. Multimédia | Examiner le contenu des deux vidéos et confirmer leur caractère décoratif ou les alternatives nécessaires. |
| 5. Tableaux | Le tableau de la synthèse ouvert pendant le test a une légende, des en-têtes de colonnes et 41 lignes de valeurs. Vérifier la restitution des en-têtes et l’accès aux lignes dans les conteneurs défilants, notamment `.table-scroll` et les classements départementaux. |
| 6. Liens | Les liens principaux sont présents. Le lien détaillé « Les chiffres du mois » ouvre actuellement Emploi : clarifier la destination affichée ou créer la page correspondante. Vérifier tous les intitulés et destinations sur le service publié. |
| 7. Scripts | Vérifier avec un lecteur d’écran les annonces après sélection, les filtres sectoriels, les états sans données et les rôles/états des commandes. Sur la synthèse, Flèche gauche, Début et Fin changent la période, Échap ferme l’infobulle et Entrée ouvre le tableau. |
| 8. Éléments obligatoires | Titres de page présents et langue `fr` sur les quatre pages. Compléter les contrôles de langue et de balisage. |
| 9. Structuration | Examiner la hiérarchie des titres : les pages détaillées ont deux H1 et les noms de blocs d’indicateurs ne remontent pas tous comme titres. Deux H1 seuls ne suffisent pas à invalider le critère. |
| 10. Présentation | Tester zoom texte à 200 %, espacements, couleurs forcées, visibilité du focus et gestion des infobulles. Sur les deux courbes détaillées essayées, Échap ramène le focus au sélecteur sans retirer immédiatement l’état visible de l’infobulle ; vérifier les conditions d’application de 10.13, notamment si le contenu est masqué par l’infobulle et si celle-ci reste survolable. |
| 11. Formulaires | Le sélecteur natif de la synthèse possède une étiquette. Vérifier le périmètre final des champs de saisie et leurs instructions. |
| 12. Navigation | Parcourir tous les contrôles dans les deux sens, y compris les menus, les infobulles et le zoom du treemap. Déterminer l’applicabilité de 12.1 selon le périmètre du site : le RGAA prévoit un cas particulier pour les sites de très peu de pages. |
| 13. Consultation | Vérifier l’orientation, les gestes de zoom et leurs alternatives simples, ainsi que l’accessibilité de tout document proposé au téléchargement en production. |

Après les corrections, auditer l’URL publiée en suivant la [méthode d’échantillonnage de la DINUM](https://accessibilite.numerique.gouv.fr/obligations/evaluation-conformite/), avec les pages légales et documents accessibles au public lorsqu’ils existent. Choisir la [base de test avec technologies d’assistance](https://accessibilite.numerique.gouv.fr/methode/environnement-de-test/) selon le contexte d’usage. Reporter chaque critère applicable dans une grille avant de calculer un taux et de publier la déclaration.

Les [mesures et résultats détaillés](.cache/rgaa-20261110/evidence.json), les [essais ciblés](.cache/rgaa-20261110/focused.json) et le [script de reproduction](.cache/rgaa-20261110/probe.py) sont disponibles dans le cache local. Le script utilise Playwright Python, Edge et axe-core 4.10.3 placé à côté de lui ; lancer `python .cache/rgaa-20261110/probe.py`, puis la même commande avec `--focused`.
