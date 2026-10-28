# Poker Lab — tournament-first training (v0.2)

[**Play the tournament prototype**](https://aaronklassen80.github.io/poker-lab/)

Poker Lab is now an **eight-player, simulated-chip single-table freezeout tournament** instead of the former cash-game demo. This is a first step toward a tournament-training platform, not yet a fully modeled multi-table event.

## Playable now
- 8 seats: you plus 7 computer opponents; 2,000 starting tournament chips each
- Blinds start at 10/20 and increase after every six completed hands (not timed; ideal for interruptible mobile sessions)
- No rebuys; players are eliminated when out of chips, with recorded finishing place
- Top-three 50/30/20 practice payout structure (percentages only; no real prizes or money)
- Correct heads-up small-blind-on-button order; showdown hand rankings; side pots and short all-in betting rules
- Tournament dashboard: blinds, hands to next level, number remaining, average stack, hero stack in BB, bubble/paid status
- Play, optional Coach, and Training mode; live pot-odds math and equity-versus-random-holdings estimates
- Tournament-specific coaching context includes effective stack depth and cautions about ICM
- Autosaves the current game to this browser's localStorage; restart from About (?) menu
- Responsive iPhone and laptop browser layouts

## The limitations matter
- The opponents remain **simple heuristics**, not solver-validated elite players.
- The coach is **not an ICM calculator**, a GTO solver, a reliable push/fold chart, or a professional strategy grade. It must not be used as a definitive guide to tournament decisions.
- There are not yet antes, timed levels, user-chosen blind schedules, multi-table events, bounties, reentries, saved accounts across devices, hand replay, or full finish-place summaries for other bots after the human is eliminated. The tournament ends when you bust (or win), with a restart option.
- Tournament results and the current hand save in this browser only. Clearing browser data or using a different device loses the state.
- Early simulations and 17 automated checks exercise rules and chip conservation, but full independent auditing and strategy validation are still needed.
- Tournament payouts are practice percentages of a fictional prize structure, not chips or actual money awarded.

## Code and tests
- `index.html`: published, self-contained HTML game (built from module source)
- `js/engine.js`: rules, tournament and elimination state
- `js/strategy.js`: basic bot policies and carefully qualified coach calculations
- `js/app.js`: view and autosave
- `styles.css`: responsive UI
- `tests/tournament.test.mjs`: automated engine and strategy checks
- `scripts/build_single.py`: combine source into publishable `index.html`

Run `npm test` with Node 18+. No npm dependencies. For local modular development, run `python -m http.server 8080` in this repository.

## Roadmap — tournament-centered
1. Fully audited engine: verify blind/ante/all-in details and tournament tie-breakers.
2. Stack-depth and positional preflop training with validated charts for the specific blind and action states.
3. Real ICM model with explicit payout structures, bubble-factor comparisons, post-hand explanation, and graded push/fold drills.
4. Strong adaptive opponents, benchmarked against reputable reference strategies.
5. Configurable 6–9-max sit-and-go, satellite, and eventually multi-table tournament simulations with balancing and table moves.
6. Accounts/cloud save, detailed player progress, and training plans.

All chips are simulated. No deposits or real-money gambling.
