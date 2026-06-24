import { useState, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, FileText, Loader2, ImageIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = [
  { value: 'ECO', label: 'Eco' },
  { value: 'TECH', label: 'Tech' },
  { value: 'ARTA', label: 'Artă' },
  { value: 'EDUCATIE', label: 'Educație' },
  { value: 'SANATATE', label: 'Sănătate' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'FOOD', label: 'Food' },
  { value: 'FINANTE', label: 'Finanțe' },
];

const MAX_IMAGES_GRATUIT = 3;
const MAX_IMAGES_PRO = 10;
const MIN_WORDS = 100;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function IdeaNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPro = user?.plan === 'PRO';
  const maxImages = isPro ? MAX_IMAGES_PRO : MAX_IMAGES_GRATUIT;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVAT'>('PUBLIC');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const wordCount = countWords(problem) + countWords(solution);
  const isValid = title.trim().length >= 5 && category && problem.trim().length >= 20 && solution.trim().length >= 20 && wordCount >= MIN_WORDS;

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags((prev) => [...prev, t]);
      setTagInput('');
    }
  };

  const handleImages = (files: FileList | null) => {
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Creăm ideea — eroare fatală, oprim fluxul
      const { data } = await api.post<{ id: string }>('/ideas', {
        title, category, problem, solution, targetAudience: targetAudience || undefined,
        tags, visibility,
      });
      const ideaId = data.id;

      // 2. Upload imagini — eroare non-fatală, navigăm la idee indiferent
      if (images.length > 0) {
        try {
          const formData = new FormData();
          images.forEach((img) => formData.append('images', img));
          await api.post(`/ideas/${ideaId}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // Ideea a fost creată, imaginile pot fi adăugate ulterior din pagina ideii
        }
      }

      // 3. Upload PDF — eroare non-fatală
      if (pdf) {
        try {
          const formData = new FormData();
          formData.append('pdf', pdf);
          await api.post(`/ideas/${ideaId}/pdf`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // PDF-ul poate fi adăugat ulterior din pagina ideii
        }
      }

      navigate(`/idea/${ideaId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'A apărut o eroare. Încearcă din nou.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Postează idee</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Descrie ideea ta cât mai clar — antreprenorii caută detalii și originalitate.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Titlu + Categorie */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Titlu idee *">
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Aplicație de reducere a risipei alimentare"
              maxLength={150} required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{title.length}/150</p>
          </Field>

          <Field label="Categorie *">
            <select
              value={category} onChange={(e) => setCategory(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: category ? 'var(--text)' : 'var(--text-2)' }}
            >
              <option value="">Selectează categorie</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Problemă */}
        <Field label="Ce problemă rezolvi? *" hint={`${countWords(problem)} cuvinte`}>
          <textarea
            value={problem} onChange={(e) => setProblem(e.target.value)}
            rows={4} required minLength={20}
            placeholder="Descrie problema pe care ai identificat-o. De ce există această problemă? Cine o resimte?"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        {/* Soluție */}
        <Field label="Cum o rezolvi? *" hint={`${countWords(solution)} cuvinte`}>
          <textarea
            value={solution} onChange={(e) => setSolution(e.target.value)}
            rows={4} required minLength={20}
            placeholder="Descrie soluția ta. Ce face produsul/serviciul tău? Cum funcționează?"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-y"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        {/* Progres cuvinte */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>
            <span>Minim {MIN_WORDS} cuvinte pentru participare la giveaway-uri</span>
            <span style={{ color: wordCount >= MIN_WORDS ? '#22c55e' : 'var(--text-2)' }}>
              {wordCount}/{MIN_WORDS}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-4)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (wordCount / MIN_WORDS) * 100)}%`,
                backgroundColor: wordCount >= MIN_WORDS ? '#22c55e' : 'var(--orange)',
              }}
            />
          </div>
        </div>

        {/* Audiență țintă */}
        <Field label="Audiență țintă" hint="Opțional">
          <input
            type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="Ex: Studenți, restaurante mici, familii din mediul urban"
            maxLength={500}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Field>

        {/* Tag-uri */}
        <Field label="Tag-uri" hint={`${tags.length}/5`}>
          <div className="flex gap-2">
            <input
              type="text" value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
              placeholder="Adaugă un tag și apasă Enter"
              maxLength={20}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button type="button" onClick={handleAddTag} disabled={tags.length >= 5}
              className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--bg-4)', color: 'var(--text-2)' }}>
              Adaugă
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
                  #{t}
                  <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {/* Imagini */}
        <Field label={`Imagini ${isPro ? '(max 10)' : `(max ${maxImages} — Plan Gratuit)`}`}>
          <input
            ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            multiple className="hidden"
            onChange={(e) => handleImages(e.target.files)}
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            {imagePreviews.map((src, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden aspect-video">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button" onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 rounded-full p-0.5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            {images.length < maxImages && (
              <button
                type="button" onClick={() => imageInputRef.current?.click()}
                className="aspect-video rounded-xl flex flex-col items-center justify-center gap-1 text-xs border-2 border-dashed transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                <ImageIcon size={20} />
                Adaugă
              </button>
            )}
          </div>
        </Field>

        {/* PDF */}
        <Field label="Plan de afaceri (PDF, max 20MB)" hint="Opțional">
          <input
            ref={pdfInputRef} type="file" accept="application/pdf"
            className="hidden" onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
          {pdf ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)' }}>
              <FileText size={20} style={{ color: 'var(--orange)' }} />
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{pdf.name}</span>
              <button type="button" onClick={() => setPdf(null)} style={{ color: 'var(--text-2)' }}><X size={16} /></button>
            </div>
          ) : (
            <button
              type="button" onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border-2 border-dashed transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              <Upload size={16} /> Încarcă PDF
            </button>
          )}
        </Field>

        {/* Vizibilitate */}
        <Field label="Vizibilitate">
          <div className="grid grid-cols-2 gap-2">
            {(['PUBLIC', 'PRIVAT'] as const).map((v) => (
              <button
                key={v} type="button" onClick={() => setVisibility(v)}
                className="px-4 py-3 rounded-xl text-sm font-medium text-left transition-all"
                style={{
                  backgroundColor: visibility === v ? 'rgba(246,166,35,0.12)' : 'var(--bg-3)',
                  border: `1.5px solid ${visibility === v ? 'var(--orange)' : 'var(--border)'}`,
                  color: visibility === v ? 'var(--orange)' : 'var(--text-2)',
                }}>
                <span className="font-semibold">{v === 'PUBLIC' ? 'Publică' : 'Privată'}</span>
                <p className="text-xs mt-0.5 font-normal" style={{ color: 'var(--text-2)' }}>
                  {v === 'PUBLIC' ? 'Vizibilă în feed pentru antreprenori' : 'Vizibilă doar ție'}
                </p>
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            Anulează
          </button>
          <button type="submit" disabled={!isValid || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Se publică...' : 'Publică idee'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'var(--text-2)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
