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
| 1R Site shell | R | `phase-1r-site-shell` | 0 | Not started |
| 1I Data tooling | I | `phase-1i-data-tooling` | 0 | Not started |
| 2R Home page and carousels | R | `phase-2r-home-carousels` | 1R, 1I | Not started |
| 2I Detail page | I | `phase-2i-detail-page` | 1R, 1I | Not started |
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
css/tokens.css             colours, type scale, spacing (dark streaming theme)
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
| `teaser` | string | yes | Dutch, spoiler-free, what the book is about (40 to 70 words) |
| `extraTeaser` | string | yes | Dutch, spoiler-free, what the book offers beyond the film or series (40 to 70 words) |
| `links` | object[] | yes | Where to get the book, `{ "label": "Bibliotheek", "url": "https://..." }`. Starts with the bibliotheek.nl title page; more can be added later |

`tools/validate_books.py` checks the types and required fields above. With `--strict` it also checks that `teaser` and `extraTeaser` are 40 to 70 words, that the cover file exists, that `length` matches `pages`, and that `links` has at least one entry. All ten book files already meet the contract (see [PR #1](https://github.com/IrisFardau/TerpVentures_Bookflix/pull/1)).

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

**1I Data tooling** (`phase-1i-data-tooling`)
- Files: `tools/validate_books.py`, `docs/CONTENT_GUIDE.md`.
- Already done in PR #1: `tools/fetch_covers.py` and all ten book files with covers.
- `validate_books.py`: checks every book file against the contract, that the filename matches `id`, and that catalogue ids resolve to a file; with `--strict` also the checks listed under the data contract. Exit code 1 on errors.
- `CONTENT_GUIDE.md`: tone for the target group, the spoiler-free rule, how to write `teaser` and `extraTeaser` (40 to 70 words, `extraTeaser` about what the book adds), choosing `age` and `contentWarnings`, the reading-time formula, and how to find the edition, ISBN and link on bibliotheek.nl.
- Acceptance: the validator passes on all ten books, also with `--strict`, and fails with a clear message on a deliberately broken file.

### Phase 2: Core features

Both streams depend on 1R **and** 1I being merged: the UI needs the shell and data loader from 1R, the content needs the tools and guide from 1I.

**2R Home page and carousels** (`phase-2r-home-carousels`)
- Files: `index.html`, `css/home.css`, `js/carousel.js`, `js/home.js`.
- UI: hero banner for the featured book (cover, title, `teaser`, button "Bekijk boek"); one carousel per catalogue row with cover and title per book; horizontal scrolling with arrow buttons, touch and keyboard; hover effect; each card links to `boek.html?id=<id>`; placeholder cover when an image is missing.
- Content: review the `teaser` texts of the five R books against the content guide.
- Acceptance: all rows render from `catalog.json`; arrows scroll; every card opens the right detail URL; `validate_books.py --strict` passes.

**2I Detail page** (`phase-2i-detail-page`)
- Files: `boek.html`, `css/detail.css`, `js/detail.js`.
- UI: cover, title, author, a badge such as "Bekend van de Netflix-serie (2021)" (plus `adaptation.note` when present), genres, age, pages, reading time and language, the content warnings, the `teaser`, a section "Wat biedt het boek extra?" with `extraTeaser`, a button per entry in `links` (for example "Leen bij de Bibliotheek") that opens in a new tab, a link back to the home page, and a friendly Dutch message for an unknown or missing id.
- Content: review the `teaser` and `extraTeaser` texts of the five I books against the content guide.
- Acceptance: `boek.html?id=<id>` works for every book that has a file; an unknown id shows the not-found message; no link buttons show when `links` is empty; `validate_books.py --strict` passes.

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
- Data: `python tools/validate_books.py` (phase 1), with `--strict` from the end of phase 2.
- Per phase: the acceptance checks in section 7.
- Whole site: `docs/TEST_CHECKLIST.md` (from phase 3I).
