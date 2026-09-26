# Automatic marketplace updates — 2026-09-18

## Behavior

- Visible home, account and detail pages check the shared server every five seconds. Returning to the tab or reconnecting triggers a refresh; successful mutations also signal other tabs in the same browser.
- Home updates cover the complete catalogue count, fourteen category counts, four group counts, filtered/page results and up to six illustrated featured listings. New listings without a photo appear in the catalogue; the featured carousel continues to use listings with media.
- Expired and cancelled auctions are excluded from public discovery. Expiry uses the server clock and earliest end time. Account history, bids, questions, photos and item details remain stored and accessible.
- Background requests preserve visible content, applied filters, unsubmitted search text and page selection. If the last page disappears, the page is clamped to the new final page. Carousel updates preserve the current item when it remains available.
- Transient network failures retain loaded content and retry. The home and account pages display a bilingual reconnecting notice.

## Automated verification

- `node check-discover.cjs`: **9/9**. Temporary SQLite database, real Express routes, JPEG publication, inclusive category/group counts, pagination, cancellation, natural expiry, cache headers, server clock, preserved bids/details/account history, validation and empty catalogue.
- `node frontend-app/check-live-refresh.mjs`: **6/6**. Five-second polling, hidden/visible lifecycle, focus/online/storage signals, unrelated storage isolation, request coalescing, failure recovery, foreground gating, unmount cleanup and storage-blocked fallback.
- `node frontend-app/check-i18n.cjs`: **7/7**.
- Production frontend build and `git diff --check`: passed.

## Observed browser checks

Used a separate local test server on port 5188 with a temporary database and synthetic seller. No real listing or account was created, cancelled or modified during these checks.

1. Opened a home page with 14 active items, selected Models & building (4 items), left an unsubmitted search in the input and paused the carousel on Sync baseline 6.
2. Published a one-minute auction with a real JPEG through a separate HTTP client. Without navigation or manual reload, the home page showed 15 total items, Mecha count 2 and Models & building count 5. The new item appeared in the filtered list and featured dots. The input, selected group and paused active slide remained intact.
3. Let that auction naturally expire. Without a reload, total items returned to 14, Mecha to 1 and the selected group to 4. The auction disappeared from both list and carousel; the paused slide remained unchanged.
4. Opened an existing synthetic item's detail page, then cancelled it through a separate client. The open page automatically displayed the cancellation message and removed the bid action.
5. Opened the synthetic seller profile: Selling 13 and Ended / cancelled 2. Published another item from a separate client; the existing profile updated to Selling 14 and displayed the new card without a reload.
6. Restarted the normal site with preserved data and loaded the updated home page on port 5173. Public discovery reported 16 active items and no ended items. The existing responsive layout and Chinese labels displayed correctly.

The temporary browser tab and test server were closed after verification. Other clients with the old JavaScript loaded should refresh once to load the new automatic updater. Subsequent catalogue updates require no manual reload while connected.
