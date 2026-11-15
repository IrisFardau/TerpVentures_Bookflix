# Bookflix development plan

## 1. Goal

A Dutch-language website with a streaming-service look that shows books which were made into a film or TV series. It should encourage young people (assumed 12 to 18) to read, starting from what they already watch.

Prototype scope: 10 popular books, a home page with cover carousels, and a detail page per book with a spoiler-free description of what the book adds to the film or series, plus a link to the book on bibliotheek.nl.

Out of scope for the prototype: search, accounts, a CMS, a backend, hosting.

## 2. Status

Each stream updates only its own rows.

| Phase | Stream | Branch | Depends on | Status |
|---|---|---|---|---|
| 0 Plan | joint | `main` | none | Done |
| 1R Site shell | R | `phase-1r-site-shell` | 0 | In review |
| 1I Data tooling | I | `phase-1i-data-tooling` | 0 | In review |
| 2R Home page and carousels | R | `phase-2r-home-carousels` | 1R, 1I | In review |
| 2I Detail page | I | `phase-2i-detail-page` | 1R, 1I | In review |
| 3R Home page polish | R | `phase-3r-home-polish` | 2R, 2I | Not started |
| 3I Detail page polish | I | `phase-3i-detail-polish` | 2R, 2I | Not started |
| 4 Prototype release | joint | `phase-4-release` | 3R, 3I | Not started |

```
0 Plan ──┬─> 1R ─┬─> 2R ─┬─> 3R ─┬─> 4 Release
         └─> 1I ─┘─> 2I ─┘─> 3I ─┘
```

Within a phase, R and I run in parallel and touch no common files. A phase starts only when **both** streams of the previous phase are merged to `main`.

## 3. Technical approach

**Stack.** Plain HTML, CSS and JavaScript ES modules. No framework, no build step, no Node.js. Book data lives in JSON files that the pages load with `fetch`. Python is used only for the local server and helper scripts (standard library only).

**Run locally.** From the repo root:

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening the HTML files directly from disk does not work, because `fetch` is blocked on `file://`.

**Directory layout.**

```
index.html                 home page (hero + carousels)
boek.html                  detail page, opened as boek.html?id=<book-id>
css/tokens.css             colours, type scale, spacing (dark media-library theme)
css/base.css               reset, header, footer, shared components
css/home.css               hero and carousels
css/detail.css             detail page
js/data.js                 loads the catalogue and book files
js/carousel.js             carousel component
js/home.js                 builds the home page
js/detail.js               builds the detail page
data/catalog.json          carousel rows and the featured book
data/books/<book-id>.json  one file per book
assets/covers/<book-id>.jpg
assets/placeholder-cover.svg
tools/validate_books.py    checks the data against the contract
tools/fetch_covers.py      downloads covers by ISBN
docs/DEVELOPMENT_PLAN.md   this plan
docs/CONTENT_GUIDE.md      how to write the Dutch book texts
README.md                  how to run and test locally
```

One file per book is what lets both streams write content at the same time without merge conflicts.

**Language.** All text visible on the site is Dutch (`<html lang="nl">`). Code, JSON keys, commit messages and docs are English.

## 4. Data contract

This contract is the interface between the two streams. Changing it requires agreement from both and an update to this section.

`data/books/<book-id>.json`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Same as the filename, lowercase with hyphens |
| `title` | string | yes | Title of the edition the ISBN belongs to, as listed on bibliotheek.nl |
| `subtitle` | string | no | |
| `originalTitle` | string | no | Only when the edition title is a translation |
| `series` | string | no | Dutch, for example "Heartstopper, deel 1" |
| `author` | string | yes | |
| `isbn` | string | yes | ISBN-13, digits only, from bibliotheek.nl. Dutch edition where one exists |
| `publisher` | string | yes | |
| `year` | number | yes | Year of this edition |
| `language` | string | yes | "Nederlands" or "Engels" |
| `cover` | string | yes | Local path `assets/covers/<id>.jpg`, downloaded from the bibliotheek.nl catalogue |
| `format` | `"roman"` or `"graphic novel"` | yes | |
| `genres` | string[] | yes | Dutch genre names, used for carousel rows |
| `pages` | number | yes | Max 350 |
| `length` | `"kort"` or `"middel"` | yes | `kort` under 200 pages, `middel` 200 to 350 |
| `readingTimeMinutes` | number | yes | Estimate: 1 min per page (roman), 0.5 min per page (graphic novel), rounded to 15 |
| `age` | string | yes | For example "12+" |
| `contentWarnings` | string[] | yes | Dutch, lowercase. Empty array when none |
| `adaptation.type` | `"film"` or `"serie"` | yes | |
| `adaptation.title` | string | yes | Title of the film or series as known in the Netherlands |
| `adaptation.year` | number | yes | |
| `adaptation.platform` | string | yes | "Netflix" for this set |
| `adaptation.note` | string | no | For example when the adaptation is only inspired by the book |
| `teaser` | string | yes | Dutch, spoiler-free, what the book is about (15 to 60 words) |
| `extraTeaser` | string | yes | Dutch, spoiler-free, what the book offers beyond the film or series (15 to 60 words) |
| `links` | object[] | yes | Where to get the book, `{ "label": "Bibliotheek", "url": "https://..." }`. Starts with the bibliotheek.nl title page; more can be added later |

