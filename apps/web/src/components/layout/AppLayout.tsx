import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Topbar — offset sidebar pe desktop */}
      <Topbar onMenuClick={() => setSidebarOpen(true)} />

      {/* Conținut principal */}
      <main
        className="min-h-screen"
        style={{
          marginLeft: 240,
          paddingTop: 56,
        }}
      >
        {/* Pe mobil, sidebar-ul e overlay, deci nu facem offset */}
        <div
          className="p-6"
          style={{
            // Pe ecrane mici resetăm marginea stânga
          }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
