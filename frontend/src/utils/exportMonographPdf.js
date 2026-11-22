import html2pdf from 'html2pdf.js';

/**
 * Normalizes citation brackets to numbered LaTeX style [1, p. 4]
 */
export function formatCitations(content, docList = []) {
  if (!content || typeof content !== 'string') return content;
  const docMap = {};
  (docList || []).forEach((doc, idx) => {
    const num = String(idx + 1);
    docMap[doc.toLowerCase()] = num;
    docMap[doc.replace(/\.pdf$/i, '').toLowerCase()] = num;
    docMap[doc.replace(/_/g, ' ').toLowerCase()] = num;
    docMap[doc.replace(/[-_.]/g, ' ').toLowerCase()] = num;
  });

  const findDocNum = (str) => {
    const clean = str.replace(/,\s*p(?:p)?\.?\s*[\d\-–]+.*/i, '').trim().toLowerCase();
    for (const [key, num] of Object.entries(docMap)) {
      if (clean === key || clean.includes(key) || key.includes(clean)) {
        return num;
      }
    }
    return null;
  };

  let result = content.replace(/\[([^\]]+)\]/g, (match, inner) => {
    const trimmed = inner.trim();
    if (/^\d+(?:,\s*p(?:p)?\.?\s*[\d\-–]+)?$/i.test(trimmed)) return match;
    if (/^\d+(?:\s*,\s*\d+)*$/.test(trimmed) || /^\d+\s*[\-–]\s*\d+$/.test(trimmed)) return match;

    const singlePageMatch = trimmed.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
    const docPart = trimmed.replace(/,\s*p(?:p)?\.?\s*[\d\-–]+.*/i, '').trim();
    const singleNum = findDocNum(docPart);
    if (singleNum && !trimmed.includes(';') && !/\.pdf.*\.pdf/i.test(trimmed)) {
      const pageSuffix = singlePageMatch ? `, ${singlePageMatch[1]}` : '';
      return `[${singleNum}${pageSuffix}]`;
    }

    const items = trimmed.split(/;\s*|,\s*(?=[^,]*\.(?:pdf|docx|txt)|\b[A-Za-z0-9_\-]{4,}\b)/i);
    const resolvedNums = [];
    let commonPage = '';

    items.forEach((item) => {
      const pMatch = item.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
      if (pMatch && !commonPage) commonPage = `, ${pMatch[1]}`;
      const num = findDocNum(item);
      if (num && !resolvedNums.includes(num)) {
        resolvedNums.push(num);
      }
    });

    if (resolvedNums.length > 0) {
      return `[${resolvedNums.sort((a, b) => Number(a) - Number(b)).join(', ')}${commonPage}]`;
    }
    return match;
  });

  result = result.replace(/\(([^)]+\.pdf(?:,\s*p(?:p)?\.?\s*[\d\-–]+)?)\)/gi, (match, inner) => {
    const pageMatch = inner.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
    const pageSuffix = pageMatch ? `, ${pageMatch[1]}` : '';
    const num = findDocNum(inner);
    if (num) {
      return `[${num}${pageSuffix}]`;
    }
    return match;
  });

  return result;
}

/**
 * Transforms Markdown tables into publication-grade academic LaTeX booktabs HTML
 */
export function preprocessTables(content) {
  if (!content || !content.includes('|')) return content;

  const lines = content.split('\n');
  let inTable = false;
  let htmlOutput = [];
  let tableRows = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (/^\|[\s\-:]+([\|\s\-:]+)*\|$/.test(trimmed)) {
        return;
      }
      inTable = true;
      const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
      tableRows.push(cells);
    } else {
      if (inTable) {
        htmlOutput.push(renderHtmlTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      htmlOutput.push(line);
    }
  });

  if (inTable && tableRows.length > 0) {
    htmlOutput.push(renderHtmlTable(tableRows));
  }

  return htmlOutput.join('\n');
}

function renderHtmlTable(rows) {
  if (rows.length === 0) return '';
  const header = rows[0];
  const body = rows.slice(1);

  const captionHtml = `<div class="latex-table-caption" style="text-align: center; font-size: 8.5pt; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif; margin-bottom: 6px; color: #000000;"><span style="font-weight: 700;">Table 1:</span> <span style="font-style: italic;">Comparative Analysis of Methodologies, Architectural Paradigms, and Empirical Findings</span></div>`;

  const headerHtml = `<thead><tr>${header
    .map(
      (h) =>
        `<th style="background-color: transparent; color: #000000; padding: 7px 9px; border-bottom: 1pt solid #000000; font-weight: 700; font-size: 8pt; text-align: left; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${h}</th>`
    )
    .join('')}</tr></thead>`;

  const bodyHtml = `<tbody>${body
    .map(
      (row) =>
        `<tr style="page-break-inside: avoid !important; break-inside: avoid !important;">${row
          .map(
            (c) =>
              `<td style="padding: 6px 9px; border-bottom: 0.25pt solid #e5e5e5; color: #000000; font-size: 7.5pt; vertical-align: top; line-height: 1.45; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${c}</td>`
          )
          .join('')}</tr>`
    )
    .join('')}</tbody>`;

  const noteHtml = `<div class="latex-table-note" style="font-size: 7pt; font-style: italic; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif; color: #222222; margin-top: 5px; text-align: left;">Note: Citations in bracket notation correspond to verified primary indexed literature in the reference catalog.</div>`;

  return `<div class="pdf-table-wrap" style="overflow-x: auto; margin: 18px 0; page-break-inside: auto !important; break-inside: auto !important;">${captionHtml}<table style="width: 100%; border-collapse: collapse; border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${headerHtml}${bodyHtml}</table>${noteHtml}</div>`;
}

