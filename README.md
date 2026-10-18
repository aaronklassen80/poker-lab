# Poker Lab

A mobile-friendly, six-player Texas Hold'em educational prototype with simulated chips and an on-demand coach.

**[Play Poker Lab](https://aaronklassen80.github.io/poker-lab/)** (after GitHub Pages is enabled)

## This version
- Six-player $1/$2 no-rake cash table with five **basic heuristic** bots
- Fold, check/call, raises, all-ins, side pots, and showdown
- Play / Coach / Training modes, an action log, and session statistics
- Pot-odds calculations and estimated equity against **random** opponent cards, not inferred strategic ranges

## Important limitations
This is a v0.1 experimental training prototype, not a GTO solver or reliable source of optimal betting decisions. The bot opponents are not professional-level. No accounts or persistent sessions. Simulated chips only.

## Files
- `index.html` — full self-contained deployable game
- `src/game.js` — extracted readable game logic
- `src/styles.css` — extracted site styles

The original full development-source archive includes the modular test suite; this repo is the initial public deployment. The game should be reviewed and extensively tested before being used for serious strategy training.

## Publishing with GitHub Pages
Repository **Settings → Pages → Build and deployment → Deploy from a branch → main → / (root) → Save**.
