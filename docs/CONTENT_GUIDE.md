# Bookflix content guide

How to choose a book and write its data file in `data/books/<id>.json`. The field definitions are in the data contract, section 4 of [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). This guide is about the choices and the writing: what goes in each field and how it should read.

Everything a visitor sees is Dutch. This guide is in English like the other docs, with Dutch examples.

## 1. Who we write for

Readers of 12 to 18 who know the film or series and are not sure they want to read the book. They decide in a few seconds, on a phone, between other things to watch.

So every text should:

- **Start from what they know.** They have seen the series; tell them why the book is worth it anyway.
- **Be short.** One look at the screen, no scrolling for the teaser.
- **Talk to them, not about them.** Use *je*, not *u* and not *de lezer*.
- **Sound like a friend recommending a book**, not like a teacher or a back-cover blurb. No *"Een meeslepend verhaal dat je niet meer loslaat."*

## 2. Choosing a book

A book fits the catalogue when all of these are true:

| Rule | Why |
|---|---|
| A film or series of it is on Netflix | That is the hook. If it is only *inspired by* the book, say so in `adaptation.note`. |
| 350 pages or fewer in the edition we link to | Thick books scare off the readers we want. |
| bibliotheek.nl has it as a printed book | The link must lead to a book they can borrow. |
| Suitable for at least part of 12 to 18 | Younger books are fine if teenagers still enjoy them (Matilda); adult books only when the library or the content makes them right for 15+ or 16+. |

Keep the set balanced: about half **kort** (under 200 pages) and half **middel** (200 to 350), and a mix of genres, formats (novel and graphic novel) and film versus series.

## 3. Finding the edition on bibliotheek.nl

1. Search `https://www.bibliotheek.nl/catalogus.html?q=<title> <author>`.
2. Pick the result, in this order of preference:
   - a **Dutch** edition (*Taal: Nederlands*), and only if there is none, the English one;
   - a **printed book** (*Gedrukt boek*), not an e-book, audiobook or *Dwarsligger*;
   - a recent edition that still fits within 350 pages;
   - the edition with the Netflix cover, if there is one: readers recognise it.
3. Open the result. The page URL contains the catalogue number: `https://www.bibliotheek.nl/catalogus/titel.<number>.html/...`. Store it without the part after `.html`:
   `https://www.bibliotheek.nl/catalogus/titel.433151897.html`
4. Under *Versies* on that page, take the details of **the same edition** you picked: ISBN-13 (drop the ISBN-10 if two are shown), publisher (without the city), year and number of pages. The cover on the page belongs to that edition, so the ISBN, the page count and the cover then match.
5. Copy the title exactly as the library writes it, including lower case (*Thirteen reasons why*). A subtitle that the library shows goes in `subtitle`.

## 4. The fields

### Identity

- **`id`**: the title in lowercase with hyphens, no accents or punctuation: *Arsène Lupin, gentleman-inbreker* → `arsene-lupin-gentleman-inbreker`. For part of a series add the number: `heartstopper-1`. The filename is the same.
- **`title`**, **`subtitle`**: as on bibliotheek.nl (see above).
- **`originalTitle`**: only when the edition is a translation, for example `"To All the Boys I've Loved Before"`.
- **`series`**: Dutch, as *"<series name>, deel <n>"*: `"Heartstopper, deel 1"`. Leave it out for a standalone book.
- **`author`**: as known to readers. Two makers of a graphic novel (writer and artist) are joined with `&`: `"Gerard Way & Gabriel Bá"`.

### Edition

- **`isbn`**, **`publisher`**, **`year`**, **`pages`**, **`language`**: from the edition on bibliotheek.nl. `language` is `"Nederlands"` or `"Engels"`.
- **`cover`**: always `assets/covers/<id>.jpg`. Do not find the image yourself; run `python tools/fetch_covers.py <id>` once the `links` entry is in place (section 6).

### Format, length and reading time

- **`format`**: `"roman"` or `"graphic novel"`. Comics and manga count as graphic novel.
- **`length`**: `"kort"` under 200 pages, `"middel"` from 200 to 350.
- **`readingTimeMinutes`**: pages × 1 minute for a novel, pages × 0.5 minute for a graphic novel, rounded to the nearest 15 minutes. Examples: a 232-page novel → 225; a 263-page graphic novel → 135. It is a rough guide for the reader, not a promise, so don't adjust it by feel.

### Genres

Two or three genres. Reuse the ones that already exist, so the carousel rows and the *Meer zoals dit* row keep working:

> Avontuur, Detective, Drama, Fantasy, Filosofisch, Graphic novel, Historisch, Horror, Humor, Klassieker, LHBTIQ+, Misdaad, Mysterie, Realistisch, Romantiek, Sciencefiction, Superhelden

A graphic novel always gets `Graphic novel` as its first genre. Add a new genre only if none of these fits, and then use the Dutch word the library uses.

### Age

Use the library's advice: the *"Vanaf ca. … jaar"* line in the description, written as `"13+"`. If the library gives none, or lists the book under *Volwassenen*, decide yourself from the content warnings: violence and death in detail → `"15+"`, horror or sexual content → `"16+"`. Do not lower the library's age to make a book fit the target group.