`tools/validate_books.py` checks the types and required fields above, the ISBN-13 check digit, unknown fields (typos), that the filename matches `id`, and that every id in the catalogue has a file. With `--strict` it also checks the content rules from section 5 and `docs/CONTENT_GUIDE.md`: at most 350 pages, `length` and `readingTimeMinutes` match `pages`, `teaser` and `extraTeaser` are 15 to 60 words, the cover is a JPEG at `assets/covers/<id>.jpg`, the first link is the bibliotheek.nl title page, `adaptation.platform` is "Netflix", two or three genres with "Graphic novel" first for a graphic novel, lowercase content warnings, and that each book is in the right catalogue rows. Style hints (empty praise, possible spoilers, new genres, unused covers, short/medium balance) are warnings that don't fail the run. All ten book files pass `--strict`.

`data/catalog.json`:

```json
{
  "featured": "<book-id>",
  "rows": [
    { "title": "Bekend van Netflix", "books": ["<book-id>", "..."] }
  ]
}
```

`js/data.js` exposes `loadCatalog()`, `loadBook(id)` and `loadAllBooks()`. A book file that is missing or invalid is skipped with a console warning, so the site keeps working while content is still being added.

## 5. Open questions and how they are handled

**Book covers.** `tools/fetch_covers.py` downloads each cover once and stores it in `assets/covers/<id>.jpg`, so the site never depends on an external service at runtime. Sources, in order:
1. bibliotheek.nl: the cover shown on the book's title page (the `links` entry for bibliotheek.nl). These images are signed, short-lived URLs on `leibniz.zbkb.nl`, which is why they are downloaded rather than linked.
2. Open Library Covers API: `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false` (redirects to archive.org).
3. No result: the script lists the book, the site shows `assets/placeholder-cover.svg`, and the cover is added by hand.

Run `python tools/fetch_covers.py` for missing covers, `--force` to download all again, or pass book ids to limit it. The network must allow `www.bibliotheek.nl` and `leibniz.zbkb.nl` (and `covers.openlibrary.org` plus `archive.org` for the fallback).

Covers are copyrighted. Using them in a local prototype is low risk, but permission and source must be checked before the site goes public (phase 4 decision).

**bibliotheek.nl links.** The library link is stored per book as the first entry in `links`, as a complete URL to the book's title page: `https://www.bibliotheek.nl/catalogus/titel.<ppn>.html`. Find it by searching `https://www.bibliotheek.nl/catalogus.html?q=<title author>` and opening the right edition. `docs/CONTENT_GUIDE.md` (phase 1I) describes this step.

**The 10 books.** All based on a Netflix film or series, for readers 12 to 18, half short (under 200 pages) and half medium (200 to 350 pages). Title, ISBN, publisher, pages and cover come from the bibliotheek.nl catalogue (checked November 2026). Dutch editions where the library has one; three books are only available in English.

