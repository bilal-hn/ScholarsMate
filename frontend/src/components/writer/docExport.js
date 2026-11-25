// Document exports for the writer (.docx, .pdf, Markdown). Every citation string comes from
// utils/citationFormat.js, so exports always match the on-canvas References.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  NumberFormat,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  LineRuleType,
} from 'docx';
import { bibliographyEntries, partsToHtml } from '../../utils/citationFormat';

export const PAGE_SIZES = {
  letter: { label: 'Letter', w: 816, h: 1056, twipW: 12240, twipH: 15840, pdf: 'letter' },
  a4: { label: 'A4', w: 794, h: 1123, twipW: 11906, twipH: 16838, pdf: 'a4' },
};

const slug = (t, fallback) => (t || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '_');

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------------------

export function markdownBibliography(citations, style) {
  const entries = bibliographyEntries(citations, style);
  if (entries.length === 0) return '';
  const lines = entries.map((e) => {
    const body = e.parts.map((p) => (p.i ? `*${p.t}*` : p.t)).join('');
    return e.label ? `${e.label} ${body}` : body;
  });
  return `\n\n---\n\n## References\n\n${lines.join('\n\n')}\n`;
}

export const markdownText = ({ title, text, citations, style }) =>
  `# ${title}\n\n${text}${markdownBibliography(citations, style)}`;

export function downloadMarkdown(args) {
  download(new Blob([markdownText(args)], { type: 'text/markdown;charset=utf-8;' }), `${slug(args.title, 'academic_draft')}.md`);
}

// ---------------------------------------------------------------------------------------
// .docx
// ---------------------------------------------------------------------------------------

const toHex = (c) => {
  if (!c) return undefined;
  const s = c.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return m[1].toUpperCase();
  m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined; // transparent
    return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return undefined;
};

const toTwips = (v) => {
  if (!v) return null;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return null;
  if (v.endsWith('in')) return Math.round(n * 1440);
  if (v.endsWith('pt')) return Math.round(n * 20);
  if (v.endsWith('px')) return Math.round(n * 15);
  return null;
};

const firstFont = (family) => (family || '').split(',')[0].replace(/['"]/g, '').trim() || undefined;

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function parseRuns(node, current = {}) {
  const runs = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (!child.textContent) return;
      runs.push(
        new TextRun({
          text: child.textContent,
          bold: current.bold,
          italics: current.italics,
          underline: current.underline ? { type: 'single' } : undefined,
          strike: current.strike,
          superScript: current.superScript,
          subScript: current.subScript,
          color: current.color,
          shading: current.fill ? { type: ShadingType.CLEAR, fill: current.fill, color: 'auto' } : undefined,
          font: current.font,
          size: current.size,
        })
      );
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') {
      runs.push(new TextRun({ break: 1 }));
      return;
    }
    const next = { ...current };
    if (tag === 'b' || tag === 'strong') next.bold = true;
    if (tag === 'i' || tag === 'em') next.italics = true;
    if (tag === 'u') next.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true;
    if (tag === 'sup') next.superScript = true;
    if (tag === 'sub') next.subScript = true;
    if (tag === 'font') {
      if (child.getAttribute('color')) next.color = toHex(child.getAttribute('color'));
      if (child.getAttribute('face')) next.font = firstFont(child.getAttribute('face'));
    }
    const st = child.style;
    if (st) {
      if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) next.bold = true;
      if (st.fontStyle === 'italic') next.italics = true;
      const deco = `${st.textDecorationLine || ''} ${st.textDecoration || ''}`;
      if (deco.includes('underline')) next.underline = true;
      if (deco.includes('line-through')) next.strike = true;
      if (st.verticalAlign === 'super') next.superScript = true;
      if (st.verticalAlign === 'sub') next.subScript = true;
      if (st.color) next.color = toHex(st.color) || next.color;
      if (st.backgroundColor) next.fill = toHex(st.backgroundColor) || next.fill;
      if (st.fontFamily) next.font = firstFont(st.fontFamily);
      if (st.fontSize && st.fontSize.endsWith('pt')) next.size = Math.round(parseFloat(st.fontSize) * 2);
    }
    runs.push(...parseRuns(child, next));
  });
  return runs;
}

