import { useEffect, useState } from 'react';
import Logo from './Logo';

// Loader afișat cât timp sesiunea se restaurează (schimb de refresh token → access
// token nou, la boot-ul aplicației). Pe conexiune rapidă asta durează sub 400ms —
// îl afișăm abia după acel prag, ca să nu clipească inutil pe majoritatea încărcărilor.
const SHOW_DELAY_MS = 400;

export default function AppLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="app-loader fixed inset-0 z-50 flex flex-col items-center justify-center gap-7"
      style={{ backgroundColor: 'var(--bg)' }}
      role="status"
      aria-label="Se încarcă InspireMe"
    >
      <div className="app-loader-mark">
        <Logo height={44} />
      </div>
      <div
        className="app-loader-ring w-7 h-7 rounded-full border-2"
        style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent', borderRightColor: 'transparent' }}
      />
    </div>
  );
}
