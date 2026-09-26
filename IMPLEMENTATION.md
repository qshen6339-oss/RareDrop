# RareDrop implementation notes

## Architecture

Vue 3 and Vue Router form a separate frontend. The browser calls `/api`, which Vite proxies to the original Express server on port 3333. The API paths on the backend have no `/api` prefix. Hash routing makes page navigation work without server-side route rewrites. Build/preview uses Vite's native configuration loader to avoid configuration-bundling filesystem problems in the current Windows sandbox.

The original `database.js`, backend dependency manifest, backend dependency lockfile, tests and fixtures are retained. The supplied `server.js` enables the three route imports and supports configurable port/bind address for local and LAN previews. Business logic is inside `app/`.

## Coursework API coverage

| Method | Path | Frontend use |
|---|---|---|
| POST | /users | Register |
| POST | /login | Sign in |
| POST | /logout | Sign out |
| GET | /users/:user_id | My collection and seller/bidder profiles |
| GET | /search | Discover, query, pagination and category filtering |
| POST | /item | Publish a listing |
| GET | /item/:item_id | Details and current price |
| POST | /item/:item_id/bid | Place a bid |
| GET | /item/:item_id/bid | Bid history |
| GET | /item/:item_id/question | Questions |
| POST | /item/:item_id/question | Ask the seller |
| POST | /question/:question_id | Seller answer/update |

`GET /search` supports the specified `q`, `status`, `limit` and `offset`. `q` searches the **name**, as specified by the downloaded OpenAPI description. BID selects items the authenticated user has bid on; OPEN selects the user's active listings; ARCHIVE selects their closed listings. Status search without a valid session returns 400, matching the course tests. Default limit is 20, maximum 100, offset minimum 0.

## Authentication, validation and bidding

Passwords use Node's asynchronous scrypt with random per-account salts. Plain passwords are never stored. Random 32-byte session tokens are stored in the supplied session column and sent through the required `X-Authorization` header. Logging in again reuses an active token; logout clears it. The UI stores the session in sessionStorage and removes it after a 401 response.

Joi rejects missing/blank required values, unexpected fields and invalid numeric ranges. Registration requires an 8–30-character password with uppercase, lowercase, numeric and symbol characters. All queries with user input use parameter bindings. Search escapes SQL LIKE wildcards so query text is literal. Vue renders user text with escaped interpolation, not raw HTML.

Amounts are integer whole yuan (CNY) in this demo, and timestamps are Unix milliseconds. A new bid must be strictly greater than the displayed current price (the starting price if there are no bids). All write transactions run through a connection-level queue and `BEGIN IMMEDIATE`. The price is re-read inside the same transaction before inserting, so competing equal bids cannot both succeed. Sellers cannot bid on their own listings. Expired auctions reject new bids.

Details refresh approximately every 15 seconds while the document is visible. The backend always validates the latest state even if the browser's displayed price is old. No realtime socket server is required.

## Extensions

### Profanity filter

New item names/descriptions and new questions are normalized with Unicode NFKC and checked with case-insensitive whole-word matching. Rejected content gets a helpful 400 response. Whole-word matching avoids false positives on innocent substrings such as “Scunthorpe.” This is a small English-language filter for the coursework, not comprehensive multilingual moderation.

### Multiple categories

`categories` stores category definitions; `item_categories` is a many-to-many association with a composite primary key. New item requests can include optional `category_ids`, and search accepts optional `category_id`. Invalid categories fail the complete transaction without leaving a partial item.

Additional endpoints:

- `GET /categories`
- `GET /item/:item_id/categories`
- `PUT /item/:item_id/categories` (seller-only, atomic replacement)

The category system uses additional tables without changing the original four table definitions. A cleanup trigger protects extension associations if the provided wipe script deletes items using another SQLite connection with foreign-key enforcement off.

### Browser-local drafts

`drafts.js` stores snapshots under `raredrop-drafts-v1-<user_id>`. A draft has a random ID, saved form data and update time. Saving an existing draft replaces it without duplicating it. Drafts can be incomplete; publishing uses backend validation. A successful publication removes its draft. If removal fails, the user is told the auction was published and the remaining local draft needs attention.

Quota errors and corrupted JSON are reported without replacing existing stored data. Drafts stay on the browser/device and are not sent to the API until publication. Separate browser profiles and different devices do not share them.

