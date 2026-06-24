# InspireMe — Bug Tracker

Fișier de urmărire a bug-urilor raportate de utilizatori.
Format: ID · Titlu · Descriere · Actual Result · Expected Result · Status

---

## BUG-001 — Feed dispare după filtrare pe categorie

**Status:** ✅ Rezolvat

**Descriere:**
Când utilizatorul apasă pe un filtru de categorie în feed, lista de idei este ștearsă imediat (`setIdeas([])`). Dacă apelul API returnează eroare (500), feed-ul rămâne gol. La întoarcerea la "Toate", se face un nou apel care, dacă și acesta eșuează, tot arată feed gol.

**Actual Result:**
- User apasă "Eco" → feed gol instant
- API returnează 500 → feed rămâne gol
- User apasă "Toate" → feed tot gol, mesaj: "Nicio idee publicată încă. Fii primul!"

**Expected Result:**
- Feed-ul să păstreze ideile anterioare în timp ce se încarcă noua categorie
- Dacă API-ul eșuează, să afișeze un mesaj de eroare, nu stare goală
- La întoarcerea la "Toate", feed-ul să încarce corect

---

## BUG-002 — Feed API returnează 500 intermitent (Redis fără error handling)

**Status:** ✅ Rezolvat

**Descriere:**
În `feed.service.ts`, operațiunile Redis (`redis.get`, `redis.set`) nu sunt învelite în try/catch. Orice eroare temporară de rețea sau timeout la Upstash Redis aruncă excepție neprinsă → Express o transformă în 500. Se întâmplă pe `/feed/ideas`, `/feed/ideas?category=*` și `/feed/stats`.

**Actual Result:**
- Prima încărcare: 200 (Redis e rece, merge la DB)
- Cereri ulterioare: 500 dacă Redis are timeout sau problemă de conexiune
- Erorile apar rapid în succesiune, nu gradual (semn de Redis, nu Neon cold start)

**Expected Result:**
- Dacă Redis eșuează → fall-through la interogare DB, răspuns 200
- Redis-ul e opțional (cache), nu critic pentru funcționarea feed-ului

---

## BUG-003 — Upload imagine eșuează cu eroare "cloud_name" (Cloudinary neconfigurata)

**Status:** 🔴 Open — necesită configurare .env

**Descriere:**
Cloudinary nu are credențialele configurate în `.env` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`). La `POST /ideas/:id/images`, Cloudinary aruncă `Error: Missing required parameter - cloud_name`, care ajunge neformatat la utilizator.

**Actual Result:**
- User încarcă imagini la postare idee → eroare "cloud_name..." în formular
- Ideea a fost deja creată (POST /ideas returnase 201)
- La reîncercare: 403 "Plan Gratuit permite doar 1 idee" — ideea există deja

**Expected Result:**
- Dacă Cloudinary nu e configurat: mesaj clar "Upload imagini indisponibil momentan"
- Dacă upload-ul eșuează DAR ideea a fost creată: navigare la idee cu avertisment, nu blocare
- Nu ar trebui să fie posibil să ai o idee "orfană" (fără imagini) și să nu știi că există

**Fix parțial aplicat:** Frontend navighează la idee chiar dacă upload imaginile eșuează.
**Fix complet:** Configurează variabilele Cloudinary în `.env`.

---

## BUG-004 — Idee "orfană" după eșec upload imagini

**Status:** ✅ Rezolvat

**Descriere:**
Flow-ul de postare idee are 3 pași: (1) creare idee, (2) upload imagini, (3) upload PDF. Dacă pasul 1 reușește dar pasul 2 eșuează, utilizatorul vede eroare în formular. La reîncercare (apăsare din nou buton Publică), pasul 1 eșuează cu 403 (limita Plan Gratuit), fără să știe că ideea există deja.

**Actual Result:**
- Prima apăsare: idee creată (201) + imagini eșuate (500) → eroare afișată
- A doua apăsare: 403 "ai deja o idee" → utilizatorul e confuz

**Expected Result:**
- Dacă pasul 1 reușește și pasul 2 eșuează: navigare imediată la ideea creată cu toast "Imaginile nu s-au putut încărca"
- Utilizatorul să știe că ideea există și poate adăuga imaginile ulterior
