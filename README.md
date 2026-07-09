# Warframe Tracker

Ein statischer Browser-Tracker für Warframes, Waffen und Companions.

## Features

- Lädt aktuelle Item-Daten über `https://api.warframestat.us/items?language=de`
- Tabs für Warframes, Waffen und Companions
- Detailansicht pro Eintrag mit Typ, Mastery Rank, Bauzeit, Bild und Wiki-Link
- Blueprint-/Komponenten-Checkliste pro Eintrag
- Ein Klick, um einen kompletten Warframe, eine Waffe oder einen Companion als vorhanden zu markieren
- Fortschritt wird automatisch im `localStorage` des Browsers gespeichert
- Export und Import des Fortschritts als JSON-Datei
- Suche, Sortierung und Filter für erledigte Einträge

## Nutzung

Öffne `index.html` direkt im Browser oder hoste das Repository über GitHub Pages.

> Hinweis: Beim ersten Öffnen braucht die App Internetzugriff, um die Warframe-Daten zu laden. Danach nutzt sie bis zu 24 Stunden den lokalen Cache.

## Dateien

- `index.html` – App-Struktur
- `styles.css` – Layout und Design
- `script.js` – Datenabruf, Filter, Checklisten und Speicherung
