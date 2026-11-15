// Builds the detail page boek.html?id=<book-id>. See phase 2I in docs/DEVELOPMENT_PLAN.md.

import { loadBook } from './data.js';

const PLACEHOLDER_COVER = 'assets/placeholder-cover.svg';
const COVER_PATTERN = /^assets\/covers\/[a-z0-9-]+\.jpg$/;
const SITE_NAME = 'Bookflix';

const FORMAT_LABELS = { roman: 'Roman', 'graphic novel': 'Graphic novel' };
const LENGTH_LABELS = { kort: 'Kort', middel: 'Middellang' };
const ADAPTATION_LABELS = { film: 'film', serie: 'serie' };

/** Creates an element with optional class and text. Text is never parsed as HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 45 → "ca. 45 min", 120 → "ca. 2 uur", 135 → "ca. 2 uur en 15 min". */
export function formatReadingTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `ca. ${rest} min`;
  if (rest === 0) return `ca. ${hours} uur`;
  return `ca. ${hours} uur en ${rest} min`;
}

/** "Bekend van de Netflix-serie Heartstopper (2022)". */
export function adaptationLabel(adaptation) {
  const kind = ADAPTATION_LABELS[adaptation.type] ?? adaptation.type;
  return `Bekend van de ${adaptation.platform}-${kind} ${adaptation.title} (${adaptation.year})`;
}

/** Button text for a link: the library gets a call to action, other labels are used as is. */
export function linkText(link) {
  return link.label === 'Bibliotheek' ? 'Leen bij de Bibliotheek' : link.label;
}

function isSafeUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function buildCover(book) {
  const figure = el('figure', 'detail-cover');
  const img = el('img', 'detail-cover__image');
  img.alt = `Omslag van ${book.title}`;
  img.width = 300;
  img.height = 450;
  img.decoding = 'async';
  // When the image is missing, show the placeholder with the title on top (see 1R notes).
  const caption = el('figcaption', 'detail-cover__fallback-title', book.title);
  caption.hidden = true;
  const showPlaceholder = () => {
    img.onerror = null;
    img.src = PLACEHOLDER_COVER;
    img.alt = '';
    caption.hidden = false;
    figure.classList.add('detail-cover--placeholder');
  };
  img.onerror = showPlaceholder;
  if (COVER_PATTERN.test(book.cover)) {
    img.src = book.cover;
  } else {
    showPlaceholder();
  }
  figure.append(img, caption);
  return figure;
}

function buildFacts(book) {
  const facts = [
    ['Leeftijd', book.age],
    ['Lengte', `${LENGTH_LABELS[book.length] ?? book.length} · ${book.pages} pagina's`],
    ['Leestijd', formatReadingTime(book.readingTimeMinutes)],
    ['Vorm', FORMAT_LABELS[book.format] ?? book.format],
    ['Taal', book.language],
  ];
  if (book.series) facts.push(['Serie', book.series]);
  if (book.originalTitle) facts.push(['Oorspronkelijke titel', book.originalTitle]);

  const list = el('dl', 'detail-facts');
  for (const [term, value] of facts) {
    const item = el('div', 'detail-facts__item');
    item.append(el('dt', 'detail-facts__term', term), el('dd', 'detail-facts__value', value));
    list.append(item);
  }
  return list;
}

function buildGenres(genres) {
  const list = el('ul', 'detail-tags');
  list.setAttribute('aria-label', 'Genres');
  for (const genre of genres) list.append(el('li', 'detail-tag', genre));
  return list;
}

function buildLinks(links) {
  const safe = links.filter((link) => isSafeUrl(link.url));
  if (safe.length === 0) return null;
  const wrapper = el('div', 'detail-actions');
  safe.forEach((link, index) => {
    const anchor = el('a', index === 0 ? 'btn btn-primary' : 'btn');
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.append(document.createTextNode(linkText(link)));
    anchor.append(el('span', 'visually-hidden', ' (opent in een nieuw tabblad)'));
    wrapper.append(anchor);
  });
  return wrapper;
}

