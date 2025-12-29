// 1223 add gpt-realtime + gpt-4o-search-preview + prompt
/*export const runtime = "nodejs";

type WebSearchReq = {
  query: string;
  recency_days?: number;
  domains?: string[];
};

type UrlCitation = { title?: string; url?: string };

function normalizeDomains(domains: string[]): string[] {
  const cleaned = domains
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/+$/g, ""));
  return Array.from(new Set(cleaned)).slice(0, 100);
}

function getTaipeiNowISO(): string {
  // 產生類似 2025-12-23T15:35:29 的字串（台北時間）
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return s.replace(" ", "T");
}

function extractOutputTextFromResponses(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();

  let text = "";
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string") {
        text += part.text;
      }
    }
  }
  return text.trim();
}

function extractUrlCitationsFromResponses(resp: any): UrlCitation[] {
  const citations: UrlCitation[] = [];
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      for (const ann of annotations) {
        if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
      }
    }
  }
  return citations;
}

function extractOutputTextFromChat(resp: any): string {
  const content = resp?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractUrlCitationsFromChat(resp: any): UrlCitation[] {
  const anns = resp?.choices?.[0]?.message?.annotations;
  const arr = Array.isArray(anns) ? anns : [];
  const citations: UrlCitation[] = [];
  for (const ann of arr) {
    if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
  }
  return citations;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const body = (await req.json()) as WebSearchReq;
    const query = String(body?.query || "").trim();
    const recency_days = Number.isFinite(body?.recency_days) ? Number(body.recency_days) : 30;
    const domains = normalizeDomains(Array.isArray(body?.domains) ? body.domains : []);

    if (!query) return Response.json({ error: "Missing required field: query" }, { status: 400 });

    const model = process.env.WEB_SEARCH_MODEL || "gpt-4o-mini";
    const isSearchPreviewModel = /-search-(preview|api)\b/i.test(model);

    // ✅ A 方法：把「台北時間」當成 prompt 錨點
    const taipeiNow = getTaipeiNowISO();
const taipeiToday = taipeiNow.slice(0, 10); // YYYY-MM-DD

const basePrompt = [
  "你是一個搜尋助理。請在需要時使用網路最新資訊，並用繁體中文回答。",
  "",
  "【時間基準】",
  `- 現在的台北時間（Asia/Taipei）是：${taipeiNow}`,
  "- 使用者提到「今天/昨日/最近/本週」等相對時間，一律以 Asia/Taipei 推算，不要用 UTC。",
  "",
  "【數值/價格類問題的硬規則（務必遵守）】",
  `- 若問題涉及「價格/股價/收盤價/匯率」：答案一定要包含「該數值所對應的日期（Asia/Taipei）」；沒有日期就視為不可用來源。`,
  `- 若使用者問「今天收盤價」：以台北時間「${taipeiToday}」為今天；若今天尚未收盤或休市，請改用「最近一個交易日」並明確寫出日期（不要假裝是今天）。`,
  "- 優先使用一手/權威報價來源（交易所/大型資料商/報價頁），避免採用新聞文章內文引用的價格當作收盤價。",
  "- 若找到的價格彼此矛盾，請列出差異並說明你採信哪個來源與原因；不確定就直接說無法確認。",
  "",
  "輸出格式：",
  "- 【結論】1-2 句直接回答（若不是今天，請在這裡就講清楚是哪一天）",
  "- 【重點】2~6 點條列",
  "- 【來源】列出使用到的來源（title + url）",
  "",
  recency_days > 0 ? `- 盡量優先使用最近 ${recency_days} 天資訊（若能找到）` : "",
  domains.length ? `- 若可行，優先參考這些網域：${domains.join(", ")}` : "",
  "",
  `問題：${query}`,
]
  .filter(Boolean)
  .join("\n");

    if (isSearchPreviewModel) {
      // ✅ Chat Completions：用 search-preview 專用模型
      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: basePrompt }],
        }),
      });

      const respJson = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        return Response.json(
          { error: "OpenAI chat/completions error", status: upstream.status, statusText: upstream.statusText, details: respJson },
          { status: 500 }
        );
      }

      const answer = extractOutputTextFromChat(respJson);
      const citations = extractUrlCitationsFromChat(respJson);

      return Response.json({
        answer,
        citations: citations.slice(0, 10),
        meta: { query, recency_days, domains, model, mode: "chat_completions", taipeiNow },
      });
    }

    // ✅ Responses：一般模型 + web_search tool（支援 domain filtering）
    const tools: any[] = [
      {
        type: "web_search",
        ...(domains.length ? { filters: { allowed_domains: domains } } : {}),
      },
    ];

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        tools,
        tool_choice: "auto",
        input: basePrompt,
      }),
    });

    const respJson = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return Response.json(
        { error: "OpenAI responses error", status: upstream.status, statusText: upstream.statusText, details: respJson },
        { status: 500 }
      );
    }

    const answer = extractOutputTextFromResponses(respJson);
    const citations = extractUrlCitationsFromResponses(respJson);

    return Response.json({
      answer,
      citations: citations.slice(0, 10),
      meta: { query, recency_days, domains, model, mode: "responses", taipeiNow },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
}*/

//1223 V2 TWSE + gpt-4o-search-preview -> preview final

