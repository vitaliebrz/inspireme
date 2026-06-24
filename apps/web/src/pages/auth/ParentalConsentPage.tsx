import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';

export default function ParentalConsentPage() {
  const { token, action } = useParams<{ token: string; action: 'confirm' | 'reject' }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || !action) return;
    api
      .post(`/auth/parental-consent/${token}/${action}`)
      .then(({ data }) => { setMessage(data.message); setStatus('success'); })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setMessage(err.response?.data?.error ?? 'A apărut o eroare.');
        setStatus('error');
      });
  }, [token, action]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-sm text-center">
        <p className="text-2xl font-extrabold mb-8" style={{ color: 'var(--orange)' }}>InspireMe</p>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3" style={{ color: 'var(--text-2)' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--orange)' }} />
            <p>Se procesează...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={48} color="#22c55e" />
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <XCircle size={48} color="#ef4444" />
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