## Cover photo uploads and demo media

The original course API remains unchanged. The additional `POST /item-with-photo` accepts the same listing fields plus `photo`, a JPEG data URL, with `Content-Type: application/vnd.raredrop.item+json`. A route-specific 2 MB JSON parser handles this media type without changing the supplied server's 100 KB parser or original POST /item behavior. All validation, authentication, profanity and category checks are shared with text-only creation. The item, category associations and image BLOB are inserted in one transaction, so a failed image write rolls everything back.

The browser accepts one JPG, PNG or WebP up to 10 MB, decodes it, resizes to a maximum 1600-pixel edge, and re-encodes to JPEG at most 1 MB. This removes source metadata; transparent pixels receive a white background. Oversized dimensions, unreadable files and unsupported types show an error while retaining form input. Re-encoding is asynchronous; save/publish is disabled until it finishes. Photo data and the display filename are included in browser-local draft snapshots, with quota failures preserving the previous saved draft. Draft IDs use a getRandomValues fallback on HTTP LAN previews where randomUUID is unavailable.

The backend validates base64, JPEG file markers, dimensions and size. It does not run a full image decoder; the browser is responsible for decoding and re-encoding the chosen source file. `item_photos` stores the BLOB with an item foreign key and a cleanup trigger compatible with the teaching wipe script. `GET /item/:item_id/photo` returns the stored bytes as image/jpeg with nosniff and a restrictive CSP. Upload filenames never become filesystem paths. There are no loose upload files or new package dependencies.

`GET /item/:item_id/media` returns a relative photo_url for uploaded photos, or a whitelisted original artwork image_key for seeded demo items. The frontend only resolves matching item-photo paths against its API base. Lists, profiles and details all use this media resolver. Listings without a photo retain the explicit no-photo state. Original item/search response fields remain unchanged.

Generated images and the exact prompts are documented in `IMAGE_CREDITS.txt`. DM Sans and Space Grotesk are bundled locally with their SIL Open Font License files in `frontend-app/public/fonts/`. Interface icons come from Lucide (ISC license); Vue, Vue Router, Express and Vite retain their package licensing. Original starter attribution remains in the supplied files.

## Seller cancellation

`POST /item/:item_id/cancel` requires the authenticated seller and an auction that has not naturally ended. Cancellation is recorded atomically in the extension table `item_cancellations`, preserving the original item, end date, bids, questions and photos. Repeating a successful cancellation returns success without duplicating the record. A cleanup trigger handles the teaching wipe script, including connections with foreign keys disabled.

`GET /item/:item_id/status` returns OPEN, ENDED or CANCELLED with an optional cancellation timestamp. Existing item/search response shapes remain unchanged. Cancelled items disappear from default and OPEN searches and appear in the seller's ARCHIVE / Ended / cancelled list. The bidder's history still includes them. Bid and question creation check cancellation within their write transactions. The UI confirms cancellation, distinguishes it from a completed auction and does not present a winning bid for a cancelled listing.

## Editing profile names

`PATCH /users/:user_id` requires a valid session belonging to that user. Its body contains only `first_name` and `last_name`; both are required, trimmed and limited to 50 characters. Unexpected fields are rejected. It updates those two columns atomically and returns only the user ID and names. Email, password, session, auction ownership and bid records are preserved. Existing joins retrieve the new names for profiles, sellers and bidders without copying names into historical records.

The own-profile Edit name button opens a labelled native dialog with prefilled fields, Cancel and Save name. Empty or unchanged names cannot be submitted; saving disables repeated submissions and errors stay beside the form. A successful save updates the heading/avatar and reloads the visible listing details. Escape and Cancel discard unsaved edits. `check-profile.cjs` verifies the actual routes with an isolated database; `check-cancellation.cjs` does the same for cancellation.

## Bilingual interface and marketplace discovery

`i18n.js` holds a reactive locale, with English source keys and a Chinese dictionary. Selection is stored under `raredrop-language`, with browser-language fallback and safe handling of blocked storage. Translations are evaluated during rendering; language changes do not remount routes or discard form fields. Dates and countdowns use the selected locale; CNY remains the auction currency in both languages and is displayed with the ¥ symbol. User-authored text is not translated. Known server error messages and Joi validation messages are localized at display time without changing backend response contracts. The switch to CNY on 2026-09-21 retained existing numeric prices and bids without exchange-rate conversion.

