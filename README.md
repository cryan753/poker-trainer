# River 90 — Poker Table Lab

[Open the poker trainer](https://cryan753.github.io/poker-trainer/)

Free browser-based no-limit Texas Hold'em practice. No Replit subscription, installation, API key, or app account is needed to play. Practice chips only; no real-money games.

## Start practicing

1. Open the website in Edge or Chrome.
2. Choose Cash game or Tournament, 2–9 players, your starting position, and starting stacks in big blinds. Select each opponent's style separately.
3. Click **Deal me in** at the bottom of Table setup.
4. Play the hand. The hand review opens automatically after it finishes.
5. Save a takeaway, then choose **Next hand** or **Replay same deal**.

The default table is six-handed with you on the button, 100-BB stacks, two tight-passive opponents, two tight-aggressive opponents, and one loose-aggressive opponent. Other models include calling station, very tight, and maniac. Cards can be random or selected.

## Features

- Complete hands, legal raise-to controls, all-ins, unequal-stack side pots, split pots, and return of uncalled bets.
- Cash practice with optional rake and either resetting or continuing stacks.
- Independent tournament hands or a single-table session with antes, rising blinds, and eliminations.
- Immediate decision-by-decision heuristic reviews, calling prices, and approximate range equity.
- Authored drills, same-deal replays, reasoning notes, a last-100-hands library, and JSON backup import/export.
- Keyboard controls: F fold, C check/call, R submit chosen raise, N next hand after review, Esc pause. Shortcuts do not act while typing.

## Privacy and saves

Only application code is public. No personal hand-history XML files, account information, or private notes were uploaded to this repository. The website app stores practice hands, notes, settings, and unfinished practice in the browser, not in the repository. No automatic cloud or cross-device synchronization is included.

Use **Guide & backups → Export backup** periodically. Clearing browser data or switching browsers/devices can remove access to the saved copy. Import replaces, rather than merges, the destination's data. When storage is unavailable, temporary practice mode works but is not persistent. Do not upload personal backup files into this public repository.

## Analysis limitations

The opponents and coach use simplified rules and modeled ranges. They are not a GTO solver, professional AI coach, or calibrated human player population. Reviews do not compute each action's expected value or money lost to mistakes. Range equity is approximate and should not be treated as an exact action recommendation. The coach does not use subsequently revealed cards to judge earlier decisions.

Tournament advice is chip-based: no ICM, payout schedule, bounties, satellites, or multi-table fields. Tournament button movement is simplified. Same-deal replays benefit from known information and are labeled separately from ordinary practice results. No promise of expertise or profit is made.

## Verification

The published engine passed 21 automated test groups, including 2,000 randomized legal hands with chip-conservation checks, ranking evaluation, heads-up order, unequal all-ins, short-raise reopening, side pots, and replay checks.

The matching published HTML/CSS/JavaScript passed 11 Chromium DOM-harness acceptance groups covering full hands and automatic reviews, notes, replays, authored drills, unfinished-hand restoration, all table sizes and seat choices, tournament progression, and layouts. No uncaught page errors were recorded in those runs. Navigation was blocked by the testing environment, so the interface tests used inlined copies of the exact published assets and a storage adapter. These tests do not verify native browser-storage persistence or direct live-site interaction on a user's device.

GitHub Pages reported successful build and deployment of application commit `ca090f060015840c8bac9c2df65bee8293ecb13f`. A live site can still be affected by browser settings, caching, or a hosting outage.

## Hosting

This is a plain static HTML/CSS/JavaScript site. GitHub Pages uses the `main` branch and repository root. `.nojekyll` disables unnecessary Jekyll processing. There is no paid backend or build dependency.
