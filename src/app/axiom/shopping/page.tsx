"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { ShoppingItem, ShoppingList } from "@/types/axiom";
import { Plus, Trash2, Check, X, Undo2, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const inp =
  "w-full bg-card border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent";

// Pending purchases — the toast lets the user undo within this window.
const UNDO_TIMEOUT_MS = 7000;

interface UndoSnapshot {
  listId: string;
  itemId: string;
  itemText: string;
  expiresAt: number;
}

export default function ShoppingPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);

  // Auto-clear the undo toast when its window expires. Stored on a ref
  // so we can cancel + reschedule when a new item is checked off mid-window.
  const undoTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await axiom
      .from("shopping_lists")
      .select("*")
      .order("created_at", { ascending: true });
    setLists((data as ShoppingList[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    };
  }, []);

  function scheduleUndoExpiry(snap: UndoSnapshot) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndo((current) => (current && current.itemId === snap.itemId ? null : current));
    }, UNDO_TIMEOUT_MS);
  }

  async function persistList(listId: string, patch: Partial<ShoppingList>) {
    const { data, error } = await axiom
      .from("shopping_lists")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", listId)
      .select()
      .single();
    if (!error && data) {
      setLists((prev) => prev.map((l) => (l.id === listId ? (data as ShoppingList) : l)));
    } else if (error) {
      console.error("[shopping] persist failed:", error);
    }
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    const { data, error } = await axiom
      .from("shopping_lists")
      .insert({ name, items: [] })
      .select()
      .single();
    if (!error && data) {
      setLists((prev) => [...prev, data as ShoppingList]);
      setNewListName("");
      setCreatingList(false);
    } else if (error) {
      console.error("[shopping] create list failed:", error);
    }
  }

  async function renameList(listId: string, name: string) {
    await persistList(listId, { name: name.trim() || "Untitled" });
  }

  async function deleteList(listId: string) {
    const { error } = await axiom.from("shopping_lists").delete().eq("id", listId);
    if (error) {
      console.error("[shopping] delete list failed:", error);
      return;
    }
    setLists((prev) => prev.filter((l) => l.id !== listId));
  }

  async function addItem(listId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    const entry: ShoppingItem = {
      id: crypto.randomUUID(),
      text: trimmed,
      purchased: false,
      created_at: new Date().toISOString(),
    };
    await persistList(listId, { items: [...list.items, entry] });
  }

  async function togglePurchased(listId: string, itemId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return;
    const nowPurchased = !item.purchased;
    const updated = list.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            purchased: nowPurchased,
            purchased_at: nowPurchased ? new Date().toISOString() : undefined,
          }
        : i,
    );
    await persistList(listId, { items: updated });

    if (nowPurchased) {
      // Hide it from the active list and offer a short undo window.
      const snap: UndoSnapshot = {
        listId,
        itemId,
        itemText: item.text,
        expiresAt: Date.now() + UNDO_TIMEOUT_MS,
      };
      setUndo(snap);
      scheduleUndoExpiry(snap);
    }
  }

  async function doUndo() {
    if (!undo) return;
    await togglePurchased(undo.listId, undo.itemId);
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }

  async function deleteItem(listId: string, itemId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    await persistList(listId, { items: list.items.filter((i) => i.id !== itemId) });
  }

  async function clearPurchased(listId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    await persistList(listId, { items: list.items.filter((i) => !i.purchased) });
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shopping</h1>
          <p className="text-muted text-sm mt-0.5">
            Tools, materials, anything else to pick up. Check items off as you grab them.
          </p>
        </div>
        {!creatingList ? (
          <button
            onClick={() => setCreatingList(true)}
            className="flex items-center gap-1.5 bg-accent text-background px-4 py-2 text-sm font-semibold hover:bg-accent/90"
          >
            <Plus size={14} /> New list
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createList();
                if (e.key === "Escape") {
                  setCreatingList(false);
                  setNewListName("");
                }
              }}
              placeholder="e.g. Home Depot"
              className={inp + " w-56"}
              style={{ fontSize: 16 }}
            />
            <button
              onClick={createList}
              disabled={!newListName.trim()}
              className="flex items-center gap-1.5 bg-accent text-background px-3 py-2 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setCreatingList(false);
                setNewListName("");
              }}
              className="text-muted hover:text-foreground p-2"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="border border-border bg-card p-10 text-center">
          <p className="text-foreground text-sm mb-1">No lists yet.</p>
          <p className="text-muted text-xs">
            Tap <span className="text-accent">+ New list</span> to start one (Home Depot, Menards, Amazon, etc.).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <ShoppingListCard
              key={list.id}
              list={list}
              onRename={(name) => renameList(list.id, name)}
              onDelete={() => deleteList(list.id)}
              onAddItem={(text) => addItem(list.id, text)}
              onToggle={(itemId) => togglePurchased(list.id, itemId)}
              onDeleteItem={(itemId) => deleteItem(list.id, itemId)}
              onClearPurchased={() => clearPurchased(list.id)}
            />
          ))}
        </div>
      )}

      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg px-4 py-3 flex items-center gap-3 max-w-[90vw]">
          <Check size={14} className="text-accent shrink-0" />
          <span className="text-sm text-foreground truncate max-w-xs">{undo.itemText}</span>
          <button
            onClick={doUndo}
            className="flex items-center gap-1 text-accent text-xs font-semibold hover:text-accent/80 whitespace-nowrap"
          >
            <Undo2 size={12} /> Undo
          </button>
          <button
            onClick={() => {
              setUndo(null);
              if (undoTimer.current) window.clearTimeout(undoTimer.current);
            }}
            className="text-muted hover:text-foreground shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function ShoppingListCard({
  list,
  onRename,
  onDelete,
  onAddItem,
  onToggle,
  onDeleteItem,
  onClearPurchased,
}: {
  list: ShoppingList;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: (text: string) => void;
  onToggle: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onClearPurchased: () => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(list.name);
  const [showPurchased, setShowPurchased] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = list.items.filter((i) => !i.purchased);
  const purchased = list.items.filter((i) => i.purchased);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (draftName.trim() && draftName !== list.name) onRename(draftName);
              else setDraftName(list.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraftName(list.name);
                setEditingName(false);
              }
            }}
            className="flex-1 bg-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent"
            style={{ fontSize: 16 }}
          />
        ) : (
          <>
            <h2 className="text-lg font-semibold text-foreground flex-1 truncate">{list.name}</h2>
            <span className="text-xs text-muted">{active.length}</span>
            <button
              onClick={() => setEditingName(true)}
              className="text-muted hover:text-foreground p-1"
              title="Rename"
            >
              <Pencil size={13} />
            </button>
          </>
        )}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-muted hover:text-red-500 p-1"
            title="Delete list"
          >
            <Trash2 size={13} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-500">Delete?</span>
            <button
              onClick={onDelete}
              className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground"
            >
              No
            </button>
          </div>
        )}
      </div>

      <div className="p-4 border-b border-border flex items-center gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItem.trim()) {
              onAddItem(newItem);
              setNewItem("");
            }
          }}
          placeholder="Add an item…"
          className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          style={{ fontSize: 16 }}
        />
        <button
          onClick={() => {
            if (newItem.trim()) {
              onAddItem(newItem);
              setNewItem("");
            }
          }}
          disabled={!newItem.trim()}
          className="bg-accent text-background px-3 py-2 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">
          {list.items.length === 0 ? "Nothing on the list yet." : "All items purchased."}
        </p>
      ) : (
        <ul>
          {active.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onToggle={() => onToggle(item.id)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
        </ul>
      )}

      {purchased.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowPurchased((s) => !s)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-muted hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              {showPurchased ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {purchased.length} purchased
            </span>
            {showPurchased && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClearPurchased();
                }}
                className="text-red-400 hover:text-red-500 cursor-pointer"
              >
                Clear all
              </span>
            )}
          </button>
          {showPurchased && (
            <ul className="border-t border-border">
              {purchased.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() => onToggle(item.id)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 group">
      <button
        onClick={onToggle}
        className={cn(
          "shrink-0 w-5 h-5 border flex items-center justify-center transition-colors",
          item.purchased ? "bg-accent border-accent" : "border-border hover:border-accent",
        )}
        aria-label={item.purchased ? "Mark not purchased" : "Mark purchased"}
      >
        {item.purchased && <Check size={12} className="text-background" />}
      </button>
      <span
        onClick={onToggle}
        className={cn(
          "flex-1 text-sm cursor-pointer select-none",
          item.purchased ? "text-muted line-through" : "text-foreground",
        )}
      >
        {item.text}
      </span>
      <button
        onClick={onDelete}
        className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity shrink-0"
        title="Remove"
      >
        <X size={13} />
      </button>
    </li>
  );
}
