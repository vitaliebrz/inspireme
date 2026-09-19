import { useState, useEffect } from 'react';
import {
  Check, Crown, Loader2, ExternalLink, AlertCircle, ShieldCheck, XCircle,
  Sparkles, Image as ImageIcon, TrendingUp, Users, Gift, BarChart2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSearchParams } from 'react-router-dom';
import ConfirmModal from '../../components/ui/ConfirmModal';

interface SubscriptionStatus {
  currentPlan: 'GRATUIT' | 'PRO';
  role: 'ELEV' | 'ANTREPRENOR' | 'ADMIN';
  subscription: {
    currentPeriodEnd: string;
    cancelledAt: string | null;
    stripePriceId: string | null;
  } | null;
}

type ApiError = { response?: { data?: { error?: string } } };

const ELEV_PLANS = [
  {
    id: 'gratuit',
    name: 'Gratuit',
    price: { month: 0, year: 0 },
    features: [
      '1 idee publicată',
      '3 imagini per idee',
      '5 mesaje/zi în chat',
      'Participare la giveaway-uri',
      'Vizualizare feedback antreprenori',
    ],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { month: 25, year: 240 },
    features: [
      'Idei nelimitate',
      '10 imagini per idee',
      'Mesaje nelimitate în chat',
      'Prioritate în feed (scor +100)',
      'Badge Pro vizibil pe profil',
      'Participare la giveaway-uri prioritar',
    ],
    highlight: true,
  },
];

const ANTREPRENOR_PLANS = [
  {
    id: 'gratuit',
    name: 'Gratuit',
    price: { month: 0, year: 0 },
    features: [
      '5 cereri de conectare total',
      'Vizualizare feed idei',
      'Feedback pe idei',
      'Profil public',
    ],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { month: 75, year: 720 },
    features: [
      '30 cereri de conectare/zi',
      'Lansare giveaway-uri',
      'Prioritate în feed antreprenori',
      'Badge Pro pe profil',
      'Acces statistici avansate',
      'Confirmare investiții în platformă',
    ],
    highlight: true,
  },
];

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Tur de bun-venit la activarea Pro ───────────────────────────────────────
// Apare o singură dată, la revenirea din Stripe cu succes — prezintă pe rând ce
// s-a deblocat, ca userul să vadă concret ce a primit, nu doar un banner text.

interface TourStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const ELEV_TOUR_STEPS: TourStep[] = [
  {
    icon: <Sparkles size={28} />,
    title: 'Bun venit la InspireMe Pro! 🎉',
    description: 'Plata a fost procesată cu succes. Ai acces complet la toate beneficiile Pro, chiar din acest moment.',
  },
  {
    icon: <TrendingUp size={28} />,
    title: 'Idei nelimitate',
    description: 'Nu mai ești limitat la o singură idee — poți publica oricâte idei de business vrei.',
  },
  {
    icon: <ImageIcon size={28} />,
    title: 'Mai multe imagini + chat nelimitat',
    description: 'Până la 10 imagini per idee (față de 3) și mesaje nelimitate în chat cu antreprenorii.',
  },
  {
    icon: <Crown size={28} />,
    title: 'Prioritate în feed',
    description: 'Ideile tale primesc scor +100 și apar înaintea celor cu plan Gratuit — mai multă vizibilitate, mai repede.',
  },
];

const ANTREPRENOR_TOUR_STEPS: TourStep[] = [
  {
    icon: <Sparkles size={28} />,
    title: 'Bun venit la InspireMe Pro! 🎉',
    description: 'Plata a fost procesată cu succes. Ai acces complet la toate beneficiile Pro, chiar din acest moment.',
  },
  {
    icon: <Users size={28} />,
    title: '30 cereri de conectare pe zi',
    description: 'Față de 5 cereri total pe planul Gratuit, acum poți contacta zilnic până la 30 de elevi cu idei interesante.',
  },
  {
    icon: <Gift size={28} />,
    title: 'Lansează giveaway-uri',
    description: 'Poți crea giveaway-uri de investiție și te conectezi direct cu elevii care participă.',
  },
  {
    icon: <BarChart2 size={28} />,
    title: 'Prioritate în feed + statistici avansate',
    description: 'Profilul tău apare înaintea antreprenorilor cu plan Gratuit, plus acces la statistici detaliate.',
  },
];