| Book id | Edition (bibliotheek.nl) | Lang. | Pages | Adaptation (Netflix) |
|---|---|---|---|---|
| `de-kleine-prins` | De kleine prins, Antoine de Saint-Exupéry (Ad. Donker 2024) | NL | 107 | Film, 2015 |
| `het-ellendige-eerste-boek` | Het ellendige eerste boek, Lemony Snicket (Lannoo 2017) | NL | 151 | Series, 2017 |
| `locke-and-key-welcome-to-lovecraft` | Locke & Key: Welcome to Lovecraft, Joe Hill & Gabriel Rodríguez (IDW 2020) | EN | 158 | Series, 2020 |
| `enola-holmes-the-case-of-the-missing-marquess` | The Case of the Missing Marquess, Nancy Springer (Hot Key 2020) | EN | 167 | Film, 2020 |
| `the-umbrella-academy-apocalypse-suite` | The Umbrella Academy: Apocalypse Suite, Gerard Way & Gabriel Bá (Dark Horse 2008) | EN | 184 | Series, 2019 |
| `matilda` | Matilda, Roald Dahl (De Fontein Jeugd 2022) | NL | 206 | Film, 2022 |
| `thirteen-reasons-why` | Thirteen reasons why, Jay Asher (Lemniscaat) | NL | 232 | Series, 2017 |
| `arsene-lupin-gentleman-inbreker` | Arsène Lupin, gentleman-inbreker, Maurice Leblanc (Oevers 2021) | NL | 234 | Series, 2021 (inspired by) |
| `heartstopper-1` | Heartstopper deel 1, Alice Oseman (Van Goor 2021) | NL | 263 | Series, 2022 |
| `aan-alle-jongens-van-wie-ik-hield` | Aan alle jongens van wie ik hield, Jenny Han (Rainbow 2021) | NL | 319 | Film, 2018 |

Content ownership for reviews in phases 2 and 3: stream R owns the five short books, stream I the five medium books.

Sweet Tooth was dropped because bibliotheek.nl does not have it. Cover images on bibliotheek.nl are signed, short-lived URLs, so they are downloaded once into `assets/covers/` rather than linked. Copyright of the covers still needs a decision before the site goes public (phase 4).

## 6. Workflow for every phase

1. Update `main`, then create the phase branch from it (names in the status table).
2. Build the phase. Stay inside the files listed for your stream.
3. Test locally: run the server, walk through the acceptance checks of the phase, run `python tools/validate_books.py`.
4. Code review of the branch diff against `main` (`/code-review` in Claude Code). Fix the findings or record why not.
5. Update this plan on the same branch: your row in the status table, plus any deviations or decisions in your phase section.
6. Push the branch and open a pull request to `main` on GitHub. The other developer reviews and merges. If `main` moved, rebase first.

Nothing is committed directly to `main` after phase 0. The GitHub CLI is not installed, so pull requests are opened in the GitHub web interface.

## 7. Phases

### Phase 1: Foundation

Both streams depend only on this plan and can start immediately.

**1R Site shell** (`phase-1r-site-shell`)
- Files: `index.html`, `boek.html`, `css/tokens.css`, `css/base.css`, `js/data.js`, `assets/placeholder-cover.svg`, `README.md`, `.gitignore`.
- UI: page shells with shared header and footer, the dark streaming theme as CSS variables, Dutch interface text.
- Data loading: `js/data.js` as described in the data contract, including skipping missing book files.
- Already done in PR #1: `data/catalog.json` and all ten book files with covers.
- README: how to run and test locally.
- Acceptance: both pages load on localhost with header and footer; the browser console lists the ten loaded books; renaming one book file makes the console warn about it while the pages keep working.

