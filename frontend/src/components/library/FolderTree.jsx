import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Check, Folder, FolderInput, FolderOpen, FolderPlus, Pencil, Trash2, X } from 'lucide-react';
import { createFolderAPI, updateFolderAPI, deleteFolderAPI } from '../../services/api';
import {
  buildFolderTree,
  flattenVisible,
  flattenAll,
  folderSubtreeIds,
  apiErrorMessage,
  hasDragType,
  ITEMS_MIME,
  FOLDER_MIME,
} from './folderTreeUtils';

const STORAGE_KEY = 'scholarsmate.library.expandedFolders';
const ROOT = '__root__';
const NAME_MAX = 120;

const loadExpanded = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
  } catch {
    return new Set();
  }
};

const saveExpanded = (set) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // storage unavailable: expansion just won't persist
  }
};

const indent = (depth) => ({ paddingLeft: 6 + depth * 14 });

/**
 * Nested folder tree. Folders are organisation only (they never change RAG scope).
 * `onChanged` must re-fetch the folder list; `onDropItems(folderId, docIds)` handles papers dropped on a folder.
 */
export default function FolderTree({ folders, activeFolderId, onSelect, onChanged, onNotify, onDropItems }) {
  const [expanded, setExpanded] = useState(loadExpanded);
  const [editing, setEditing] = useState(null); // { kind: 'rename', id } | { kind: 'create', parentId }
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [dropId, setDropId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const rowRefs = useRef(new Map());
  const settledRef = useRef(true);
  const pendingFocusRef = useRef(null); // row to focus once it exists after a re-render
  const cancelRef = useRef(null);
  const moveRef = useRef(null);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const rows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const positions = useMemo(() => {
    const map = new Map();
    const walk = (list) =>
      list.forEach((n, i) => {
        map.set(n.id, { size: list.length, pos: i + 1 });
        walk(n.children);
      });
    walk(tree);
    return map;
  }, [tree]);
  const tabbableId = rows.some((r) => r.node.id === focusId) ? focusId : rows[0]?.node.id;
  const confirmFolder = confirmId ? byId.get(confirmId) : null;
  const movingFolder = movingId ? byId.get(movingId) : null;
  const movable = useMemo(() => {
    if (!movingId) return [];
    const blocked = folderSubtreeIds(folders, movingId);
    return folders.filter((f) => !blocked.has(f.id));
  }, [folders, movingId]);

  // Focus a row once it is rendered (after rename, create, delete, move).
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (el) {
      pendingFocusRef.current = null;
      el.focus(); // onFocus records it as the tabbable row
    }
  });

  useEffect(() => {
    if (confirmId) cancelRef.current?.focus();
  }, [confirmId]);

  useEffect(() => {
    if (movingId) moveRef.current?.querySelector('button:not(:disabled)')?.focus();
  }, [movingId]);

  const setOpen = (id, open) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      saveExpanded(next);
      return next;
    });

  const focusRow = (id) => {
    setFocusId(id);
    rowRefs.current.get(id)?.focus();
  };

  // The row to land on after `id` (and anything under it) disappears.
  const neighbourOf = (id) => {
    const gone = folderSubtreeIds(folders, id);
    const i = rows.findIndex((r) => r.node.id === id);
    const after = rows.slice(i + 1).find((r) => !gone.has(r.node.id));
    const before = rows.slice(0, Math.max(i, 0)).reverse().find((r) => !gone.has(r.node.id));
    return (after || before)?.node.id || null;
  };

  // ---- create / rename -----------------------------------------------------
  const startRename = (folder) => {
    setConfirmId(null);
    setMovingId(null);
    settledRef.current = false;
    setDraft(folder.name);
    setEditing({ kind: 'rename', id: folder.id });
  };

  const startCreate = (parentId = null) => {
    setConfirmId(null);
    setMovingId(null);
    if (parentId) setOpen(parentId, true);
    settledRef.current = false;
    setDraft('');
    setEditing({ kind: 'create', parentId });
  };

  const cancelEdit = () => {
    settledRef.current = true;
    pendingFocusRef.current = editing?.kind === 'rename' ? editing.id : editing?.parentId || null;
    setEditing(null);
  };

  const commitEdit = async () => {
    if (!editing || settledRef.current) return;
    settledRef.current = true;
    const edit = editing;
    const name = draft.trim();
    setEditing(null);
    if (!name) {
      pendingFocusRef.current = edit.kind === 'rename' ? edit.id : edit.parentId || null;
      return;
    }
    if (name.length > NAME_MAX) {
      onNotify?.({ type: 'error', message: `Folder names can be at most ${NAME_MAX} characters.` });
      return;
    }
    try {
      if (edit.kind === 'create') {
        const created = await createFolderAPI(name, edit.parentId);
        pendingFocusRef.current = created?.id || null;
      } else {
        pendingFocusRef.current = edit.id;
        if (name !== byId.get(edit.id)?.name) await updateFolderAPI(edit.id, { name });
      }
      await onChanged?.();
    } catch (err) {
      onNotify?.({ type: 'error', message: apiErrorMessage(err, 'Could not save the folder.') });
    }
  };

  const nameInput = (label) => (
    <input
      type="text"
      autoFocus
      maxLength={NAME_MAX}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep Escape/Enter from reaching the library's window handler
        if (e.key === 'Enter') commitEdit();
        else if (e.key === 'Escape') cancelEdit();
      }}
      onBlur={commitEdit}
      placeholder="Folder name..."
      className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
    />
  );

  // ---- delete ---------------------------------------------------------------
  const closeConfirm = () => {
    pendingFocusRef.current = confirmId;
    setConfirmId(null);
  };

  const confirmDelete = async () => {
    const folder = confirmFolder;
    if (!folder) return;
    pendingFocusRef.current = neighbourOf(folder.id);
    setConfirmId(null);
    try {
      await deleteFolderAPI(folder.id);
      onNotify?.({ type: 'success', message: `Deleted folder "${folder.name}". Its papers stay in your library.` });
      await onChanged?.();
    } catch (err) {
      pendingFocusRef.current = folder.id;
      onNotify?.({ type: 'error', message: apiErrorMessage(err, 'Could not delete the folder.') });
    }
  };

  // ---- move (drag, or the keyboard "Move to..." panel) ----------------------
  const moveFolder = async (folderId, parentId) => {
    const folder = byId.get(folderId);
    if (!folder || folderId === parentId || (folder.parent_id || null) === parentId) return;
    try {
      await updateFolderAPI(folderId, { parent_id: parentId });
      if (parentId) setOpen(parentId, true);
      pendingFocusRef.current = folderId;
      await onChanged?.();
    } catch (err) {
      // 409: cycle or nesting too deep. The server's wording is the message.
      onNotify?.({ type: 'error', message: apiErrorMessage(err, 'Could not move the folder.') });
    }
  };

  const closeMove = () => {
    pendingFocusRef.current = movingId;
    setMovingId(null);
  };

  const pickMoveTarget = (parentId) => {
    const id = movingId;
    setMovingId(null);
    moveFolder(id, parentId);
  };

  // ---- drag and drop --------------------------------------------------------
  const acceptsDrag = (e, folderOnly) =>
    hasDragType(e, FOLDER_MIME) || (!folderOnly && hasDragType(e, ITEMS_MIME));

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    setDropId(null);
    const draggedFolder = e.dataTransfer.getData(FOLDER_MIME);
    if (draggedFolder) {
      moveFolder(draggedFolder, targetId);
      return;
    }
    const raw = e.dataTransfer.getData(ITEMS_MIME);
    if (!raw || !targetId) return;
    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length) onDropItems?.(targetId, ids);
    } catch {
      // malformed payload from another source: ignore
    }
  };

  const onTargetDragOver = (e, targetId, folderOnly = false) => {
    if (!acceptsDrag(e, folderOnly)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = hasDragType(e, FOLDER_MIME) ? 'move' : 'copy';
    setDropId(targetId || ROOT);
  };

  const onTargetDragLeave = (e, targetId) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropId((prev) => (prev === (targetId || ROOT) ? null : prev));
  };

  // ---- keyboard -------------------------------------------------------------
  const onRowKeyDown = (e, index) => {
    // Escape belongs to the tree here; letting it bubble would close the whole library.
    if (e.key === 'Escape') {
      e.stopPropagation();
      return;
    }
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const { node } = rows[index];
    const open = expanded.has(node.id);
    const handled = () => e.preventDefault();
    switch (e.key) {
      case 'ArrowDown':
        handled();
        if (rows[index + 1]) focusRow(rows[index + 1].node.id);
        break;
      case 'ArrowUp':
        handled();
        if (rows[index - 1]) focusRow(rows[index - 1].node.id);
        break;
      case 'Home':
        handled();
        focusRow(rows[0].node.id);
        break;
      case 'End':
        handled();
        focusRow(rows[rows.length - 1].node.id);
        break;
      case 'ArrowRight':
        handled();
        if (node.children.length) {
          if (!open) setOpen(node.id, true);
          else focusRow(node.children[0].id);
        }
        break;
      case 'ArrowLeft':
        handled();
        if (open && node.children.length) setOpen(node.id, false);
        else if (node.parent_id && byId.has(node.parent_id)) focusRow(node.parent_id);
        break;
      case 'Enter':
      case ' ':
        handled();
        onSelect?.(node.id);
        break;
      case 'F2':
        handled();
        startRename(node);
        break;
      case 'Delete':
        handled();
        setMovingId(null);
        setConfirmId(node.id);
        break;
      case 'm':
        handled();
        setConfirmId(null);
        setMovingId(node.id);
        break;
      case 'n':
        handled();
        startCreate(node.id);
        break;
      default:
    }
  };

  const onPanelKeyDown = (e, close) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  // ---- render ---------------------------------------------------------------
  const iconButton = 'p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700/70 cursor-pointer transition-colors';

  const createRow = (parentId, depth) => (
    <div key={`create-${parentId || ROOT}`} className="flex items-center gap-1 pr-1 py-1" style={indent(depth)}>
      <span className="w-4 shrink-0" />
      <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--theme-accent-primary,#e06c67)]" />
      {nameInput(parentId ? `New subfolder name in ${byId.get(parentId)?.name || 'folder'}` : 'New folder name')}
    </div>
  );

  return (
    <div
      className={`rounded transition-colors ${dropId === ROOT ? 'bg-amber-500/10' : ''}`}
      onDragOver={(e) => onTargetDragOver(e, null, true)}
      onDragLeave={(e) => onTargetDragLeave(e, null)}
      onDrop={(e) => handleDrop(e, null)}
    >
      <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">Folders</span>
        <button
          type="button"
          onClick={() => startCreate(null)}
          className={iconButton}
          aria-label="New folder"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div role="tree" aria-label="Folders" className="space-y-0.5">
        {editing?.kind === 'create' && editing.parentId === null && createRow(null, 0)}

        {rows.map(({ node, depth }, index) => {
          const hasChildren = node.children.length > 0;
          const isOpen = expanded.has(node.id);
          const isActive = activeFolderId === node.id;
          const isRenaming = editing?.kind === 'rename' && editing.id === node.id;
          const place = positions.get(node.id);
          return (
            <React.Fragment key={node.id}>
              <div
                role="treeitem"
                aria-label={node.name}
                aria-level={depth + 1}
                aria-setsize={place?.size}
                aria-posinset={place?.pos}
                aria-expanded={hasChildren ? isOpen : undefined}
                aria-selected={isActive}
                tabIndex={node.id === tabbableId ? 0 : -1}
                ref={(el) => {
                  if (el) rowRefs.current.set(node.id, el);
                  else rowRefs.current.delete(node.id);
                }}
                draggable={!isRenaming}
                onDragStart={(e) => {
                  e.dataTransfer.setData(FOLDER_MIME, node.id);
                  e.dataTransfer.setData('text/plain', node.name);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => onTargetDragOver(e, node.id)}
                onDragLeave={(e) => onTargetDragLeave(e, node.id)}
                onDrop={(e) => handleDrop(e, node.id)}
                onClick={() => {
                  setFocusId(node.id);
                  onSelect?.(isActive ? null : node.id);
                }}
                onFocus={() => setFocusId(node.id)}
                onKeyDown={(e) => onRowKeyDown(e, index)}
                style={indent(depth)}
                className={`group flex items-center gap-1 pr-1 py-1 rounded text-[11.5px] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 transition-colors ${
                  dropId === node.id
                    ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/40'
                    : isActive
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100'
                }`}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(node.id, !isOpen);
                    }}
                    className="p-0.5 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}

                {isOpen && hasChildren ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--theme-accent-primary,#e06c67)]" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--theme-accent-primary,#e06c67)]" />
                )}

                {isRenaming ? (
                  nameInput(`Rename folder ${node.name}`)
                ) : (
                  <>
                    <span className="truncate flex-1 text-left" title={node.name}>{node.name}</span>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0 group-hover:hidden group-focus-within:hidden">
                      {node.item_ids?.length || 0}
                    </span>
                    <span className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        tabIndex={-1}
                        className={iconButton}
                        aria-label={`New subfolder in ${node.name}`}
                        title="New subfolder (N)"
                        onClick={(e) => {
                          e.stopPropagation();
                          startCreate(node.id);
                        }}
                      >
                        <FolderPlus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={iconButton}
                        aria-label={`Move ${node.name} to…`}
                        title="Move to… (M)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(null);
                          setMovingId(node.id);
                        }}
                      >
                        <FolderInput className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={iconButton}
                        aria-label={`Rename ${node.name}`}
                        title="Rename (F2)"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(node);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`${iconButton} hover:text-red-400`}
                        aria-label={`Delete ${node.name}`}
                        title="Delete (Del)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMovingId(null);
                          setConfirmId(node.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </>
                )}
              </div>
              {editing?.kind === 'create' && editing.parentId === node.id && createRow(node.id, depth + 1)}
            </React.Fragment>
          );
        })}
      </div>

      {rows.length === 0 && !editing && (
        <p className="px-2 py-1 text-[10.5px] text-zinc-500 italic">No folders yet. Use + to create one.</p>
      )}

      {confirmFolder && (
        <div
          role="alert"
          onKeyDown={(e) => onPanelKeyDown(e, closeConfirm)}
          className="mx-1 my-1 p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 space-y-1.5"
        >
          <p>
            Delete folder <span className="font-semibold text-zinc-100">"{confirmFolder.name}"</span>? Its subfolders go
            with it. Your papers stay in the library.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={confirmDelete}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800/70 text-red-100 text-[10.5px] font-medium cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Delete folder
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={closeConfirm}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10.5px] cursor-pointer"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {movingFolder && (
        <div
          ref={moveRef}
          role="group"
          aria-label={`Move folder ${movingFolder.name}`}
          onKeyDown={(e) => onPanelKeyDown(e, closeMove)}
          className="mx-1 my-1 p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 space-y-1.5"
        >
          <p>
            Move <span className="font-semibold text-zinc-100">"{movingFolder.name}"</span> to:
          </p>
          <div className="max-h-40 overflow-y-auto rounded border border-zinc-800 py-0.5">
            <button
              type="button"
              disabled={!movingFolder.parent_id}
              onClick={() => pickMoveTarget(null)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
            >
              <FolderOpen className="h-3 w-3 shrink-0 text-zinc-400" />
              <span className="truncate flex-1">Top level</span>
              {!movingFolder.parent_id && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
            </button>
            <FolderPickerList
              folders={movable}
              excludeIds={movingFolder.parent_id ? [movingFolder.parent_id] : []}
              onPick={pickMoveTarget}
            />
          </div>
          <button
            type="button"
            onClick={closeMove}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10.5px] cursor-pointer"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Indented list of folders to pick from (row menu, inspector, move panel). Plain buttons, so Tab walks them;
 * folders in `excludeIds` show as already chosen.
 */
export function FolderPickerList({ folders, excludeIds = [], onPick, emptyText = 'No folders yet.' }) {
  const list = useMemo(() => flattenAll(buildFolderTree(folders)), [folders]);
  if (list.length === 0) {
    return <div className="px-2 py-1.5 text-[10.5px] text-zinc-500 italic">{emptyText}</div>;
  }
  return (
    <div>
      {list.map(({ node, depth }) => {
        const already = excludeIds.includes(node.id);
        return (
          <button
            key={node.id}
            type="button"
            disabled={already}
            onClick={() => onPick(node.id)}
            style={{ paddingLeft: 8 + depth * 12 }}
            className="w-full flex items-center gap-1.5 pr-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
          >
            <Folder className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="truncate flex-1">{node.name}</span>
            {already && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
