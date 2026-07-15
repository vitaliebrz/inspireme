# InspireMe — Epics, Stories & Criterii de Acceptare
> Document de Product Management — Structura completă · Versiune 1.0.0 · Iunie 2026

## Sumar Epics

| ID | Epic | Descriere |
|---|---|---|
| EP-01 | Autentificare & Onboarding | Înregistrare, login, recuperare parolă, product tour, onboarding, consimțământ parental GDPR |
| EP-02 | Feed & Idei | Feed principal, postare idei, vizualizare idee, editare, ștergere, căutare, filtre automate |
| EP-03 | Chat & Colaborare | Cereri conectare, chat real-time, upload fișiere, blocare, raportare, logging, confirmare colaborare |
| EP-04 | Giveaway | Creare giveaway, participare, algoritm selecție server-side, countdown, confirmare investiție |
| EP-05 | Abonamente & Plăți | Planuri Gratuit/Pro pentru elevi și antreprenori, integrare Stripe, toggle lunar/anual |
| EP-06 | Profiluri | Profil elev, profil antreprenor, statusuri automate, analytics Pro, vizibilitate publică/privată |
| EP-07 | Notificări | Notificări in-app, email configurabil, email sistem (non-dezactivabil), rezumat săptămânal, avertizări |
| EP-08 | Moderare & Admin | Dashboard admin, gestionare utilizatori, auto-ascundere la 3 rapoarte, sistem moderare 3 niveluri |
| EP-09 | Legal & Securitate | Termeni și condiții, cookie policy, consimțământ parental, drepturi GDPR utilizator |

---

## EP-01 · Autentificare & Onboarding

### S-01 · Înregistrare Elev
**Ca elev**, vreau să mă înregistrez în 2 pași simpli, astfel încât să pot posta ideea mea cât mai repede.

Criterii de acceptare:
- Formularul are 2 pași: date personale și profil
- Parola are cerințe vizuale live (8 caractere, literă mare, număr)
- Email-ul deja folosit afișează eroare specifică
- Butonul Continuă e dezactivat până pasul 1 e valid
- După submit: loading → mesaj succes → redirect /feed după 2s
- Dacă vârsta sub 16 ani: flux consimțământ parental declanșat automat

Tasks: AUTH-01 | AUTH-05

### S-02 · Înregistrare Antreprenor
**Ca antreprenor**, vreau să mă înregistrez rapid într-un singur pas, astfel încât să pot explora ideile elevilor imediat.

Criterii de acceptare:
- Formular pas unic (fără stepper)
- Email de business non-gmail/yahoo/hotmail obligatoriu
- Domeniu activitate: listă fixă + opțiune Alt domeniu custom
- Checkbox declarativ: confirm că am 18+ ani și activez profesional
- După submit: redirect /feed cu Product Tour specific antreprenorilor

Tasks: AUTH-02

### S-03 · Login și Recuperare Parolă
**Ca utilizator**, vreau să mă autentific și să îmi recuperez parola, astfel încât să am acces sigur la contul meu.

Criterii de acceptare:
- Login cu email + parolă, toggle show/hide parolă
- Validare în timp real: email invalid sau parolă goală → eroare vizuală
- Link "Ai uitat parola?" → flux reset în 3 pași
- Link recuperare valid 24 ore, single-use
- Mesaj clar dacă link expirat sau deja folosit

Tasks: AUTH-03 | AUTH-04

### S-04 · Onboarding și Product Tour
**Ca utilizator nou**, vreau să fiu ghidat prin platformă la primul login, astfel încât să înțeleg rapid cum o folosesc.

Criterii de acceptare:
- Product Tour overlay la primul login (flag firstLogin în DB)
- Tour diferit pentru Elev (5 pași) și Antreprenor (5 pași)
- Buton "Sari peste" mereu vizibil
- După tour: modal onboarding 3 pași de configurare profil
- Dacă modal închis fără finalizare: banner persistent în topbar până la completare

Tasks: AUTH-06 | AUTH-07

### S-05 · Consimțământ Parental Minori
**Ca părinte**, vreau să confirm accesul copilului meu pe platformă, astfel încât să fiu informat și să îmi dau acordul.

Criterii de acceptare:
- La înregistrare: câmp "Ai sub 16 ani?" [Da/Nu]
- Dacă Da: câmp email părinte, cont creat cu status Pending
- Email automat către părinte cu link confirmare valid 48 ore
- Părintele poate confirma sau refuza accesul
- După reminder la 48h fără răspuns: cont rămâne suspendat (nu șters)
- Log păstrat: email părinte, timestamp trimitere, timestamp confirmare

