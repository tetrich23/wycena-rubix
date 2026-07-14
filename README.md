# Wycena Rubix

Aplikacja React do automatycznej wyceny listy produktów na podstawie pliku Excel,
wykorzystująca Anthropic API (Claude + web search) do wyszukiwania cen na pl.rubix.com.

## Jak uruchomić na GitHub Pages

1. **Utwórz nowe repozytorium** na GitHubie, np. o nazwie `wycena-rubix`.
2. **Wypchnij zawartość tego folderu** do repozytorium (na branch `main`):
   ```bash
   git init
   git add .
   git commit -m "Pierwsza wersja aplikacji"
   git branch -M main
   git remote add origin https://github.com/TWOJA-NAZWA/wycena-rubix.git
   git push -u origin main
   ```
3. **Sprawdź `vite.config.js`** — pole `base` musi być dokładną nazwą Twojego repo,
   np. jeśli repo nazywa się `moj-projekt`, ustaw `base: "/moj-projekt/"`.
4. W ustawieniach repozytorium na GitHubie wejdź w **Settings → Pages** i w sekcji
   "Build and deployment" wybierz źródło: **GitHub Actions**.
5. Po pushu na `main` workflow z `.github/workflows/deploy.yml` sam zbuduje
   i opublikuje stronę. Adres pojawi się w **Settings → Pages** (zwykle
   `https://TWOJA-NAZWA.github.io/wycena-rubix/`).

## Klucz API

Aplikacja przy starcie prosi o klucz API Anthropic (`sk-ant-...`). Klucz jest
używany wyłącznie w przeglądarce użytkownika, trzymany w pamięci (nie jest
zapisywany na serwerze ani w repozytorium) i znika po odświeżeniu strony.

**Ważne:** ponieważ to statyczna strona bez backendu, klucz API trafia do kodu
JS wykonywanego w przeglądarce — widoczny jest tam dla każdego, kto ma dostęp
do tej karty przeglądarki (np. przez DevTools). Nadaje się to do użytku
osobistego (Ty wpisujesz swój własny klucz), ale **nie udostępniaj** takiego
linku publicznie z myślą, że inni użyją go bez własnego klucza — każdy musi
wpisać swój.

## Rozwój lokalny

```bash
npm install
npm run dev
```
