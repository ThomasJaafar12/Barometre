# Baromètre économique Urssaf

Générateur Python de trois pages HTML statiques à partir des données, des géographies et des médias locaux.

## Génération

Python 3.11 ou ultérieur, `pandas` et `openpyxl` sont nécessaires. Installer les dépendances avec :

```powershell
python -m pip install -r requirements.txt
python builder.py
```

La commande produit uniquement dans `dist/` :

- `index.html` : accueil et choix de lecture ;
- `barometre_bref.html` : quatre indicateurs expliqués simplement, pour la France et ses régions ;
- `barometre_details.html` : version détaillée avec les graphiques, cartes, filtres et animations historiques.

Les dossiers `Assets/Data_source`, `Assets/Geo`, `Assets/logo` et `Assets/Mp4` doivent être présents. Le fichier `Assets/Mp4/placeholder.mp4` est obligatoire.

Les métadonnées de publication se configurent avant le lancement :

```powershell
$env:BAROMETRE_PUBLICATION_DATE = "24 juin 2026"
$env:BAROMETRE_ISSUE_NUMBER = "189"
python builder.py
```

Les trois pages partagent ces métadonnées. Les fichiers HTML générés sont des artefacts : effectuer les changements durables dans les templates ou le package Python.

## Organisation modulaire

- `builder.py` appelle l’orchestrateur `barometre_builder/page.py`.
- `payloads.py`, les modules métier et `dpae.py` préparent les données. `context.py` les construit une seule fois pour les trois rendus.
- `brief.py` projette uniquement les séries nécessaires à la synthèse.
- `renderers/` contient un moteur sans écriture de fichier pour chaque page, ainsi que les fonctions communes de rendu.
- `templates/` contient les styles et scripts sources, dont `details.css` et `details.js`. La version détaillée conserve son squelette `barometre.template.html` et les fragments de `template_fragments/chapters/`.
- `security.py` centralise l’encodage, la validation et la politique CSP ; `dependencies.py` centralise les versions et empreintes des bibliothèques. Leurs fichiers et mentions de licence sont conservés dans `barometre_builder/vendor/`.
- `publication.py` assemble les rendus pour la diffusion : styles et scripts applicatifs externes, bibliothèques locales, copie des médias et manifeste SHA-256. `publishing.py` prépare les fichiers sur disque puis les publie avec restauration en cas d’échec. Les autres sous-dossiers présents dans `dist/` sont préservés.

`build_pages() -> dict[str, str]` construit et valide le site complet avant sa publication dans `dist/`. `build_page()` génère aussi les trois pages et retourne le HTML détaillé. `build_payloads()` et `render_html()` restent accessibles dans `barometre_builder.page` ; `render_html()` conserve le rendu historique inline, sans écriture de fichier.

```text
dist/
├── index.html
├── barometre_bref.html
├── barometre_details.html
├── site_manifest.json
└── assets/
    ├── css/
    ├── js/
    ├── images/
    ├── videos/
    └── vendor/
```

Les données restent intégrées aux pages. La publication adapte uniquement les URLs des médias dans une copie de présentation ; le contexte d’ingestion et les données différées compressées restent inchangés. Aucun `fetch()`, JSON externe, module ES ou téléchargement de bibliothèque n’est ajouté à la lecture ou à la génération.

## Lecture des indicateurs

La synthèse présente la masse salariale et les effectifs trimestriels corrigés des variations saisonnières, toutes les procédures collectives trimestrielles et les DPAE mensuelles du fichier fourni. Les quarante et un derniers trimestres ou cent vingt et un derniers mois sont affichés pour couvrir dix années complètes entre la première et la dernière observation, lorsque les données sont disponibles ; l’évolution annuelle utilise la même période un an auparavant, avant la sélection de cette fenêtre.

Les DPAE additionnent les CDI, les CDD longs et les CDD courts. La colonne `due_long`, déjà comprise dans ces catégories, n’est pas ajoutée. Les anciennes régions sont agrégées par région actuelle et mois. Les territoires absents, dont Mayotte dans le fichier actuel, et les observations incomplètes sont indiqués comme indisponibles. Le périmètre national disponible est précisé. Les DPAE ne représentent pas les créations nettes d’emplois.

Dans la version détaillée, le chapitre « Santé des entreprises » présente les DPAE mensuelles depuis 2014. Les filtres permettent de suivre tous les contrats, les CDI, les CDD longs ou les CDD courts ; le total des CDI et CDD longs reste visible pour comparaison, sur la même échelle. Les cartes présentent les glissements annuel et mensuel et le tableau détaille les trois types de contrats. Les comparaisons utilisent le même mois de l’année précédente et le mois précédent, avant la sélection de la fenêtre affichée. Les données du classeur sont utilisées telles quelles, sans supposer un traitement saisonnier absent de ses métadonnées.

Chaque indicateur possède sa propre période : la date de publication n’est pas la date des observations. Les mêmes sources et agrégats sont utilisés dans les deux lectures pour les indicateurs communs.

Les géographies simplifiées sont conservées dans `.cache/barometre/`. Le cache est invalidé lorsque les sources ou paramètres changent. Si la géographie départementale locale manque, son téléchargement est limité au domaine HTTPS officiel prévu, aux redirections autorisées et à 25 Mo.

Les agrégats des modules et des DPAE sont également conservés dans ce dossier, sous forme de JSON. Leurs empreintes SHA-256 tiennent compte du contenu des sources, du code de préparation, des régions et des références vidéo concernées. Une modification est donc détectée même si la taille et la date du fichier restent identiques. L’intégrité du cache est vérifiée avant réutilisation ; un cache absent ou corrompu est recalculé. Les fichiers de cache sont remplacés atomiquement et leur écriture reste facultative.

