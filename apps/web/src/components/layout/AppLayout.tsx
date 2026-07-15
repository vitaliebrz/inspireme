import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { NotificationsProvider } from '../../context/NotificationsContext';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isChat = pathname.startsWith('/chat');
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isChat) return;

    const mainEl = mainRef.current;
    const topbarEl = document.querySelector('header') as HTMLElement | null;
    const vv = window.visualViewport;

    if (!vv) {
      // Fallback browsere fără visualViewport API
      const html = document.documentElement;
      const body = document.body;
      const root = document.getElementById('root');
      html.style.height = '100%'; html.style.overflow = 'hidden';
      body.style.height = '100%'; body.style.overflow = 'hidden';
      if (root) { root.style.height = '100%'; root.style.overflow = 'hidden'; }
      return () => {
        html.style.height = ''; html.style.overflow = '';
        body.style.height = ''; body.style.overflow = '';
        if (root) { root.style.height = ''; root.style.overflow = ''; }
      };
    }

    const update = () => {
      const { offsetTop, height } = vv;
      const isDesktop = window.innerWidth >= 1024;

      // Pe iOS, tastatura deplasează visual viewport în jos față de layout viewport.
      // Compensăm: topbar-ul se mută la topul zonei VIZIBILE (nu al layout-ului),
      // iar zona de chat ocupă exact spațiul vizibil rămas sub topbar.
      if (topbarEl) {
        topbarEl.style.top = `${offsetTop}px`;
      }
      if (mainEl) {
        mainEl.style.top = `${offsetTop + 56}px`;
        mainEl.style.left = isDesktop ? '240px' : '0';
        mainEl.style.height = `${height - 56}px`;
        mainEl.style.overflow = 'hidden';
        mainEl.style.paddingTop = '0';
      }
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (topbarEl) topbarEl.style.top = '';
      if (mainEl) {
        mainEl.style.top = '';
        mainEl.style.left = '';
        mainEl.style.height = '';
        mainEl.style.overflow = '';
        mainEl.style.paddingTop = '';
      }
    };
  }, [isChat]);

  return (
    <NotificationsProvider>
      <ScrollToTop />
      <div
        className={isChat ? '' : 'min-h-screen'}
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <Topbar
          onMenuClick={() => setSidebarOpen((v) => !v)}
          sidebarOpen={sidebarOpen}
        />

        <main
          ref={mainRef}
          className={isChat ? 'fixed right-0' : 'min-h-screen pt-14 lg:ml-60'}
        >
          <div className={isChat ? 'h-full' : 'p-4 lg:p-6'}>
            <Outlet />
          </div>
        </main>

      </div>
    </NotificationsProvider>
  );
}