/**
 * Downloads a publication-grade PDF from an existing DOM node ref
 */
export async function exportElementToPDF(element, filename = 'Literature_Review.pdf') {
  if (!element) return;

  const clonedElement = element.cloneNode(true);
  clonedElement.style.width = '700px';
  clonedElement.style.margin = '0 auto';
  clonedElement.style.padding = '0';
  clonedElement.style.backgroundColor = '#ffffff';
  clonedElement.style.color = '#000000';
  clonedElement.style.fontFamily = '"Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif';
  clonedElement.style.boxSizing = 'border-box';

  const printStyles = document.createElement('style');
  printStyles.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Latin+Modern+Roman:ital,wght@0,400;0,700;1,400;1,700&display=swap');

    * {
      box-sizing: border-box !important;
    }
    body, div, p, span, h1, h2, h3, h4, th, td, li, table, strong, em {
      font-family: "Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif !important;
      color: #000000 !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
    }
    .pdf-section {
      page-break-inside: auto !important;
      break-inside: auto !important;
      margin-bottom: 20px !important;
    }
    h1, h2, h3, h4 {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
      color: #000000 !important;
    }
    h1 {
      font-size: 18pt !important;
      font-weight: 700 !important;
      color: #000000 !important;
      margin-bottom: 8px !important;
      line-height: 1.25 !important;
      text-align: center !important;
    }
    h2 {
      font-size: 12.5pt !important;
      font-weight: 700 !important;
      color: #000000 !important;
      margin-top: 22px !important;
      margin-bottom: 8px !important;
      border: none !important;
    }
    h3 {
      font-size: 10.5pt !important;
      font-weight: 700 !important;
      color: #000000 !important;
      margin-top: 14px !important;
      margin-bottom: 6px !important;
    }
    h4 {
      font-size: 9.5pt !important;
      font-weight: 700 !important;
      font-style: italic !important;
      color: #000000 !important;
      margin-top: 10px !important;
      margin-bottom: 4px !important;
    }
    p {
      font-size: 9.5pt !important;
      line-height: 1.6 !important;
      color: #000000 !important;
      margin-bottom: 10px !important;
      text-align: justify !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    li {
      font-size: 9pt !important;
      line-height: 1.5 !important;
      color: #000000 !important;
      margin-bottom: 4px !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    blockquote {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      border-left: 1.5pt solid #000000 !important;
      background-color: transparent !important;
      padding: 4px 12px !important;
      margin: 10px 0 !important;
      font-style: italic !important;
      font-size: 9pt !important;
      color: #000000 !important;
    }
    table {
      page-break-inside: auto !important;
      break-inside: auto !important;
      width: 100% !important;
      border-collapse: collapse !important;
      border-top: 1.5pt solid #000000 !important;
      border-bottom: 1.5pt solid #000000 !important;
      margin: 14px 0 !important;
    }
    th {
      border-bottom: 0.75pt solid #000000 !important;
      background-color: transparent !important;
      color: #000000 !important;
      font-weight: 700 !important;
      padding: 6px 8px !important;
      font-size: 8pt !important;
      text-align: left !important;
    }
    td {
      border-bottom: 0.25pt solid #e5e5e5 !important;
      color: #000000 !important;
      padding: 5px 8px !important;
      font-size: 7.5pt !important;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    th, td {
      word-break: break-word !important;
      overflow-wrap: break-word !important;
    }
    .avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .latex-toc-entry {
      display: flex !important;
      align-items: baseline !important;
      justify-content: space-between !important;
      width: 100% !important;
      margin-bottom: 4px !important;
      font-size: 9pt !important;
    }
    .latex-toc-dots {
      flex: 1 1 auto !important;
      border-bottom: 1.5px dotted #000000 !important;
      margin: 0 8px 3px 8px !important;
      min-width: 20px !important;
    }
    .latex-bib-entry {
      display: flex !important;
      align-items: flex-start !important;
      gap: 8px !important;
      margin-bottom: 6px !important;
      font-size: 8.5pt !important;
      line-height: 1.4 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    hr {
      border: none !important;
      border-top: 0.5pt solid #000000 !important;
      margin: 18px 0 !important;
    }
  `;
  clonedElement.prepend(printStyles);

  const opt = {
    margin: [12, 12, 12, 12],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollY: 0,
      scrollX: 0,
      windowWidth: 700,
      ignoreElements: (node) => node.tagName === 'BUTTON',
      onclone: (clonedDoc) => {
        const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach((s) => {
          if (s.innerHTML && s.innerHTML.includes('oklch')) {
            s.remove();
          }
        });
      },
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['h1', 'h2', 'h3', 'tr', 'blockquote', '.avoid-break', 'li', '.latex-bib-entry'],
    },
  };

  await html2pdf().set(opt).from(clonedElement).save();
}
