import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
    >
      <span className="text-8xl font-bold" style={{ color: 'var(--orange)' }}>404</span>
      <p className="text-xl font-semibold">Pagina nu a fost găsită</p>
      <p style={{ color: 'var(--text-2)' }}>Pagina pe care o cauți nu există sau a fost mutată.</p>
      <Link
        to="/feed"
        className="mt-4 px-6 py-2 rounded-xl font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        Înapoi la Feed
      </Link>
    </div>
  );
}
