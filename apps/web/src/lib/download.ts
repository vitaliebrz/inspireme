// Descarcă un fișier cu numele lui original (ex. „Plan_Afaceri.pdf").
// Atributul HTML `download` e ignorat pentru URL-uri de pe alt domeniu (Cloudinary), iar
// documentele urcate înainte de fix au URL fără extensie (servite ca octet-stream) — așa că
// luăm fișierul ca blob (Cloudinary permite CORS) și îl salvăm noi, cu numele și tipul corect.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Fișierul nu mai este disponibil.' : 'Descărcarea a eșuat. Încearcă din nou.');
  }
  const blob = await res.blob();

  // Tipul real din conținut (magic bytes), nu din header — fișierele vechi vin ca octet-stream
  const isPdf = (await blob.slice(0, 4).text()) === '%PDF';
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(filename);
  const name = !hasExt && isPdf ? `${filename}.pdf` : filename;
  const typed = isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob;

  const href = URL.createObjectURL(typed);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocare amânată — unele browsere (Safari) pornesc descărcarea asincron
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
