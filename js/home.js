// Builds the home page: hero for the featured book and one carousel per
// catalogue row. See phase 2R in docs/DEVELOPMENT_PLAN.md.

import { loadAllBooks, loadCatalog } from './data.js';
import { createCarousel } from './carousel.js';
import { createCover, detailUrl, el } from './dom.js';

let heroCount = 0;

/** For example "Bekend van de Netflix-serie (2022)". */
function adaptationBadge({ type, platform, year }) {
  // type is "film" or "serie", which are also the Dutch words.
  return `Bekend van de ${platform}-${type} (${year})`;
}

/** For example "ca. 2 uur 15 min". */
function formatReadingTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `ca. ${rest} min`;
  return rest === 0 ? `ca. ${hours} uur` : `ca. ${hours} uur ${rest} min`;
}

function createHero(book) {
  heroCount += 1;
  const titleId = `hero-${heroCount}-titel`;

  const hero = el('section', 'hero');
  hero.setAttribute('aria-labelledby', titleId);

  // Blurred copy of the cover as a backdrop (.hero::before), like the banner in
  // a media library. A CSS background reuses the cover download without a
  // second <img>; if it fails to load, the backdrop just stays empty. The URL is
  // made absolute because a relative url() in a custom property would resolve
  // against css/home.css instead of the page.
  const backdropUrl = new URL(book.cover, document.baseURI).href;
  hero.style.setProperty('--hero-backdrop', `url(${JSON.stringify(backdropUrl)})`);

  const inner = el('div', 'container hero__inner');
  const cover = createCover(book, { className: 'hero__cover', loading: 'eager' });

  const body = el('div', 'hero__body');
  const title = el('h2', 'hero__title', book.title);
  title.id = titleId;

  const facts = el('ul', 'hero__facts');
  facts.setAttribute('role', 'list');
  for (const fact of [
    book.author,
    `${book.pages} pagina's`,
    `${formatReadingTime(book.readingTimeMinutes)} lezen`,
    book.age,
  ]) {
    facts.append(el('li', '', fact));
  }

  const button = el('a', 'btn btn-primary hero__button', 'Bekijk boek');
  button.href = detailUrl(book.id);

  body.append(
    el('p', 'badge', adaptationBadge(book.adaptation)),
    title,
    facts,
    el('p', 'hero__teaser', book.teaser),
    button,
  );
  inner.append(cover, body);
  hero.append(inner);
  return hero;
}

/** Builds the hero and the rows, and only puts them on the page once all of them are built. */
async function render(heroSlot, rowsSlot) {
  const catalog = await loadCatalog();
  // Pass the catalogue on, so the rows and the loaded books come from the same one.
  const books = await loadAllBooks(catalog);

  const featured = books.get(catalog.featured);
  const rows = [];
  try {
    for (const row of catalog.rows) {
      const rowBooks = row.books.map((id) => books.get(id)).filter(Boolean);
      if (rowBooks.length === 0) {
        console.warn(`[home] Skipping row "${row.title}": none of its books could be loaded`);
        continue;
      }
      rows.push(createCarousel(row.title, rowBooks));
    }
    const hero = featured ? createHero(featured) : null;

    if (hero) heroSlot.append(hero);
    rowsSlot.append(...rows.map((row) => row.element));
  } catch (error) {
    // Rows built before the failure never reach the page; release their observers.
    for (const row of rows) row.destroy();
    throw error;
  }

  return Boolean(featured) || rows.length > 0;
}

async function init() {
  const heroSlot = document.getElementById('hero');
  const rowsSlot = document.getElementById('rijen');
  // A live region: it stays in the DOM and only its text changes, so screen
  // readers announce each message.
  const status = document.getElementById('home-status');

  status.textContent = 'Boeken laden…';
  try {
    const hasContent = await render(heroSlot, rowsSlot);
    status.textContent = hasContent ? '' : 'Er zijn nog geen boeken om te laten zien.';
  } catch (error) {
    console.error('[home] Could not build the home page:', error);
    status.textContent = 'De boeken konden niet worden geladen. Probeer de pagina opnieuw te laden.';
  }
}

init();
