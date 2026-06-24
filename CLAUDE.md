# InspireMe — Instrucțiuni Claude Code

Tu ești arhitectul și developerul principal al platformei InspireMe.

## CONTEXT PLATFORMĂ
InspireMe este o platformă pentru elevi (13-19 ani) și antreprenori din România unde elevii postează idei de business și se conectează cu antreprenori reali care pot investi în ele.

## TECH STACK
- Frontend: React 19 + TypeScript + Tailwind CSS v4 + Vite
- Backend: Node.js + Express + TypeScript
- Baza de date: PostgreSQL + Prisma ORM
- Auth: JWT + bcrypt + refresh tokens
- Real-time: Socket.io (chat)
- Stocare fișiere: Cloudinary (imagini + PDF max 10MB)
- Plăți: Stripe
- Email: Resend
- Caching: Redis (sesiuni, rate limiting, notificări)

## PROIECT EXISTENT
- Repo GitHub: github.com/vitalikbrz/inspireme (Private)
- Branch activ: develop
- Structura: monorepo cu apps/web (frontend) și apps/api (backend)
- Figma Design: https://www.figma.com/design/IvBLvAi503Vg0Odvvbs0v4/InspireMe-UI-Design

## BRAND
- Primary navy: #2d3748
- Accent orange: #f6a623
- Font: Plus Jakarta Sans
- Dark mode implicit
- Border radius carduri: 14-16px

## DARK MODE CULORI
- --bg: #0f1117
- --bg-2: #161b27
- --bg-3: #1e2535
- --bg-4: #252d40
- --border: rgba(255,255,255,0.08)
- --text: #f0f2f8
- --text-2: #8892a4

## LIGHT MODE CULORI
- --bg: #f4f6fa
- --bg-2: #ffffff
- --bg-3: #eef1f7
- --bg-4: #e4e8f0
- --border: rgba(0,0,0,0.08)
- --text: #1a202c
- --text-2: #4a5568

## UTILIZATORI
- ELEV: postează idei, participă giveaway-uri, chat cu antreprenori
- ANTREPRENOR: evaluează idei, lasă feedback, lansează giveaway-uri, investește
- ADMIN: moderare, dashboard statistici, gestionare utilizatori

## PERFORMANȚĂ — OBLIGATORIU
- Redis pentru: sesiuni JWT, rate limiting, caching feed, notificări queue
- Paginare cursor-based (nu offset) pentru feed și liste mari
- Lazy loading pentru imagini și componente React
- Debounce 300ms pe search și inputs
- Memoizare cu React.memo, useMemo, useCallback unde e necesar
- Virtual scrolling pentru liste lungi (feed cu multe carduri)
- Bundle splitting per rută cu React.lazy + Suspense
- Service Worker pentru caching assets statice
- Compresie imagini la upload (max 1MB după compresie)
- Index-uri PostgreSQL pe: user_id, created_at, category, status

## ALGORITMI ȘI DATA STRUCTURES
- Feed sorting: algoritm cu scoring (plan Pro = +100 pts, recent = +timp, engagement = +vizualizări)
- Căutare: full-text search PostgreSQL cu tsvector și tsquery
- Notificări: queue cu Redis Bull pentru procesare asincronă
- Rate limiting: sliding window algorithm cu Redis
- Selecție câștigător giveaway: crypto.randomInt pe SERVER (niciodată client-side)
- Chat: mesaje stocate cu cursor pagination, WebSocket cu rooms per conversație
- Memoizare rezultate căutare frecvente în Redis (TTL 5 min)
- Batch processing pentru notificări (nu trimite individual)
- Debounce pe auto-save draft idee (30 secunde)
- Throttle pe scroll events
- Infinite scroll cu Intersection Observer (nu scroll events)

## SECURITATE
- JWT access token: 15 minute expiry
- JWT refresh token: 7 zile, rotație la fiecare request
- Rate limiting: 100 req/15min per IP general, 5 req/15min pe auth routes
- Sanitizare input: DOMPurify pe frontend, express-validator pe backend
- Upload fișiere: validare tip REAL (magic bytes), nu doar extensie
- GDPR: soft delete pentru useri (anonimizare, nu ștergere fizică imediată)
- Helmet.js pentru HTTP headers
- CORS configurat strict

## MOBILE + WEB NUANȚE
- Touch targets minimum 44x44px pe mobile
- Skeleton loaders pe toate listele și cardurile
- Optimistic UI updates pe like/follow/cerere conectare
- Error boundaries pe fiecare pagină
- Offline state detection cu feedback vizual
- PWA ready (manifest + service worker)
- Scroll position preservation la navigare înapoi
- Keyboard navigation support (accessibility)
- Focus management după modals
- Image lazy loading cu Intersection Observer
- Preload pentru rute critice (login, feed)