// Paragraph options (alignment, indent, spacing) from the block's inline style.
function blockOptions(node, d) {
  const s = node.style || {};
  const opts = {};
  const align = ALIGN[s.textAlign];
  if (align) opts.alignment = align;
  const left = toTwips(s.marginLeft);
  if (left) opts.indent = { left };
  const lh = s.lineHeight && !/px|pt|in$/.test(s.lineHeight) ? parseFloat(s.lineHeight) : NaN;
  opts.spacing = {
    before: toTwips(s.marginTop) ?? d.before,
    after: toTwips(s.marginBottom) ?? d.after,
    line: Number.isFinite(lh) ? Math.round(lh * 240) : d.line,
    lineRule: LineRuleType.AUTO,
  };
  return opts;
}

const isPageBreak = (n) =>
  n.tagName.toLowerCase() === 'div' &&
  (n.classList.contains('word-page-break') || n.classList.contains('page-break') || n.getAttribute('data-page-break') === 'true');

function buildTable(node) {
  const rows = [];
  Array.from(node.querySelectorAll('tr')).forEach((tr, rowIndex) => {
    const cellEls = Array.from(tr.querySelectorAll('th, td'));
    const inHead = tr.parentElement?.tagName === 'THEAD';
    const allTh = cellEls.length > 0 && cellEls.every((c) => c.tagName === 'TH');
    const isHeader = inHead || (rowIndex === 0 && allTh);
    const cells = cellEls.map((cell) => {
      const isTh = cell.tagName === 'TH';
      const runs = parseRuns(cell, isTh || isHeader ? { bold: true } : {});
      const custom = toHex(cell.dataset.shade) || (isTh ? undefined : toHex(cell.style.backgroundColor));
      const fill = custom || (isTh || isHeader ? 'F1F5F9' : undefined);
      return new TableCell({
        children: [
          new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
            spacing: { before: 80, after: 80 },
          }),
        ],
        shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
        margins: {
          top: convertInchesToTwip(0.08),
          bottom: convertInchesToTwip(0.08),
          left: convertInchesToTwip(0.12),
          right: convertInchesToTwip(0.12),
        },
      });
    });
    if (cells.length > 0) rows.push(new TableRow({ children: cells, tableHeader: isHeader }));
  });
  return rows.length ? new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }) : null;
}

const HEADINGS = {
  h1: [HeadingLevel.HEADING_1, { before: 280, after: 140 }],
  h2: [HeadingLevel.HEADING_2, { before: 220, after: 110 }],
  h3: [HeadingLevel.HEADING_3, { before: 180, after: 90 }],
  h4: [HeadingLevel.HEADING_4, { before: 150, after: 75 }],
};

const MAX_LIST_LEVEL = 4;

// One paragraph per item, nested lists one level deeper; an item's own runs exclude its sublists.
function pushList(out, list, level) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  Array.from(list.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const own = li.cloneNode(true);
    own.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => sub.remove());
    out.push(
      new Paragraph({
        ...(ordered ? { numbering: { reference: 'default-numbering', level } } : { bullet: { level } }),
        children: parseRuns(own),
        spacing: { after: 100 },
      })
    );
    Array.from(li.children)
      .filter((c) => ['ul', 'ol'].includes(c.tagName.toLowerCase()))
      .forEach((sub) => pushList(out, sub, Math.min(level + 1, MAX_LIST_LEVEL)));
  });
}