### Content warnings

Short Dutch phrases in lowercase, most serious first. They are there so a reader knows what to expect, not to scare them off. Name the topic, not the scene: `"zelfdoding"`, not what happens.

Reuse existing phrases where they fit:

> alcohol, bedreiging, bloed, diefstal, dood van ouders, emotionele verwaarlozing, geweld, homofobie, kindermishandeling, lichte spanning, moord, pesten, rouw, seksueel geweld, verlies en afscheid, verlies van een ouder, vermissing, zelfdoding

Always mention, if present: suicide or self-harm, sexual violence, abuse, death of a parent, discrimination, eating disorders, drugs and alcohol, graphic violence. Use `[]` only if there is really nothing.

### Adaptation

- **`type`**: `"film"` or `"serie"`.
- **`title`**: as shown on Netflix in the Netherlands (often the English title).
- **`year`**: the year the film or first season came out.
- **`platform`**: `"Netflix"`.
- **`note`**: only when the relation is unusual, in one Dutch sentence: *"De serie is geïnspireerd op het boek, niet een verfilming ervan."*

### Links

The first entry is always the library:

```json
"links": [
  { "label": "Bibliotheek", "url": "https://www.bibliotheek.nl/catalogus/titel.433151897.html" }
]
```

More links (a bookshop, an e-book) may follow later. `label` is the text on the button, so keep it to one or two Dutch words.

## 5. Writing the two teasers

Both are **15 to 60 words**, Dutch, and **spoiler-free** (section 5.3). Read them aloud: if you run out of breath, the sentence is too long.

### 5.1 `teaser`: what the book is about

The situation at the start, who it is about, and the question that keeps you reading. Nothing after roughly the first quarter of the book.

A good shape:

1. **Who** and **where**, in one sentence.
2. **What goes wrong** or what changes.
3. **The question**, often as the last sentence.

> Clay Jensen vindt een pakketje met cassettebandjes voor zijn deur. Ze zijn ingesproken door Hannah Baker, een klasgenoot die er niet meer is. Op de bandjes vertelt ze over dertien redenen. Eén ervan gaat over Clay.

Avoid:

- Empty praise: *meeslepend, prachtig, een must-read, je kunt het niet wegleggen*.
- A summary of the whole plot.
- Starting with the author or the prizes.

### 5.2 `extraTeaser`: what the book adds to the film or series

This is the reason Bookflix exists. Answer the question the reader has: *"I've seen it, why read it?"* Be concrete about what is different on paper:

- **Point of view**: you are inside a character's head (*"In het boek zit je helemaal in het hoofd van Enola"*).
- **Style**: the narrator's voice, humour, the drawings.
- **Content**: storylines, characters or a mood that the adaptation changed, left out or toned down, described without saying what happens.
- **Experience**: short chapters, read it in one evening, stories that work like separate episodes.

> In de serie is Assane gefascineerd door dit boek, en nu kun je zelf lezen waarom. Je ontmoet de echte Lupin, met de trucs en vermommingen die Assane kopieert.

Only claim a difference you are sure of. If you have not seen the adaptation, check a reliable review before writing *"in de serie gaat dit anders"*. Never make the film or series sound bad: the reader liked it, that's why they are here.

### 5.3 The spoiler rule

Write nothing a reader would be annoyed to learn before reading. In practice:

- **No ending**, no twist, no reveal of who did it or who ends up with whom.
- **No deaths** of main characters, except what happens before or on the first pages (the Baudelaire parents, Hannah in *Thirteen reasons why*).
- **No later books** in the series.
- **Differences with the adaptation stay general**: *"het einde is anders"* is already a spoiler for someone who hasn't seen the series; *"het boek blijft dichter bij Hannah en Clay"* is fine.
- When in doubt, compare with the library's own description: what they mention is safe.

## 6. Language and style

- Standard Dutch spelling (Groene Boekje). Watch *d/t*, *ei/ij* and compounds: *graphic novel*, *rugbyspeler*, *superheldenteam*.
- Character names as in the edition we link to: in the Dutch Lemony Snicket they are Violet, Claus and Roosje. If you don't know the Dutch name, describe the role instead: *"een angstaanjagende directrice"*.
- Titles of films and series in their Netflix form, in the text without quotes.
- Numbers below twenty in words (*dertien redenen*), except ages and years.
- Quotation marks: single quotes for an ironic or quoted word: *een 'familielid'*.
- No emoji, no exclamation marks in a row, no hashtags.

## 7. Adding a book, step by step

1. Check the book against section 2.
2. Find the edition and link (section 3).
3. Create `data/books/<id>.json`, with the fields in the same order as the existing files.
4. Write `teaser` and `extraTeaser` (section 5).
5. Add the id to the rows in `data/catalog.json`: always *Bekend van Netflix*, plus *Kort & krachtig* or *Lekker doorlezen*, plus *Graphic novels* if it is one.
6. Download the cover: `python tools/fetch_covers.py <id>`, then open the image to check it is the right book and edition.
7. Check the data: `python tools/validate_books.py --strict`.
8. Look at the book in the site (`python -m http.server 8000`, then `boek.html?id=<id>`).
9. Ask the other stream to review the texts against this guide (phase 3 does this for all books).