## STRUCTURA BAZA DE DATE (PostgreSQL + Prisma)
- users (id, email, password_hash, role: ELEV|ANTREPRENOR|ADMIN, plan: GRATUIT|PRO, created_at, last_login, is_deleted)
- profiles_elev (user_id, first_name, last_name, school, class, city, bio, interests[], avatar_url)
- profiles_antreprenor (user_id, first_name, last_name, company, position, domain, website, bio_mentor, experience_years, avatar_url)
- ideas (id, user_id, title, category, problem, solution, target_audience, visibility: PUBLIC|PRIVATE, status: PUBLICAT|CONTACTAT|IN_COLABORARE|REALIZAT, plan_at_post, created_at, view_count)
- idea_images (id, idea_id, url, order)
- idea_pdfs (id, idea_id, url, filename, size)
- connection_requests (id, from_user_id, to_user_id, idea_id, status: PENDING|ACCEPTED|REFUSED, created_at, expires_at)
- conversations (id, elev_id, antreprenor_id, connection_request_id, created_at, last_message_at)
- messages (id, conversation_id, sender_id, content, type: TEXT|PDF|IMAGE, file_url, created_at)
- feedback (id, antreprenor_id, idea_id, rating_general, rating_originalitate, rating_viabilitate, rating_prezentare, rating_potential, comment, interested_in_collab, created_at, updated_at)
- collaborations (id, elev_id, antreprenor_id, idea_id, confirmed_by_elev, confirmed_by_antreprenor, confirmed_at)
- giveaways (id, antreprenor_id, title, description, investment_description, start_date, end_date, max_participants, winner_id, status: ACTIVE|FINISHED|CANCELLED)
- giveaway_participants (id, giveaway_id, elev_id, idea_id, joined_at)
- subscriptions (id, user_id, plan: PRO, stripe_subscription_id, current_period_end, cancelled_at)
- notifications (id, user_id, type, title, body, data jsonb, read_at, created_at)
- blocked_users (id, blocker_id, blocked_id, created_at)
- reports (id, reporter_id, content_type: IDEA|MESSAGE|USER, content_id, reason, status: PENDING|RESOLVED, created_at)
- parental_consents (id, user_id, parent_email, token, confirmed_at, expires_at)
- investment_history (id, antreprenor_id, idea_id, collaboration_id, investment_type, amount_description, status: ACTIV|IN_NEGOCIERE|FINALIZAT|NECONFIRMAT, created_at)

## FLOW-URI CRITICE

### Stadiu idee (PRIVAT - vizibil doar elevului)
- PUBLICAT: automat la postare
- CONTACTAT: automat la prima cerere acceptată
- IN_COLABORARE: setat manual de elev
- REALIZAT: setat manual → badge public 🏆 pe card
- Reset automat: dacă niciun mesaj 30 zile → revine la PUBLICAT
- Notificare la reset: "Conversația cu [Antreprenor] pare inactivă. Stadiul ideii tale a revenit la Publicat."

### Cereri conectare
- Antreprenor Gratuit: max 5 total pe viață
- Antreprenor Pro: max 30/zi (Redis counter, reset midnight)
- Blocare: model Instagram (per utilizator, nu per idee)
- Expirare cerere: 1 an
- După blocare: antreprenorul nu mai vede ideile elevului în feed

### Chat securitate
- Cerere de conectare obligatorie înainte de chat
- Doar PDF + imagini în chat, max 10MB
- Loguri păstrate pe server, accesibile admin doar la raport activ
- Buton "Raportează conversația" permanent vizibil în header
- Auto-ascundere conținut la 3 rapoarte de utilizatori diferiți
- Confirmare colaborare la 30 zile după conectare

### Giveaway
- Selecție câștigător: crypto.randomInt pe SERVER exclusiv
- Animație frontend doar vizuală (rezultatul vine de la server)
- Confirmare investiție la 30 zile post-giveaway
- Badge "Giveaway neîndeplinit" dacă nu confirmă în 37 zile
- Doar antreprenori Pro pot lansa giveaway-uri
- Condiție participare elev: titlu + min 100 cuvinte + min o imagine sau PDF

### Abonamente
- Elev Gratuit: 1 idee, 3 imagini, chat 5 msg/zi (server-side counter)
- Elev Pro: 25 lei/lună sau 240 lei/an — idei nelimitate, prioritate feed
- Antreprenor Gratuit: 5 cereri conectare total
- Antreprenor Pro: 75 lei/lună sau 720 lei/an — 30 cereri/zi, giveaway-uri
- Stripe webhooks: checkout.session.completed, invoice.payment_failed, customer.subscription.deleted

