# Wycena Rubix (wersja darmowa — scraper)

Aplikacja React + mały backend scrapujący ceny bezpośrednio z pl.rubix.com
(bez żadnego płatnego API AI). Backend używa Playwright (prawdziwej,
headless przeglądarki), bo Rubix doładowuje ceny przez JavaScript —
zwykłe pobranie HTML-a ich nie pokazuje.

## Ważne zastrzeżenia

- **Regulamin Rubix**: automatyczne pobieranie danych ze sklepu może być
  objęte warunkami korzystania z serwisu. Sprawdź „Warunki handlowe" na
  pl.rubix.com, zanim odpalisz to na dużą skalę, żeby nie złamać regulaminu
  swojego konta.
- **Ceny bez logowania mogą być inne niż Twoje indywidualne (netto, po
  rabatach)** — scraper pobiera to, co widać publicznie, bez logowania.
  Jeśli chcesz swoich cen B2B, powiedz — da się rozbudować backend o
  logowanie, ale to już bardziej ingeruje w Twoje konto.
- Bądź dla serwera Rubix "grzeczny" — nie ustawiaj zbyt wysokiej
  równoległości (w aplikacji domyślnie 2), żeby nie przeciążać ich strony
  ani nie zostać zablokowanym (rate limiting / captcha).

## Część 1: Backend (scraper) — wdrożenie na Render.com (darmowe)

1. Wejdź na [render.com](https://render.com) i załóż darmowe konto.
2. **New → Web Service**, połącz swoje repozytorium GitHub z tym projektem.
3. W ustawieniach:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Kliknij **Create Web Service**. Pierwszy build potrwa kilka minut
   (Playwright pobiera przeglądarkę Chromium).
5. Po wdrożeniu Render poda publiczny adres, np.
   `https://wycena-rubix-scraper.onrender.com` — to jest adres, który
   wklejasz w aplikacji frontendowej.

**Uwaga o darmowym planie Render**: usypia serwis po ~15 minutach
bezczynności. Pierwsze zapytanie po uśpieniu może trwać 30-60 sekund
(budzenie), kolejne już szybko.

## Część 2: Frontend — GitHub Pages

Tak jak poprzednio:

```bash
git init
git add .
git commit -m "Wersja darmowa - scraper"
git branch -M main
git remote add origin https://github.com/TWOJA-NAZWA/wycena-rubix.git
git push -u origin main
```

Sprawdź `vite.config.js` (`base` = nazwa repo), włącz **Settings → Pages →
Source: GitHub Actions**. Po zbudowaniu wejdź na stronę i przy pierwszym
uruchomieniu wklej adres backendu z Render (Część 1, punkt 5).

## Rozwój lokalny

Backend:
```bash
cd server
npm install
npx playwright install --with-deps chromium
npm start
```

Frontend:
```bash
npm install
npm run dev
```
