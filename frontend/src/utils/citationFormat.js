// Single source of citation text for the writer: in-text labels and bibliography entries
// for IEEE, APA 7, Harvard and Chicago author-date. DocumentWriter, its exports and the
// cite drawer all call this file, so a style change touches nothing else.
//
// A citation is one entry of the draft's citations array:
//   { id, doc_name, paper_title|title, authors, year, venue, doi, url, page_number, doc_index }
// `doc_index` is the IEEE number (order of first appearance); reconcileCitations() sets it.

export const CITATION_STYLES = [
  { id: 'ieee', label: 'IEEE', example: '[1]' },
  { id: 'apa', label: 'APA 7', example: '(Smith, 2020)' },
  { id: 'harvard', label: 'Harvard', example: '(Smith 2020)' },
  { id: 'chicago', label: 'Chicago', example: '(Smith 2020)' },
];

export const DEFAULT_CITATION_STYLE = 'ieee';

export const normalizeStyle = (style) =>
  (CITATION_STYLES.some((s) => s.id === style) ? style : DEFAULT_CITATION_STYLE);

// ---------------------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------------------

const words = (s) => s.trim().split(/\s+/).filter(Boolean);

function nameFromFirstLast(full) {
  const w = words(full);
  if (w.length === 0) return null;
  if (w.length === 1) return { family: w[0], given: '' };
  return { family: w[w.length - 1], given: w.slice(0, -1).join(' ') };
}

/**
 * Parses "Last, First; Last, First", "First Last and First Last", "A B, C D, and E F".
 * A trailing "et al." is dropped from the list and reported as `etAl`.
 */
export function parseAuthorList(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return { authors: [], etAl: false };
  const etAl = /[,;]?\s*\bet\.?\s*al\.?\s*$/i.test(rawInput);
  const raw = etAl ? rawInput.replace(/[,;]?\s*\bet\.?\s*al\.?\s*$/i, '') : rawInput;
  const out = [];
  const push = (n) => {
    if (n && n.family) out.push(n);
  };

  // A segment holds one name or a comma list of names.
  const fromSegment = (seg) => {
    const tokens = seg.split(',').map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    if (tokens.length === 1) return push(nameFromFirstLast(tokens[0]));
    if (tokens.every((t) => words(t).length >= 2)) return tokens.forEach((t) => push(nameFromFirstLast(t)));
    if (tokens.length % 2 === 0) {
      for (let i = 0; i < tokens.length; i += 2) push({ family: tokens[i], given: tokens[i + 1] });
      return;
    }
    tokens.forEach((t) => push(nameFromFirstLast(t)));
  };

  const hasSemicolon = raw.includes(';');
  const normalized = raw.replace(/,?\s+(and|&)\s+/gi, hasSemicolon ? ';' : '|');
  if (hasSemicolon) {
    normalized.split(/[;|]/).forEach((seg) => {
      const t = seg.trim();
      if (!t) return;
      const [family, given] = t.split(',').map((x) => x.trim());
      push(t.includes(',') ? { family, given: given || '' } : nameFromFirstLast(t));
    });
  } else {
    normalized.split('|').forEach(fromSegment);
  }
  return { authors: out, etAl };
}

export const parseAuthors = (raw) => parseAuthorList(raw).authors;

