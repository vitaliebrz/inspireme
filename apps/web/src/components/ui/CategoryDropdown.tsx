import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check, Plus, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useCategories } from '../../lib/useCategories';
import { resolveIcon } from '../../lib/categories';

interface CategoryResponse {
  id: string;
  name: string;
  iconName: string | null;
  order: number;
}

interface Props {
  categories: string[];
  onChange: (cats: string[]) => void;
}

export function CategoryDropdown({ categories, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { categories: availableCategories, loading: catsLoading, refresh } = useCategories();

  // Auto-elimină categoriile orfane (șterse de admin) din selecție la prima încărcare
  const autoCleanedRef = useRef(false);
  useEffect(() => {
    if (catsLoading || availableCategories.length === 0 || autoCleanedRef.current) return;
    autoCleanedRef.current = true;
    const valid = categories.filter((name) => availableCategories.some((c) => c.name === name));
    if (valid.length < categories.length) {
      onChange(valid);
    }
  }, [catsLoading, availableCategories]); // categories omis intenționat — rulăm o singură dată

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setInputVal('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setInputVal('');
    }
  }, [open]);

  const toggle = (name: string) => {
    if (categories.includes(name)) {
      onChange(categories.filter((c) => c !== name));
    } else if (categories.length < 3) {
      onChange([...categories, name]);
    }
  };

  // Categorii selectate care nu mai există în lista globală (au fost șterse de admin)
  const orphaned = categories.filter(
    (name) => !availableCategories.some((c) => c.name === name),
  );

  const trimmed = inputVal.trim();
  const filtered = trimmed
    ? availableCategories.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
    : availableCategories;

  const exactMatch = availableCategories.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = trimmed.length >= 2 && !exactMatch && categories.length < 3;

  const handleAddNew = useCallback(async () => {
    if (!canAdd || adding) return;
    setAdding(true);
    try {
      // Folosim numele returnat de server (cu prima literă mare) nu inputul raw
      const res = await api.post<CategoryResponse>('/categories', { name: trimmed });
      const savedName = res.data.name;
      await refresh();
      onChange([...categories, savedName]);
    } catch {
      // dacă 409 (există deja), categoria există — selectăm varianta din server
      const existing = availableCategories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
      );
      const nameToAdd = existing?.name ?? (trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
      await refresh();
      onChange([...categories, nameToAdd]);
    }
    setInputVal('');
    setAdding(false);
  }, [canAdd, adding, trimmed, categories, availableCategories, onChange, refresh]);

  const label =
    categories.length === 0 ? 'Selectează categorie (max 3)' : categories.join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-[18px] text-sm text-left"
        style={{
          backgroundColor: 'var(--bg-4)',
          border: `1px solid ${open ? 'var(--orange)' : 'var(--border)'}`,
          color: categories.length > 0 ? 'var(--text)' : 'var(--text-2)',
        }}>
        <span className="truncate">{label}</span>
        <ChevronDown
          size={15}
          style={{
            color: 'var(--text-2)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms ease-out',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 rounded-[18px] p-2 z-50"
          style={{
            backgroundColor: 'var(--bg-4)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}>
          {/* Input căutare / adăugare */}
          <div className="mb-2 px-0.5">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canAdd) void handleAddNew();
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Caută sau adaugă categorie..."
              className="w-full px-3 py-1.5 rounded-xl text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          {/* Categorii orfane — șterse de admin, dar încă selectate */}
          {orphaned.length > 0 && (
            <div className="mb-2">
              {orphaned.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm mb-1"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                  }}>
                  <span className="flex-1 font-medium" style={{ color: '#ef4444' }}>{name}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>eliminată</span>
                  <button
                    type="button"
                    onClick={() => onChange(categories.filter((c) => c !== name))}
                    className="shrink-0 p-0.5 rounded"
                    style={{ color: '#ef4444' }}
                    title={`Elimină categoria ${name}`}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="h-px mb-2" style={{ backgroundColor: 'var(--border)' }} />
            </div>
          )}

          {/* Lista categorii filtrate */}
          <div className="grid grid-cols-2 gap-1" style={{ maxHeight: '11rem', overflowY: 'auto' }}>
            {filtered.map((cat) => {
              const selected = categories.includes(cat.name);
              const disabled = !selected && categories.length >= 3;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggle(cat.name)}
                  disabled={disabled}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: selected ? 'rgba(246,166,35,0.12)' : 'transparent',
                    color: selected ? 'var(--orange)' : 'var(--text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected && !disabled)
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-3)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = selected
                      ? 'rgba(246,166,35,0.12)'
                      : 'transparent';
                  }}>
                  {(() => {
                    const Icon = resolveIcon(cat.iconName);
                    return <Icon size={14} style={{ flexShrink: 0, opacity: selected ? 1 : 0.6 }} />;
                  })()}
                  {cat.name}
                  {selected && (
                    <Check size={11} className="ml-auto shrink-0" color="var(--orange)" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && !canAdd && (
              <p
                className="col-span-2 text-xs text-center py-3"
                style={{ color: 'var(--text-2)' }}>
                Nicio categorie găsită
              </p>
            )}
          </div>

          {/* Buton adaugă categorie nouă */}
          {canAdd && (
            <button
              type="button"
              onClick={() => void handleAddNew()}
              disabled={adding}
              className="w-full mt-1.5 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-opacity"
              style={{
                backgroundColor: 'rgba(246,166,35,0.08)',
                color: 'var(--orange)',
                border: '1px dashed rgba(246,166,35,0.35)',
              }}>
              {adding ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              {adding ? 'Se adaugă...' : `Adaugă „${trimmed}"`}
            </button>
          )}

          {categories.length === 3 && (
            <p className="text-xs text-center mt-2 mb-0.5" style={{ color: 'var(--text-2)' }}>
              Maxim 3 categorii selectate
            </p>
          )}
        </div>
      )}
    </div>
  );
}
