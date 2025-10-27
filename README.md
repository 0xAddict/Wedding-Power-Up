# Trello Power‑Up: Checklist-on-Front + Dependencies

This Power‑Up does two things:
1) **Checklist preview on the card front** (first 2 incomplete items + progress).
2) **Dependencies**: mark a card as **Depends on** other cards (and automatically write the reverse relation as **Blocks** on those cards). Shows **Depends on**/**Blocked by** badges.

No external server is required. Host these static files (GitHub Pages, Netlify, Vercel) and register the Power‑Up.

## Demo of capabilities
- `card-badges`: shows checklist summary + dependency counts on the **front of cards**.
- `card-detail-badges`: shows fuller info on the **card back**.
- `card-buttons`: opens a UI to edit dependencies.
- `show-settings`: opens a small settings popup.

> Note: Trello does not allow arbitrary HTML on the card front. We emulate “checklist on front” using badges (text + tooltip).

## Quick start
1. **Host** this folder (e.g., GitHub Pages). Your base URL will look like `https://<user>.github.io/trello-deps-powerup/`.
2. Go to **https://trello.com/power-ups/admin** → “Create new Power‑Up”.
3. Set **Iframe connector URL** to your hosted `index.html`, e.g. `https://<user>.github.io/trello-deps-powerup/index.html`.
4. Enable these **capabilities**:
   - `card-badges`
   - `card-detail-badges`
   - `card-buttons`
   - `show-settings`
5. Enable on a board and test.

## How dependencies are stored
- For a card **A** that depends on **B**:
  - On **A** (card scope, shared visibility): `dependsOn = [<B.id>, ...]`
  - On **B**: `blocks = [<A.id>, ...]` (auto-updated)
- Data is saved using the Power‑Up client methods `t.get`/`t.set` (pluginData). Limit is ~4096 chars per scope/visibility (per card).

## Editing dependencies
Use the **“Dependencies”** card button:
- Pick cards from a searchable list (from this board) or paste Trello card URLs.
- Save updates—relations are symmetrically written.

## Build/Host
Static—no build step required. Files:
- `index.html` – connection page
- `client.js` – capability handlers
- `modal.html`, `modal.js` – dependency editor
- `settings.html`, `settings.js` – small settings popup
- `styles.css` – minimal styles
- `icon.svg` – badge/button icon

## Notes & limitations
- Card front supports **badges** only (one line of text). We truncate checklist item names.
- To compute “Blocked by” we use the current card’s `dependsOn`. “Blocking” (cards that depend on this one) is shown on the back badge by reading the reverse `blocks` list on this card. 
- For very large boards, loading all cards in the modal might be slower. This version avoids Trello REST API/auth for simplicity; you can later add REST auth (API key + token) to query across boards.

## License
MIT
