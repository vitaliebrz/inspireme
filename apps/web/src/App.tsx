import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';

// Auth pages — încărcate imediat (rute critice)
import LoginPage from './pages/auth/LoginPage';
import RegisterElevPage from './pages/auth/RegisterElevPage';
import RegisterAntreprenorPage from './pages/auth/RegisterAntreprenorPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ParentalConsentPage from './pages/auth/ParentalConsentPage';

// Pages — lazy loading per rută
const FeedPage = lazy(() => import('./pages/feed/FeedPage'));
const IdeaDetailPage = lazy(() => import('./pages/ideas/IdeaDetailPage'));
const IdeaNewPage = lazy(() => import('./pages/ideas/IdeaNewPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const GiveawaysPage = lazy(() => import('./pages/giveaways/GiveawaysPage'));
const GiveawayDetailPage = lazy(() => import('./pages/giveaways/GiveawayDetailPage'));
const GiveawayNewPage = lazy(() => import('./pages/giveaways/GiveawayNewPage'));
const SubscriptionsPage = lazy(() => import('./pages/subscriptions/SubscriptionsPage'));
const ProfilePage = lazy(() => import('./pages/profiles/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const TermeniPage = lazy(() => import('./pages/legal/TermeniPage'));
const ConfidentialitatePage = lazy(() => import('./pages/legal/ConfidentialitatePage'));
const CookiePolicyPage = lazy(() => import('./pages/legal/CookiePolicyPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }}
      />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/feed" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/feed" replace />} />

        {/* Publice */}
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register/elev" element={<PublicOnly><RegisterElevPage /></PublicOnly>} />
        <Route path="/register/antreprenor" element={<PublicOnly><RegisterAntreprenorPage /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/parental-consent/:token/:action" element={<ParentalConsentPage />} />
        <Route path="/termeni" element={<TermeniPage />} />
        <Route path="/confidentialitate" element={<ConfidentialitatePage />} />
        <Route path="/cookie-policy" element={<CookiePolicyPage />} />

        {/* Protejate cu layout */}
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/feed/antreprenori" element={<FeedPage tab="antreprenori" />} />
          <Route path="/idea/new" element={<IdeaNewPage />} />
          <Route path="/idea/:id" element={<IdeaDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/giveaways" element={<GiveawaysPage />} />
          <Route path="/giveaways/new" element={<GiveawayNewPage />} />
          <Route path="/giveaways/:id" element={<GiveawayDetailPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/profile/me" element={<ProfilePage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
