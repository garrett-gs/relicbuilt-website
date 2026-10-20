"use client";

import { useEffect, useRef } from "react";

// ── Global flush registry ────────────────────────────────────────────
// Every form with unsaved edits registers a flush here while it's dirty.
// AutoUpdateOverlay calls flushPendingAutosaves() right before a reload so
// in-flight work is persisted first instead of waiting on the debounce — which
// is what lets the app update itself without losing anyone's work.
const pendingFlushers = new Set<() => void | Promise<void>>();

/**
 * Save every form that currently has unsaved edits, immediately, and resolve
 * once those writes have been kicked off (and settled, where the save returns a
 * promise). Safe to call anytime; a no-op when nothing is dirty.
 */
export async function flushPendingAutosaves(): Promise<void> {
  const flushers = [...pendingFlushers];
  await Promise.all(
    flushers.map((f) => {
      try {
        return Promise.resolve(f());
      } catch {
        return Promise.resolve();
      }
    }),
  );
}

/**
 * Debounced autosave.
 *
 * Calls `save` roughly `delay`ms after the last edit (while `dirty` is true),
 * and flushes any still-pending change when the component unmounts — so moving
 * to another record or navigating away never drops edits.
 *
 * While dirty it also registers a flush with flushPendingAutosaves(), so an
 * imminent reload (e.g. an auto-update) can persist the work on demand.
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save while editing. Re-arms whenever `changeKey` changes.
  useEffect(() => {
    if (!dirty) return;
    timerRef.current = setTimeout(() => {
      void saveRef.current();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dirty, changeKey, delay]);

  // While dirty, expose an on-demand flush: cancel the debounce and save now.
  // Registered/unregistered as the form goes dirty/clean (and on unmount).
  useEffect(() => {
    if (!dirty) return;
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return saveRef.current();
    };
    pendingFlushers.add(flush);
    return () => {
      pendingFlushers.delete(flush);
    };
  }, [dirty]);

  // Flush a pending change on unmount (e.g. switching records / leaving page).
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void saveRef.current();
    };
  }, []);
}