Les templates et les métadonnées de publication sont relus à chaque lancement, et les politiques CSP sont recalculées après le rendu. Dans la synthèse, les tableaux de valeurs sont construits à leur première ouverture et les formateurs français sont réutilisés lors des changements de région.

## Ouverture et diffusion

Ouvrir `dist/index.html` directement dans un navigateur récent, ou servir le site :

```powershell
python -m http.server 8000 --directory dist --bind 127.0.0.1
```

Les données, D3 7.9.0, GSAP et ScrollTrigger 3.12.5 sont disponibles localement. Seules les polices Google nécessitent Internet ; leur absence conserve les polices de repli existantes. Les scripts classiques sont chargés dans leur ordre historique, sans `async` ni `defer`. Les empreintes des bibliothèques locales sont contrôlées à chaque génération ; les scripts inline restent autorisés par leur empreinte CSP.

Après une génération, exporter le site complet et créer une archive :

```powershell
.\scripts\export_package.ps1 -Zip
```

Cette commande fonctionne sous Windows PowerShell 5.1 ou PowerShell 7, depuis n’importe quel dossier de travail. Elle crée `exports/export_package/` et `exports/export_package.zip`. Les trois pages, les styles, scripts, bibliothèques, images et vidéos sont copiés sans modification, après vérification du manifeste et des empreintes. L’archive contient `index.html` à sa racine ; la décompresser puis ouvrir cette page. Omettre `-Zip` pour créer uniquement le dossier.

Utiliser `-OutputDirectory 'exports/publication avec espaces'` pour choisir un autre sous-dossier de `exports`, et `-PythonExecutable 'C:\chemin\vers\python.exe'` pour choisir l’interpréteur. Les sorties hors de `exports` et les liens symboliques sortants sont refusés. Un échec de validation ou de publication préserve la version précédente du paquet. La création du ZIP est préparée dans un fichier temporaire avant remplacement de l’archive précédente.

L’exporteur Python est également utilisable directement :

```powershell
python scripts/export_package.py --zip
```

Relancer `python builder.py` avant l’export pour actualiser le site. Ne pas modifier directement les fichiers de `dist/` : le manifeste vérifie leur intégrité.

## Sécurité de l’hébergement

Chaque page contient une CSP calculée à partir des scripts assemblés. Les scripts et feuilles de style locaux sont autorisés depuis le site ; les scripts externes ne sont plus nécessaires. Le validateur contrôle la liste explicite et l’ordre des scripts locaux. Les textes dynamiques utilisent des insertions DOM sûres. La politique interdit les scripts inline non autorisés, `eval`, les plugins, les cadres, les formulaires et les connexions de données externes. Les styles inline restent autorisés pour conserver les graphiques et animations existants. Google Fonts est limité à ses domaines dédiés ; ses feuilles de style variables ne peuvent pas utiliser une empreinte SRI fixe.

L’encodage suit les [recommandations OWASP sur les injections de scripts](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html). Les autorisations par empreinte reposent sur la [directive CSP `script-src` documentée par MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

Sur un hébergement HTTP, ajouter les en-têtes suivants. La directive `frame-ancestors` doit être envoyée comme en-tête HTTP, car une balise meta ne peut pas l’appliquer :

```text
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Servir les pages en HTTPS. Activer `Strict-Transport-Security` uniquement lorsque l’hébergement HTTPS est correctement configuré. Si une CSP complète est aussi envoyée par le serveur, elle doit autoriser les mêmes empreintes que la CSP du HTML généré.

## Vérifications

```powershell
python -m unittest discover -v
```

Les tests couvrent les contrats historiques, les DPAE, les comparaisons annuelles, l’assemblage des trois pages, l’encodage, la CSP, les empreintes, les chemins de diffusion et la restauration après échec de remplacement. Ils réintègrent les styles et scripts externalisés et comparent tout le contenu aux rendus historiques : seuls les chemins des médias, les références aux bibliothèques et les métadonnées de sécurité peuvent changer. Les octets des médias et le payload différé restent identiques. Le budget de 4 Mo pour le HTML détaillé et ses ressources applicatives, ainsi que les 3 Mo de données encodées compressées, est conservé. La compression gzip utilise la stratégie `Z_FILTERED`, sans perte de données.

Vérifier également le site réellement écrit sur disque :

```powershell
python scripts/verify_publication.py
```

Pour comparer à des HTML sauvegardés avant une migration, ajouter `--reference-dir CHEMIN`. La référence locale de cette migration est conservée dans `.cache/migration-reference/`, avec les empreintes des HTML et des médias.

Le contrôle navigateur facultatif nécessite Node.js, Playwright et `pngjs` disponibles dans l’environnement Node. Il utilise Edge sous Windows, ou Chromium ailleurs ; `--channel chrome` permet de choisir Chrome :

```powershell
node scripts/verify_browser.cjs
```

Il génère une référence inline depuis les mêmes données, vérifie les interactions et les captures sur ordinateur et mobile, en `file://` et HTTP, et refuse les erreurs JavaScript/CSP, les ressources manquantes ou les requêtes de données. Les captures et le rapport sont placés dans `.cache/browser-verification/`. Le profil de couleur sRGB et le rendu logiciel sont imposés aux deux versions pour des comparaisons reproductibles. La tolérance visuelle est limitée à 0,02 % des pixels avec une amplitude maximale de 32/255 pour l’anticrénelage ; la comparaison du contenu, du CSS, des scripts et des médias est exacte. `--reference-dir .cache/migration-reference` compare aux pages sauvegardées avant cette migration ; `--site-dir CHEMIN` contrôle un paquet déplacé ou extrait.
