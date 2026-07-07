# Barometre

Projet de generation d'un barometre HTML statique a partir de donnees locales, de fichiers geo et d'assets medias.

Le builder Python assemble :

- les donnees metier presentes dans `Assets/Data_source`
- les geographies presentes dans `Assets/Geo`
- les videos presentes dans `Assets/Mp4`
- le template d'interface `barometre.template.html`

Le resultat genere est `index.html`.

## Structure

- `builder.py` : point d'entree pour lancer la generation.
- `barometre_builder/` : logique de construction des payloads, geographies et modules.
- `barometre_builder/template_fragments/chapters/` : fragments HTML et JS dedies a chaque chapitre.
- `barometre.template.html` : template HTML principal.
- `index.html` : fichier de sortie genere.
- `Assets/` : donnees source, geojson, logo et videos.

## Prerequis

- Python 3.11+ recommande.
- Les dossiers `Assets/Data_source`, `Assets/Geo`, `Assets/logo` et `Assets/Mp4` doivent etre presents.
- `Assets/Mp4/placeholder.mp4` est obligatoire.
- Une connexion reseau peut etre necessaire au premier build si `Assets/Geo/departements-50m.geojson` n'est pas encore en cache.
- Le rendu final charge `d3` depuis un CDN au moment de l'ouverture de `index.html`.

## How to use

Depuis la racine du projet :

```powershell
python builder.py
```

La date et le numéro affichés dans le header peuvent être configurés au moment de la génération :

```powershell
$env:BAROMETRE_PUBLICATION_DATE = "24 juin 2026"
$env:BAROMETRE_ISSUE_NUMBER = "189"
python builder.py
```

La commande :

1. charge les donnees et geographies depuis `Assets/`
2. injecte les payloads dans `barometre.template.html`
3. regenere `index.html`

Si tout se passe bien, le script affiche :

```text
Wrote index.html
```

Ensuite, ouvrez `index.html` dans un navigateur pour verifier le rendu.

## Workflow conseille

1. Mettre a jour les fichiers de donnees dans `Assets/Data_source`.
2. Mettre a jour les fichiers geo ou les assets si necessaire.
3. Relancer `python builder.py`.
4. Ouvrir `index.html` et verifier les modules, la carte et les medias.

## Notes

- `index.html` est un artefact genere : les modifications durables doivent etre faites dans le template ou dans `barometre_builder/`.
- Les chapitres sont assembles via `barometre_builder/chapters.py`, qui centralise le registre et concatene les fragments dedies.
- Si le cache geo des departements est absent, le builder tente de retrouver l'URL source via `Assets/Geo/contours_administratifs_dataset.json`.
