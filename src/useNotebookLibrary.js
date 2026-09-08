import { useEffect, useState, useSyncExternalStore } from 'react';
import { createNotebookLibrary } from './notebookStorage';

export function useNotebookLibrary() {
  const [store] = useState(() => createNotebookLibrary());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.initialize();
    // Edits already persist synchronously. This retry also covers a temporarily
    // unavailable store when the browser backgrounds the WebView.
    const flush = () => {
      if (store.getSnapshot().saveState === 'error' || store.getSnapshot().saveState === 'unsaved') store.saveNow();
    };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [store]);

  return { ...snapshot, updateBook: store.updateBook, saveNow: store.saveNow, openBook: store.openBook,
    newBook: store.newBook, copyBook: store.copyBook, importBooks: store.importBooks,
    deleteBook: store.deleteBook, restoreDeleted: store.restoreDeleted,
    restoreCheckpoint: store.restoreCheckpoint, exportBackup: store.exportBackup };
}
