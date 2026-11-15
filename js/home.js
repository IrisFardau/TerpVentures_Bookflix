// Builds the home page: hero for the featured book and one carousel per
// catalogue row. See phase 2R in docs/DEVELOPMENT_PLAN.md.

import { loadAllBooks, loadCatalog } from './data.js';
import { createCarousel } from './carousel.js';
import { createCover, detailUrl, el } from './dom.js';

/** Teardown functions of the carousels currently on the page. */
const carousels = [];

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
  const hero = el('section', 'hero');
  hero.setAttribute('aria-labelledby', 'hero-titel');

  // Blurred copy of the cover as a backdrop, like the banner in a media library.
  const backdrop = el('img', 'hero__backdrop');
  backdrop.src = book.cover;
  backdrop.alt = '';
  backdrop.addEventListener('error', () => backdrop.remove(), { once: true });

  const inner = el('div', 'container hero__inner');
  const cover = createCover(book, { className: 'hero__cover', loading: 'eager' });

  const body = el('div', 'hero__body');
  const title = el('h2', 'hero__title', book.title);
  title.id = 'hero-titel';

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
  hero.append(backdrop, inner);
  return hero;
}

function showStatus(status, message) {
  status.textContent = message;
  status.hidden = false;
}

async function render(heroSlot, rowsSlot, status) {
  const catalog = await loadCatalog();
  // Pass the catalogue on, so the rows and the loaded books come from the same one.
  const books = await loadAllBooks(catalog);

  const featured = books.get(catalog.featured);
  if (featured) heroSlot.append(createHero(featured));

  let rowCount = 0;
  for (const row of catalog.rows) {
    const rowBooks = row.books.map((id) => books.get(id)).filter(Boolean);
    if (rowBooks.length === 0) {
      console.warn(`[home] Skipping row "${row.title}": none of its books could be loaded`);
      continue;
    }
    const carousel = createCarousel(row.title, rowBooks);
    carousels.push(carousel.destroy);
    rowsSlot.append(carousel.element);
    rowCount += 1;
  }

  if (rowCount === 0 && !featured) {
    showStatus(status, 'Er zijn nog geen boeken om te laten zien.');
  } else {
    status.hidden = true;
    status.textContent = '';
  }
}

async function init() {
  const heroSlot = document.getElementById('hero');
  const rowsSlot = document.getElementById('rijen');
  const status = document.getElementById('home-status');

  showStatus(status, 'Boeken laden…');
  try {
    await render(heroSlot, rowsSlot, status);
  } catch (error) {
    console.error('[home] Could not build the home page:', error);
    for (const destroy of carousels.splice(0)) destroy();
    heroSlot.replaceChildren();
    rowsSlot.replaceChildren();
    showStatus(status, 'De boeken konden niet worden geladen. Probeer de pagina opnieuw te laden.');
  }
}

init();