Tasks: AUTH-05

---

## EP-02 · Feed & Idei

### S-06 · Feed Principal cu Filtre
**Ca utilizator**, vreau să văd toate ideile active filtrate pe categorii, astfel încât să găsesc rapid ce mă interesează.

Criterii de acceptare:
- Grid 3 coloane desktop, 1 coloană mobil
- Filtre: Toate / Eco / Tech / Artă / Educație / Sănătate / Social / Food / Finanțe
- Click filtru → filtrare JavaScript fără reload pagina
- Ideile Pro apar primele, apoi Gratuit
- Skeleton shimmer animat în timp ce cardurile se încarcă
- 4 stats carduri sus: total idei, utilizatori, colaborări, giveaway-uri

Tasks: FEED-01

### S-07 · Vizualizare Idee
**Ca utilizator**, vreau să văd toate detaliile unei idei într-o pagină dedicată, astfel încât să pot evalua potențialul ei.

Criterii de acceptare:
- Layout 2 coloane: 65% detalii + 35% sidebar
- Stadiu idee vizibil DOAR elevului proprietar (nu antreprenorilor, nu vizitatorilor)
- Stadiile: Publicat → Contactat → În colaborare → Realizat
- Primele 2 automate, ultimele 2 setate manual de elev
- Badge 🏆 "Această idee a primit investiție" vizibil PUBLIC doar la stadiu Realizat
- Galerie imagini cu modal lightbox fullscreen la click
- Card PDF cu buton descărcare
- Elevii văd feedback de la antreprenori (doar citire, fără formular)
- Antreprenorii văd formularul de Feedback Structurat (rating + 4 criterii + comentariu)
- Antreprenorii văd Card Propunere Colaborare (Mentorat/Investiție/Parteneriat)
- Feedback editabil în primele 24 ore, definitiv după

Tasks: FEED-03 | FEED-04 | FEED-09

### S-09 · Editare și Ștergere Idee
Criterii de acceptare:
- Editare permisă înainte de prima colaborare activă
- După prima colaborare: ideea nu mai poate fi editată
- Ștergere permisă oricând, indiferent de colaborări
- Dacă are colaborări active: warning explicit cu lista colaboratorilor
- La ștergere cu colaborări: notificare automată fiecărui antreprenor
- Conversațiile din chat rămân intacte după ștergerea ideii

Tasks: FEED-05 | FEED-06

### S-10 · Filtre Automate Conținut
Criterii de acceptare:
- Listă cuvinte interzise blochează publicarea automat
- Mesaj clar utilizatorului cu ce trebuie corectat
- Linkuri externe blocate în corpul ideii (permise doar în profil)
- Toate postările blocate logate: user, conținut, motiv, timestamp

Tasks: FEED-07

### S-11 · Căutare Globală
Criterii de acceptare:
- Search bar permanent în topbar
- Rezultate instant cu debounce 300ms
- Rezultate grupate pe 3 tab-uri: Idei | Antreprenori | Elevi
- Click rezultat → redirect la pagina relevantă
- Escape sau click în afara închide rezultatele

Tasks: FEED-08

### S-12 · Feed Antreprenori
Criterii de acceptare:
- Feed are 2 tab-uri: Feed Idei | Feed Antreprenori
- Grid carduri antreprenori cu: avatar, nume, companie, domeniu, badge status, badge plan
- Aceleași filtre pe categorii ca Feed Idei
- Antreprenorii Pro (Mentor Exclusiv) apar primii în grid
- Antreprenorii Retrași apar ultimii cu opacitate redusă

Tasks: FEED-10 | FEED-11

---

## EP-03 · Chat & Colaborare

### S-12 · Cereri de Conectare
Criterii de acceptare:
- Antreprenorii trimit cerere, elevul acceptă sau refuză
- Refuz: antreprenorul poate retrimite la idei NOI ale elevului
- Buton Blochează separat (model Instagram): blocare permanentă până la deblocare
- După blocare: antreprenorul nu vede ideile elevului în feed
- Cererea expiră automat după 1 an fără răspuns
- Limite: Gratuit 5 cereri total pe viață, Pro 30/zi resetate la miezul nopții

Tasks: CHAT-01 | CHAT-04 | CHAT-08

### S-13 · Chat Real-Time
Criterii de acceptare:
- Layout: 280px listă conversații + 1fr fereastră chat
- Mesajele proprii dreapta (portocaliu), ale celuilalt stânga (gri)
- Separatoare dată între grupuri de zile
- Mesaje noi apar instant cu animație fade-in
- Scroll automat la ultimul mesaj după trimitere

