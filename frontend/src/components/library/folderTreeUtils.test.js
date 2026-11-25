import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFolderTree,
  flattenVisible,
  folderSubtreeIds,
  smartFilter,
  folderItems,
  foldersOfItem,
  apiErrorMessage,
} from './folderTreeUtils.js';

const F = (id, name, parent_id = null, item_ids = []) => ({ id, name, parent_id, item_ids });

test('nests children and sorts by name', () => {
  const tree = buildFolderTree([F('c', 'Zeta', 'a'), F('a', 'Alpha'), F('b', 'Beta', 'a'), F('d', 'Bravo')]);
  assert.deepEqual(tree.map((n) => n.name), ['Alpha', 'Bravo']);
  assert.deepEqual(tree[0].children.map((n) => n.name), ['Beta', 'Zeta']);
});

test('orphans and self-parents show at the root', () => {
  const tree = buildFolderTree([F('a', 'A', 'missing'), F('b', 'B', 'b')]);
  assert.deepEqual(tree.map((n) => n.id), ['a', 'b']);
});

test('flattenVisible only descends into expanded folders', () => {
  const tree = buildFolderTree([F('a', 'A'), F('b', 'B', 'a'), F('c', 'C', 'b')]);
  assert.deepEqual(flattenVisible(tree, new Set()).map((r) => r.node.id), ['a']);
  const rows = flattenVisible(tree, new Set(['a', 'b']));
  assert.deepEqual(rows.map((r) => [r.node.id, r.depth]), [['a', 0], ['b', 1], ['c', 2]]);
});

test('folderSubtreeIds includes descendants only', () => {
  const folders = [F('a', 'A'), F('b', 'B', 'a'), F('c', 'C', 'b'), F('d', 'D')];
  assert.deepEqual([...folderSubtreeIds(folders, 'a')].sort(), ['a', 'b', 'c']);
});

test('unfiled = in no folder, at any depth', () => {
  const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const folders = [F('a', 'A', null, ['1']), F('b', 'B', 'a', ['2'])];
  assert.deepEqual(smartFilter('unfiled', items, folders).map((i) => i.id), ['3']);
  assert.equal(smartFilter('unfiled', items, []).length, 3);
});

test('recent keeps the newest 50, pdf keeps has_pdf, unknown kind is a no-op', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({
    id: String(i), created_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}`, has_pdf: i % 2 === 0,
  }));
  const recent = smartFilter('recent', items);
  assert.equal(recent.length, 50);
  assert.equal(recent[0].id, '59');
  assert.equal(smartFilter('pdf', items).length, 30);
  assert.equal(smartFilter(null, items), items);
});

test('folderItems and foldersOfItem use direct membership', () => {
  const items = [{ id: '1' }, { id: '2' }];
  const folders = [F('a', 'A', null, ['1']), F('b', 'B', 'a', ['1', '2'])];
  assert.deepEqual(folderItems(items, folders, 'b').map((i) => i.id), ['1', '2']);
  assert.equal(folderItems(items, folders, 'gone'), items);
  assert.deepEqual(foldersOfItem(folders, '1').map((f) => f.id), ['a', 'b']);
});

test('apiErrorMessage prefers a string detail', () => {
  assert.equal(apiErrorMessage({ response: { data: { detail: 'Too deep' } } }, 'x'), 'Too deep');
  assert.equal(apiErrorMessage({ response: { data: { detail: [{ msg: 'bad' }] } } }, 'fallback'), 'fallback');
  assert.equal(apiErrorMessage(null, 'fallback'), 'fallback');
});
