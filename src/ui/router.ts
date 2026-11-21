import { useEffect, useState } from 'react';

/** Einfache Hash-Navigation: #/baum, #/personen, #/person/P001/familie, #/quellen/Q01 … */
export function useRoute(): string[] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return parts.length ? parts : ['baum'];
}

export function go(...parts: string[]) {
  location.hash = '/' + parts.map(encodeURIComponent).join('/');
}

export function back(fallback: string[] = ['baum']) {
  if (history.length > 1) history.back();
  else go(...fallback);
}