/*export const runtime = "nodejs";

type WebSearchReq = {
  query: string;
  recency_days?: number;
  domains?: string[];
};

type UrlCitation = { title?: string; url?: string };

function normalizeDomains(domains: string[]): string[] {
  const cleaned = domains
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/+$/g, ""));
  return Array.from(new Set(cleaned)).slice(0, 100);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getTaipeiNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year!;
  const m = map.month!;
  const d = map.day!;
  const hh = map.hour!;
  const mm = map.minute!;
  const ss = map.second!;
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  const ymd = `${y}-${m}-${d}`;
  return {
    iso,
    ymd,
    hour: Number(hh),
    minute: Number(mm),
    second: Number(ss),
  };
}

function addDaysToYMD(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = pad2(dt.getUTCMonth() + 1);
  const dd = pad2(dt.getUTCDate());
  return `${yy}-${mm}-${dd}`;
}


function parseDateFromQuery(query: string, defaultYear: number): { ymd: string; explicit: boolean } | null {
  const q = query;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = q.match(/(20\d{2})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*(?:日)?/);
  if (m) {
    const y = Number(m[1]);
    const mo = pad2(Number(m[2]));
    const d = pad2(Number(m[3]));
    return { ymd: `${y}-${mo}-${d}`, explicit: true };
  }

  // MM/DD (assume current year)
  m = q.match(/(?:^|\D)(\d{1,2})\s*\/\s*(\d{1,2})(?:\D|$)/);
  if (m) {
    const mo = pad2(Number(m[1]));
    const d = pad2(Number(m[2]));
    return { ymd: `${defaultYear}-${mo}-${d}`, explicit: true };
  }

  return null;
}

function isPriceQuery(query: string): boolean {
  const q = query.toLowerCase();
  const kws = [
    "股價",
    "收盤",
    "收盤價",
    "開盤",
    "最高",
    "最低",
    "成交",
    "成交價",
    "報價",
    "price",
    "close",
    "quote",
  ];
  return kws.some((k) => q.includes(k));
}


function inferTwseStockNo(query: string): string | null {
  const q = query;

  
  const nameMap: Array<[RegExp, string]> = [
    [/台積電|tsmc/i, "2330"],
    [/鴻海/i, "2317"],
    [/聯發科/i, "2454"],
    [/中華電/i, "2412"],
    [/國泰金/i, "2882"],
    [/富邦金/i, "2881"],
  ];
  for (const [re, code] of nameMap) {
    if (re.test(q)) return code;
  }


  const twMatch = q.match(/(?:^|[^\d])(\\d{4})\s*(?:\.?tw)?(?:[^\d]|$)/i);
  if (twMatch) {
    const code = twMatch[1];
    // 避免把年份 2025 誤判成代號
    if (!/年/.test(q.slice(Math.max(0, twMatch.index ?? 0) - 2, (twMatch.index ?? 0) + 6))) {
      if (code !== "2024" && code !== "2025" && code !== "2026") return code;
    }
  }

  // 最後：找 4 位數，但排除看起來像「年份」的上下文
  const re = /\d{4}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const code = m[0];
    const idx = m.index;
    const left = q.slice(Math.max(0, idx - 2), idx);
    const right = q.slice(idx, Math.min(q.length, idx + 6));
    // 排除日期語境：2025年、2025-、2025/ 等
    if (/[年\/\-]/.test(right) || /年/.test(left)) continue;
    // 排除明顯年份
    if (code >= "1900" && code <= "2099") continue;
    return code;
  }

  return null;
}

function parseTwseRowDateToISO(s: string): string | null {
  // 常見：113/12/23（民國）或 2025/12/23
  const m = String(s).trim().match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900) y += 1911; // 民國轉西元
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function toNumberMaybe(x: any): number | null {
  const s = String(x ?? "").replace(/,/g, "").trim();
  if (!s || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchTwseStockDayMonth(stockNo: string, yyyy: number, mm: number) {
  // TWSE STOCK_DAY: date=YYYYMM01 (查當月)
  const dateParam = `${yyyy}${pad2(mm)}01`;
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateParam}&stockNo=${encodeURIComponent(
    stockNo
  )}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      // 某些環境對沒有 UA 的請求比較敏感
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*",
    },
  });

  if (!res.ok) {
    throw new Error(`TWSE fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return { url, json };
}

async function getTwseCloseForDateOrPrev(stockNo: string, targetYmd: string) {
  const [y, m] = targetYmd.split("-").map(Number);

  // 嘗試：本月 → 若找不到 <= target 的資料，再試上月
  const tryMonths: Array<{ yy: number; mm: number }> = [{ yy: y, mm: m }];
  const prev = new Date(Date.UTC(y, m - 2, 1)); // 上月（UTC）
  tryMonths.push({ yy: prev.getUTCFullYear(), mm: prev.getUTCMonth() + 1 });

  let best: {
    ymd: string;
    row: string[];
    sourceUrl: string;
    fields?: string[];
  } | null = null;

  for (const mon of tryMonths) {
    const { url, json } = await fetchTwseStockDayMonth(stockNo, mon.yy, mon.mm);
    const rows: string[][] = Array.isArray(json?.data) ? json.data : [];
    const fields: string[] | undefined = Array.isArray(json?.fields) ? json.fields : undefined;

    // 找 close 欄位 index（通常是 "收盤價"）
    let closeIdx = 6; // fallback
    if (fields?.length) {
      const i = fields.findIndex((f) => String(f).includes("收盤"));
      if (i >= 0) closeIdx = i;
    }

    for (const row of rows) {
      const rowYmd = parseTwseRowDateToISO(row?.[0]);
      if (!rowYmd) continue;
      // 找 <= target 的最近一筆
      if (rowYmd <= targetYmd) {
        if (!best || rowYmd > best.ymd) {
          best = { ymd: rowYmd, row, sourceUrl: url, fields };
          // 把 closeIdx 暫存到 row 的尾端不好看，之後用 fields 再找一次
          (best as any).closeIdx = closeIdx;
        }
      }
    }
  }

  if (!best) return null;

  const closeIdx = (best as any).closeIdx as number;
  const row = best.row;

  // 常見欄位順序：日期、成交股數、成交金額、開盤、最高、最低、收盤、漲跌、成交筆數
  const open = toNumberMaybe(row?.[3]);
  const high = toNumberMaybe(row?.[4]);
  const low = toNumberMaybe(row?.[5]);
  const close = toNumberMaybe(row?.[closeIdx]);
  const volume = toNumberMaybe(row?.[1]); // 成交股數（常為整數很大）

  return {
    ymd: best.ymd,
    open,
    high,
    low,
    close,
    volume,
    sourceUrl: best.sourceUrl,
  };
}

function extractOutputTextFromResponses(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();

  let text = "";
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string") {
        text += part.text;
      }
    }
  }
  return text.trim();
}

function extractUrlCitationsFromResponses(resp: any): UrlCitation[] {
  const citations: UrlCitation[] = [];
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      for (const ann of annotations) {
        if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
      }
    }
  }
  return citations;
}

function extractOutputTextFromChat(resp: any): string {
  const content = resp?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractUrlCitationsFromChat(resp: any): UrlCitation[] {
  const anns = resp?.choices?.[0]?.message?.annotations;
  const arr = Array.isArray(anns) ? anns : [];
  const citations: UrlCitation[] = [];
  for (const ann of arr) {
    if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
  }
  return citations;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const body = (await req.json()) as WebSearchReq;
    const query = String(body?.query || "").trim();
    const recency_days = Number.isFinite(body?.recency_days) ? Number(body.recency_days) : 30;
    const domains = normalizeDomains(Array.isArray(body?.domains) ? body.domains : []);

    if (!query) return Response.json({ error: "Missing required field: query" }, { status: 400 });

    const taipei = getTaipeiNowParts();
    const taipeiNow = taipei.iso;

    // =========================================================
    // ✅ 1) 股價類（台股）優先走 TWSE：拿「確定數字」
    // =========================================================
    const maybeStockNo = inferTwseStockNo(query);
    const looksLikePrice = isPriceQuery(query);

    if (maybeStockNo && looksLikePrice) {
      // 目標日期：有寫日期就用；沒寫日期 + 問收盤價 → 若還沒過收盤後一段時間，就先用昨天
      const parsed = parseDateFromQuery(query, Number(taipei.ymd.slice(0, 4)));
      let targetYmd = parsed?.ymd ?? taipei.ymd;

      const isCloseIntent = /收盤|收盤價|close/i.test(query);
      const afterCloseLikely = taipei.hour > 14 || (taipei.hour === 14 && taipei.minute >= 0);
      if (!parsed?.explicit && isCloseIntent && !afterCloseLikely) {
        // 台股通常下午收盤；若時間太早，先查前一交易日（避免查不到）
        targetYmd = addDaysToYMD(taipei.ymd, -1);
      }

      try {
        const twse = await getTwseCloseForDateOrPrev(maybeStockNo, targetYmd);

        if (twse?.close != null) {
          const sameDay = twse.ymd === targetYmd;

          const answer =
            `台北時間基準：${taipeiNow}\n` +
            `台積電/台股等台灣上市股票以 TWSE（台灣證交所）日資料為準。\n\n` +
            `查詢代號：${maybeStockNo}.TW\n` +
            (sameDay
              ? `✅ ${twse.ymd} 收盤價：${twse.close} TWD`
              : `⚠️ 找不到 ${targetYmd} 當日資料（可能休市/尚未更新/非交易日），最近一個可取得的交易日是 ${twse.ymd}，收盤價：${twse.close} TWD`) +
            (twse.open != null || twse.high != null || twse.low != null
              ? `\n（開/高/低：${twse.open ?? "—"} / ${twse.high ?? "—"} / ${twse.low ?? "—"}）`
              : "") +
            (twse.volume != null ? `\n成交股數：${twse.volume}` : "");

          const citations: UrlCitation[] = [
            {
              title: `TWSE STOCK_DAY ${maybeStockNo}（含收盤價）`,
              url: twse.sourceUrl,
            },
          ];

          return Response.json({
            answer,
            citations,
            meta: {
              query,
              recency_days,
              domains,
              mode: "twse_first",
              market: "TWSE",
              stockNo: maybeStockNo,
              targetYmd,
              resolvedYmd: twse.ymd,
              taipeiNow,
            },
          });
        }
        // close 拿不到就 fallback 搜尋
      } catch {
        // TWSE 失敗就 fallback 搜尋
      }
    }

    // =========================================================
    // ✅ 2) 其他 query 才走 gpt-4o-search-preview / Responses
    // =========================================================
    const model = process.env.WEB_SEARCH_MODEL || "gpt-4o-mini";
    const isSearchPreviewModel = /-search-(preview|api)\b/i.test(model);

    const basePrompt = [
  "你是一個網路研究助理。請先使用網路搜尋，再用繁體中文回答。",
  "",
  "【時間基準】",
  `- 現在的台北時間（Asia/Taipei）是：${taipeiNow}`,
  "- 使用者提到「今天/昨日/最近/本週」等相對時間，一律以 Asia/Taipei 推算，不要用 UTC。",
  "",
  "【可靠性規則（務必遵守）】",
  "- 先把問題改寫成 2~4 個更可搜的查詢（必要時包含中/英文關鍵字），再整合答案。",
  "- 對於會變動或容易出錯的資訊（價格、日期、規則、名單、政策、數字統計）：至少用 2 個獨立來源交叉確認。",
  "- 優先採用權威/一手來源（官方網站、政府機關、公司公告、學術機構、大型媒體/資料商）。避免只依賴論壇或單一部落格。",
  "- 如果找不到足夠可靠來源，請直接說「無法可靠確認」並說明缺口；不要猜。",
  "",
  "【輸出格式】",
  "- 【結論】1~2 句直接回答",
  "- 【重點】最多 6 點條列（每點盡量可由來源支撐）",
  "- 【來源】列出 3~6 筆（title + url）",
  "- 【不確定/差異】只有在資訊不足或來源矛盾時才寫",
  "",
  recency_days > 0 ? `- 優先參考最近 ${recency_days} 天內的資訊（若可取得）` : "",
  domains.length ? `- 若可行，優先參考這些網域：${domains.join(", ")}` : "",
  "",
  `問題：${query}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (isSearchPreviewModel) {
      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: basePrompt }],
        }),
      });

      const respJson = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        return Response.json(
          { error: "OpenAI chat/completions error", status: upstream.status, statusText: upstream.statusText, details: respJson },
          { status: 500 }
        );
      }

      const answer = extractOutputTextFromChat(respJson);
      const citations = extractUrlCitationsFromChat(respJson);

      return Response.json({
        answer,
        citations: citations.slice(0, 10),
        meta: { query, recency_days, domains, model, mode: "chat_completions", taipeiNow },
      });
    }

    // Responses + web_search tool（保留 domain filtering）
    const tools: any[] = [
      {
        type: "web_search",
        ...(domains.length ? { filters: { allowed_domains: domains } } : {}),
      },
    ];

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        tools,
        tool_choice: "auto",
        input: basePrompt,
      }),
    });

    const respJson = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return Response.json(
        { error: "OpenAI responses error", status: upstream.status, statusText: upstream.statusText, details: respJson },
        { status: 500 }
      );
    }

    const answer = extractOutputTextFromResponses(respJson);
    const citations = extractUrlCitationsFromResponses(respJson);

    return Response.json({
      answer,
      citations: citations.slice(0, 10),
      meta: { query, recency_days, domains, model, mode: "responses", taipeiNow },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
}*/

