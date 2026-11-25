// Pure helpers for the library folder tree and smart collections (no React, no network).

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Turns the flat `[{id, name, parent_id, item_ids}]` list into a sorted forest.
 * A folder whose parent is missing (or is itself) is shown at the root rather than dropped.
 */
export function buildFolderTree(folders = []) {
  const nodes = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id && node.parent_id !== node.id ? nodes.get(node.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  const sortDeep = (list) => {
    list.sort(byName);
    list.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);
  return roots;
}

/** Depth-first `[{node, depth}]` of the rows that are visible given the expanded set. */
export function flattenVisible(roots, expanded, depth = 0, out = []) {
  for (const node of roots) {
    out.push({ node, depth });
    if (node.children.length && expanded.has(node.id)) flattenVisible(node.children, expanded, depth + 1, out);
  }
  return out;
}

/** Every node, expanded or not (for pickers). */
export function flattenAll(roots) {
  return flattenVisible(roots, { has: () => true });
}

/** The ids of a folder and everything below it. */
export function folderSubtreeIds(folders, folderId) {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const RECENT_LIMIT = 50;

/**
 * Smart collections over library items. `kind`: 'unfiled' (in no folder), 'recent'
 * (newest RECENT_LIMIT), 'pdf' (has a PDF). Anything else returns the list unchanged.
 */
export function smartFilter(kind, items, folders = []) {
  if (kind === 'unfiled') {
    const filed = new Set(folders.flatMap((f) => f.item_ids || []));
    return items.filter((i) => !filed.has(i.id));
  }
  if (kind === 'recent') {
    const stamp = (i) => i.created_at || '';
    return [...items]
      .sort((a, b) => stamp(b).localeCompare(stamp(a)) || String(b.id).localeCompare(String(a.id)))
      .slice(0, RECENT_LIMIT);
  }
  if (kind === 'pdf') return items.filter((i) => i.has_pdf);
  return items;
}

/** Items that belong to one folder (direct membership only). */
export function folderItems(items, folders, folderId) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return items;
  const members = new Set(folder.item_ids || []);
  return items.filter((i) => members.has(i.id));
}

/** Folders (flat) that contain a library item. */
export function foldersOfItem(folders, itemId) {
  return folders.filter((f) => (f.item_ids || []).includes(itemId));
}

/** Readable text out of an axios error (FastAPI 422s carry a list, not a string). */
export function apiErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

// Native drag-and-drop payload types (rows -> folders/workspaces, folders -> folders).
export const ITEMS_MIME = 'application/x-scholarsmate-items';
export const FOLDER_MIME = 'application/x-scholarsmate-folder';

/** True when the drag carries the given payload type (dataTransfer.types is a list, not always an array). */
export const hasDragType = (e, type) => Array.from(e.dataTransfer?.types || []).includes(type);