*1R notes (decisions and deviations):*
- Header and footer markup is duplicated as static HTML in `index.html` and `boek.html`. With no build step there are no includes, and static markup works without JavaScript. Keep the copies in sync; `python tools/check_shell.py` reports any page whose header or footer differs (apart from `aria-current`).
- Visual style: the first theme (near-black with a red accent) looked too much like Netflix. It was replaced with a theme inspired by the Jellyfin media player: charcoal surfaces (`#101010` to `#303030`), blue accent `#00a4dc`, a purple-to-blue brand gradient (`#aa5cc3` to `#00a4dc`) used only for the logo mark and the placeholder cover, a translucent blurred header with tab-style navigation (accent underline on the current page), rounded corners, and `.section-title` for row headings. The logo is an original open-book mark, not Jellyfin's. Phase 2 and 3 styles should use the tokens in `css/tokens.css` rather than new colours.
- Both pages have a small inline module script that calls `js/data.js` and logs to the console. Phase 2 replaces it with `js/home.js` and `js/detail.js`.
- `js/data.js` also rejects ids that don't match `^[a-z0-9]+(-[a-z0-9]+)*$` before fetching, and checks the required fields and value types of the data contract in section 4 (including the ISBN-13 check digit). Word counts, the page limit and whether the cover file exists are left to `validate_books.py`. Results are cached per id. `loadAllBooks()` returns a `Map<id, book>` in catalogue order. `loadCatalog()` throws when the catalogue can't load, because no page works without it.
- Book list and catalogue: while 1R was in progress, `main` replaced the original ten books with the Netflix set from section 5, including all ten book files, covers and `data/catalog.json` (featured `heartstopper-1`; rows "Bekend van Netflix", "Kort & krachtig", "Lekker doorlezen", "Graphic novels"). 1R took those over and dropped its own four placeholder book files (`harry-potter-steen-der-wijzen`, `de-hongerspelen`, `oorlogswinter`, `duin`). So the console now lists all ten books as loaded rather than warning about missing I books.
- `assets/placeholder-cover.svg` shows a generic book icon and the logo, not the book title. A static SVG can't show a different title per book, so 2R and 2I put the title over it in HTML. With all covers present it is only a fallback for an image that fails to load.
- `tools/__pycache__/` is in `.gitignore`; the compiled file committed on `main` was removed from the repo.

**1I Data tooling** (`phase-1i-data-tooling`)
- Files: `tools/validate_books.py`, `docs/CONTENT_GUIDE.md`.
- Already done in PR #1: `tools/fetch_covers.py` and all ten book files with covers.
- `validate_books.py`: checks every book file against the contract, that the filename matches `id`, and that catalogue ids resolve to a file; with `--strict` also the checks listed under the data contract. Exit code 1 on errors.
- `CONTENT_GUIDE.md`: tone for the target group, the spoiler-free rule, how to write `teaser` and `extraTeaser` (15 to 60 words, `extraTeaser` about what the book adds), choosing `age` and `contentWarnings`, the reading-time formula, and how to find the edition, ISBN and link on bibliotheek.nl.
- Acceptance: the validator passes on all ten books, also with `--strict`, and fails with a clear message on a deliberately broken file.

*1I notes (decisions and deviations):*
- 1I was built on the branch `claude/charming-mayer-xmj84x` instead of `phase-1i-data-tooling`, together with the book data and the plan updates for the new contract.
- The teaser limit is 15 to 60 words instead of the 40 to 70 first written in section 4: several texts are shorter than 40 words, and short suits the target group. The minimum went from 30 to 15 in 2I, when the Heartstopper `extraTeaser` was cut to its last sentence (21 words) at the owner's request.
- `validate_books.py` has three levels: contract errors (always), content errors (`--strict`) and warnings (never fail). Rules that need judgement, like spoilers and empty praise, are warnings based on word lists in the script; they help a reviewer but don't replace one.
- The validator has a hidden `--root <dir>` option to run it on a copy of `data/` and `assets/`. The acceptance test used it on copies with a broken JSON file, a wrong ISBN check digit, too many pages, a missing cover, a non-JPEG cover, a wrong `id`, an unknown field and catalogue mistakes; each gave a clear error and exit code 1.
- The content guide is in English like the other docs, with Dutch examples.

### Phase 2: Core features

Both streams depend on 1R **and** 1I being merged: the UI needs the shell and data loader from 1R, the content needs the tools and guide from 1I.

**2R Home page and carousels** (`phase-2r-home-carousels`)
- Files: `index.html`, `css/home.css`, `js/carousel.js`, `js/home.js`.
- UI: hero banner for the featured book (cover, title, `teaser`, button "Bekijk boek"); one carousel per catalogue row with cover and title per book; horizontal scrolling with arrow buttons, touch and keyboard; hover effect; each card links to `boek.html?id=<id>`; placeholder cover when an image is missing.
- Content: review the `teaser` texts of the five R books against the content guide.
- Acceptance: all rows render from `catalog.json`; arrows scroll; every card opens the right detail URL; `validate_books.py --strict` passes.

