# Backlog

Ideas that are wanted but not planned yet. Each needs a plan in `docs/plans/` before
any code, and some need an owner decision first (marked). Pick from here when starting
a new plan; remove an item once a plan picks it up.

## Product

- **QR code on the board.** Phones scan to join instead of typing `<host>/<CODE>`.
  *Owner decision:* needs a QR dependency (or a hand-rolled encoder) — No new deps.
- **"Change my answer" in Guess Who.** Let a player re-open their answer until the host
  advances. A game-rule change in `packages/games`, not UI only: the reducer, its
  redaction tests and the conformance kit all move.
- **Phones show who is still thinking.** Today the player views carry counts only
  ("3 of 5 answered"). Showing names is a deliberate widening of `view()` for players —
  View-only applies: redaction tests first, and the host view stays as it is.
- **Dark mode.** The paper palette is warm-light only (`design.md`); a dark variant
  needs its own sketch and token set.

## Operations

- **Deploy automation.** Redeploying is a manual SSH + `docker build` (`docs/deploy.md`).
  A workflow that builds the image in CI and pulls it on the VM would remove the
  1 GB-VM build and the OOM gotcha. Needs repo secrets and a CI change (guarded).
- **VM OS upgrade.** The live VM runs Ubuntu 20.04 (EOL). Recreate on 22.04/24.04.
- **Real-device play-test S18** (`docs/plans/plan-15.md` matrix): lock a phone mid-round,
  switch Wi-Fi ↔ mobile data, rejoin on a second device. Logic is covered by tests;
  real phone network stacks are not.
