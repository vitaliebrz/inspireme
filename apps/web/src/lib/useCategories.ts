import { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { api } from './api';
import { resolveIcon, getCategoryIcon } from './categories';

export interface CategoryItem {
  id: string;
  name: string;
  iconName: string | null;
  order: number;
}

let _cache: CategoryItem[] | null = null;
let _promise: Promise<CategoryItem[]> | null = null;

// Abonați montați — notificați la fiecare refetch (adăugare/ștergere categorie de admin),
// ca lista să dispară/apară instant peste tot (filtre feed, dropdown-uri), nu doar la remount.
const _subs = new Set<(c: CategoryItem[]) => void>();

function fetchCategories(): Promise<CategoryItem[]> {
  _promise = api.get<CategoryItem[]>('/categories').then((r) => {
    _cache = r.data;
    _subs.forEach((fn) => fn(r.data));
    return r.data;
  }).catch(() => {
    const empty: CategoryItem[] = [];
    _subs.forEach((fn) => fn(empty));
    return empty;
  });
  return _promise;
}

export function useCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    const onUpdate = (data: CategoryItem[]) => { setCategories(data); setLoading(false); };
    _subs.add(onUpdate);
    if (_cache) { setCategories(_cache); setLoading(false); }
    else { void (_promise ?? fetchCategories()); }
    return () => { _subs.delete(onUpdate); };
  }, []);

  const refresh = useCallback(() => {
    _cache = null;
    _promise = null;
    void fetchCategories();
  }, []);

  return { categories, loading, refresh };
}

// Helper plan — citește din cache și returnează iconul corect pentru un nume de categorie
// Fallback la getCategoryIcon (hardcodat) dacă cache-ul nu e disponibil
export function getIconForCategoryName(categoryName: string): LucideIcon {
  if (_cache) {
    const cat = _cache.find((c) => c.name === categoryName);
    if (cat?.iconName) return resolveIcon(cat.iconName);
  }
  return getCategoryIcon(categoryName);
}

export function invalidateCategoriesCache() {
  _cache = null;
  _promise = null;
  // Reîncărcăm imediat + notificăm toate componentele montate (feed, dropdown-uri)
  void fetchCategories();
}
