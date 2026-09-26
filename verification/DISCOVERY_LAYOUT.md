# Discovery layout and language checks

## Automated checks

- 2026-09-17: `node check-discover.cjs` passed **7/7**, using isolated SQLite fixtures. Cases include pagination across 25 visible items, all 14 categories and four groups, multiple-category membership, unclassified goods, search/filter intersections, literal search characters, zero results, cancellation exclusion, live illustrated carousel items, price/photo metadata, private-data exclusion and invalid queries. See `discover-tests.json`.
- `node frontend-app/check-i18n.cjs` passed **7/7** for preference persistence, storage failure, reactive labels/errors, category coverage, parameter preservation, formatting locale and localized validation. See `i18n-tests.json`.
- The production frontend build succeeded. No coursework test or fixture was edited for these features. Previous original-test limitations remain documented in `TEST_NOTES.md`.

## Browser checks

The language update was checked with a temporary database and synthetic accounts: language preference survived refresh; switching preserved a partially completed listing and selected category; a saved draft retained its original text; login errors changed language without resubmitting. Profile editing, registration, cancellation confirmation and bid records showed translated interface text and localized dates.

The discovery layout was checked on the running site through read-only browsing. No real account, bid, photo or listing was modified during these checks.

- Three columns at desktop widths, including 1280 px; 390 px mobile view without horizontal overflow. Mobile exposes a category selector and two-column group cards.
- Right-hand Models & building selected six matching items; left-hand Model cars selected one, with matching heading and count.
- Clear filters restored the complete catalogue; the second page displayed the remaining items and a no-match search showed the empty state.
- Automatic rotation changed the featured link; manual dots/next changed the selected slide, and explicit pause held the item after focus moved outside the carousel.
- Clicking the featured Moonbean item opened its real detail page.
- Chinese and English navigation, category groups, controls and counts remained usable.

Groups overlap when an item has categories in more than one group. Counts include visible ended auctions; cancelled listings are excluded, while the carousel contains only live illustrated items. These checks do not constitute a full browser compatibility or load test.

## Follow-up: 2026-09-18

Public discovery now excludes both ended and cancelled auctions, and visible pages update automatically. The earlier 25-item pagination example above describes the September 17 behavior. Current API coverage is 9/9 against 24 initial open fixtures, including real publication, expiry and history retention. See `LIVE_UPDATES.md` and the updated `discover-tests.json`.
