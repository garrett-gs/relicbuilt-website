"use client";

import { useEffect, useRef } from "react";

/**
 * Debounced autosave.
 *
 * Calls `save` roughly `delay`ms after the last edit (while `dirty` is true),
 * and flushes any still-pending change when the component unmounts — so moving
 * to another record or navigating away never drops edits.
 *
 * `changeKey` must change on every edit so the debounce timer resets per
 * keystroke. Pass the form's state object (its reference changes each edit) or
 * an incrementing counter bumped wherever the page marks itself dirty.
 */
export function useAutosave(
  dirty: boolean,
  changeKey: unknown,
  save: () => void | Promise<void>,
  delay = 900,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Debounced save while editing. Re-arms whenever `changeKey` changes.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void saveRef.current();
    }, delay);
    return () => clearTimeout(t);
  }, [dirty, changeKey, delay]);

  // Flush a pending change on unmount (e.g. switching records / leaving page).
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void saveRef.current();
    };
  }, []);
}
