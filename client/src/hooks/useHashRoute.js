import { useState, useEffect, useCallback } from 'react';

// Keeps the visible page in the URL hash (#/outstanding) so the browser back
// button works and a page can be bookmarked or pasted to a colleague.
//
// `validIds` must be a stable reference - pass a module-level constant, not an
// array literal, or the listener re-subscribes on every render.
const readHash = (validIds, fallback) => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return validIds.includes(id) ? id : fallback;
};

export default function useHashRoute(validIds, fallback) {
  const [view, setView] = useState(() => readHash(validIds, fallback));

  useEffect(() => {
    const onHashChange = () => setView(readHash(validIds, fallback));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [validIds, fallback]);

  // An empty or unknown hash on first load: put the resolved page in the URL
  // without adding a history entry, so Back still leaves the app.
  useEffect(() => {
    if (readHash(validIds, null) === null) {
      window.history.replaceState(null, '', `#/${fallback}`);
    }
  }, [validIds, fallback]);

  const navigate = useCallback((id) => {
    if (readHash(validIds, null) === id) return;
    window.location.hash = `#/${id}`;
  }, [validIds]);

  return [view, navigate];
}
