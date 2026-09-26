# New designs — 2026-09-21

- Imported 28 separate demo products: two for each of the fourteen categories.
- Generated and visually inspected 28 new square PNGs with the built-in image tool, using the original three products as style references. Original generation files are preserved; project copies and exact prompts are listed in `IMAGE_CREDITS_NEW_COLLECTIONS.json`.
- `node check-new-designs.cjs`: 5/5 passed using a temporary database. Checks cover unique artwork and frontend mapping, two items per category, distinct future deadlines within one year, real category/group/carousel responses and idempotence without changing existing items.
- Live import preserved all 67 previous item rows, previous category/media associations, user accounts, bids and questions. A SQLite backup was saved before import. Import evidence is in `new-designs-2026-09-21.json`.
- Live API verification: 28 additions present; two per category across all fourteen category filters; four group filters include respectively 6, 6, 8 and 8 additions; featured carousel data includes new designs. All 28 PNG URLs return HTTP 200 and byte-identical images to the saved artwork. Public catalogue total was 86 at verification time.
- New auction deadlines range from 2026-10-04 to 2027-09-21. Restarting reported zero additional inserts and kept existing deadlines.
- Fixed an existing stray character and split identifier in `i18n.js` that blocked the build. `frontend-app/check-i18n.cjs`: 7/7 passed. Vite production build passed and the normal preview starts successfully at `http://127.0.0.1:5173/`.

This batch's verification covers generated image inspection, database preservation, real HTTP catalogue/filter/media results, language checks and the production build. No new browser interaction or viewport regression pass was performed for this content-only addition.