// 1229 realtime access stock price

// src/app/api/web_search/route.ts
export const runtime = "nodejs";

type WebSearchReq = {
  query: string;
  recency_days?: number;
  domains?: string[];
};

type UrlCitation = { title?: string; url?: string };

function normalizeDomains(domains: string[]): string[] {
  const cleaned = domains
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/+$/g, ""));
  return Array.from(new Set(cleaned)).slice(0, 100);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getTaipeiNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;

  const y = map.year!;
  const m = map.month!;
  const d = map.day!;
  const hh = map.hour!;
  const mm = map.minute!;
  const ss = map.second!;
  return {
    iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`,
    ymd: `${y}-${m}-${d}`,
    year: Number(y),
    hour: Number(hh),
    minute: Number(mm),
  };
}

function addDaysToYMD(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** 支援：YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 / MM/DD(用當年) */
function parseDateFromQuery(query: string, defaultYear: number): { ymd: string; explicit: boolean } | null {
  const q = query;

  let m = q.match(/(20\d{2})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*(?:日)?/);
  if (m) {
    return { ymd: `${Number(m[1])}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`, explicit: true };
  }

  m = q.match(/(?:^|\D)(\d{1,2})\s*\/\s*(\d{1,2})(?:\D|$)/);
  if (m) {
    return { ymd: `${defaultYear}-${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`, explicit: true };
  }

  return null;
}

/** 是否在問「股價/報價」 */
function looksLikePriceQuery(query: string): boolean {
  const q = query.toLowerCase();
  const kws = [
    "股價",
    "價格",
    "報價",
    "現價",
    "即時",
    "最新",
    "多少錢",
    "多少",
    "盤中",
    "成交價",
    "成交",
    "price",
    "quote",
  ];
  return kws.some((k) => q.includes(k));
}

/** 是否明確在問收盤/歷史 */
function isCloseIntent(query: string): boolean {
  const q = query.toLowerCase();
  return ["收盤", "收盤價", "close", "昨日收盤", "前一日收盤"].some((k) => q.includes(k));
}

/** 是否明確在問即時 */
function isRealtimeIntent(query: string): boolean {
  const q = query.toLowerCase();
  const yes = ["即時", "現在", "現價", "最新", "盤中", "多少錢", "報價", "realtime", "real-time", "live"].some((k) =>
    q.includes(k)
  );
  // 有寫收盤就不要當即時
  return yes && !isCloseIntent(query);
}

function toNumberMaybe(x: any): number | null {
  const s = String(x ?? "").replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-" || s.toLowerCase() === "na") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 1) 直接從 query 抓台股代碼：支援 4~6 位數 + 可選字母（例如 00687B）
 * 2) 也支援 2330.TW / 2330.tw / 2330TWO 這種寫法（只取主碼）
 */
function inferTaiwanCodeFromQuery(query: string): string | null {
  const q = query.trim();

  // 2330.TW / 2330.TWO / 00687B.TW
  let m = q.match(/(^|[^\w])(\d{4,6}[A-Za-z]?)(?:\.(?:TW|TWO))([^\w]|$)/);
  if (m) return m[2].toUpperCase();

  // 單純出現 4~6 + 可選字母（避免年份誤判）
  m = q.match(/(^|[^\d])(\d{4,6}[A-Za-z]?)(?!\d)/);
  if (m) {
    const code = m[2].toUpperCase();
    // 排除年份 2024~2026 這種
    if (/^20(2[4-6])$/.test(code)) return null;
    return code;
  }

  return null;
}

/** 少量常見名稱映射（可自行擴充）；找不到就會走 Yahoo Search */
function inferFromNameMap(query: string): { code: string; name: string } | null {
  const nameMap: Array<[RegExp, { code: string; name: string }]> = [
    [/台積電|tsmc/i, { code: "2330", name: "台積電" }],
    [/鴻海/i, { code: "2317", name: "鴻海" }],
    [/台塑/i, { code: "1301", name: "台塑" }],
    [/聯發科/i, { code: "2454", name: "聯發科" }],
    [/中華電/i, { code: "2412", name: "中華電" }],
    [/國泰金/i, { code: "2882", name: "國泰金" }],
    [/富邦金/i, { code: "2881", name: "富邦金" }],
  ];
  for (const [re, v] of nameMap) if (re.test(query)) return v;
  return null;
}

/** 用 Yahoo Search 把「名稱」轉成 symbol（1301.TW / 6488.TWO / 00687B.TW ...） */
async function yahooSearchTaiwanSymbol(userQuery: string): Promise<{ symbol: string; shortname?: string } | null> {
  const url =
    "https://query2.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(userQuery) +
    "&quotesCount=10&newsCount=0&enableFuzzyQuery=true";

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const quotes: any[] = Array.isArray(json?.quotes) ? json.quotes : [];

  // 優先台灣標的（.TW / .TWO），再看 quoteType
  const picked =
    quotes.find((q) => typeof q?.symbol === "string" && (q.symbol.endsWith(".TW") || q.symbol.endsWith(".TWO"))) ||
    null;

  if (!picked?.symbol) return null;
  return { symbol: String(picked.symbol), shortname: picked.shortname || picked.longname };
}

/** TWSE MIS 即時（官方盤中報價） */
async function fetchTwseMisRealtime(code: string) {
  // 同時試 tse_ 與 otc_（MIS 會回傳哪個有資料）
  const exCh = `tse_${code}.tw|otc_${code}.tw`;
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=${encodeURIComponent(exCh)}`;

  // MIS 有時會需要帶 Referer / UA
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://mis.twse.com.tw/stock/fibest.jsp",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!res.ok) throw new Error(`MIS failed: ${res.status} ${res.statusText}`);
  const json: any = await res.json().catch(() => null);

  const arr: any[] = Array.isArray(json?.msgArray) ? json.msgArray : [];
  if (!arr.length) return null;

  // 選一個有價格的（z 是最新成交，y 是昨收）
  const pick =
    arr.find((it) => toNumberMaybe(it?.z) != null) ||
    arr.find((it) => toNumberMaybe(it?.y) != null) ||
    arr[0];

  const last = toNumberMaybe(pick?.z);
  const prevClose = toNumberMaybe(pick?.y);
  const open = toNumberMaybe(pick?.o);
  const high = toNumberMaybe(pick?.h);
  const low = toNumberMaybe(pick?.l);

  const name = (pick?.n || pick?.nf || pick?.name || "").toString().trim() || undefined;
  const time = (pick?.t || "").toString().trim(); // "13:30:00"
  const date = (pick?.d || "").toString().trim(); // "20251229"

  return {
    last,
    prevClose,
    open,
    high,
    low,
    name,
    rawTime: time,
    rawDate: date,
    sourceUrl: url,
  };
}

/** Yahoo Quote JSON（非爬 HTML）；用於 MIS 擋掉或找不到時的 fallback */
async function fetchYahooQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error(`Yahoo quote failed: ${res.status} ${res.statusText}`);

  const json: any = await res.json().catch(() => null);
  const r = json?.quoteResponse?.result?.[0];
  if (!r) return null;

  const price = typeof r?.regularMarketPrice === "number" ? r.regularMarketPrice : null;
  const prevClose = typeof r?.regularMarketPreviousClose === "number" ? r.regularMarketPreviousClose : null;
  const open = typeof r?.regularMarketOpen === "number" ? r.regularMarketOpen : null;
  const high = typeof r?.regularMarketDayHigh === "number" ? r.regularMarketDayHigh : null;
  const low = typeof r?.regularMarketDayLow === "number" ? r.regularMarketDayLow : null;
  const name = (r?.shortName || r?.longName || "").toString().trim() || undefined;

  // epoch seconds
  const t = typeof r?.regularMarketTime === "number" ? r.regularMarketTime : null;

  return { price, prevClose, open, high, low, name, marketTimeEpochSec: t, sourceUrl: url };
}

