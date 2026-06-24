import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <Topbar
        onMenuClick={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />

      {/* Pe mobile: fără offset (sidebar e overlay). Pe desktop: offset 240px */}
      <main className="min-h-screen lg:ml-60" style={{ paddingTop: 56 }}>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
