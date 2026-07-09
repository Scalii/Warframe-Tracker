# Warframe Tracker

A static browser tracker for Warframes, weapons, and companions.

## Features

- English UI and English Warframe data
- Separate live API categories for:
  - `https://api.warframestat.us/warframes`
  - `https://api.warframestat.us/weapons`
  - `https://api.warframestat.us/companions`
- Item cards with real Warframe CDN images where the data source provides an image
- Details panel with item type, Mastery Rank, build time, description, image, and wiki link
- Blueprint and crafting component checklist per item
- One-click complete/incomplete toggle for a full Warframe, weapon, or companion
- Progress is stored locally in the browser via `localStorage`
- Export and import progress as JSON
- Search, sorting, and a hide-complete filter
- Optimized loading: the app no longer stores the huge all-items API response and renders long lists in chunks

## Usage

Open `index.html` in a browser or host this repository with GitHub Pages.

The app needs internet access to load live Warframe data and images. Your owned/checklisted progress stays local in your browser.

## Files

- `index.html` – app shell and English UI
- `styles.css` – layout and visual design
- `script.js` – category loading, image handling, search, checklists, and progress storage
