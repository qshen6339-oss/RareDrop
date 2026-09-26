# Account updates — 2026-09-16

## Name editing

`node check-profile.cjs`: **6/6 passed**. See `profile-tests.json` for the recorded checks. These cover authentication and ownership, invalid/extra fields, trimmed Chinese names, seller/profile/search joins, existing bidder names, and unchanged credentials/session/ownership. Persistence is checked through a separate SQLite connection.

Browser checks used the production frontend against a temporary database, with synthetic accounts. Confirmed:

- Edit name appears on the own-profile page and opens prefilled fields.
- Save name is disabled when unchanged.
- Cancel discards a changed value; Escape closes the editor without saving.
- Saving Luna / Chen updates the heading and avatar; reloading retains the name, also displayed on the seller's listing card.
- The dialog has readable spacing, labelled inputs and distinct Cancel/Save actions in the existing purple/white style.

The running site serves the updated frontend and the PATCH endpoint returns the expected 401 for an unauthenticated request. No real account was renamed during verification.

## Cancellation

`node check-cancellation.cjs`: **10/10 passed**. See `cancellation-tests.json`. The isolated checks cover seller authorization, state changes, original records retained, rejected new bids/questions, search/profile visibility, repeat cancellation, ended auctions, concurrent bid/cancel handling and extension cleanup.

Browser checks used a temporary listing with an existing £95 bid. Keep selling and Escape left it active. Confirming cancellation displayed Cancelled, removed bidding/new-question controls, preserved the bid history without a winner and persisted after reload. The seller's Ended / cancelled tab showed the cancelled card with Last bid £95.

The original course tests after cancellation remained **120/128**, with the same eight documented fixture/expectation conflicts; independent API checks passed **18/18**. See `TEST_NOTES.md`. The targeted name tests and production frontend build also passed. These checks are not a claim of complete browser or concurrency coverage.