*2R notes (decisions and deviations):*
- Content: reviewed the `teaser` texts of the five short books against `docs/CONTENT_GUIDE.md`. All are within 15 to 60 words (30 to 60 at the time of the review), follow the who / what changes / question shape and contain no spoilers. Fixed one sentence in *The Umbrella Academy*: "net als de wereld …" (which reads as "just like") became "precies op het moment dat de wereld dreigt te vergaan", and "tot superheldenteam" got its article.
- `validate_books.py --strict` passes for all ten books with no errors or warnings.
- Hero: blurred cover as backdrop, cover, badge "Bekend van de Netflix-serie (2022)", title, a line with author, pages, reading time and age, the teaser, and the button "Bekijk boek". If the featured book can't load, the hero is left out and the rows still render.
- Cards show the book title plus the adaptation, for example "Film: Enola Holmes", because the film or series title is often what readers recognise.
- Carousels: native horizontal scrolling (touch and trackpad work without extra code) with scroll snapping. The arrow buttons sit next to the row heading, as in media-library apps, and scroll about one screen. They are hidden when a row fits on screen and use `aria-disabled` at the ends, so keyboard focus is not lost. Each row is one Tab stop (roving tabindex); Left/Right arrow keys, Home and End move between the cards of a row, and a visually hidden hint tells screen-reader users so. Keys with Alt, Ctrl, Meta or Shift are left to the browser. Smooth scrolling is turned off with reduced motion.
- `js/dom.js` holds the shared helpers `el`, `createCover` (2:3 cover with the placeholder and title on top when the image fails) and `detailUrl`, so 2I and 3I can use them without importing the carousel. `js/carousel.js` exports `createCarousel(title, books)`, which returns `{ element, destroy }`; call `destroy()` before discarding a row that may be rebuilt (for example "Meer zoals dit").
- A row whose books all fail to load is skipped with a console warning. If the catalogue itself can't load, the page shows a Dutch error message.
- Covers in the carousels use `loading="lazy"`; the hero cover loads eagerly.
- README is not in the 2R file list, so it was left unchanged. It still describes the pages correctly; `js/home.js` and `js/carousel.js` can be added to its layout table in phase 4.
- Tested in Edge (headless, real time) at 1200 px and 360 px wide: no horizontal page scroll, arrow states at both ends, keyboard navigation, all detail links, placeholder fallback, and with `prefers-reduced-motion`.
- Code review: fixed the loading message showing without JavaScript, rendering errors leaving the page on "Boeken laden…", focus loss when the arrows hide on resize, a duplicated helper and a hard-coded colour. Not changed: a fallback label for unknown adaptation types (`js/data.js` already only accepts `film` and `serie`), and badge wording for platforms other than Netflix (the whole set is Netflix).
- Second code review: modifier keys no longer blocked in rows, roving tabindex, `destroy()` for the carousel's observer and listeners, scroll updates batched per frame, no layout read before the row is in the DOM, `loadAllBooks(catalog)` takes the caller's catalogue, card labels derived from the adaptation type, shared helpers moved to `js/dom.js`, and two redundant hiding rules removed.

**2I Detail page** (`phase-2i-detail-page`)
- Files: `boek.html`, `css/detail.css`, `js/detail.js`.
- UI: cover, title, author, a badge such as "Bekend van de Netflix-serie (2021)" (plus `adaptation.note` when present), genres, age, pages, reading time and language, the content warnings, the `teaser`, a section "Wat biedt het boek extra?" with `extraTeaser`, a button per entry in `links` (for example "Leen bij de Bibliotheek") that opens in a new tab, a link back to the home page, and a friendly Dutch message for an unknown or missing id.
- Content: review the `teaser` and `extraTeaser` texts of the five I books against the content guide.
- Acceptance: `boek.html?id=<id>` works for every book that has a file; an unknown id shows the not-found message; no link buttons show when `links` is empty; `validate_books.py --strict` passes.

