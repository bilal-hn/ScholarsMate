// Table editing for the contentEditable writer. Each operation clones the table, edits the
// clone and returns its HTML; applyTableHtml() then swaps it in through execCommand so the
// browser's own undo stack records one step per operation.
//
// ponytail: merged cells (colspan/rowspan) are not handled. Tables made here never have them;
// a pasted table with merged cells can mis-align columns. Upgrade: map cells to a grid first.

export const TH_STYLE =
  'border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-weight: 600; background: #f8fafc; word-break: break-word; font-size: 12px;';
export const TD_STYLE =
  'border: 1px solid #e2e8f0; padding: 8px 10px; word-break: break-word; font-size: 12px;';
export const TABLE_STYLE =
  'width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin: 1.5rem 0; font-family: inherit; box-sizing: border-box;';

export const SHADE_COLORS = [
  { name: 'None', value: null },
  { name: 'Light gray', value: '#f1f5f9' },
  { name: 'Light yellow', value: '#fef9c3' },
  { name: 'Light green', value: '#dcfce7' },
  { name: 'Light blue', value: '#dbeafe' },
  { name: 'Light pink', value: '#fce7f3' },
  { name: 'Light orange', value: '#ffedd5' },
];

export function tableHtml(rows, cols) {
  const head = Array.from({ length: cols }, (_, c) => `<th style="${TH_STYLE}">Header ${c + 1}</th>`).join('');
  const body = Array.from({ length: Math.max(0, rows - 1) }, (_, r) =>
    `<tr>${Array.from({ length: cols }, (_, c) => `<td style="${TD_STYLE}">Cell ${r + 1},${c + 1}</td>`).join('')}</tr>`
  ).join('');
  return `<table style="${TABLE_STYLE}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><p><br/></p>`;
}

/** The table cell the caret is in, with its position, or null. */
export function getCellContext(editor) {
  const sel = window.getSelection();
  if (!editor || !sel || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  const cell = el?.closest('td, th');
  if (!cell || !editor.contains(cell)) return null;
  const row = cell.parentElement;
  const table = cell.closest('table');
  if (!table || !editor.contains(table)) return null;
  return { table, row, cell, r: Array.from(table.rows).indexOf(row), c: cell.cellIndex };
}

const makeCell = (tag, shade) => {
  const el = document.createElement(tag);
  el.setAttribute('style', tag === 'th' ? TH_STYLE : TD_STYLE);
  if (shade) {
    el.style.backgroundColor = shade;
    el.dataset.shade = shade;
  }
  el.innerHTML = '<br>';
  return el;
};

const retag = (cell, tag) => {
  if (cell.tagName.toLowerCase() === tag) return cell;
  const next = makeCell(tag, cell.dataset.shade);
  next.innerHTML = cell.innerHTML;
  return next;
};

const isHeaderRow = (row) => row.parentElement?.tagName === 'THEAD';

/** Applies one operation to a clone. Returns { html, r, c }; html === '' means the table is gone. */
export function runTableOp(op, ctx, arg) {
  const t = ctx.table.cloneNode(true);
  const rows = Array.from(t.rows);
  const row = rows[ctx.r];
  let { r, c } = ctx;

  if (op === 'row-above' || op === 'row-below') {
    const fresh = document.createElement('tr');
    Array.from(row.cells).forEach((cell) => fresh.appendChild(makeCell(cell.tagName.toLowerCase())));
    if (op === 'row-above') row.before(fresh);
    else {
      row.after(fresh);
      r += 1;
    }
  } else if (op === 'col-left' || op === 'col-right') {
    const at = op === 'col-left' ? c : c + 1;
    rows.forEach((tr) => {
      const ref = tr.cells[Math.min(c, tr.cells.length - 1)];
      const fresh = makeCell(ref ? ref.tagName.toLowerCase() : 'td');
      const before = tr.cells[at];
      if (before) before.before(fresh);
      else tr.appendChild(fresh);
    });
    if (op === 'col-right') c += 1;
  } else if (op === 'row-delete') {
    row.remove();
    if (t.rows.length === 0) return { html: '' };
    r = Math.min(r, t.rows.length - 1);
  } else if (op === 'col-delete') {
    rows.forEach((tr) => tr.cells[c]?.remove());
    if (!t.rows[0] || t.rows[0].cells.length === 0) return { html: '' };
    c = Math.min(c, t.rows[0].cells.length - 1);
  } else if (op === 'header-toggle') {
    const first = rows[0];
    if (isHeaderRow(first)) {
      const body = t.tBodies[0] || t.appendChild(document.createElement('tbody'));
      Array.from(first.cells).forEach((cell) => cell.replaceWith(retag(cell, 'td')));
      body.prepend(first);
      if (!t.tHead.rows.length) t.tHead.remove();
    } else {
      Array.from(first.cells).forEach((cell) => cell.replaceWith(retag(cell, 'th')));
      const head = t.tHead || t.createTHead();
      if (t.firstElementChild !== head) t.prepend(head);
      head.appendChild(first);
    }
  } else if (op === 'shade') {
    const cell = rows[r].cells[c];
    cell.style.backgroundColor = arg || '';
    if (arg) cell.dataset.shade = arg;
    else delete cell.dataset.shade;
    // A cleared header cell should go back to the header tint, not to nothing.
    if (!arg && cell.tagName === 'TH') cell.style.backgroundColor = '#f8fafc';
  }
  return { html: t.outerHTML, r, c };
}

const placeCaret = (editor, tableIndex, r, c) => {
  const table = editor.querySelectorAll('table')[tableIndex];
  const cell = table?.rows[r]?.cells[c];
  if (!cell) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

/**
 * Swaps `table` for `html` by selecting it and running insertHTML, which keeps Ctrl+Z working.
 * Returns true when the browser did it, false when we had to edit the DOM directly.
 */
export function applyTableHtml(editor, table, html, caret) {
  const index = Array.from(editor.querySelectorAll('table')).indexOf(table);
  const range = document.createRange();
  range.selectNode(table);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  editor.focus();

  const ok = html ? document.execCommand('insertHTML', false, html) : document.execCommand('delete');
  if (ok && !table.isConnected) {
    if (html && caret) placeCaret(editor, index, caret.r, caret.c);
    return true;
  }

  // ponytail: no undo for table edits when insertHTML is refused (older/odd browsers). The
  // table is then swapped in the DOM directly. Upgrade: keep an app-level undo stack.
  if (table.isConnected) {
    if (html) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      table.replaceWith(tpl.content);
      if (caret) placeCaret(editor, index, caret.r, caret.c);
    } else {
      table.remove();
    }
  }
  return false;
}