function toDocxElements(root) {
  const out = [];
  const body = { before: 0, after: 180, line: 360 };

  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) {
        out.push(new Paragraph({ children: [new TextRun({ text: node.textContent })], spacing: { after: 180, line: 360 } }));
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();

    if (isPageBreak(node)) {
      out.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (HEADINGS[tag]) {
      const [heading, sp] = HEADINGS[tag];
      out.push(new Paragraph({ heading, children: parseRuns(node), ...blockOptions(node, { ...sp, line: 240 }) }));
    } else if (tag === 'blockquote') {
      out.push(
        new Paragraph({
          children: parseRuns(node, { italics: true }),
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { before: 160, after: 160 },
          border: { left: { style: BorderStyle.SINGLE, size: 4, space: 10, color: '94a3b8' } },
        })
      );
    } else if (tag === 'ul' || tag === 'ol') {
      pushList(out, node, 0);
    } else if (tag === 'table') {
      const table = buildTable(node);
      if (table) {
        out.push(table);
        out.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 120 } }));
      }
    } else if (tag === 'p' && node.classList.contains('doc-title')) {
      out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: parseRuns(node, { bold: true }), ...blockOptions(node, { before: 0, after: 120, line: 240 }) }));
    } else if (tag === 'p' && node.classList.contains('doc-subtitle')) {
      out.push(new Paragraph({ children: parseRuns(node, { color: '475569', size: 28 }), ...blockOptions(node, { before: 0, after: 240, line: 276 }) }));
    } else if (tag === 'p') {
      const runs = parseRuns(node);
      out.push(
        runs.length > 0
          ? new Paragraph({ children: runs, ...blockOptions(node, body) })
          : new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 100 } })
      );
    } else if (tag === 'br') {
      out.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 100 } }));
    } else {
      const hasBlocks = Array.from(node.childNodes).some(
        (c) => c.nodeType === Node.ELEMENT_NODE && ['p', 'div', 'table', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote'].includes(c.tagName.toLowerCase())
      );
      if (hasBlocks) node.childNodes.forEach(visit);
      else {
        const runs = parseRuns(node);
        if (runs.length > 0) out.push(new Paragraph({ children: runs, ...blockOptions(node, body) }));
      }
    }
  };

  root.childNodes.forEach(visit);
  return out;
}

export async function exportDocx({ html, title, citations, style, pageSize }) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const content = toDocxElements(temp);

  const refs = [];
  const entries = bibliographyEntries(citations, style);
  if (entries.length > 0) {
    refs.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 240 } }));
    refs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'References', bold: true })],
        border: { top: { style: BorderStyle.SINGLE, size: 8, space: 4, color: 'cbd5e1' } },
        spacing: { before: 200, after: 120 },
      })
    );
    entries.forEach((e) => {
      const runs = [];
      if (e.label) runs.push(new TextRun({ text: `${e.label}  `, bold: true }));
      e.parts.forEach((p) => runs.push(new TextRun({ text: p.t, italics: !!p.i })));
      refs.push(new Paragraph({ children: runs, spacing: { before: 100, after: 80, line: 320 } }));
    });
  }

  const size = PAGE_SIZES[pageSize] || PAGE_SIZES.letter;
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
            level,
            format: NumberFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: size.twipW, height: size.twipH },
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title || 'Academic Draft', bold: true })],
            spacing: { after: 360 },
          }),
          ...content,
          ...refs,
        ],
      },
    ],
  });

  download(await Packer.toBlob(doc), `${slug(title, 'academic_draft')}.docx`);
}

// ---------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function exportPdf({ html, title, citations, style, pageSize, fontFamily }) {
  return import('html2pdf.js')
    .then((mod) => {
      const html2pdf = mod.default || mod;
      const element = document.createElement('div');
      element.style.padding = '40px';
      element.style.fontFamily = fontFamily;
      element.style.color = '#111827';
      element.style.backgroundColor = '#ffffff';
      element.innerHTML = `<h1 style="font-size: 26px; font-weight: bold; margin-bottom: 20px; font-family: serif;">${escapeHtml(title)}</h1>${html}`;

      const entries = bibliographyEntries(citations, style);
      if (entries.length > 0) {
        const items = entries
          .map(
            (e) =>
              `<li style="margin-bottom: 10px; font-size: 13px; line-height: 1.6;">${e.label ? `<strong>${e.label}</strong> ` : ''}${partsToHtml(e.parts)}</li>`
          )
          .join('');
        element.innerHTML += `<div style="margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 20px;"><h2 style="font-size: 16px; font-weight: bold; font-family: serif; margin-bottom: 16px;">References</h2><ol style="padding-left: 0; list-style: none;">${items}</ol></div>`;
      }

      return html2pdf()
        .set({
          margin: 15,
          filename: `${slug(title, 'document')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: (PAGE_SIZES[pageSize] || PAGE_SIZES.letter).pdf, orientation: 'portrait' },
        })
        .from(element)
        .save();
    })
    .catch(() => window.print());
}