*2I notes (decisions and deviations):*
- Built on the branch `claude/charming-mayer-xmj84x` instead of `phase-2i-detail-page`, like 1I.
- Layout: cover left and title block right from 48rem wide, stacked on phones. Order: badge ("Bekend van de Netflix-serie <title> (<year>)", with `adaptation.note` below it), title, subtitle, author, genres, `teaser`, link buttons; then "Wat biedt het boek extra?" as a highlighted card, the content warnings under "Goed om te weten", and "Over dit boek" with age, length and pages, reading time, format, language, series and original title. Publisher, year and ISBN stay in the data but are not shown. The adaptation title is in the badge because it often differs from the book title.
- A blurred copy of the cover fills the top of the page, in the spirit of the 1R media-player theme. Its URL is made absolute in JavaScript, because `url()` in a CSS custom property resolves against `css/detail.css`.
- Reading time is shown as "ca. 2 uur en 15 min". The link labelled "Bibliotheek" shows as "Leen bij de Bibliotheek"; other labels are used as written. The first link is the primary button. Only `https:` links get a button, and every value from the data is set with `textContent`, never as HTML.
- Not found: an unknown or invalid id shows "Dit boek kunnen we niet vinden", a missing id shows "Geen boek gekozen", both with a button back to the home page. Without JavaScript a `<noscript>` message shows.
- The cover is the shared `createCover` from `js/dom.js` with the class `detail-cover`, so it uses the same path, image and placeholder (with the title) as the home page. The image is decorative (`alt=""`) because the title is right next to it.
- `document.title` is set to "<title> – Bookflix" (or "Boek niet gevonden – Bookflix"). The description meta tag per book stays for 3I.
- 2R added shared helpers in `js/dom.js` (`el`, `createCover`) and `.cover` and `.badge` in `css/base.css` while 2I was in progress. `js/detail.js` uses `el` and `createCover` from `js/dom.js`, and the adaptation badge uses the shared `.badge` class.
- The phase 1 smoke-test script in `boek.html` was replaced by `js/detail.js`. `css/base.css` and `css/tokens.css` were not changed; `.btn`, `.section-title`, `.page-title` and `.lead` are reused.
- Tested in Chromium at 1280 and 390 px wide: all ten books render with no console errors and no horizontal scroll; an unknown id and a missing id show their messages; with `links` replaced by a `javascript:` URL no button shows; HTML in a title is shown as text; a missing cover shows the placeholder; tab order is skip link, logo, Home, back link, library button. `validate_books.py --strict` and `check_shell.py` pass.
- Content review of the five medium books (I) against the content guide: all texts are within 15 to 60 words and spoiler-free. The Heartstopper `extraTeaser` was shortened to "Je ontmoet Nick en Charlie zoals de bedenker ze voor het eerst tekende, met kleine momenten die in de serie net anders gaan."

### Phase 3: Polish

Both streams depend on 2R and 2I being merged. R stays on the home page files, I on the detail page files, and each reviews the other's book texts.

**3R Home page polish** (`phase-3r-home-polish`)
- Files: `index.html`, `css/home.css`, `css/base.css`, `css/tokens.css`, `js/carousel.js`, `js/home.js`, and text fixes in the five **I** book files.
- Responsive layout from phone to desktop; keyboard operation and visible focus in the carousels; alt texts; colour contrast; reduced-motion support; lazy loading of covers.
- Content review of the I books: spoilers, Dutch spelling and tone, working library links.
- Acceptance: usable at 360 px width with no horizontal page scroll; the whole home page can be operated by keyboard.

**3I Detail page polish** (`phase-3i-detail-polish`)
- Files: `boek.html`, `css/detail.css`, `js/detail.js`, `docs/TEST_CHECKLIST.md`, and text fixes in the five **R** book files.
- Responsive detail page; accessibility as in 3R; a row "Meer zoals dit" with books sharing a genre; page title and description meta tags per book; favicon.
- `docs/TEST_CHECKLIST.md`: a manual end-to-end checklist for the whole site.
- Content review of the R books.
- Acceptance: same responsive and keyboard checks as 3R, for the detail page; the checklist exists and passes.

If 3I needs a change in a shared file owned by 3R (`css/base.css`, `css/tokens.css`), it asks R to make it rather than editing it.

### Phase 4: Prototype release (joint)

Depends on 3R and 3I. One branch, `phase-4-release`, worked on together.

- `python tools/validate_books.py --strict` passes for all ten books.
- Walk through `docs/TEST_CHECKLIST.md` in two browsers and on a phone.
- Try the prototype with a few young people and record the feedback in this plan.
- Decide on: hosting (GitHub Pages works without changes), cover permissions for a public site, and the next set of books and features.
- Tag `v0.1.0` after the merge.

## 8. Verification summary

- Local server: `python -m http.server 8000`, then http://localhost:8000.
- Data: `python tools/validate_books.py --strict` (passes from phase 1I on).
- Per phase: the acceptance checks in section 7.
- Whole site: `docs/TEST_CHECKLIST.md` (from phase 3I).
