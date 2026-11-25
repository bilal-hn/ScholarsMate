import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAuthors,
  parseAuthorList,
  inTextLabel,
  bibliographyEntries,
  reconcileCitations,
  partsToHtml,
} from './citationFormat.js';

const base = { doc_name: 'p.pdf', paper_title: 'Attention Is All You Need', venue: 'NeurIPS', year: 2017, doc_index: 3 };
const one = { ...base, authors: 'Vaswani, Ashish' };
const two = { ...base, authors: 'Ashish Vaswani and Noam Shazeer' };
const three = { ...base, authors: 'Vaswani, A.; Shazeer, N.; Uszkoreit, J.' };
const noYear = { ...one, year: null };

test('parseAuthors handles the shapes the library produces', () => {
  assert.deepEqual(parseAuthors('Vaswani, A.; Shazeer, N.'), [
    { family: 'Vaswani', given: 'A.' },
    { family: 'Shazeer', given: 'N.' },
  ]);
  assert.deepEqual(parseAuthors('Ashish Vaswani, Noam Shazeer, and Jakob Uszkoreit').map((a) => a.family), [
    'Vaswani', 'Shazeer', 'Uszkoreit',
  ]);
  assert.deepEqual(parseAuthors('Vaswani, A., Shazeer, N.').map((a) => a.family), ['Vaswani', 'Shazeer']);
  assert.deepEqual(parseAuthors(null), []);
});

test('in-text: IEEE numbers and page', () => {
  assert.equal(inTextLabel(one, 'ieee'), '[3]');
  assert.equal(inTextLabel({ ...one, page_number: 5 }, 'ieee'), '[3, p. 5]');
  assert.equal(inTextLabel({ ...one, page_number: '5-7' }, 'ieee'), '[3, pp. 5-7]');
});

test('in-text: 1, 2 and 3+ authors', () => {
  assert.equal(inTextLabel(one, 'apa'), '(Vaswani, 2017)');
  assert.equal(inTextLabel(two, 'apa'), '(Vaswani & Shazeer, 2017)');
  assert.equal(inTextLabel(three, 'apa'), '(Vaswani et al., 2017)');

  assert.equal(inTextLabel(one, 'harvard'), '(Vaswani 2017)');
  assert.equal(inTextLabel(two, 'harvard'), '(Vaswani and Shazeer 2017)');
  assert.equal(inTextLabel(three, 'harvard'), '(Vaswani et al. 2017)');

  assert.equal(inTextLabel(one, 'chicago'), '(Vaswani 2017)');
  assert.equal(inTextLabel(two, 'chicago'), '(Vaswani and Shazeer 2017)');
  assert.equal(inTextLabel(three, 'chicago'), '(Vaswani, Shazeer, and Uszkoreit 2017)');
  assert.equal(inTextLabel({ ...three, authors: `${three.authors}; Parmar, N.; Jones, L.` }, 'chicago'), '(Vaswani et al. 2017)');
});

test('in-text: missing year is n.d., page numbers follow each style', () => {
  assert.equal(inTextLabel(noYear, 'apa'), '(Vaswani, n.d.)');
  assert.equal(inTextLabel(noYear, 'harvard'), '(Vaswani n.d.)');
  assert.equal(inTextLabel(noYear, 'chicago'), '(Vaswani n.d.)');
  const p = { ...one, page_number: 12 };
  assert.equal(inTextLabel(p, 'apa'), '(Vaswani, 2017, p. 12)');
  assert.equal(inTextLabel(p, 'harvard'), '(Vaswani 2017, p. 12)');
  assert.equal(inTextLabel(p, 'chicago'), '(Vaswani 2017, 12)');
});

test('in-text: no authors falls back to a short title, not "Anon"', () => {
  assert.equal(inTextLabel({ ...base, authors: null }, 'apa'), '(Attention Is All, 2017)');
});

const entry = (c, style) => bibliographyEntries([c], style)[0];

test('bibliography: IEEE', () => {
  assert.equal(entry(one, 'ieee').text, '[1] A. Vaswani, “Attention Is All You Need,” NeurIPS, 2017.');
  assert.equal(entry(two, 'ieee').parts[0].t, 'A. Vaswani and N. Shazeer, ');
  assert.equal(entry(three, 'ieee').parts[0].t, 'A. Vaswani, N. Shazeer, and J. Uszkoreit, ');
  assert.match(entry({ ...one, doi: '10.1/x' }, 'ieee').text, /doi: 10\.1\/x\.$/);
});

test('bibliography: APA 7', () => {
  assert.equal(entry(one, 'apa').text, 'Vaswani, A. (2017). Attention Is All You Need. NeurIPS.');
  assert.equal(entry(two, 'apa').parts[0].t, 'Vaswani, A., & Shazeer, N. (2017). ');
  assert.equal(entry(three, 'apa').parts[0].t, 'Vaswani, A., Shazeer, N., & Uszkoreit, J. (2017). ');
  assert.match(entry(noYear, 'apa').text, /\(n\.d\.\)/);
  assert.ok(entry(one, 'apa').parts.some((p) => p.i && p.t === 'NeurIPS.'));
});