function buildWarnings(warnings) {
  if (warnings.length === 0) return null;
  const section = el('section', 'detail-warnings');
  section.setAttribute('aria-labelledby', 'detail-warnings-title');
  const title = el('h2', 'detail-warnings__title', 'Goed om te weten');
  title.id = 'detail-warnings-title';
  const intro = el('p', 'detail-warnings__intro', 'In dit boek komt het volgende voor:');
  const list = el('ul', 'detail-tags');
  for (const warning of warnings) list.append(el('li', 'detail-tag detail-tag--warning', warning));
  section.append(title, intro, list);
  return section;
}

function buildBackLink() {
  const back = el('a', 'detail-back', '← Terug naar home');
  back.href = 'index.html';
  return back;
}

function renderBook(root, book) {
  document.title = `${book.title} – ${SITE_NAME}`;

  const article = el('article', 'detail');
  if (COVER_PATTERN.test(book.cover)) {
    // Blurred cover behind the top of the page. The path is checked above, so it is safe in url().
    // It is made absolute because url() in a custom property resolves against css/detail.css.
    const coverUrl = new URL(book.cover, document.baseURI).href;
    article.style.setProperty('--detail-backdrop', `url("${coverUrl}")`);
    article.classList.add('detail--has-backdrop');
  }

  const header = el('div', 'detail-header');
  const info = el('div', 'detail-info');

  const badge = el('p', 'detail-badge', adaptationLabel(book.adaptation));
  info.append(badge);
  if (book.adaptation.note) info.append(el('p', 'detail-note', book.adaptation.note));

  const title = el('h1', 'detail-title', book.title);
  info.append(title);
  if (book.subtitle) info.append(el('p', 'detail-subtitle', book.subtitle));
  info.append(el('p', 'detail-author', book.author));

  info.append(buildGenres(book.genres));
  info.append(el('p', 'detail-teaser', book.teaser));
  const actions = buildLinks(book.links);
  if (actions) info.append(actions);

  header.append(buildCover(book), info);

  const body = el('div', 'detail-body');
  const extra = el('section', 'detail-extra');
  extra.setAttribute('aria-labelledby', 'detail-extra-title');
  const extraTitle = el('h2', 'section-title', 'Wat biedt het boek extra?');
  extraTitle.id = 'detail-extra-title';
  extra.append(extraTitle, el('p', 'detail-extra__text', book.extraTeaser));

  const factsSection = el('section', 'detail-about');
  factsSection.setAttribute('aria-labelledby', 'detail-about-title');
  const factsTitle = el('h2', 'section-title', 'Over dit boek');
  factsTitle.id = 'detail-about-title';
  factsSection.append(factsTitle, buildFacts(book));

  body.append(extra);
  const warnings = buildWarnings(book.contentWarnings);
  if (warnings) body.append(warnings);
  body.append(factsSection);

  article.append(header, body);
  root.replaceChildren(buildBackLink(), article);
}

/** A message page with a heading, a short text and a button back to the home page. */
function renderMessage(root, pageTitle, heading, text) {
  document.title = `${pageTitle} – ${SITE_NAME}`;
  const box = el('div', 'detail-empty');
  box.append(el('h1', 'page-title', heading), el('p', 'lead', text));
  const home = el('a', 'btn btn-primary', 'Bekijk alle boeken');
  home.href = 'index.html';
  const actions = el('div', 'detail-actions');
  actions.append(home);
  box.append(actions);
  root.replaceChildren(box);
}

function renderNotFound(root, hasId) {
  renderMessage(
    root,
    'Boek niet gevonden',
    hasId ? 'Dit boek kunnen we niet vinden' : 'Geen boek gekozen',
    hasId
      ? 'Misschien is de link verkeerd overgenomen, of staat het boek niet meer in Bookflix.'
      : 'Kies een boek op de homepage om te zien wat het boek je geeft naast de film of serie.',
  );
}

function renderError(root) {
  renderMessage(
    root,
    'Er ging iets mis',
    'Er ging iets mis',
    'Dit boek kon niet worden getoond. Probeer het later nog eens, of kies een ander boek.',
  );
}

async function init() {
  const root = document.getElementById('book-detail');
  if (!root) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      renderNotFound(root, false);
    } else {
      const book = await loadBook(id);
      if (book) renderBook(root, book);
      else renderNotFound(root, true);
    }
  } catch (error) {
    // Never leave the page stuck on the loading text.
    console.error('[detail] Could not show the book:', error);
    renderError(root);
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

init();