Tasks: CHAT-02

### S-14 · Upload Fișiere și Siguranță Chat
Criterii de acceptare:
- Permis DOAR PDF și imagini (JPG, PNG, WebP), max 10MB
- Scanare tip fișier real (nu doar extensia)
- Fișierele stocate cu nume randomizat pe server
- Buton "Raportează conversația" permanent vizibil în header chat

Tasks: CHAT-03 | CHAT-05

### S-15 · Logging și Confirmare Colaborare
Criterii de acceptare:
- Toate mesajele logate pe server
- Adminul accesează o conversație DOAR la raport activ pe ea
- La 30 zile după conectare: notificare ambelor părți pentru confirmare
- Dacă ambii confirmă: colaborare înregistrată în statistici

Tasks: CHAT-06 | CHAT-07

---

## EP-04 · Giveaway

### S-16 · Lansare și Participare Giveaway
Criterii de acceptare:
- Disponibil antreprenorilor cu Plan Pro și adminilor (fără restricție de plan)
- Câmpuri: titlu, descriere, investiție promisă, dată start/sfârșit, max participanți
- La creare: antreprenorul confirmă explicit că va onora investiția promisă
- Elevii pot participa dacă ideea are: titlu + 100 cuvinte + imagine/PDF
- Countdown live cu setInterval (4 boxuri: zile, ore, minute, secunde)

Tasks: GIV-01 | GIV-02 | GIV-04

### S-17 · Selecție Câștigător și Confirmare Investiție
Criterii de acceptare:
- Selecția rulează EXCLUSIV pe server (crypto.randomInt)
- Animația wheel-of-fortune e VIZUALĂ ONLY, rezultatul vine de la server
- Log selecție: dată, ID câștigător, seed random, cine a inițiat
- La 30 zile: ambele părți confirmă că investiția s-a realizat
- Dacă antreprenorul nu confirmă în 37 zile: badge "Giveaway neîndeplinit" pe profil

Tasks: GIV-03 | GIV-05 | GIV-06

---

## EP-05 · Abonamente & Plăți

### S-18 · Planuri Elev
- **Gratuit**: 1 idee activă, 3 imagini, 1 PDF, chat 5 mesaje/zi (server-side)
- **Pro** (25 lei/lună sau 240 lei/an): idei nelimitate, chat nelimitat, prioritate #1 feed, analytics complete, acces mentori exclusivi

Tasks: SUB-01 | SUB-02 | SUB-06

### S-19 · Planuri Antreprenor
- **Gratuit**: max 5 cereri totale pe viața contului, feedback pe idei, profil public
- **Pro** (75 lei/lună sau 720 lei/an): 30 cereri/zi, giveaway-uri, badge Mentor Exclusiv, profil evidențiat #1

Tasks: SUB-03 | SUB-04 | SUB-06

### S-20 · Procesare Plăți Stripe
Criterii de acceptare:
- Click "Începe acum" → redirect Stripe Checkout
- Webhooks: checkout.session.completed, invoice.payment_failed, customer.subscription.deleted
- Anulare oricând fără penalizări

Tasks: SUB-05

---

## EP-06 · Profiluri

### S-21 · Profil Elev
- Vizualizare proprie: tabs Ideile mele / Giveaway-uri / Feedback primit / Analytics (Pro)
- Vizualizare publică: Nume, Bio, Interese, Idei publice (fără Școală/Oraș fără autentificare)

Tasks: PROF-01 | PROF-02

### S-22 · Profil Antreprenor cu Statusuri
- ACTIV (verde): intrat în ultimele 30 zile
- INACTIV (amber): 30-60 zile fără activitate
- RETRAS (gri): peste 60 zile fără activitate
- Avertisment modal la contact antreprenor RETRAS

Tasks: PROF-03 | PROF-04 | PROF-05

### S-23 · Analytics Elev Pro
- Accesibil DOAR elevilor Pro (Plan Gratuit vede tab cu blur + prompt upgrade)
- Grafic linie: vizualizări ultimele 7 zile (SVG responsiv)
- Heatmap activitate (model GitHub, 52 săptămâni)

Tasks: PROF-06

### S-24 · Istoricul Investițiilor Antreprenor
- Tabel: Proiect | Sumă/Tip investiție | Dată | Status (Activ/În negociere/Finalizat/Neconfirmat)
- Alimentat automat din colaborările confirmate și giveaway-urile finalizate

Tasks: PROF-07

---

## EP-07 · Notificări

