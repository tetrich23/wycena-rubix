import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Jedna współdzielona przeglądarka na cały serwer (oszczędza pamięć na darmowym hostingu)
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

// Prosty semafor, żeby nie odpalać zbyt wielu kart naraz (limit pamięci na darmowym hostingu)
const MAX_CONCURRENT_PAGES = 3;
let activePages = 0;
const queue = [];
function acquireSlot() {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activePages < MAX_CONCURRENT_PAGES) {
        activePages++;
        resolve();
      } else {
        queue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}
function releaseSlot() {
  activePages--;
  const next = queue.shift();
  if (next) next();
}

async function searchRubix(query) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "pl-PL",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const url = `https://pl.rubix.com/pl/search?text=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });

    // Daj czas na doładowanie cen przez JS/AJAX (Rubix ładuje je asynchronicznie)
    await page.waitForTimeout(1500);

    const results = await page.evaluate(() => {
      // Szukamy linków do produktów (wzorzec URL Rubix: /p-G<numer>)
      const productLinks = Array.from(document.querySelectorAll('a[href*="/p-G"]'));
      const seen = new Set();
      const items = [];

      for (const link of productLinks) {
        const href = link.getAttribute("href");
        if (!href || seen.has(href)) continue;

        // Szukamy najbliższego wspólnego kontenera (karty produktu), żeby znaleźć cenę obok
        let card = link.closest("li, article, div");
        let priceText = "";
        let depth = 0;
        while (card && depth < 6 && !priceText) {
          const match = card.innerText && card.innerText.match(/(\d[\d\s]*,\d{2})\s*z[łl]/i);
          if (match) priceText = match[1].replace(/\s/g, "") + " zł";
          card = card.parentElement;
          depth++;
        }

        const name = (link.textContent || "").trim();
        if (!name) continue;

        seen.add(href);
        items.push({
          name,
          url: href.startsWith("http") ? href : `https://pl.rubix.com${href}`,
          price: priceText || null,
        });
      }
      return items;
    });

    return results;
  } finally {
    await page.close();
    await context.close();
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/search", async (req, res) => {
  const { query } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: "Brak zapytania (query)" });
  }

  await acquireSlot();
  try {
    const items = await searchRubix(String(query).trim());
    const withPrice = items.filter((i) => i.price);
    const best = withPrice[0] || items[0] || null;

    if (!best) {
      return res.json({ found: false, note: "Brak wyników wyszukiwania na pl.rubix.com" });
    }
    if (!best.price) {
      return res.json({
        found: false,
        note: "Znaleziono produkt, ale bez widocznej ceny (może wymagać zalogowania lub wyceny na zapytanie)",
        url: best.url,
      });
    }
    return res.json({ found: true, price: best.price, url: best.url, note: best.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Błąd scrapowania: " + (err.message || String(err)) });
  } finally {
    releaseSlot();
  }
});

app.listen(PORT, () => {
  console.log(`Serwer scrapera Rubix działa na porcie ${PORT}`);
});