/** TWSE 日資料（收盤/歷史）：STOCK_DAY（查某月） */
async function fetchTwseStockDayMonth(stockNo: string, yyyy: number, mm: number) {
  const dateParam = `${yyyy}${pad2(mm)}01`;
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateParam}&stockNo=${encodeURIComponent(
    stockNo
  )}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!res.ok) throw new Error(`TWSE STOCK_DAY failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return { url, json };
}

function parseTwseRowDateToISO(s: string): string | null {
  const m = String(s).trim().match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900) y += 1911; // 民國轉西元
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

async function getTwseCloseForDateOrPrev(stockNo: string, targetYmd: string) {
  const [y, m] = targetYmd.split("-").map(Number);

  const tryMonths: Array<{ yy: number; mm: number }> = [{ yy: y, mm: m }];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  tryMonths.push({ yy: prev.getUTCFullYear(), mm: prev.getUTCMonth() + 1 });

  let best: { ymd: string; row: string[]; sourceUrl: string; fields?: string[]; closeIdx: number } | null = null;

  for (const mon of tryMonths) {
    const { url, json } = await fetchTwseStockDayMonth(stockNo, mon.yy, mon.mm);
    const rows: string[][] = Array.isArray(json?.data) ? json.data : [];
    const fields: string[] | undefined = Array.isArray(json?.fields) ? json.fields : undefined;

    let closeIdx = 6;
    if (fields?.length) {
      const i = fields.findIndex((f) => String(f).includes("收盤"));
      if (i >= 0) closeIdx = i;
    }

    for (const row of rows) {
      const rowYmd = parseTwseRowDateToISO(row?.[0]);
      if (!rowYmd) continue;

      if (rowYmd <= targetYmd) {
        if (!best || rowYmd > best.ymd) {
          best = { ymd: rowYmd, row, sourceUrl: url, fields, closeIdx };
        }
      }
    }
  }

  if (!best) return null;

  const row = best.row;
  const open = toNumberMaybe(row?.[3]);
  const high = toNumberMaybe(row?.[4]);
  const low = toNumberMaybe(row?.[5]);
  const close = toNumberMaybe(row?.[best.closeIdx]);
  const volume = toNumberMaybe(row?.[1]);

  return { ymd: best.ymd, open, high, low, close, volume, sourceUrl: best.sourceUrl };
}

/** ============ web_search：文字抽取（Responses / ChatCompletions） ============ */

function extractOutputTextFromResponses(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();

  let text = "";
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string") {
        text += part.text;
      }
    }
  }
  return text.trim();
}

function extractUrlCitationsFromResponses(resp: any): UrlCitation[] {
  const citations: UrlCitation[] = [];
  const output = Array.isArray(resp?.output) ? resp.output : [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      for (const ann of annotations) {
        if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
      }
    }
  }
  return citations;
}

function extractOutputTextFromChat(resp: any): string {
  const content = resp?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractUrlCitationsFromChat(resp: any): UrlCitation[] {
  const anns = resp?.choices?.[0]?.message?.annotations;
  const arr = Array.isArray(anns) ? anns : [];
  const citations: UrlCitation[] = [];
  for (const ann of arr) {
    if (ann?.type === "url_citation") citations.push({ title: ann.title, url: ann.url });
  }
  return citations;
}

/** chat/completions 常常拿不到 annotations → 從文字裡把 [title](url) 抽出來補 citations */
function extractMarkdownLinks(text: string): UrlCitation[] {
  const out: UrlCitation[] = [];
  const re = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ title: m[1], url: m[2] });
  }
  // 去重
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.title || ""}__${c.url || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatTaipeiTimeFromEpoch(epochSec: number | null): string | null {
  if (!epochSec) return null;
  const dt = new Date(epochSec * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dt);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const body = (await req.json()) as WebSearchReq;
    const query = String(body?.query || "").trim();
    const recency_days = Number.isFinite(body?.recency_days) ? Number(body.recency_days) : 30;
    const domains = normalizeDomains(Array.isArray(body?.domains) ? body.domains : []);

    if (!query) return Response.json({ error: "Missing required field: query" }, { status: 400 });

    const taipei = getTaipeiNowParts();
    const taipeiNow = taipei.iso;

    // =========================================================
    // ✅ 1) 台股/ETF：即時 & 收盤（不走 web_search）
    // =========================================================
    const maybeCode = inferTaiwanCodeFromQuery(query) || inferFromNameMap(query)?.code || null;
    const dateInQuery = parseDateFromQuery(query, taipei.year);
    const priceLike = looksLikePriceQuery(query) || isRealtimeIntent(query) || isCloseIntent(query);

    // 若使用者只打「台塑多少錢」這種：maybeCode 可能抓不到 → 用 Yahoo Search 補 symbol
    let symbolFromSearch: { symbol: string; shortname?: string } | null = null;
    let finalCode = maybeCode;
    let finalSymbol: string | null = null;

    if (priceLike) {
      if (finalCode) {
        // 不知道是上市或上櫃，先假設 .TW，MIS 會同時試 tse/otc；Yahoo quote 我們用 .TW 先試
        finalSymbol = `${finalCode}.TW`;
      } else {
        symbolFromSearch = await yahooSearchTaiwanSymbol(query);
        if (symbolFromSearch?.symbol) {
          finalSymbol = symbolFromSearch.symbol;
          finalCode = symbolFromSearch.symbol.split(".")[0].toUpperCase();
        }
      }
    }

    const hasTaiwanInstrument = !!(priceLike && finalCode && finalSymbol);

    if (hasTaiwanInstrument) {
      // 1a) 若有明確日期或明確收盤：走 STOCK_DAY（官方日資料）
      if (dateInQuery?.explicit || isCloseIntent(query)) {
        let targetYmd = dateInQuery?.ymd ?? taipei.ymd;

        // 如果是問「今天收盤」但現在還沒收盤後資料時間（台股約 13:30 收盤，留 5 分鐘緩衝）
        const afterCloseLikely = taipei.hour > 13 || (taipei.hour === 13 && taipei.minute >= 35);
        if (!dateInQuery?.explicit && isCloseIntent(query) && !afterCloseLikely) {
          targetYmd = addDaysToYMD(taipei.ymd, -1);
        }

        try {
          const twse = await getTwseCloseForDateOrPrev(finalCode!, targetYmd);

          if (twse?.close != null) {
            const sameDay = twse.ymd === targetYmd;
            const answer =
              `台北時間基準：${taipeiNow}\n` +
              `代號：${finalCode}（${finalSymbol}）\n` +
              (sameDay
                ? `✅ ${twse.ymd} 收盤價：${twse.close} TWD`
                : `⚠️ 找不到 ${targetYmd} 當日資料（可能休市/尚未更新/非交易日），最近可取得交易日：${twse.ymd}\n收盤價：${twse.close} TWD`) +
              (twse.open != null || twse.high != null || twse.low != null
                ? `\n（開/高/低：${twse.open ?? "—"} / ${twse.high ?? "—"} / ${twse.low ?? "—"}）`
                : "") +
              (twse.volume != null ? `\n成交股數：${twse.volume}` : "");

            const citations: UrlCitation[] = [
              { title: `TWSE STOCK_DAY ${finalCode}（日資料/收盤）`, url: twse.sourceUrl },
            ];

            return Response.json({
              answer,
              citations,
              meta: {
                query,
                mode: "tw_close_stock_day",
                taipeiNow,
                stockNo: finalCode,
                symbol: finalSymbol,
                targetYmd,
                resolvedYmd: twse.ymd,
              },
            });
          }
        } catch {
          // STOCK_DAY 失敗 → fallback：用 Yahoo previousClose 當「最近可得」（會明講）
          try {
            const yq = await fetchYahooQuote(finalSymbol!);
            if (yq?.prevClose != null) {
              const t = formatTaipeiTimeFromEpoch(yq.marketTimeEpochSec);
              const answer =
                `台北時間基準：${taipeiNow}\n` +
                `代號：${finalCode}（${finalSymbol}）\n` +
                `⚠️ 目前無法取得 TWSE 日資料（收盤/歷史），改用 Yahoo Quote 的「前一交易日收盤」作為最近可得資訊。\n` +
                `前一交易日收盤（previousClose）：${yq.prevClose}（可能有延遲）` +
                (t ? `\n資料時間（台北）：${t}` : "");

              const citations: UrlCitation[] = [{ title: `Yahoo Quote ${finalSymbol}`, url: yq.sourceUrl }];
              return Response.json({
                answer,
                citations,
                meta: { query, mode: "close_fallback_yahoo_prevclose", taipeiNow, stockNo: finalCode, symbol: finalSymbol },
              });
            }
          } catch {
            // ignore
          }
        }

        // 若全部都失敗，最後才回 web_search
      } else {
        // 1b) 即時：先 MIS，再 Yahoo quote
        // 若使用者沒講即時/收盤，但看起來是問價格（例如「台塑多少錢」），我們當即時處理
        let mis: Awaited<ReturnType<typeof fetchTwseMisRealtime>> | null = null;
        try {
          mis = await fetchTwseMisRealtime(finalCode!);
        } catch {
          mis = null;
        }

        if (mis && (mis.last != null || mis.prevClose != null)) {
          const lastStr = mis.last != null ? `${mis.last}` : "—";
          const prevStr = mis.prevClose != null ? `${mis.prevClose}` : "—";
          const nameStr = mis.name ? `（${mis.name}）` : "";
          const answer =
            `台北時間基準：${taipeiNow}\n` +
            `代號：${finalCode}（${finalSymbol}）${nameStr}\n` +
            `✅ 即時/最新成交：${lastStr} TWD\n` +
            `昨收：${prevStr} TWD` +
            (mis.open != null || mis.high != null || mis.low != null
              ? `\n（開/高/低：${mis.open ?? "—"} / ${mis.high ?? "—"} / ${mis.low ?? "—"}）`
              : "") +
            (mis.rawDate && mis.rawTime
              ? `\n資料時間（交易所回傳）：${mis.rawDate} ${mis.rawTime}（可能為交易所格式）`
              : "");

          const citations: UrlCitation[] = [{ title: `TWSE MIS 即時報價 ${finalCode}`, url: mis.sourceUrl }];

          return Response.json({
            answer,
            citations,
            meta: { query, mode: "realtime_mis", taipeiNow, stockNo: finalCode, symbol: finalSymbol },
          });
        }

        // MIS 沒拿到 → Yahoo quote fallback
        try {
          const yq = await fetchYahooQuote(finalSymbol!);
          if (yq && (yq.price != null || yq.prevClose != null)) {
            const t = formatTaipeiTimeFromEpoch(yq.marketTimeEpochSec);
            const answer =
              `台北時間基準：${taipeiNow}\n` +
              `代號：${finalCode}（${finalSymbol}）${yq.name ? `（${yq.name}）` : ""}\n` +
              `✅ 最新價格（Yahoo）：${yq.price ?? "—"}\n` +
              `昨收：${yq.prevClose ?? "—"}` +
              (yq.open != null || yq.high != null || yq.low != null
                ? `\n（開/高/低：${yq.open ?? "—"} / ${yq.high ?? "—"} / ${yq.low ?? "—"}）`
                : "") +
              (t ? `\n資料時間（台北）：${t}` : "") +
              `\n（註：Yahoo 報價可能有延遲；若需完全即時請以券商/交易所為準）`;

            const citations: UrlCitation[] = [{ title: `Yahoo Quote ${finalSymbol}`, url: yq.sourceUrl }];
            return Response.json({
              answer,
              citations,
              meta: { query, mode: "realtime_yahoo_fallback", taipeiNow, stockNo: finalCode, symbol: finalSymbol },
            });
          }
        } catch {
          // ignore
        }

        // 即時也失敗 → 最後用 STOCK_DAY 給最近收盤（避免回「查不到」）
        try {
          const twse = await getTwseCloseForDateOrPrev(finalCode!, taipei.ymd);
          if (twse?.close != null) {
            const answer =
              `台北時間基準：${taipeiNow}\n` +
              `代號：${finalCode}（${finalSymbol}）\n` +
              `⚠️ 目前無法取得即時報價，改提供最近可取得交易日收盤：\n` +
              `✅ ${twse.ymd} 收盤價：${twse.close} TWD`;

            const citations: UrlCitation[] = [{ title: `TWSE STOCK_DAY ${finalCode}（日資料/收盤）`, url: twse.sourceUrl }];
            return Response.json({
              answer,
              citations,
              meta: { query, mode: "realtime_failed_close_fallback", taipeiNow, stockNo: finalCode, symbol: finalSymbol },
            });
          }
        } catch {
          // ignore
        }
      }
    }

    // =========================================================
    // ✅ 2) 非股價類問題：才走 web_search / 搜尋模型
    // =========================================================
    const model = process.env.WEB_SEARCH_MODEL || "gpt-4o-mini";
    const isSearchPreviewModel = /-search-(preview|api)\b/i.test(model);

    const basePrompt = [
      "你是一個網路研究助理。請先使用網路搜尋，再用繁體中文回答。",
      "",
      "【時間基準】",
      `- 現在的台北時間（Asia/Taipei）是：${taipeiNow}`,
      "- 使用者提到「今天/昨日/最近/本週」等相對時間，一律以 Asia/Taipei 推算，不要用 UTC。",
      "",
      "【可靠性規則（務必遵守）】",
      "- 先把問題改寫成 2~4 個更可搜的查詢（必要時包含中/英文關鍵字），再整合答案。",
      "- 對於會變動或容易出錯的資訊（價格、日期、規則、名單、政策、數字統計）：至少用 2 個獨立來源交叉確認；若只有單一來源，請標註「可能有延遲/僅單一來源」。",
      "- 優先採用權威/一手來源（官方網站、政府機關、公司公告、學術機構、大型媒體/資料商）。避免只依賴論壇或單一部落格。",
      "- 如果找不到足夠可靠來源，請直接說「無法可靠確認」並說明缺口；不要猜。",
      "",
      "【輸出格式】",
      "- 【結論】1~2 句直接回答",
      "- 【重點】最多 6 點條列（每點盡量可由來源支撐）",
      "- 【來源】列出 3~6 筆（title + url）",
      "- 【不確定/差異】只有在資訊不足或來源矛盾時才寫",
      "",
      recency_days > 0 ? `- 優先參考最近 ${recency_days} 天內的資訊（若可取得）` : "",
      domains.length ? `- 若可行，優先參考這些網域：${domains.join(", ")}` : "",
      "",
      `問題：${query}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (isSearchPreviewModel) {
      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: basePrompt }],
        }),
      });

      const respJson = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        return Response.json(
          { error: "OpenAI chat/completions error", status: upstream.status, statusText: upstream.statusText, details: respJson },
          { status: 500 }
        );
      }

      const answer = extractOutputTextFromChat(respJson);
      let citations = extractUrlCitationsFromChat(respJson);
      if (!citations.length) citations = extractMarkdownLinks(answer).slice(0, 10);

      return Response.json({
        answer,
        citations: citations.slice(0, 10),
        meta: { query, recency_days, domains, model, mode: "chat_completions", taipeiNow },
      });
    }

    // Responses + web_search tool（支援 domain filtering）
    const tools: any[] = [
      {
        type: "web_search",
        ...(domains.length ? { filters: { allowed_domains: domains } } : {}),
      },
    ];

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        tools,
        tool_choice: "auto",
        input: basePrompt,
      }),
    });

    const respJson = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return Response.json(
        { error: "OpenAI responses error", status: upstream.status, statusText: upstream.statusText, details: respJson },
        { status: 500 }
      );
    }

    const answer = extractOutputTextFromResponses(respJson);
    let citations = extractUrlCitationsFromResponses(respJson);
    if (!citations.length) citations = extractMarkdownLinks(answer).slice(0, 10);

    return Response.json({
      answer,
      citations: citations.slice(0, 10),
      meta: { query, recency_days, domains, model, mode: "responses", taipeiNow },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
}







