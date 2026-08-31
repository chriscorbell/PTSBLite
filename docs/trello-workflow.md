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
- Keep comments short. Link to a card instead of restating one.

## The lists

- **Intake (Nick starts here)**: Nick's drop zone. The pinned "📥 Drop feedback here" card is the
  intake channel and stays here permanently.
- **Blocked (Need response from Nick)**: questions waiting on Nick, one per card.
- **Ready for Chris**: split, actionable, agreed. The implementation queue, top card first.
- **In Progress by Chris**: claimed work. Claiming a card here is what stops two sessions building
  the same thing.
- **Done**: shipped and deployed. If Nick wants something changed after trying it, he raises a
  new card in Intake rather than commenting here.
- **Junked**: kept for the record — withdrawn requests, so they are not re-raised as new.

## Trello access

Use the Trello MCP tools, when the session has them, for structure: listing lists and cards,
creating, moving, and archiving. They cannot handle comments (verified 2026-08-29: `add_comment`
is rejected at runtime and reads omit comment bodies).

Comments go through the REST API with `TRELLO_API_KEY` and `TRELLO_TOKEN` from the environment.
The loop depends on comments, so if those variables are unset, stop and report that instead of
working blind. Append `key=$TRELLO_API_KEY&token=$TRELLO_TOKEN` to every query string:

```sh
# The whole board: lists with their open cards
curl "https://api.trello.com/1/boards/bWnb6qXO/lists?cards=open&card_fields=name,desc,dateLastActivity&..."
# A card's comments, newest first
curl "https://api.trello.com/1/cards/$CARD/actions?filter=commentCard&limit=50&..."
# Every comment on the board, newest first (one call, every card). Not limit=50:
# a busy day passes fifty comments, and a truncated sweep looks exactly like a
# clean board. On 2026-08-30 that hid eight of Nick's replies for half a day.
curl "https://api.trello.com/1/boards/bWnb6qXO/actions?filter=commentCard&limit=1000&..."
# Post a comment
curl -X POST "https://api.trello.com/1/cards/$CARD/actions/comments?..." --data-urlencode "text=..."
# Move to another list, or archive
curl -X PUT "https://api.trello.com/1/cards/$CARD?idList=$LIST&..."
curl -X PUT "https://api.trello.com/1/cards/$CARD?closed=true&..."
# Create a card
curl -X POST "https://api.trello.com/1/cards?idList=$LIST&..." --data-urlencode "name=..." --data-urlencode "desc=..."
```

Comment authorship: everything posted with this token shows as Chris's account, which is why
Claude signs. A comment's `memberCreator` matching `GET /1/members/me` means ours (Chris or
Claude); any other account is Nick.

## The loop

Run the steps in order. A run that finds nothing to do ends quietly.

### 1. Triage intake

New input is any card in Intake other than the pinned one, plus any comment from Nick anywhere
on the board that we have not answered. Nick comments on whatever card seems relevant to him,
not where the process would like him to, so sweep the whole board with the board-wide comments
call: every comment of his on any card, in any list, with no later reply from us, is intake. Reach
far enough back to cover every card, not just today's — the sweep returns nothing to say it was
truncated, so a short one is indistinguishable from an empty board.

Handle a swept comment where it makes sense: fold it into the card it sits on when it belongs
there, or split it out like any other input when it does not (a comment on a Done card asking
for a change becomes a new card that links back). Either way, reply on the card so the newest
comment is ours and the next run knows it is handled. The one exception: a comment on a Blocked
card is an answer, and step 2 owns those.

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

Rework on something already shipped arrives as a new Intake card, handled by step 1. When the
new card revisits a Done card, link the Done card in its description so the history travels
with it.

### 3. Keep the board honest

Fix what is wrong; leave alone what is merely improvable. Nick gets a notification for every
edit, so a quiet board beats a constantly reshuffled one. In scope:

- A card whose list no longer matches reality: a merged PR still sitting in In Progress, a
  "Question" card that no longer waits on anyone. Move it and say why in a comment only if Nick
  needs to know.
- A stale claim: a card in In Progress whose newest comment is Claude's claim, more than two
  hours old, with no open PR behind it. Return it to the top of "Ready for Chris" with a comment
  saying the earlier run died. A younger claim is a live run doing its work; leave it alone.
- Duplicates: two cards asking for the same change. Fold both descriptions into the older card,
  archive the newer with a comment pointing at the survivor.
- A description that events have overtaken (says "still to build" after it shipped, cites a
  withdrawn rule). Correct it, preserving Nick's own words as quotes.
- Ready ordered so a card never sits above one it depends on.

Never edit Done or Junked content (they are the record), never archive anything Nick wrote
without a comment linking to where it went, and never delete anything at all.

Done when every card's list, description, and position would survive Nick reading them cold.

### 4. Implement one card

Take the top card of "Ready for Chris" that is clearly actionable. A card needing a decision gets
its question instead, per step 1; take the next card.

First move the card to "In Progress by Chris" and comment "Building this now. — Claude". That
claims it — but runs can start seconds apart, so a claim is not yours until checked: re-read the
card's comments after claiming, and if a claim earlier than yours is there, back off to the next
card and leave the earlier claimant to it.

A card already sitting in In Progress belongs to another live run; leave it alone. Stale claims
are step 3's job, and it returns them to Ready rather than adopting them mid-flight.

Then the normal repository workflow from AGENTS.md: branch, implement, `pnpm run check` green,
PR titled after the card and linking it. Merge once verify is green: `gh pr checks --watch`,
then `gh pr merge --squash`. Main requires branches to be up to date, so if the merge is
rejected because another PR landed first: `gh pr update-branch`, wait for verify again, merge.

Once the PR merges (Cloudflare Pages deploys main within a few minutes), move the card to
Done and comment: what changed in Nick's terms, how to test it, and the PR link.

If the run cannot finish (verify stays red, merge not permitted), leave the card in In Progress
with a comment saying exactly where things stand, so the next run or Chris can pick it up.

One implementation card per run. Triage and answers are always processed; the cap is on building.