### S-26 · Notificări In-App
- Dropdown la click pe 🔔 în topbar (max 5 recente + link Toate)
- Pagina /notificări cu filter tabs: Toate / Necitite / Mesaje / Idei / Giveaway / Sistem
- Vizualizări idee: REZUMAT SĂPTĂMÂNAL (nu per vizualizare)

Tasks: NOTIF-01 | NOTIF-04

### S-27 · Email Notificări și Avertizări
- Email mesaje & cereri: ON by default, poate fi dezactivat
- Email sistem & cont: ON by default, NU poate fi dezactivat (GDPR)
- Max 3 emailuri pe zi per utilizator (grupate în digest)
- Avertizare ștergere cont: email la 330 zile și 354 zile inactivitate
- Ștergere automată la 365 zile fără activitate

Tasks: NOTIF-02 | NOTIF-03 | NOTIF-05

---

## EP-08 · Moderare & Admin

### S-28 · Dashboard Admin
- Acces DOAR pentru rolul ADMIN (/admin protejat)
- 6 stat cards: utilizatori, elevi, antreprenori, idei, venit, rapoarte pending
- Sidebar distinct: fundal #1a1a2e + badge roșu ADMIN

Tasks: ADMIN-01

### S-29 · Gestionare Utilizatori și Moderare
- 3 niveluri moderare: Avertisment / Eliminare conținut / Suspendare cont
- Auto-ascundere conținut la 3 rapoarte de utilizatori diferiți
- Al doilea admin (MODERATOR): acces DOAR la pagina de moderare
- Ștergere automată cont inactiv după 365 zile (job zilnic 02:00)

Tasks: ADMIN-02 | ADMIN-03 | ADMIN-04 | ADMIN-05 | ADMIN-06

---

## EP-09 · Legal & Securitate

### S-30 · Documente Juridice și Cookie Policy
- Termeni și Condiții, Politică de Confidențialitate, Cookie Policy în footer
- Pagini dedicate: /termeni, /confidentialitate, /cookie-policy
- Checkbox obligatoriu la înregistrare
- Banner cookie la prima vizită

Tasks: LEGAL-01 | LEGAL-02

### S-31 · Drepturi GDPR Utilizator
- Dreptul la ștergere: opțiune în Setări → Cont → Șterge contul meu
- Dreptul la portabilitate: export date JSON/CSV în max 72 ore
- Dreptul la rectificare: editare date din profil oricând
- Dreptul la restricționare: Dezactivează contul temporar

Tasks: LEGAL-03 | LEGAL-04

---

## Task-uri Complete — Index Rapid

### AUTH
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| AUTH-01 | Înregistrare Elev (flux 2 pași) | CRITIC | FULL-STACK |
| AUTH-02 | Înregistrare Antreprenor | CRITIC | FULL-STACK |
| AUTH-03 | Login cu email/parolă | CRITIC | FULL-STACK |
| AUTH-04 | Recuperare parolă (link 24h) | CRITIC | BACKEND |
| AUTH-05 | Consimțământ parental minori sub 16 ani | CRITIC | FULL-STACK |
| AUTH-06 | Product Tour la primul login | ÎNALT | FRONTEND |
| AUTH-07 | Onboarding modal 3 pași | ÎNALT | FRONTEND |

### FEED
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| FEED-01 | Feed principal cu filtre pe categorii | CRITIC | FULL-STACK |
| FEED-02 | Postare idee nouă (doar elevi) | CRITIC | FULL-STACK |
| FEED-03 | Pagina vizualizare idee — versiune Elev | CRITIC | FRONTEND |
| FEED-04 | Pagina vizualizare idee — versiune Antreprenor | CRITIC | FRONTEND |
| FEED-05 | Editare idee (înainte de prima colaborare) | ÎNALT | FULL-STACK |
| FEED-06 | Ștergere idee cu notificare colaboratori | ÎNALT | FULL-STACK |
| FEED-07 | Filtre automate conținut (cuvinte interzise + linkuri) | CRITIC | BACKEND |
| FEED-08 | Căutare globală (Idei + Antreprenori + Elevi) | ÎNALT | FULL-STACK |
| FEED-09 | Reset automat stadiu idee la 30 zile inactivitate | ÎNALT | BACKEND |
| FEED-10 | Feed Antreprenori — tab separat | CRITIC | FULL-STACK |
| FEED-11 | Card Antreprenor în Feed | ÎNALT | FRONTEND |

