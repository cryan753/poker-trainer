# Decision Lab calculation boundary

## Pipeline

The browser records a decision snapshot before the action. New snapshots include pending action order, each player’s last acted bet, blind/ante/rake settings, stacks, contributions, positions, the visible board, hero’s cards, and public action history. No opponent hole cards or undealt cards are included.

`analysis-client.js` strips inputs to an explicit public-data allowlist and sends them to a local Web Worker. `analysis-core.js` validates them and reconstructs the betting state. A completed Hand object, its future board, and the original shuffle seed are never accepted as analysis state. Saved legacy snapshots reconstruct missing reopening information from public history.

The analyzer:

1. Builds weighted legal opponent combinations, removing known cards.
2. Conditions those weights on the observed action sequence and sizes under the authored probability model, or uses a supplied current-range override.
3. Generates legal alternatives and always includes the exact action/size chosen.
4. Evaluates remaining cards and betting through a finite public-information continuation policy.
5. Applies the same table engine’s pot awards, returns, rake, and split rules.
6. Reports action values, numerical uncertainty, evidence, assumptions, and sample-based continuation plans.

## Response model and historical actions

New practice opponents use `Poker.Analysis.bot`, sampling `actionDistribution` from the same authored policy used for analysis continuations. Each call receives only the acting player’s own hole cards and public state. Sensitivity overrides change modeled opponent behavior, not the future hero policy.

Historical action likelihoods are smoothed, and bet sizes are fitted with a size-likelihood kernel. Saved hands from older bot policies and manually supplied histories are therefore approximate fits. Professional names are illustrative parameter profiles. No measured professional hand-history database or proprietary training data is included.

## Values and candidate coverage

Each tested action begins at the same public decision. Chip EV is `(final hero stack − currently uncommitted hero stack) / BB`. Fold is normally zero under that convention. Checking can have substantial positive value because the pot already exists. The app compares actions rather than interpreting a positive number alone as approval.

The action menu includes fold/check/call where legal, several authored size candidates, relevant all-ins, and the exact recorded size. It is not a continuous-size optimizer. Continuations use a limited size policy and raising depth. Values depend on both the initial action and the future policy; they are not claims about optimal continuation play.

## Enumeration versus simulation

Heads-up river analysis enumerates each weighted opponent combination and every branch of the finite response tree. This is exact numerical evaluation of that model, not an equilibrium solve.

Heads-up calls that end betting can enumerate legal remaining boards when the work is bounded. Other options in the same report may still be simulated. Larger and multiway situations use paired Monte Carlo deals and continuation randomness to reduce noise in action differences.

Multiway ranges are sampled with randomized sequential removal of already assigned cards. This avoids impossible duplicate cards but is an approximation to the joint range posterior. Folded-card correlations with prior actions are omitted. Hidden folded cards are integrated as unknown dead cards.

Sampling standard errors and paired action-gap errors describe numerical variation within the fixed model. They do not measure uncertainty about opponent assumptions. A reference strategy, more samples, and robust range estimates are different sources of evidence. The app provides what-if reruns rather than turning the sampling interval into a claim about human behavior.

## Decision-specific explanations

Evidence includes the user’s cards, board, exact action and size, pot and remaining stack, tested alternatives, observed-price arithmetic, and the next opponent’s modeled response distribution. Postflop calling examples are classified by currently stronger/weaker made hands; on earlier streets a draw can still improve. Multiway response percentages refer to the next responding opponent, not the chance that everyone folds.

Continuation plans aggregate the next sampled hero decisions after the leading tested action. They show board-change categories, concrete sampled cards, facing-bet status, average price, and the continuation policy’s response mix. They are assumptions behind the displayed EV, not solved prescriptions for every future card.

## Tournament utility

Optional ICM uses the specified remaining prize schedule and all remaining stacks. Exact subset evaluation is used through ten live players. Larger fields use seeded exponential-race samples to generate the standard ICM finish-order distribution. Correlated numerical error from reused ICM samples is bounded conservatively in the action comparison.

Payout EV subtracts the fold branch’s expected prize equity, or the check branch when folding is unavailable. Fold branches continue the other players’ hand before computing ICM, since opponents’ stack changes also matter. Starting stacks resolve simultaneous elimination order; equal starting stacks split applicable prizes. The display also shows chip EV.

Standard ICM assumes equal skill and static stacks/payouts. It does not model bounties, blind movement, future skill edges, deal negotiations, or a complete multi-table event. The action policies remain authored chip-oriented policies, even when terminal outcomes use ICM utility. The payout input is an explicit review scenario, not a live event feed.

## External reference JSON

Use **Export reference template** on a decision for a complete starting schema. Required content includes:

- `format: river90-reference-v1`.
- Descriptive title and source tool/version/URL/notes.
- Exact canonical public state and legal action rights.
- Rake and optional payout rules.
- Explicit weighted ranges for all active seats, including the hero range.
- Declared `equilibrium` or `fixed-policy` solution type, betting-tree description, and continuation assumptions.
- `BB` or `prize units`, with `net-from-decision` EV convention.
- Legal action totals, finite action EVs, and either all action frequencies or none.

An unfilled template intentionally fails validation. Imports are limited in size and reject illegal actions, inconsistent pot/price data, impossible board cards, invalid frequencies, missing ranges, and unsupported source-URL protocols. Reference state matching ignores private metadata, names, and the original shuffle seed.

A state match alone does not imply a range/strategy match. External EVs are displayed separately and remain user supplied. No source becomes independently verified simply by importing JSON, and mismatching states do not grade the hand.

## Reference sources

- [Expected value and pot odds — GTO Wizard](https://blog.gtowizard.com/what-is-expected-value-in-poker/)
- [Equity realization — GTO Wizard](https://blog.gtowizard.com/equity-realization/)
- [ICM basics — GTO Wizard](https://blog.gtowizard.com/icm-basics/)
- [Betting trees — PioSOLVER](https://piosolver.com/docs/viewer/postflop_tree_building/)
- [Strategy assumptions and node locking — PioSOLVER](https://piosolver.com/docs/viewer/node_locking/)

These sources explain concepts. They do not endorse or certify this implementation.
