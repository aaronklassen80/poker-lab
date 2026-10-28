# Poker Lab — Multi-Table Tournament Trainer v0.3

**Live game:** https://aaronklassen80.github.io/poker-lab/

A free, simulated-chip poker tournament trainer built for practicing at variable-sized live tournament tables. This version changes Poker Lab from a fixed eight-player Sit & Go into a multi-table tournament model. It is **still an experimental poker trainer**, not a verified poker solver.

## Running Aces–style practice scenario (illustrative settings)

- Opens with **36 entrants across six tables of six**. Some tables gain players while other tables lose players, with balancing and table consolidation between hands. Tables can grow up to nine-handed.
- Adds **14 scheduled late arrivals** during the first 14 rounds and permits up to **8 AI re-entries** when eliminated during late registration. Total is typically **50–58 entries**, including re-entries, depending on simulated knockouts; it is not a guaranteed fixed number.
- **12,000-chip starting stacks**, **50/100** opening blinds, blind increases every **five hands** and a **big-blind ante from level three**. These are educational defaults, **not** verified casino blind structures. Blind increases are driven by hands, not real-time minutes, so practice sessions can be interrupted.
- The player sees their current table. Other tables play real independent simulated hands between each hero hand, and new entrants are seated with table balancing as tournament progress dictates.
- **Seven paid positions** in an *illustrative* 35/22/15/10/8/6/4 percentage schedule. Not Running Aces' actual payouts. All chips and payouts are fictional.
- Three switchable modes: **Play** (hints hidden), **Coach** (on-demand math), and **Train** (automatic contextual math).
- Current seat position (BTN / SB / BB / UTG / HJ / CO), stack in big blinds, field size, table size, blind level, entries, late registrations, and re-entries shown during play.
- Saved midhand and between hands in the same browser using localStorage (not synced between phone and laptop). Separate save slot from the prior Sit & Go demo.

## Honesty about strategy and limitations

- The coach computes immediate pot odds and estimated showdown equity against **uniformly random opposing holdings**. This is **not** range-adjusted equity, optimized betting advice, ICM, or GTO solver output.
- The current AI opponents are basic heuristic bots rather than validated advanced tournament players. Off-screen tables use lower-sample equity simulations for speed. There is no claim of real-human playing quality.
- Simultaneous knockouts across independent tables are ordered approximately, using the players' stack sizes at hand start. The simulation progresses all tables by one hand per human hand, not the actual real-world pace of each table.
- Re-entry is modeled for bots, not for the user. There are no tournament accounts, official structures, fees, taxes, bounties or real-money wagering.
- Long-term priorities: verified live-tournament blind presets, bot benchmarks, a real ICM model, range-aware preflop and postflop coaching, decision grading, hand replays, and adjustable tournament setups.

## Source and testing

- `index.html` — deployed standalone build (no external dependencies)
- `js/engine.js` — poker rules and hand evaluation
- `js/director.js` — multi-table scheduling, late registration, re-entries, balancing and save/restore
- `js/strategy.js` — baseline opponents and clearly-qualified coach math
- `js/app.js` — browser UI and saved-game integration
- `styles.css` — desktop and mobile styles
- `tests/*.test.mjs` — automated poker engine and MTT tests, including multi-tournament stress runs
- `scripts/build_single.py` — bundles the modular code into `index.html` for deployment

Run `npm test` with Node.js 18+. Run `python scripts/build_single.py` to create `poker-lab-offline.html`; copy that file to `index.html` to prepare a standalone deployment. Opening the offline file directly also works in modern browsers. No npm dependencies.

This is a practice simulator, not a real-money poker application.