const initials = (given) =>
  given
    .replace(/\./g, ' ')
    .split(/[\s]+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(' ');

const endWith = (s, ch = '.') => (!s || /[.?!]$/.test(s) ? s : `${s}${ch}`);

// ---------------------------------------------------------------------------------------
// Entry fields
// ---------------------------------------------------------------------------------------

const prettyName = (docName = '') =>
  docName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const sourceKey = (c) => c.doc_name || c.paper_title || c.title || `id-${c.id}`;

const yearOf = (c) => {
  const m = String(c.year ?? '').match(/\d{4}/);
  return m ? m[0] : 'n.d.';
};

const titleOf = (c) => (c.paper_title || c.title || prettyName(c.doc_name) || 'Untitled').trim();

const linkOf = (c) => {
  if (c.doi) return `https://doi.org/${String(c.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
  return c.url || '';
};

const pagesOf = (c) => {
  const p = c.page_number == null ? '' : String(c.page_number).trim();
  if (!p) return null;
  return { text: p, plural: /[-–,]/.test(p) };
};

// ---------------------------------------------------------------------------------------
// In-text labels
// ---------------------------------------------------------------------------------------

function inTextNames({ authors, etAl }, style, c) {
  if (authors.length === 0) return words(titleOf(c)).slice(0, 3).join(' ');
  const fam = authors.map((a) => a.family);
  if (etAl) return `${fam[0]} et al.`;
  if (fam.length === 1) return fam[0];
  if (style === 'apa') return fam.length === 2 ? `${fam[0]} & ${fam[1]}` : `${fam[0]} et al.`;
  if (style === 'harvard') return fam.length === 2 ? `${fam[0]} and ${fam[1]}` : `${fam[0]} et al.`;
  // chicago author-date: up to three names, then et al.
  if (fam.length === 2) return `${fam[0]} and ${fam[1]}`;
  if (fam.length === 3) return `${fam[0]}, ${fam[1]}, and ${fam[2]}`;
  return `${fam[0]} et al.`;
}

/** The text of an in-text citation: "[3]", "(Smith & Jones, 2020, p. 5)", "(Smith 2020, 5)". */
export function inTextLabel(citation, style = DEFAULT_CITATION_STYLE) {
  const s = normalizeStyle(style);
  const page = pagesOf(citation);
  const pageText = page ? `${page.plural ? 'pp.' : 'p.'} ${page.text}` : '';

  if (s === 'ieee') {
    const n = citation.doc_index || '?';
    return `[${n}${pageText ? `, ${pageText}` : ''}]`;
  }

  const names = inTextNames(parseAuthorList(citation.authors), s, citation);
  const year = yearOf(citation);
  if (s === 'apa') return `(${names}, ${year}${pageText ? `, ${pageText}` : ''})`;
  if (s === 'harvard') return `(${names} ${year}${pageText ? `, ${pageText}` : ''})`;
  return `(${names} ${year}${page ? `, ${page.text}` : ''})`; // chicago: bare page number
}

// ---------------------------------------------------------------------------------------
// Bibliography
// ---------------------------------------------------------------------------------------

const T = (t) => ({ t });
const I = (t) => ({ t, i: true });

function authorsForBibliography({ authors, etAl }, style) {
  if (authors.length === 0) return '';
  const abbr = (a) => (a.given ? `${a.family}, ${initials(a.given)}` : a.family);

  if (etAl) {
    // The source only gave us the leading author(s): keep them and say so.
    if (style === 'ieee') return `${authors.map((a) => (a.given ? `${initials(a.given)} ${a.family}` : a.family)).join(', ')} et al.`;
    if (style === 'chicago') return `${authors.map((a, i) => (a.given ? (i === 0 ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`) : a.family)).join(', ')}, et al.`;
    return `${authors.map(abbr).join(', ')}, et al.`;
  }

  if (style === 'ieee') {
    const names = authors.map((a) => (a.given ? `${initials(a.given)} ${a.family}` : a.family));
    if (names.length > 6) return `${names[0]} et al.`;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
  if (style === 'apa') {
    const names = authors.map(abbr);
    if (names.length > 20) return `${names.slice(0, 19).join(', ')}, . . . ${names[names.length - 1]}`;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]}, & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  }
  if (style === 'harvard') {
    const names = authors.map(abbr);
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  // chicago author-date: first author inverted, the rest in natural order
  const names = authors.map((a, i) => {
    if (!a.given) return a.family;
    return i === 0 ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`;
  });
  if (names.length === 1) return endWith(names[0]);
  if (names.length === 2) return endWith(`${names[0]}, and ${names[1]}`);
  if (names.length > 10) return endWith(`${names.slice(0, 7).join(', ')}, et al.`);
  return endWith(`${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);
}

/** One bibliography entry as [{ t, i? }] parts (i = italic). Excludes the IEEE "[n]" label. */
export function bibliographyParts(c, style = DEFAULT_CITATION_STYLE) {
  const s = normalizeStyle(style);
  const authors = authorsForBibliography(parseAuthorList(c.authors), s);
  const title = titleOf(c);
  const venue = (c.venue || '').trim();
  const year = yearOf(c);
  const link = linkOf(c);
  const parts = [];

  if (s === 'ieee') {
    if (authors) parts.push(T(`${authors}, `));
    parts.push(T(`“${title},” `));
    if (venue) parts.push(I(venue), T(', '));
    parts.push(T(`${year}.`));
    if (c.doi) parts.push(T(` doi: ${linkOf(c).replace('https://doi.org/', '')}.`));
    else if (link) parts.push(T(` [Online]. Available: ${link}`));
  } else if (s === 'apa') {
    parts.push(T(authors ? `${endWith(authors)} (${year}). ` : ''));
    if (venue) {
      parts.push(T(`${endWith(title)} `), I(endWith(venue)));
    } else {
      parts.push(I(endWith(title)));
    }
    if (!authors) parts.push(T(` (${year}).`));
    if (link) parts.push(T(` ${link}`));
  } else if (s === 'harvard') {
    if (authors) parts.push(T(`${authors} (${year}) `));
    parts.push(T(`‘${title}’`));
    if (!authors) parts.push(T(` (${year})`));
    if (venue) parts.push(T(', '), I(venue));
    parts.push(T('.'));
    if (link) parts.push(T(` Available at: ${link}`));
  } else {
    if (authors) parts.push(T(`${authors} ${year}. `));
    parts.push(T(`“${endWith(title)}”`));
    if (!authors) parts.push(T(` ${year}.`));
    if (venue) parts.push(T(' '), I(endWith(venue)));
    if (link) parts.push(T(` ${link}`));
  }
  return parts.filter((p) => p.t);
}

export const partsToText = (parts) => parts.map((p) => p.t).join('');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const partsToHtml = (parts) =>
  parts.map((p) => (p.i ? `<em>${escapeHtml(p.t)}</em>` : escapeHtml(p.t))).join('');

const firstSeen = (a, b) => a || b;

/**
 * Collapses citation instances into one entry per source, ordered for the style:
 * IEEE by number (first appearance), author-date styles alphabetically.
 * Returns [{ key, number, label, parts, text }].
 */
export function bibliographyEntries(citations = [], style = DEFAULT_CITATION_STYLE) {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  const s = normalizeStyle(style);
  const bySource = new Map();

  citations.forEach((c, idx) => {
    const key = sourceKey(c);
    const prev = bySource.get(key);
    if (!prev) {
      bySource.set(key, { ...c, _order: c.doc_index || idx + 1 });
    } else {
      for (const f of ['authors', 'year', 'venue', 'doi', 'url', 'paper_title', 'title']) {
        prev[f] = firstSeen(prev[f], c[f]);
      }
      prev._order = Math.min(prev._order, c.doc_index || idx + 1);
    }
  });

  const list = Array.from(bySource.entries()).map(([key, c]) => ({ key, c }));
  if (s === 'ieee') {
    list.sort((a, b) => a.c._order - b.c._order);
  } else {
    const sortKey = ({ c }) => {
      const a = parseAuthors(c.authors)[0];
      return `${(a ? a.family : titleOf(c)).toLowerCase()}|${yearOf(c)}`;
    };
    list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  return list.map(({ key, c }, i) => {
    const parts = bibliographyParts(c, s);
    const number = s === 'ieee' ? i + 1 : null;
    const label = number ? `[${number}]` : '';
    return { key, number, label, parts, text: `${label ? `${label} ` : ''}${partsToText(parts)}` };
  });
}

// ---------------------------------------------------------------------------------------
// Model upkeep
// ---------------------------------------------------------------------------------------

/**
 * Keeps the citations whose span is still in the document and numbers sources by order of
 * first appearance. `orderedIds` is the data-citation-id of every span, in document order.
 * Returns the citations in document order with `doc_index` set.
 *
 * `seen` (optional) is the set of ids that have ever had a span in this session. When given,
 * only those are pruned; a citation that never had a span (a legacy draft, say) is kept after
 * the live ones, numbered after the live sources, reusing a live number for the same source.
 */
export function reconcileCitations(citations = [], orderedIds = [], seen = null) {
  const byId = new Map(citations.map((c) => [String(c.id), c]));
  const numbers = new Map();
  const kept = [];
  const keptIds = new Set();
  for (const rawId of orderedIds) {
    const id = String(rawId);
    const c = byId.get(id);
    if (!c) continue;
    const key = sourceKey(c);
    if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    if (keptIds.has(id)) continue;
    keptIds.add(id);
    kept.push({ ...c, doc_index: numbers.get(key) });
  }
  if (seen) {
    for (const c of citations) {
      const id = String(c.id);
      if (keptIds.has(id) || seen.has(id)) continue;
      const key = sourceKey(c);
      if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
      keptIds.add(id);
      kept.push({ ...c, doc_index: numbers.get(key) });
    }
  }
  return kept;
}

/** The style a draft uses: stored on its citations, else the caller's default. */
export const styleOfCitations = (citations = [], fallback = DEFAULT_CITATION_STYLE) =>
  normalizeStyle(citations.find((c) => c.citation_style)?.citation_style || fallback);
