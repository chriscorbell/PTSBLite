# Working the Trello board

The board: https://trello.com/b/bWnb6qXO/ptsblite

Nick, the client, sees two things: the board and the deployed app at https://ptsblite.pages.dev.
He never sees the repository, so a PR number means nothing to him and "the erase drawer" means
everything. Chris is the only developer. An hourly cloud routine runs the loop below; interactive
sessions follow the rules and run whichever loop steps their work touches.

## Rules

- One card is one testable change: something Nick can try at https://ptsblite.pages.dev and
  approve or reject on its own.
- Sign every comment "— Claude".
- Write to Nick about what he can see and click. Include PR links for Chris, but lead with
  behavior.
- The board is the only state. A card's list and its newest comment decide what happens next; the
  routine remembers nothing between runs.
- A card that asks to change an authoritative engineering constraint gets questioned, not built.
  AGENTS.md governs; ADR first, code second.
- Comments cap at 2048 characters. Link to a card instead of restating one.

## The lists

- **Intake (Nick starts here)**: Nick's drop zone. The pinned "📥 Drop feedback here" card is the
  intake channel and stays here permanently.
- **Blocked (Need response from Nick)**: questions waiting on Nick, one per card.
- **Ready for Chris**: split, actionable, agreed. The implementation queue, top card first.
- **In Progress by Chris**: claimed work. Claiming a card here is what stops two sessions building
  the same thing.
- **Awaiting Approval**: shipped and deployed. Nick tests, then moves the card to Done or back
  with a comment.
- **Done** and **Junked**: kept for the record. Junked cards record withdrawn requests so they are
  not re-raised as new.

## The loop

Run the steps in order. A run that finds nothing to do ends quietly.

### 1. Triage intake

New input is any card in Intake other than the pinned one, plus any comment on the pinned card
newer than Claude's latest reply to it.

Split each piece into cards of one testable change each. Actionable work goes to "Ready for
Chris" with a description quoting or closely paraphrasing Nick, dated. Anything that needs Nick's
decision becomes its own "Question: ..." card in Blocked, with the question asked plainly in a
comment. Reply on the source card listing the cards created, then archive the source card (never
the pinned one).

Done when every sentence of Nick's input lives on exactly one card.

### 2. Process answers

A Blocked card whose newest comment is from Nick has been answered. Fold the answer into the
description, then move the card to "Ready for Chris", or to Junked with the withdrawal recorded
if he pulled the request.

An Awaiting Approval card that Nick commented on or moved back is a rejection. Fold his feedback
into the description and move the card to "Ready for Chris".

### 3. Implement one card

Take the top card of "Ready for Chris" that is clearly actionable. A card needing a decision gets
its question instead, per step 1; take the next card.

First move the card to "In Progress by Chris" and comment "Building this now. — Claude". That
claims it. A card already in In Progress belongs to whoever claimed it: touch one only if its
newest comment is Claude's own claim, and then finish that work before starting anything new.

Then the normal repository workflow from AGENTS.md: branch, implement, `pnpm run check` green,
PR titled after the card and linking it. Merge once verify is green: `gh pr checks --watch`,
then `gh pr merge --squash`.

Once the PR merges (Cloudflare Pages deploys main within a few minutes), move the card to
Awaiting Approval and comment: what changed in Nick's terms, how to test it, and the PR link.

If the run cannot finish (verify stays red, merge not permitted), leave the card in In Progress
with a comment saying exactly where things stand, so the next run or Chris can pick it up.

One implementation card per run. Triage and answers are always processed; the cap is on building.
