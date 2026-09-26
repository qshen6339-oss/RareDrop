# Verification and original-fixture discrepancies

The application uses the provided SQLite database and unmodified course tests. The OpenAPI document was downloaded from:

https://api.swaggerhub.com/apis/XCUI/Auctionary/1.0.0

## Observed results

- Frontend production build: passed, Vite 7.1.5, Node.js 24.19.0.
- Original teaching tests: **120 passed / 128 total**, 8 failures.
- Independent API checks: **18 passed / 18 total**.
- Draft storage checks: **7 passed / 7 total**.
- Local HTML, API proxy and demo image requests returned HTTP 200.
- Browser interaction automation and screencast recording have not been completed.

Machine-readable original results are in `original-tests.json`; independent results are in `contract-tests.json`; execution dates and counts are in `summary.json`. All 128 original tests were actually executed. The original failures have not been suppressed or relabeled as passes.

## Conflict 1: two expected successful bids are below the fixture's starting price

In `backend-server/tests/data/good_item_data.json`, the first item, “Vintage camera with leather case.”, has `starting_bid: 4200`.

`test.d.bidding.js` later expects bids of **3595** and **3596** to succeed with status 201. Both are below the starting price. RareDrop returns 400 and does not insert them. The same test file expects a still lower bid to be rejected, reinforcing the intended minimum-price rule.

This causes six original failures:

1. Bid 3595 expected to succeed.
2. Bid 3596 expected to succeed.
3. Bid history expected to contain those two bids.
4. Item details expected to report current bid 3596.
5. User 2 profile expected to show that bid-on item.
6. BID status search expected to include that item for user 2.

The independent suite verifies the intended behavior with an item starting at 100: bids at 99 and 100 are rejected; simultaneous bids at 110 produce exactly one success; a later bid at 125 succeeds and updates the holder and history.

## Conflict 2: search strings are absent from fixture names

The OpenAPI `GET /search` description defines `q` as a string for searching the **name of the item**.

`test.i.search.js` expects six results for `q=and` on the first user's open items, and one result for `q=uv`. In the supplied ten item names, there are **zero** case-insensitive matches for either query. There is also no “uv” in any of their descriptions. RareDrop therefore returns an empty array for these searches.

These two tests account for the remaining two failures. Searching descriptions instead would not fix the contract: it would change the specified search field, and “and” appears in nine supplied descriptions, not six.

## What remains unchanged

- No original test file or fixture has been edited.
- No item IDs, user identities, fixture names or bid amounts are hardcoded in production business logic.
- The supplied database and backend dependency files are retained.
- The only change to the original server entrypoint is uncommenting its three designated route imports.

Before assessment, ask the module tutor whether there is an updated test/fixture set. If a revised authoritative API specification or teaching clarification changes the rule, the implementation should be aligned with it. These diagnostic findings do not guarantee a particular grade.
