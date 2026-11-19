# River 90 — Decision Lab

[Open your poker trainer](https://cryan753.github.io/poker-trainer/?v=3.0.1)

Free browser-based no-limit Texas Hold’em practice for a laptop or phone. No Replit subscription, account, paid API, or installation is required. Practice chips only.

## Play and review

1. Choose **Cash game** or **Tournament**, your seat, starting stacks, and opponents.
2. Click **Deal me in** and play the hand. A decision review opens automatically when the hand ends.
3. Each review shows **your exact action**, the tested alternatives, estimated expected value (EV), the gap from the leading tested action, and numerical uncertainty.
4. Select an action row to inspect the next opponent’s modeled calls, folds, raises, and specific card combinations.
5. Use **Test opponent assumptions** to check whether the answer changes against tighter or wider callers. **Change assumptions** also supports different bluffing tendencies and explicit weighted ranges.
6. Use **Retry this decision** to return to that exact point in the original deal, or **Next hand** for fresh practice. Known-deal replays are marked separately.

The review gives concrete evidence: cards and board at the time, pot, call price, stack, actual amount, alternative sizes, weaker and stronger calling combinations, and sampled next-street continuation behavior. A result from one hand does not determine the recommendation.

## Version 3 features

- Legal full hands with 2–9 seats, configurable positions and individual stacks, cash rake, tournament antes, and single-table progression.
- Ordinary opponent types plus fictional professional-inspired styles for Ivey, Hellmuth, Dwan, Brunson, and Chan. They are authored exercises, not replicas, endorsements, or measured professional strategies.
- One public-information response policy shared by the new practice bots and the continuation analyzer.
- History-conditioned weighted opponent combinations, exact inclusion of the chosen size, and comparisons with legal fold/check/call/bet/raise alternatives.
- Paired sampled future betting and board runouts. Heads-up river decisions enumerate the finite modeled response tree; suitable all-in closing calls enumerate combinations and runouts.
- Correct pot-layer accounting through the existing engine, including unequal all-ins, uncalled returns, split pots, rake, and odd chips.
- Evidence for each choice, numerical uncertainty, deeper comparisons, opponent-read sensitivity, and manually specified current ranges.
- Optional ICM payout comparisons with chip EV shown alongside payout EV.
- Mathematical reference checks and strict import/export for externally supplied solution references.
- Comparison JSON exports, exact decision retries, notes, unfinished-hand restoration, last-100-hand history, and existing JSON backups.
- Background-worker computation with a reduced-sample local fallback when workers are unavailable.

## Tournament payout scenarios

Open **Analysis settings & reference checks** in Table setup or Guide & backups. Enable ICM and enter remaining payouts from largest to smallest. Unlisted finishing places pay zero. Add all remaining other-table stacks in BB at the hand’s blind level, and confirm that the scenario includes the whole remaining field.

These inputs define the scenario used for a review. They are not an automatically tracked multi-table event; update them when the field or payout situation changes. Invalid or incomplete inputs produce a visible error rather than silently switching objectives.

ICM is evaluated exactly for up to ten surviving players; larger fields up to 64 players use a seeded numerical approximation and report an additional uncertainty bound. Simultaneous eliminations use starting stacks to allocate remaining places, with equal-stack ties sharing the applicable prizes. Equal satellite payouts are supported. Bounties, future blind pressure, player skill differences, and full future-tournament simulation are outside the model. Future betting policies are not themselves ICM-optimized.

## Reference comparisons

The built-in checks cover pot odds, exact range equity, rake, ties, dirty outs, bluff arithmetic, side pots, and an analytically solved polar river toy game. The restricted toy game is explicitly labeled; it is not a full Hold’em solution.

For an external solution, export the reviewed decision’s reference template, fill it with a solution you have permission to use, and import the completed JSON in Analysis settings. The app requires the exact state, legal actions, rules, ranges, continuation/tree assumptions, source, and EV convention. A state-only match displays the external result separately. Parsing does not certify a source or its numbers. No commercial solver data, service, API, or subscription is bundled.

## Interpreting the numbers

**These are estimated action values against an authored opponent model. They are not GTO or expert-certified grades.** “Top tested” means best among the displayed choices under the stated ranges and continuation policy. Other bet sizes and other realistic strategies can change the answer.

Cash chip EV measures future net chips from the decision, in BB. Earlier contributions are sunk costs. Payout EV is relative to the modeled fold branch, or check where folding is unavailable. Positive EV alone does not establish that an action is best; compare alternatives. Sampling error does not measure whether the opponent assumptions are correct.

The continuation tree uses a finite size menu and bounded raising. Multiway card assignment approximates the joint posterior, and folded-card action correlations are omitted. Future decisions use only each simulated player’s own cards and public information. Actual hidden hands, actual future cards, and the original shuffle seed are excluded from analysis.

## Privacy and existing saves

Only application code and synthetic test fixtures are in this repository. Personal history files and notes are not uploaded. Practice data, analysis settings, and imported references stay in the current browser; computation is local. There is no automatic cross-device synchronization.

The existing `river90.tablelab.v2` save format remains readable. New decision snapshots add public betting-state fields, with a fallback for older snapshots. Export Table Lab backups periodically. Analysis settings/reference storage is separate; **Export comparison** preserves the exact review assumptions and report for an individual decision. Browser storage restrictions fall back to temporary practice.

## Development and verification

This is a static HTML/CSS/JavaScript site. GitHub Pages serves the `main` branch root; `.nojekyll` bypasses Jekyll. No package installation or build step is required for hosting.

Run the numerical and engine regression checks with:

```sh
node --test tests/*.test.js
```

The tests include independent known-answer EV, rake, ties, dirty outs, side pots, legal reopening, exact chosen sizes, range changes, hidden-information invariance, reference validation, ICM arithmetic, and complete modeled games. They verify implementation properties; they do not establish profitability against people or professional calibration of the policy.

See [Analysis design and assumptions](docs/decision-analysis.md) for the calculation boundary and supported reference format.