test('bibliography: Harvard', () => {
  assert.equal(entry(one, 'harvard').text, 'Vaswani, A. (2017) ‘Attention Is All You Need’, NeurIPS.');
  assert.equal(entry(three, 'harvard').parts[0].t, 'Vaswani, A., Shazeer, N. and Uszkoreit, J. (2017) ');
  assert.match(entry(noYear, 'harvard').text, /\(n\.d\.\)/);
});

test('bibliography: Chicago author-date', () => {
  assert.equal(entry(one, 'chicago').text, 'Vaswani, Ashish. 2017. “Attention Is All You Need.” NeurIPS.');
  assert.equal(
    entry({ ...base, authors: 'Ashish Vaswani, Noam Shazeer, and Jakob Uszkoreit' }, 'chicago').parts[0].t,
    'Vaswani, Ashish, Noam Shazeer, and Jakob Uszkoreit. 2017. ',
  );
  assert.match(entry(noYear, 'chicago').text, /n\.d\./);
});

test('bibliography: one entry per source, ordered per style, links the DOI', () => {
  const a = { id: 1, doc_name: 'a.pdf', paper_title: 'Zeta', authors: 'Zed, A.', year: 2020, doc_index: 1 };
  const b = { id: 2, doc_name: 'b.pdf', paper_title: 'Alpha', authors: 'Abe, B.', year: 2019, doc_index: 2, doi: '10.1/abc' };
  const again = { ...a, id: 3, page_number: 4 };
  assert.deepEqual(bibliographyEntries([a, b, again], 'ieee').map((e) => e.label), ['[1]', '[2]']);
  assert.deepEqual(bibliographyEntries([a, b, again], 'apa').map((e) => e.key), ['b.pdf', 'a.pdf']);
  assert.match(bibliographyEntries([b], 'apa')[0].text, /https:\/\/doi\.org\/10\.1\/abc$/);
});

test('partsToHtml escapes and italicises', () => {
  assert.equal(partsToHtml([{ t: 'A <b> & ' }, { t: 'J', i: true }]), 'A &lt;b&gt; &amp; <em>J</em>');
});

test('reconcileCitations prunes deleted spans and renumbers by first appearance', () => {
  const cs = [
    { id: 1, doc_name: 'a.pdf' },
    { id: 2, doc_name: 'b.pdf' },
    { id: 3, doc_name: 'a.pdf' },
  ];
  // The span for id 1 was deleted; b now appears first.
  const out = reconcileCitations(cs, [2, 3, 3]);
  assert.deepEqual(out.map((c) => [c.id, c.doc_index]), [[2, 1], [3, 2]]);
  assert.deepEqual(reconcileCitations(cs, []), []);
});

test('reconcileCitations keeps citations that never had a span, numbered after the live ones', () => {
  const cs = [
    { id: 1, doc_name: 'a.pdf' },
    { id: 2, doc_name: 'b.pdf' }, // legacy: no span in the document
    { id: 3, doc_name: 'c.pdf' },
    { id: 4, doc_name: 'c.pdf' }, // legacy: same source as a live citation
  ];
  const out = reconcileCitations(cs, [3, 1], new Set(['1', '3']));
  assert.deepEqual(out.map((c) => [c.id, c.doc_index]), [[3, 1], [1, 2], [2, 3], [4, 1]]);
  // A citation that was seen and then lost its span is still pruned.
  assert.deepEqual(reconcileCitations(cs, [3], new Set(['1', '2', '3', '4'])).map((c) => c.id), [3]);
});

test('"et al." in an author string is a flag, not an author', () => {
  assert.deepEqual(parseAuthorList('Ashish Vaswani et al.'), { authors: [{ family: 'Vaswani', given: 'Ashish' }], etAl: true });
  assert.deepEqual(parseAuthorList('Vaswani, A., et al.'), { authors: [{ family: 'Vaswani', given: 'A.' }], etAl: true });
  assert.equal(inTextLabel({ ...base, authors: 'Ashish Vaswani et al.' }, 'apa'), '(Vaswani et al., 2017)');
  assert.equal(entry({ ...base, authors: 'Vaswani, A., et al.' }, 'apa').parts[0].t, 'Vaswani, A., et al. (2017). ');
});

test('APA with 21+ authors ends "... Last" with no ampersand', () => {
  const many = Array.from({ length: 22 }, (_, i) => `Fam${i}, A.`).join('; ');
  const lead = entry({ ...base, authors: many }, 'apa').parts[0].t;
  assert.ok(lead.includes(', . . . Fam21, A.'));
  assert.ok(!lead.includes('&'));
});