### CHAT
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| CHAT-01 | Sistem cerere de conectare | CRITIC | FULL-STACK |
| CHAT-02 | Chat real-time între elev și antreprenor | CRITIC | FULL-STACK |
| CHAT-03 | Upload fișiere în chat (PDF + imagini, max 10MB) | ÎNALT | FULL-STACK |
| CHAT-04 | Sistem blocare utilizator | CRITIC | FULL-STACK |
| CHAT-05 | Raportare conversație | CRITIC | FULL-STACK |
| CHAT-06 | Logging conversații (acces admin la raportare) | CRITIC | BACKEND |
| CHAT-07 | Confirmare colaborare la 30 zile | ÎNALT | BACKEND |
| CHAT-08 | Limite cereri: Gratuit 5 total, Pro 30/zi | CRITIC | BACKEND |

### GIV
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| GIV-01 | Creare giveaway (antreprenori Pro + admin) | ÎNALT | FULL-STACK |
| GIV-02 | Participare la giveaway (verificare calitate idee) | ÎNALT | FULL-STACK |
| GIV-03 | Algoritm selecție câștigător pe SERVER | CRITIC | BACKEND |
| GIV-04 | Countdown live giveaway activ | MEDIU | FRONTEND |
| GIV-05 | Badge Giveaway neîndeplinit pe profil antreprenor | ÎNALT | BACKEND |
| GIV-06 | Confirmare investiție la 30 zile post-giveaway | ÎNALT | BACKEND |

### SUB
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| SUB-01 | Plan Elev Gratuit | CRITIC | FULL-STACK |
| SUB-02 | Plan Elev Pro — 25 lei/lună sau 240 lei/an | CRITIC | FULL-STACK |
| SUB-03 | Plan Antreprenor Gratuit | CRITIC | FULL-STACK |
| SUB-04 | Plan Antreprenor Pro — 75 lei/lună sau 720 lei/an | CRITIC | FULL-STACK |
| SUB-05 | Integrare Stripe pentru plăți | CRITIC | BACKEND |
| SUB-06 | Toggle lunar/anual cu reducere 20% | ÎNALT | FRONTEND |

### PROF
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| PROF-01 | Profil elev — vizualizare proprie | CRITIC | FULL-STACK |
| PROF-02 | Profil elev — vizualizare publică | CRITIC | FULL-STACK |
| PROF-03 | Profil antreprenor cu statusuri Activ/Inactiv/Retras | CRITIC | FULL-STACK |
| PROF-04 | Status automat antreprenor (30/60 zile) | ÎNALT | BACKEND |
| PROF-05 | Avertisment la contact antreprenor Retras | MEDIU | FRONTEND |
| PROF-06 | Analytics elev Pro | ÎNALT | FULL-STACK |
| PROF-07 | Istoricul Investițiilor pe profilul antreprenorului | ÎNALT | FULL-STACK |
| PROF-08 | Profil Elev văzut de Antreprenor | ÎNALT | FRONTEND |

### NOTIF
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| NOTIF-01 | Notificări in-app | CRITIC | FULL-STACK |
| NOTIF-02 | Email notificări (configurabil) | ÎNALT | BACKEND |
| NOTIF-03 | Email sistem & cont (nu poate fi dezactivat) | CRITIC | BACKEND |
| NOTIF-04 | Rezumat săptămânal vizualizări | MEDIU | BACKEND |
| NOTIF-05 | Avertizare ștergere cont cu 30 zile înainte | CRITIC | BACKEND |

### ADMIN
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| ADMIN-01 | Dashboard admin cu statistici platformă | ÎNALT | FULL-STACK |
| ADMIN-02 | Gestionare utilizatori | CRITIC | FULL-STACK |
| ADMIN-03 | Auto-ascundere conținut la 3 rapoarte | CRITIC | BACKEND |
| ADMIN-04 | Sistem moderare: Avertisment / Eliminare / Suspendare | CRITIC | FULL-STACK |
| ADMIN-05 | Al doilea admin de rezervă (acces limitat) | ÎNALT | BACKEND |
| ADMIN-06 | Ștergere automată cont inactiv după 1 an | ÎNALT | BACKEND |

### LEGAL
| ID | Titlu | Prioritate | Tip |
|---|---|---|---|
| LEGAL-01 | Termeni și Condiții + Politică Confidențialitate | CRITIC | FRONTEND |
| LEGAL-02 | Cookie Policy și banner consimțământ | CRITIC | FRONTEND |
| LEGAL-03 | Flux consimțământ parental minori sub 16 ani | CRITIC | FULL-STACK |
| LEGAL-04 | GDPR — drept ștergere și export date | CRITIC | BACKEND |

---

**Total: 47 task-uri · 28 Critic · 16 Înalt · 3 Mediu**
