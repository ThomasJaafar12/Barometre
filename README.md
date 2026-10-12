# Baromètre économique Urssaf

Générateur Python de trois pages HTML statiques à partir des données, des géographies et des médias locaux.

## Génération

Python 3.11 ou ultérieur, `pandas` et `openpyxl` sont nécessaires. Installer les dépendances avec :

```powershell
python -m pip install -r requirements.txt
python builder.py
```

La commande produit, à la racine :

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
- `templates/` contient les nouveaux templates, leur feuille de style et leurs scripts. La version détaillée conserve `barometre.template.html` et les fragments de `template_fragments/chapters/`.
- `security.py` centralise l’encodage, la validation et la politique CSP ; `dependencies.py` centralise les versions et empreintes des scripts CDN.

`build_pages() -> dict[str, str]` construit et valide tous les rendus avant de remplacer atomiquement chaque sortie. `build_page()` génère aussi les trois pages et retourne le HTML détaillé, pour conserver l’interface historique. `build_payloads()` et `render_html()` restent accessibles dans `barometre_builder.page` et conservent le contrat de données de la version détaillée.

## Lecture des indicateurs

La synthèse présente la masse salariale et les effectifs trimestriels corrigés des variations saisonnières, toutes les procédures collectives trimestrielles et les DPAE mensuelles du fichier fourni. Les douze derniers trimestres ou trente-six derniers mois sont affichés ; l’évolution annuelle utilise la même période un an auparavant, avant la sélection de cette fenêtre.

Les DPAE additionnent les CDI, les CDD longs et les CDD courts. La colonne `due_long`, déjà comprise dans ces catégories, n’est pas ajoutée. Les anciennes régions sont agrégées par région actuelle et mois. Les territoires absents, dont Mayotte dans le fichier actuel, et les observations incomplètes sont indiqués comme indisponibles. Le périmètre national disponible est précisé. Les DPAE ne représentent pas les créations nettes d’emplois.

Chaque indicateur possède sa propre période : la date de publication n’est pas la date des observations. Les mêmes sources et agrégats sont utilisés dans les deux lectures pour les indicateurs communs.

Les géographies simplifiées sont conservées dans `.cache/barometre/`. Le cache est invalidé lorsque les sources ou paramètres changent. Si la géographie départementale locale manque, son téléchargement est limité au domaine HTTPS officiel prévu, aux redirections autorisées et à 25 Mo.

Les agrégats des modules et des DPAE sont également conservés dans ce dossier, sous forme de JSON. Leurs empreintes SHA-256 tiennent compte du contenu des sources, du code de préparation, des régions et des références vidéo concernées. Une modification est donc détectée même si la taille et la date du fichier restent identiques. L’intégrité du cache est vérifiée avant réutilisation ; un cache absent ou corrompu est recalculé. Les fichiers de cache sont remplacés atomiquement et leur écriture reste facultative.

Les templates et les métadonnées de publication sont relus à chaque lancement, et les politiques CSP sont recalculées après le rendu. Dans la synthèse, les tableaux de valeurs sont construits à leur première ouverture et les formateurs français sont réutilisés lors des changements de région.

## Ouverture et diffusion

Ouvrir `index.html` directement dans un navigateur récent, ou servir le dossier :

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Les données sont intégrées au HTML. Les scripts et Google Fonts nécessitent Internet : D3 7.9.0 pour la synthèse, D3 7.9.0, GSAP et ScrollTrigger 3.12.5 pour les détails. Les scripts sont protégés par des empreintes SRI et la CSP ; aucune dépendance n’est téléchargée pendant une génération normale.

Créer un paquet avec les trois pages liées, le logo et les vidéos référencées :

```powershell
python scripts/build_mail_pack.py --zip
```

Le résultat est placé dans `dist/mail_pack/`, avec `dist/mail_pack.zip` et un manifeste. `--html` permet de choisir la page de départ. `--output-dir` doit désigner un sous-dossier de `dist` ; le dossier `dist` lui-même, les sorties hors de ce dossier et les ressources qui sortent de `Assets` sont refusés. Les sources sont vérifiées avant le remplacement d’un ancien paquet.

## Sécurité de l’hébergement

Chaque page contient une CSP calculée à partir des scripts assemblés. Les textes dynamiques utilisent des insertions DOM sûres. La politique interdit les scripts inline non autorisés, `eval`, les plugins, les cadres, les formulaires et les connexions de données externes. Les styles inline restent autorisés pour conserver les graphiques et animations existants. Google Fonts est limité à ses domaines dédiés ; ses feuilles de style variables ne peuvent pas utiliser une empreinte SRI fixe.

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

Les tests couvrent les contrats historiques, les DPAE, les comparaisons annuelles, l’assemblage des trois pages, l’encodage et la CSP, ainsi que les chemins du paquet de diffusion. Le budget historique de 4 Mo de HTML et 3 Mo de données compressées est conservé. La compression gzip utilise la stratégie `Z_FILTERED`, sans perte de données.
