import { useState, useEffect, FormEvent, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  X, FileText, Loader2, ImageIcon, Globe, Lock,
  Lightbulb, Send, Clock, Eye, Check,
  MessageSquare, Star, Crown, UploadCloud,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFileDrop } from '../../lib/useFileDrop';
import { getCategoryIcon } from '../../lib/categories';
import { RichTextEditor } from '../../components/ui/RichTextArea';
import { CategoryDropdown } from '../../components/ui/CategoryDropdown';

const MAX_IMAGES_GRATUIT = 3;
const MAX_IMAGES_PRO = 10;
const MIN_WORDS = 100;
const DRAFT_KEY = 'ideaNewDraft';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(html: string) {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

function charColor(current: number, min: number) {
  if (current >= min) return '#22c55e';
  if (current >= Math.ceil(min / 2)) return 'var(--orange)';
  return 'var(--text-2)';
}

function formatTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface DraftState {
  title: string;
  categories: string[];
  problem: string;
  solution: string;
  tags: string[];
  visibility: 'PUBLIC' | 'PRIVAT';
  savedAt?: string;
}

// ─── Preview card — identic cu IdeaCard din feed ─────────────────────────────

function IdeaPreviewCard({
  title,
  categories,
  problem,
  isPro,
  imagePreviews,
}: {
  title: string;
  categories: string[];
  problem: string;
  isPro: boolean;
  imagePreviews: string[];
}) {
  const categoryLabel = categories[0] ?? '';
  const CategoryIcon = getCategoryIcon(categoryLabel);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Eye size={14} style={{ color: 'var(--text-2)' }} />
        <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          Previzualizare card
        </p>
      </div>

      <article
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--border)',
          boxShadow: isPro ? '0 0 0 1.5px rgba(246,166,35,0.3)' : undefined,
        }}>

        {/* Cover — identic cu IdeaCard */}
        {imagePreviews[0] ? (
          <div className="h-36 overflow-hidden">
            <img src={imagePreviews[0]} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="h-36 flex flex-col items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--bg-3)' }}>
            {CategoryIcon ? (
              <CategoryIcon size={28} style={{ color: 'var(--orange)', opacity: 0.7 }} />
            ) : null}
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-2)' }}>
              {categoryLabel || 'Categorie'}
            </span>
          </div>
        )}

        <div className="flex flex-col flex-1 p-4 gap-3">
          {/* Categorie badge + Pro + Status */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
              {categoryLabel || 'Categorie'}
            </span>
            <div className="flex items-center gap-1.5">
              {isPro && (
                <span
                  className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(246,166,35,0.18)', color: 'var(--orange)' }}>
                  <Crown size={10} /> Pro
                </span>
              )}
              <span className="text-xs font-medium" style={{ color: '#8892a4' }}>Publicat</span>
            </div>
          </div>

          {/* Titlu */}
          <h3
            className="font-bold text-sm leading-snug line-clamp-2"
            style={{ color: title ? 'var(--text)' : 'var(--text-2)' }}>
            {title || 'Titlul ideii tale apare aici...'}
          </h3>

          {/* Problemă */}
          <p className="text-xs leading-relaxed line-clamp-2 flex-1" style={{ color: 'var(--text-2)' }}>
            {stripHtml(problem) || 'Descrierea problemei va apărea aici...'}
          </p>

          {/* Footer: autor + stats */}
          <div
            className="flex items-center justify-between pt-2"
            style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                Tu
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Tu</span>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
              <span className="flex items-center gap-1"><Eye size={12} /> 0</span>
              <span className="flex items-center gap-1"><Star size={12} /> 0</span>
              <span className="flex items-center gap-1"><MessageSquare size={12} /> 0</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IdeaNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isPro = user?.plan === 'PRO';
  const maxImages = isPro ? MAX_IMAGES_PRO : MAX_IMAGES_GRATUIT;

  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVAT'>('PUBLIC');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Încarcă draft din localStorage la mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d: DraftState = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.categories?.length) setCategories(d.categories);
        if (d.problem) setProblem(d.problem);
        if (d.solution) setSolution(d.solution);
        if (d.tags?.length) setTags(d.tags);
        if (d.visibility) setVisibility(d.visibility);
        if (d.savedAt) setDraftSavedAt(d.savedAt);
        setDraftRestored(true);
      }
    } catch { /* ignoră draft corupt */ }
  }, []);

  // Auto-save draft — debounce 5s, indicator „Se salvează..."
  useEffect(() => {
    if (!title && !problem && !solution) return;
    setDraftSaving(true);
    const timer = setTimeout(() => {
      const savedAt = formatTime(new Date());
      const draft: DraftState = { title, categories, problem, solution, tags, visibility, savedAt };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(savedAt);
      setDraftSaving(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [title, categories, problem, solution, tags, visibility]);

  const wordCount = countWords(problem) + countWords(solution);
  // Limita de 100 cuvinte nu blochează publicarea — e doar pentru eligibilitate giveaway
  const problemText = stripHtml(problem);
  const solutionText = stripHtml(solution);

  const isValid =
    title.trim().length >= 5 &&
    categories.length > 0 &&
    problemText.length >= 20 &&
    solutionText.length >= 20;

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags((prev) => [...prev, t]);
      setTagInput('');
    }
  };

  const handleImages = (files: FileList | File[] | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, maxImages - images.length);
    setImages((prev) => [...prev, ...newFiles]);
    newFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag & drop + paste pentru zona de imagini/PDF
  const { dragActive, dropHandlers } = useFileDrop({
    onImages: handleImages,
    onPdf: setPdf,
    enabled: !loading,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post<{ id: string }>('/ideas', {
        title,
        categories,
        problem,
        solution,
        tags,
        visibility,
      });
      const ideaId = data.id;

      if (images.length > 0) {
        try {
          const formData = new FormData();
          images.forEach((img) => formData.append('images', img));
          await api.post(`/ideas/${ideaId}/images`, formData);
        } catch { /* non-fatal */ }
      }

      if (pdf) {
        try {
          const formData = new FormData();
          formData.append('pdf', pdf);
          await api.post(`/ideas/${ideaId}/pdf`, formData);
        } catch { /* non-fatal */ }
      }

      localStorage.removeItem(DRAFT_KEY);
      setDraftSavedAt(null);
      setDraftSaving(false);
      setDraftRestored(false);
      // Anunță Sidebar-ul să reevalueze limita de idei (blocare buton la Gratuit)
      window.dispatchEvent(new Event('ideas:changed'));
      toast('Ideea a fost publicată cu succes!', 'success');
      navigate(`/idea/${ideaId}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'A apărut o eroare. Încearcă din nou.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Heading */}
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[1.2px] mb-2" style={{ color: 'var(--orange)' }}>
          Creare
        </p>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>Idee Nouă</h1>
      </div>

      {/* Banner upgrade Pro */}
      {!isPro && (
        <div
          className="flex items-center gap-3 p-4 rounded-[18px] mb-6"
          style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.2)' }}>
          <Lightbulb size={18} style={{ color: 'var(--orange)', flexShrink: 0 }} />
          <p className="flex-1 text-sm" style={{ color: 'var(--text-2)' }}>
            Ideile cu plan Pro primesc cu{' '}
            <span className="font-bold" style={{ color: 'var(--text)' }}>5x mai multe vizualizări</span>
          </p>
          <Link
            to="/subscriptions"
            className="px-3 py-1.5 rounded-[14px] text-xs font-bold shrink-0"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
            Upgrade
          </Link>
        </div>
      )}

      {/* Layout: formular + preview */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr' }}>
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

          {/* ── Formular ── */}
          <form onSubmit={handleSubmit} className="flex-1 min-w-0">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)' }}>

              {/* Header card */}
              <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                  Prezintă-ți ideea de business
                </h2>
              </div>

              {/* Câmpuri */}
              <div className="p-5 space-y-5">

                {/* Titlu */}
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    Titlu *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: RecycleReward — App de reciclare cu puncte"
                    maxLength={100}
                    required
                    className="w-full px-4 py-2.5 rounded-[18px] text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <p
                    className="text-xs mt-1 flex items-center justify-end gap-1"
                    style={{ color: charColor(title.trim().length, 5) }}>
                    {title.trim().length >= 5 && <Check size={11} />}
                    {title.length}/100
                  </p>
                </div>

                {/* Categorie multi-select */}
                <div className="max-w-full sm:max-w-sm">
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    Categorie * <span className="font-normal text-xs" style={{ color: 'var(--text-2)' }}>(max 3)</span>
                  </label>
                  <CategoryDropdown categories={categories} onChange={setCategories} />
                </div>

                {/* Problema rezolvată */}
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    Problema rezolvată *
                  </label>
                  <RichTextEditor
                    value={problem}
                    onChange={setProblem}
                    minHeight={100}
                    placeholder="Ce problemă reală rezolvă ideea ta?"
                  />
                  <p
                    className="text-xs mt-1 flex items-center justify-end gap-1"
                    style={{ color: charColor(problemText.length, 20) }}>
                    {problemText.length >= 20 && <Check size={11} />}
                    {problemText.length}/500
                  </p>
                </div>

                {/* Soluția propusă */}
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    Soluția propusă *
                  </label>
                  <RichTextEditor
                    value={solution}
                    onChange={setSolution}
                    minHeight={100}
                    placeholder="Cum rezolvi concret această problemă?"
                  />
                  <p
                    className="text-xs mt-1 flex items-center justify-end gap-1"
                    style={{ color: charColor(solutionText.length, 20) }}>
                    {solutionText.length >= 20 && <Check size={11} />}
                    {solutionText.length}/500
                  </p>
                </div>

                {/* Progres cuvinte — informațional, nu blochează publicarea */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>
                    <span>
                      {wordCount >= MIN_WORDS
                        ? '✓ Eligibil pentru giveaway-uri'
                        : `${MIN_WORDS} cuvinte necesare pentru giveaway-uri`}
                    </span>
                    <span style={{ color: wordCount >= MIN_WORDS ? '#22c55e' : 'var(--text-2)' }}>
                      {wordCount}/{MIN_WORDS}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-4)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (wordCount / MIN_WORDS) * 100)}%`,
                        backgroundColor: wordCount >= MIN_WORDS ? '#22c55e' : 'var(--orange)',
                        transition: 'width 300ms ease-out, background-color 300ms ease-out',
                      }}
                    />
                  </div>
                </div>

                {/* Upload imagini + PDF — cu drag & drop + paste */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative rounded-[18px]" {...dropHandlers}>
                  {dragActive && (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[18px] pointer-events-none"
                      style={{ backgroundColor: 'rgba(246,166,35,0.12)', border: '2px dashed var(--orange)', backdropFilter: 'blur(2px)' }}
                    >
                      <UploadCloud size={26} style={{ color: 'var(--orange)' }} />
                      <span className="text-sm font-bold" style={{ color: 'var(--orange)' }}>Eliberează aici</span>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>Imagini sau PDF</span>
                    </div>
                  )}
                  {/* Imagini */}
                  <div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => handleImages(e.target.files)}
                    />
                    {imagePreviews.length > 0 ? (
                      <div>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {imagePreviews.map((src, i) => (
                            <div key={i} className="relative rounded-xl overflow-hidden aspect-square">
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeImage(i)}
                                className="absolute top-1 right-1 rounded-full p-0.5"
                                style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          {images.length < maxImages && (
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="aspect-square rounded-xl flex items-center justify-center border-2 border-dashed"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                              <ImageIcon size={16} />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-center" style={{ color: 'var(--text-2)' }}>
                          {images.length}/{maxImages} imagini
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full h-27.5 flex flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <ImageIcon size={26} style={{ opacity: 0.6 }} />
                        <span className="text-xs font-semibold">Imagini (max {maxImages})</span>
                        <span className="text-xs" style={{ opacity: 0.6 }}>JPG, PNG · max 5MB</span>
                      </button>
                    )}
                  </div>

                  {/* PDF */}
                  <div>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                    />
                    {pdf ? (
                      <div
                        className="w-full h-27.5 flex flex-col items-center justify-center gap-2 rounded-[18px] px-3"
                        style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)' }}>
                        <FileText size={22} style={{ color: 'var(--orange)' }} />
                        <span className="text-xs font-medium text-center w-full truncate" style={{ color: 'var(--text)' }}>
                          {pdf.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPdf(null)}
                          className="flex items-center gap-1 text-xs"
                          style={{ color: 'var(--text-2)' }}>
                          <X size={12} /> Elimină
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pdfInputRef.current?.click()}
                        className="w-full h-27.5 flex flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <FileText size={26} style={{ opacity: 0.6 }} />
                        <span className="text-xs font-semibold">PDF Prezentare</span>
                        <span className="text-xs" style={{ opacity: 0.6 }}>PDF · max 20MB</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Tags personalizate */}
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    Tags personalizate
                  </label>
                  <div className="flex gap-2 w-full">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                      placeholder="Scrie + Enter..."
                      maxLength={20}
                      className="flex-1 min-w-0 px-4 py-1.5 rounded-full text-sm outline-none"
                      style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      disabled={tags.length >= 5}
                      className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-40"
                      style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      Adaugă
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
                          #{t}
                          <button
                            type="button"
                            onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vizibilitate */}
                <div>
                  <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                    Vizibilitate
                  </label>
                  <div className="flex gap-6">
                    {([
                      { value: 'PUBLIC' as const, label: 'Publică', sub: 'Toată lumea vede', Icon: Globe },
                      { value: 'PRIVAT' as const, label: 'Privată', sub: 'Doar antreprenorii', Icon: Lock },
                    ]).map(({ value, label, sub, Icon }) => {
                      const active = visibility === value;
                      return (
                        <label key={value} className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="visibility"
                            value={value}
                            checked={active}
                            onChange={() => setVisibility(value)}
                            className="sr-only"
                          />
                          <div
                            className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                            style={{ borderColor: active ? 'var(--orange)' : 'var(--text-2)' }}>
                            {active && (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--orange)' }} />
                            )}
                          </div>
                          <Icon size={32} style={{ color: active ? 'var(--orange)' : 'var(--text-2)', flexShrink: 0 }} />
                          <div>
                            <p className="text-sm font-semibold leading-none" style={{ color: 'var(--text)' }}>{label}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{sub}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Eroare */}
                {error && (
                  <div
                    className="px-4 py-3 rounded-xl text-sm"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {error}
                  </div>
                )}
              </div>

              {/* Footer card */}
              <div
                className="px-5 py-4 flex flex-col gap-3"
                style={{ borderTop: '1px solid var(--border)' }}>
                {/* Rând 1: status draft */}
                <div className="flex items-center gap-1.5">
                  {draftSaving ? (
                    <Loader2 size={11} className="animate-spin" style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                  ) : (
                    <Clock size={11} style={{ color: 'var(--text-2)', opacity: 0.6 }} />
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-2)', opacity: 0.7 }}>
                    {draftSaving
                      ? 'Se salvează...'
                      : draftSavedAt
                        ? `Draft salvat la ${draftSavedAt}${draftRestored ? ' · restaurat' : ''}`
                        : 'Draft nesalvat'}
                  </span>
                </div>
                {/* Rând 2: butoane */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex-1 px-4 py-2.5 rounded-[18px] text-sm font-semibold"
                    style={{ backgroundColor: 'var(--bg-4)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}>
                    Anulează
                  </button>
                  <button
                    type="submit"
                    disabled={!isValid || loading}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-[18px] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {loading ? 'Se publică...' : 'Publică Ideea'}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* ── Preview card (sticky pe desktop) ── */}
          <div className="w-full lg:w-87.5 shrink-0 lg:sticky lg:top-6 lg:self-start">
            <IdeaPreviewCard
              title={title}
              categories={categories}
              problem={problem}
              isPro={isPro}
              imagePreviews={imagePreviews}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