function ProWelcomeTour({ role, onClose }: { role: 'ELEV' | 'ANTREPRENOR'; onClose: () => void }) {
  const steps = role === 'ANTREPRENOR' ? ANTREPRENOR_TOUR_STEPS : ELEV_TOUR_STEPS;
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-anim"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center modal-content-anim"
        style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}
      >
        {/* Puncte de progres */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                backgroundColor: i === step ? 'var(--orange)' : 'var(--bg-4)',
                transition: 'width 200ms var(--ease-out), background-color 200ms ease-out',
              }}
            />
          ))}
        </div>

        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}
        >
          {current.icon}
        </div>

        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>{current.title}</h3>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-2)' }}>{current.description}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            Sari peste
          </button>
          <button
            onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {isLast ? 'Am înțeles, hai să încep' : 'Continuă'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { user, refetchUser } = useAuth();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const success = searchParams.get('success') === '1';
  const cancelled = searchParams.get('cancelled') === '1';
  const [showWelcomeTour, setShowWelcomeTour] = useState(success);

  const plans = user?.role === 'ANTREPRENOR' ? ANTREPRENOR_PLANS : ELEV_PLANS;
  const isPro = status?.currentPlan === 'PRO';

  useEffect(() => {
    api.get<SubscriptionStatus>('/subscriptions/status')
      .then(({ data }) => setStatus(data))
      .finally(() => setLoading(false));

    // Revenit de la Stripe cu succes — planul din DB e deja PRO, dar user-ul cache-uit
    // în AuthContext e vechi (setat la login). Îl recităm ca funcțiile Pro să se
    // deblocheze imediat, fără logout/login.
    if (success) void refetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post<{ url: string }>('/subscriptions/checkout', { interval });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la inițierea plății.', 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await api.post<{ url: string }>('/subscriptions/portal');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la accesarea portalului.', 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await api.post('/subscriptions/cancel');
      setStatus((prev) => (prev ? { ...prev, currentPlan: 'GRATUIT', subscription: null } : prev));
      // Planul din DB tocmai a devenit Gratuit — recităm userul cache-uit din
      // AuthContext ca funcțiile Pro să dispară imediat din restul aplicației.
      await refetchUser();
      toast('Abonamentul a fost anulat. Ai revenit la planul Gratuit.', 'success');
      setCancelModalOpen(false);
    } catch (err) {
      toast((err as ApiError).response?.data?.error ?? 'Eroare la anularea abonamentului.', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const yearlyDiscount = user?.role === 'ANTREPRENOR'
    ? Math.round((1 - 720 / (75 * 12)) * 100)
    : Math.round((1 - 240 / (25 * 12)) * 100);

  // Adminii au acces Pro din oficiu (setat direct în DB) — nu există niciun flux de
  // plată pentru ei. Nu afișăm planurile/butonul de checkout deloc, indiferent de
  // valoarea curentă a câmpului plan (backend-ul respinge oricum orice checkout de admin).
  if (user?.role === 'ADMIN') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>Planuri & Prețuri</h1>
        </div>
        <div className="rounded-2xl p-6 flex items-center gap-4"
          style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <ShieldCheck size={24} style={{ color: '#22c55e' }} />
          <div>
            <p className="font-bold text-sm" style={{ color: '#22c55e' }}>Cont de admin</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
              Conturile de admin au acces complet din oficiu și nu pot cumpăra abonamente — nu există niciun flux de plată asociat acestui cont.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {showWelcomeTour && user && user.role !== 'ADMIN' && (
        <ProWelcomeTour role={user.role} onClose={() => setShowWelcomeTour(false)} />
      )}

      <ConfirmModal
        open={cancelModalOpen}
        title="Anulează abonamentul"
        description="Anularea e imediată — pierzi accesul Pro chiar acum, nu la finalul perioadei plătite. Dacă ai mai multe idei publice, rămâne publică doar prima, restul devin private (nu se șterg, dar nu pot fi făcute publice din nou fără Pro). Ideile devenite private participante la giveaway-uri active sunt retrase automat. Primești un email cu tot ce s-a schimbat."
        danger
        confirmLabel="Anulează abonamentul"
        loading={cancelLoading}
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelModalOpen(false)}
      />

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>Planuri & Prețuri</h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Deblochează tot potențialul platformei InspireMe
        </p>
      </div>

      {/* Alerte plată */}
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <Check size={18} style={{ color: '#22c55e' }} />
          <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
            Abonamentul Pro a fost activat cu succes! Bucură-te de toate beneficiile.
          </p>
        </div>
      )}
      {cancelled && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={18} style={{ color: '#ef4444' }} />
          <p className="text-sm" style={{ color: '#ef4444' }}>Plata a fost anulată. Poți încerca din nou oricând.</p>
        </div>
      )}

      {/* Status abonament activ */}
      {isPro && status?.subscription && (
        <div className="rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{ backgroundColor: 'rgba(246,166,35,0.08)', border: '1px solid rgba(246,166,35,0.25)' }}>
          <div className="flex items-center gap-3">
            <Crown size={24} style={{ color: 'var(--orange)' }} />
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--orange)' }}>Plan Pro Activ</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                Reînnoire pe {formatDate(status.subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void handlePortal()} disabled={portalLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { if (!portalLoading) e.currentTarget.style.backgroundColor = 'var(--bg-4)'; }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
              {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Gestionează abonamentul
            </button>
            <button onClick={() => setCancelModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.18)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)')}>
              <XCircle size={14} />
              Anulează abonamentul
            </button>
          </div>
        </div>
      )}

      {/* Toggle interval facturare */}
      {!isPro && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setInterval('month')}
            className="px-5 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: interval === 'month' ? 'rgba(246,166,35,0.12)' : 'var(--bg-2)',
              border: `1.5px solid ${interval === 'month' ? 'var(--orange)' : 'var(--border)'}`,
              color: interval === 'month' ? 'var(--orange)' : 'var(--text-2)',
            }}>
            Lunar
          </button>
          <button
            onClick={() => setInterval('year')}
            className="px-5 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors relative"
            style={{
              backgroundColor: interval === 'year' ? 'rgba(246,166,35,0.12)' : 'var(--bg-2)',
              border: `1.5px solid ${interval === 'year' ? 'var(--orange)' : 'var(--border)'}`,
              color: interval === 'year' ? 'var(--orange)' : 'var(--text-2)',
            }}>
            Anual
            <span className="absolute -top-2 -right-2 text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#22c55e', color: '#fff', fontSize: 10 }}>
              -{yearlyDiscount}%
            </span>
          </button>
        </div>
      )}

      {/* Carduri planuri */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-80 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = (plan.id === 'pro') === isPro;
            const price = plan.price[interval];
            const monthlyEquiv = interval === 'year' && plan.price.year > 0
              ? (plan.price.year / 12).toFixed(0)
              : null;

            return (
              <div
                key={plan.id}
                className="rounded-2xl p-6 flex flex-col"
                style={{
                  backgroundColor: plan.highlight ? 'rgba(246,166,35,0.05)' : 'var(--bg-2)',
                  border: `${plan.highlight ? '2px' : '1px'} solid ${plan.highlight ? 'var(--orange)' : 'var(--border)'}`,
                  position: 'relative',
                }}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                    Recomandat
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  {plan.highlight && <Crown size={18} style={{ color: 'var(--orange)' }} />}
                  <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{plan.name}</h2>
                </div>

                <div className="mb-5">
                  {price === 0 ? (
                    <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Gratuit</p>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
                        {price} <span className="text-base font-medium" style={{ color: 'var(--text-2)' }}>RON</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                        {interval === 'year' ? `${monthlyEquiv} RON/lună, facturat anual` : 'pe lună'}
                      </p>
                    </div>
                  )}
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check size={15} className="shrink-0 mt-0.5" style={{ color: plan.highlight ? 'var(--orange)' : '#22c55e' }} />
                      <span style={{ color: 'var(--text-2)' }}>{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.id === 'gratuit' ? (
                  isCurrentPlan ? (
                    <div className="py-2.5 rounded-xl text-sm font-medium text-center"
                      style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                      ✓ Plan curent
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelModalOpen(true)}
                      className="py-2.5 rounded-xl text-sm font-medium text-center cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-3)')}>
                      Treci la Gratuit
                    </button>
                  )
                ) : isCurrentPlan ? (
                  <div className="py-2.5 rounded-xl text-sm font-semibold text-center"
                    style={{ backgroundColor: 'rgba(246,166,35,0.12)', color: 'var(--orange)' }}>
                    ✓ Plan curent
                  </div>
                ) : (
                  <button
                    onClick={() => void handleCheckout()} disabled={checkoutLoading}
                    className="py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                    {checkoutLoading ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                    Upgrade la Pro
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FAQ simplificat */}
      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Întrebări frecvente</h2>
        {[
          {
            q: 'Pot anula oricând?',
            a: 'Da, direct din pagina de abonament. Anularea e imediată — accesul Pro se oprește chiar atunci, nu la finalul perioadei plătite.',
          },
          {
            q: 'Ce se întâmplă cu datele mele dacă trec la Gratuit?',
            a: 'Ideile extra față de limita Gratuit devin private. Nu se șterg.',
          },
          {
            q: 'Sunt plățile sigure?',
            a: 'Da. Plățile sunt procesate de Stripe, conform standardelor PCI DSS. Nu stocăm datele cardului.',
          },
        ].map(({ q, a }) => (
          <div key={q} className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{q}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