### GDPR România
- Minori sub 16 ani: flux consimțământ parental obligatoriu prin email
- Ștergere cont: soft delete, anonimizare în 30 zile
- Export date: JSON/CSV în 72 ore
- Email sistem (non-dezactivabil): avertizări cont, confirmări plată
- Avertizare ștergere cont inactivitate: email la 330 zile și 354 zile
- Ștergere automată la 365 zile inactivitate

### Statusuri antreprenor (automate)
- ACTIV: a intrat în ultimele 30 zile
- INACTIV: 30-60 zile fără activitate
- RETRAS: peste 60 zile fără activitate
- La login: status revine automat la ACTIV
- Avertisment vizual la contact antreprenor RETRAS

## FEED
- 2 taburi: Feed Idei | Feed Antreprenori (accesibile ambilor utilizatori)
- Filtre pe categorii: Eco, Tech, Artă, Educație, Sănătate, Social, Food, Finanțe
- Ordering idei: Pro first, then Gratuit (scoring algorithm)
- Ordering antreprenori: Pro Activi, Gratuit Activi, Inactivi, Retrași
- Paginare cursor-based, 12 items per pagină

## ADMIN
- Al doilea admin (MODERATOR): acces doar la /admin/moderare
- Auto-ascundere la 3 rapoarte, admin decide final
- 3 niveluri: Avertisment / Eliminare conținut / Suspendare cont
- Ștergere automată conturi inactive (job zilnic 02:00)

## ORDINEA DE IMPLEMENTARE
1. Setup backend: Express + TypeScript + Prisma + PostgreSQL + Redis
2. Schema Prisma completă cu toate tabelele
3. Middleware: auth JWT, rate limiting, upload, error handling
4. Routes AUTH: register elev, register antreprenor, login, refresh token, reset parolă, consimțământ parental
5. Frontend: Router setup, layout principal (Sidebar + Topbar), dark/light mode toggle
6. Pagini Auth: Login, Register Elev (2 pași), Register Antreprenor (2 pași)
7. Routes + Pages FEED: idei + antreprenori (2 taburi), filtre, scoring
8. Routes + Pages IDEA: postare, vizualizare elev, vizualizare antreprenor, editare, ștergere
9. Routes + Pages CHAT: WebSocket, cereri conectare, blocare, raportare
10. Routes + Pages GIVEAWAY: creare, participare, selecție server-side, confirmare
11. Routes + Pages ABONAMENTE: Stripe integration, planuri elev + antreprenor
12. Routes + Pages PROFILURI: elev propriu, elev public, antreprenor, istoricul investițiilor
13. Routes + Pages NOTIFICĂRI: in-app, email, setări
14. Routes + Pages ADMIN: dashboard, utilizatori, moderare, giveaway admin
15. PWA setup, optimizări finale, audit performanță

## REGULI ABSOLUTE
- Niciodată logică de business pe client (rate limiting, selecție random, calcule financiare = doar server)
- Toate inputurile validate atât pe frontend (UX) cât și pe backend (securitate)
- Error handling complet pe toate rutele (try/catch, error boundaries)
- Loading states și skeleton loaders pe toate acțiunile async
- TypeScript strict mode — fără any
- Comentarii în română pentru logica de business complexă
- Commit după fiecare feature completat cu mesaj clar
- .env.example actualizat la fiecare variabilă nouă adăugată
- Niciodată secrete în cod (API keys, passwords = doar .env)
- Testează pe mobile după fiecare pagină nouă
- Accesibilitate: aria-labels, focus management, keyboard navigation

## REGULI SUPLIMENTARE (Lazy Senior Dev Mode)
- Întotdeauna alege cea mai simplă soluție care funcționează
- YAGNI — nu construi ce nu e necesar acum
- Preferă librăriile standard față de dependențe externe noi
- Nu abstrage prematur — abstrage doar când ai 3+ cazuri de utilizare
- Cel mai bun cod e codul pe care nu trebuie să îl scrii
- O funcție clară de 20 linii e mai bună decât un sistem complex de 200

## DOCUMENTE DE REFERINȚĂ
- Figma: https://www.figma.com/design/IvBLvAi503Vg0Odvvbs0v4/InspireMe-UI-Design
- 47 task-uri: AUTH(7), FEED(11), CHAT(8), GIV(6), SUB(6), PROF(8), NOTIF(5), ADMIN(6), LEGAL(4)
- 9 Epics, 31 Stories cu criterii de acceptare

## TASK-URI CRITIC (implementează primul)
AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, FEED-01, FEED-02, FEED-07, CHAT-01, CHAT-04, CHAT-05, CHAT-06, CHAT-08, GIV-03, SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, PROF-01, PROF-02, PROF-03, NOTIF-01, NOTIF-03, NOTIF-05, ADMIN-02, ADMIN-03, ADMIN-04, LEGAL-01, LEGAL-02, LEGAL-03, LEGAL-04