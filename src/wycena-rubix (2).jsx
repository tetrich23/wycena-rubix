import React, { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, Play, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";

const ACCENT = "#E8590C"; // industrial orange, nawiązuje do palet magazynowych/technicznych
const INK = "#1B1F23";
const PAPER = "#F7F5F1";

export default function App() {
  const [apiKey, setApiKey] = useState(""); // trzymany wyłącznie w pamięci (React state), nie jest nigdzie zapisywany
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [workbook, setWorkbook] = useState(null); // surowy XLSX.workbook
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [rows, setRows] = useState([]); // oryginalne wiersze z excela (obiekty)
  const [headers, setHeaders] = useState([]);
  const [queryColumns, setQueryColumns] = useState([]); // kolumny łączone w zapytanie
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState([]); // { status: 'idle'|'loading'|'found'|'notfound'|'error', price, url, note }
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [concurrency, setConcurrency] = useState(5);
  const fileInputRef = useRef(null);
  const cancelRef = useRef(false);

  function loadSheet(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    let headerRowIdx = raw.findIndex(
      (r) => r.filter((c) => String(c).trim() !== "").length >= 3
    );
    if (headerRowIdx === -1) headerRowIdx = 0;
    const cols = raw[headerRowIdx].map((c, i) => (String(c).trim() ? String(c).trim() : `Kolumna ${i + 1}`));
    const dataRows = raw.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c).trim() !== ""));
    const json = dataRows.map((r) => {
      const obj = {};
      cols.forEach((c, i) => (obj[c] = r[i] !== undefined ? r[i] : ""));
      return obj;
    });

    setHeaders(cols);
    setRows(json);
    setResults(json.map(() => ({ status: "idle", price: "", url: "", note: "" })));

    const preferredNames = ["Producent", "Numer częsci producentra", "Numer części producenta", "Krótki tekst", "Nazwa", "Opis", "Materiał"];
    const guessed = preferredNames.filter((p) => cols.includes(p));
    if (guessed.length > 0) {
      setQueryColumns(guessed);
    } else {
      const fallback = cols.find((c) => /nazwa|opis|produkt|towar|tekst|name|description/i.test(c));
      setQueryColumns([fallback || cols[0]]);
    }
  }

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        const preferred = wb.SheetNames.find((n) => /^data$/i.test(n)) || wb.SheetNames[0];
        setActiveSheet(preferred);
        loadSheet(wb, preferred);
      } catch (err) {
        alert("Nie udało się odczytać pliku: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  function switchSheet(name) {
    if (!workbook) return;
    setActiveSheet(name);
    loadSheet(workbook, name);
  }

  function toggleQueryColumn(col) {
    setQueryColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  function buildQuery(row) {
    return queryColumns
      .map((c) => String(row[c] || "").trim())
      .filter((v) => v && v !== "-")
      .join(" ");
  }

  async function lookupOne(queryText, attempt = 0) {
    const systemPrompt =
      "Jesteś asystentem wyszukującym ceny części i produktów przemysłowych na stronie pl.rubix.com/pl (polski oddział Rubix). " +
      "Dostajesz opis jednego produktu (może zawierać producenta, numer części i krótki opis połączone razem). Użyj wyszukiwarki, aby znaleźć ten dokładny lub najbliższy odpowiadający produkt WYŁĄCZNIE na stronie pl.rubix.com (możesz używać zapytań w stylu site:pl.rubix.com). " +
      "Odpowiedz WYŁĄCZNIE czystym obiektem JSON, bez markdown, bez wstępu, w formacie: " +
      '{"found": true|false, "price": "np. 123,45 zł" albo "", "url": "pełny link do produktu" albo "", "note": "krótka notatka po polsku"}. ' +
      'Jeśli produktu nie ma na Rubix, ustaw found=false, price="", url="" i note="Rubix nie ma tego produktu" (lub podobne, opisz dlaczego jeśli wiadomo).';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: `Produkt: ${queryText}` }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      }),
    });

    if (response.status === 401) {
      throw new Error("Nieprawidłowy klucz API — sprawdź, czy klucz jest poprawny i spróbuj ponownie.");
    }

    if (response.status === 429) {
      const maxAttempts = 6;
      if (attempt >= maxAttempts) {
        throw new Error("Limit zapytań (429) — przekroczono liczbę prób");
      }
      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const waitMs = retryAfterHeader
        ? retryAfterHeader * 1000
        : Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 500;
      await new Promise((res) => setTimeout(res, waitMs));
      return lookupOne(queryText, attempt + 1);
    }

    if (response.status >= 500) {
      const maxAttempts = 4;
      if (attempt >= maxAttempts) {
        throw new Error("Błąd serwera API: " + response.status);
      }
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
      return lookupOne(queryText, attempt + 1);
    }

    if (!response.ok) {
      throw new Error("Błąd API: " + response.status);
    }
    const data = await response.json();
    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return { found: false, price: "", url: "", note: "Brak jednoznacznej odpowiedzi" };
    }
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return {
        found: !!parsed.found,
        price: parsed.price || "",
        url: parsed.url || "",
        note: parsed.note || "",
      };
    } catch {
      return { found: false, price: "", url: "", note: "Nie udało się sparsować odpowiedzi" };
    }
  }

  async function startProcessing() {
    if (queryColumns.length === 0 || rows.length === 0) return;
    setProcessing(true);
    cancelRef.current = false;

    let nextIdx = 0;
    const total = rows.length;

    async function processIndex(i) {
      setCurrentIndex(i);
      setResults((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "loading" };
        return next;
      });

      const queryText = buildQuery(rows[i]);
      let res;
      if (!queryText) {
        res = { status: "error", price: "", url: "", note: "Pusty opis produktu" };
      } else {
        try {
          const r = await lookupOne(queryText);
          res = {
            status: r.found ? "found" : "notfound",
            price: r.price,
            url: r.url,
            note: r.note,
          };
        } catch (err) {
          res = { status: "error", price: "", url: "", note: String(err.message || err) };
        }
      }
      setResults((prev) => {
        const next = [...prev];
        next[i] = res;
        return next;
      });
    }

    async function worker() {
      while (!cancelRef.current) {
        const i = nextIdx;
        if (i >= total) return;
        nextIdx++;
        await processIndex(i);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
    await Promise.all(workers);

    setCurrentIndex(-1);
    setProcessing(false);
  }

  function stopProcessing() {
    cancelRef.current = true;
  }

  function exportExcel() {
    const exportRows = rows.map((row, i) => {
      const r = results[i] || {};
      return {
        ...row,
        "Cena Rubix": r.price || "",
        "Link Rubix": r.url || "",
        Status: r.status === "found" ? "Znaleziono" : r.status === "notfound" ? "Rubix nie ma tego produktu" : r.status === "error" ? "Błąd wyszukiwania" : "",
        Uwagi: r.note || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wycena");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ? fileName.replace(/\.xlsx?$/i, "") + "_wycena.xlsx" : "wycena.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const doneCount = results.filter((r) => r.status === "found" || r.status === "notfound" || r.status === "error").length;
  const foundCount = results.filter((r) => r.status === "found").length;
  const notFoundCount = results.filter((r) => r.status === "notfound").length;

  if (!apiKey) {
    return (
      <div style={{ background: PAPER, minHeight: "100%", fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", border: `1px solid #ddd`, borderRadius: 6, padding: 32, maxWidth: 420, width: "100%" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2, color: ACCENT, fontWeight: 700, marginBottom: 6 }}>
            WYCENA · RUBIX
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 10px" }}>Podaj klucz API Anthropic</h2>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
            Klucz jest używany wyłącznie w tej sesji przeglądarki, przechowywany tylko w pamięci
            i znika po odświeżeniu strony. Nie jest nigdzie zapisywany ani wysyłany poza Anthropic API.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (apiKeyInput.trim()) setApiKey(apiKeyInput.trim());
            }}
          >
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 4,
                border: "1px solid #ccc",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                marginBottom: 14,
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={!apiKeyInput.trim()}
              style={{
                width: "100%",
                background: ACCENT,
                color: "#fff",
                border: "none",
                padding: "10px 18px",
                borderRadius: 4,
                fontWeight: 700,
                cursor: apiKeyInput.trim() ? "pointer" : "default",
                fontSize: 14,
                opacity: apiKeyInput.trim() ? 1 : 0.5,
              }}
            >
              Zapisz i kontynuuj
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", color: INK, padding: "32px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ marginBottom: 28, borderBottom: `3px solid ${INK}`, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2, color: ACCENT, fontWeight: 700 }}>
              WYCENA · RUBIX
            </span>
            <button
              onClick={() => {
                setApiKey("");
                setApiKeyInput("");
              }}
              disabled={processing}
              style={{
                background: "none",
                border: "1px solid #ccc",
                borderRadius: 3,
                padding: "4px 10px",
                fontSize: 12,
                cursor: processing ? "default" : "pointer",
                color: "#666",
              }}
            >
              Zmień klucz API
            </button>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "6px 0 4px", letterSpacing: -0.5 }}>
            Automatyczna wycena z pl.rubix.com
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
            Wgraj plik Excel z listą produktów — sprawdzę każdy z nich na Rubix i zapiszę ceny.
          </p>
        </header>

        {/* Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          style={{
            border: `2px dashed ${rows.length ? "#bbb" : ACCENT}`,
            borderRadius: 4,
            padding: 28,
            textAlign: "center",
            cursor: "pointer",
            background: "#fff",
            marginBottom: 20,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <FileSpreadsheet size={28} color={ACCENT} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 600 }}>
            {fileName ? `Wczytano: ${fileName} (${rows.length} wierszy)` : "Kliknij lub przeciągnij plik Excel (.xlsx)"}
          </div>
          {!fileName && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Obsługiwane: .xlsx, .xls, .csv</div>}
        </div>

        {rows.length > 0 && (
          <>
            {/* Ustawienia */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                {sheetNames.length > 1 && (
                  <label style={{ fontSize: 13, fontWeight: 600 }}>
                    Arkusz:
                    <select
                      value={activeSheet}
                      onChange={(e) => switchSheet(e.target.value)}
                      disabled={processing}
                      style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 3, border: "1px solid #ccc", fontFamily: "inherit" }}
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Równolegle zapytań:
                  <select
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    disabled={processing}
                    style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 3, border: "1px solid #ccc", fontFamily: "inherit" }}
                  >
                    {[1, 2, 3, 5, 8].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Kolumny łączone w zapytanie do Rubix (kolejność ma znaczenie):
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {headers.map((h) => (
                  <label
                    key={h}
                    style={{
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: queryColumns.includes(h) ? "#fff3ec" : "#fff",
                      border: `1px solid ${queryColumns.includes(h) ? ACCENT : "#ddd"}`,
                      borderRadius: 3,
                      padding: "5px 9px",
                      cursor: processing ? "default" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={queryColumns.includes(h)}
                      disabled={processing}
                      onChange={() => toggleQueryColumn(h)}
                    />
                    {h}
                  </label>
                ))}
              </div>
              {rows[0] && (
                <div style={{ fontSize: 12, color: "#888", marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
                  Przykładowe zapytanie: „{buildQuery(rows[0]) || "(brak wybranych kolumn)"}"
                </div>
              )}

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {!processing ? (
                  <button
                    onClick={startProcessing}
                    disabled={queryColumns.length === 0}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: ACCENT, color: "#fff", border: "none",
                      padding: "9px 18px", borderRadius: 3, fontWeight: 700, cursor: "pointer", fontSize: 14,
                      opacity: queryColumns.length === 0 ? 0.5 : 1,
                    }}
                  >
                    <Play size={16} /> Rozpocznij wycenę
                  </button>
                ) : (
                  <button
                    onClick={stopProcessing}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#fff", color: INK, border: `1.5px solid ${INK}`,
                      padding: "9px 18px", borderRadius: 3, fontWeight: 700, cursor: "pointer", fontSize: 14,
                    }}
                  >
                    Zatrzymaj
                  </button>
                )}

                {doneCount > 0 && (
                  <button
                    onClick={exportExcel}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: INK, color: "#fff", border: "none",
                      padding: "9px 18px", borderRadius: 3, fontWeight: 700, cursor: "pointer", fontSize: 14,
                    }}
                  >
                    <Download size={16} /> Pobierz Excel z wyceną
                  </button>
                )}
              </div>
            </div>

            {/* Pasek postępu */}
            {rows.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ height: 8, background: "#e6e2da", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(doneCount / rows.length) * 100}%`,
                      background: ACCENT,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {doneCount}/{rows.length} sprawdzono · {foundCount} znaleziono · {notFoundCount} brak na Rubix
                </div>
              </div>
            )}

            {/* Tabela wyników */}
            <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 4, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: INK, color: "#fff", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>Produkt</th>
                    <th style={{ padding: "10px 12px" }}>Status</th>
                    <th style={{ padding: "10px 12px" }}>Cena</th>
                    <th style={{ padding: "10px 12px" }}>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const r = results[i] || {};
                    return (
                      <tr
                        key={i}
                        style={{
                          borderTop: "1px solid #eee",
                          background: currentIndex === i ? "#fff3ec" : "#fff",
                        }}
                      >
                        <td style={{ padding: "8px 12px", maxWidth: 320 }}>{buildQuery(row) || <span style={{ color: "#bbb" }}>—</span>}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <StatusBadge status={r.status} note={r.note} />
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "'IBM Plex Mono', monospace" }}>{r.price || "—"}</td>
                        <td style={{ padding: "8px 12px" }}>
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>
                              otwórz
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, note }) {
  const map = {
    idle: { icon: null, label: "Oczekuje", color: "#999" },
    loading: { icon: <Loader2 size={14} className="spin" />, label: "Sprawdzam…", color: "#888" },
    found: { icon: <CheckCircle2 size={14} />, label: "Znaleziono", color: "#1a7f37" },
    notfound: { icon: <XCircle size={14} />, label: note || "Rubix nie ma tego produktu", color: "#b3261e" },
    error: { icon: <AlertCircle size={14} />, label: note || "Błąd", color: "#b3261e" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: s.color, fontWeight: 600 }}>
      {s.icon}
      {s.label}
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