The desktop home page uses a category sidebar, a featured carousel and four group cards. The added read-only `GET /discover` accepts `q`, `category_id`, `group`, `limit` and `offset`, returning complete card metadata, total counts, category/group definitions and up to six featured items. It uses three database queries instead of separate detail/media/category requests for each card. The original `/search` interface is retained. Counts cover all open, non-cancelled items, not just the current page. Ended listings are excluded from every public discovery result without deleting their database records or auction history. Multi-category membership is inclusive, so group counts can overlap. Items with no recognized category remain in Extras & editions.

The catalogue uses in-memory filtering of metadata from SQLite, suitable for this local coursework dataset; large catalogues would need SQL aggregation/filtering and cached featured queries. Image BLOBs and private account fields are not included in catalogue responses. Featured items must be open and have media. The browser also removes expired slides as its clock updates. Automatic rotation is every five seconds, with hover/focus/visibility pauses, an explicit pause button, manual arrows/dots and reduced-motion support. Manual navigation pauses rotation until the user resumes it. All slides link to the real item detail page.

## Scope and validation limits

This is a local coursework prototype. It implements the given account and auction API plus single-cover image uploads; it does not provide production payment, delivery, dispute handling or a scalable media service. Images grow the local SQLite database and are public wherever their listings are accessible. Source ZIPs exclude the runtime database, including uploaded photos. Supplied tests remain unchanged. `check-photos.cjs` uses actual Express routes and a temporary database to verify authenticated publication, binary retrieval, compatibility, limits, rollback and cleanup. See verification reports for observed results and fixture conflicts.

## Automatic updates

Visible discovery, account and detail pages refresh every five seconds using `useLiveRefresh.js` and `liveRefresh.mjs`. Successful mutations signal local tabs; other devices poll the server. Focus, visibility and online events trigger refresh, while hidden pages suspend it. Request guards prevent overlaps and stale filter responses. Background refresh preserves current content, filters, page selection and unfinished input. Failed updates retry automatically. The carousel preserves its current item by ID.

Discovery exposes `server_time` and `next_expiry` with `Cache-Control: no-store`. The page aligns its clock, hides expired cards/slides and refreshes counts at expiry. Cancelled listings leave public discovery on the next refresh. The original `/search` contract, database records, bids and account history are preserved. Tests and observed browser behavior are documented in `verification/LIVE_UPDATES.md`.

## Annual collection batch (2026-09-18)

`seed-year-collections.js` imports three separate collector copies per category (42 total) under the existing demo seller. It reuses the fourteen image keys from `seed-collections.js`, interleaves categories across three rounds, and spaces all 42 end dates from first import up to its one-year anniversary. All inserts and media/category associations share one transaction. Fixed copy names and creator checks make the batch idempotent; existing auctions and end dates are preserved. The main seed invokes it so clean installations also receive the batch. `check-year-collections.cjs` validates count, date boundaries, asset existence and repeat-run preservation using a temporary database. The live import was confirmed through `/discover` and the already-open home page, with 58 active listings after the addition.

## New collectible designs (2026-09-21)

`seed-new-designs.js` reads 28 product specifications from `IMAGE_CREDITS_NEW_COLLECTIONS.json` and adds exactly two per category. Each has its own newly generated PNG, subject, description, price and image key. The frontend extends its media whitelist through `new-product-images.json`; existing cards, detail pages and carousel use the same image resolver. Discovery therefore includes new items and counts through its existing refresh path without a separate display dataset.

Artwork existence and allowed paths are checked before any insertion. All items and associations are inserted in one transaction; fixed names and the demo seller make repeat imports idempotent. End dates are evenly spread from the first import to its UTC one-year anniversary. Existing records and deadlines are unchanged. The standard seed invokes this importer after the previous collection batches.

`check-new-designs.cjs` verifies distinct new image bytes, square dimensions, image-key mappings, category counts, date boundaries, real discovery responses and repeat-run preservation in an isolated temporary database. The live import preserved 67 existing items and account/bid/question data, then verified all 28 new image URLs and category/group filter responses. An existing stray-character syntax error in `i18n.js` was repaired during startup; the 7 language checks and production build passed. See `verification/NEW_DESIGNS.md` for observed results and scope.
