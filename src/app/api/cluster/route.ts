// 0822 AI gpt-4o-mini cluster
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";

type LogRec = {
  ts: string;
  sessionId: string;
  userId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  eventId?: string;
};

type PairRec = {
  ts: string;            // user ts
  userText: string;
  assistantTs?: string;
  assistantText?: string;
};

type Body = {
  logs: LogRec[];
  threshold?: number;           // 0~1，預設 0.80
  includeAnswer?: boolean;      // 向量是否 Q+A
  method?: "embeddings" | "judge"; // judge 會在臨界值附近用 4o-mini 補判
  judgeBudget?: number;         // 最多做幾次 judge，預設 50
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!Array.isArray(body.logs)) {
      return new Response(JSON.stringify({ error: "logs must be an array" }), { status: 400 });
    }

    const threshold = clamp(body.threshold ?? 0.8, 0.5, 0.98);
    const includeAnswer = !!body.includeAnswer;
    const method = body.method ?? "embeddings";
    const judgeBudgetMax = Math.max(0, Math.min(body.judgeBudget ?? 50, 200));

    // 1) 依 sessionId + ts 排序，做 user→assistant 的配對
    const pairs = pairBySession(body.logs);

    if (pairs.length === 0) {
      return new Response(JSON.stringify({ clusters: [], used: { threshold, includeAnswer, method, n: 0 } }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // 2) 建立要嵌入的字串（可選把 A 也併進去）
    const texts = pairs.map(p => {
      if (includeAnswer && p.assistantText) {
        return `Q: ${p.userText}\nA: ${p.assistantText}`;
      }
      return p.userText;
    });

    // 3) 批量 Embeddings
    const vectors = await embedBatch(texts);

    // 4) 分群（貪婪 + centroid）
    let judgeBudget = judgeBudgetMax;
    const clusters: {
      repr: string;           // 第一個樣例（原句）
      reprIdx: number;        // 代表向量的 index
      centroid: number[];     // 群心
      count: number;
      examples: string[];
      lastTs: string;
    }[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      const p = pairs[i];

      let bestIdx = -1;
      let bestSim = -1;
      for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
        const c = clusters[cIdx];
        const sim = cosine(v, c.centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = cIdx;
        }
      }

      let shouldJoin = bestSim >= threshold;

      // 臨界值附近用 4o-mini 補判（僅 method=judge）
      if (!shouldJoin && method === "judge" && judgeBudget > 0 && bestIdx >= 0 && bestSim >= threshold - 0.05) {
        const c = clusters[bestIdx];
        const verdict = await sameIntentJudge(
          texts[i],
          texts[c.reprIdx],
          includeAnswer,
          openai
        );
        judgeBudget--;
        if (verdict) shouldJoin = true;
      }

      if (shouldJoin && bestIdx >= 0) {
        const c = clusters[bestIdx];
        c.count += 1;
        c.examples.push(p.userText);
        if (!c.lastTs || new Date(p.ts) > new Date(c.lastTs)) c.lastTs = p.ts;
        c.centroid = average(c.centroid, v, 1 / c.count);
      } else {
        clusters.push({
          repr: pairs[i].userText,
          reprIdx: i,
          centroid: v,
          count: 1,
          examples: [pairs[i].userText],
          lastTs: pairs[i].ts,
        });
      }
    }

    clusters.sort(
      (a, b) => (b.count - a.count) || (new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime())
    );

    const out = clusters.map((c, i) => ({
      rank: i + 1,
      count: c.count,
      repr: c.repr,
      lastTs: c.lastTs,
      examples: c.examples.slice(-5),
    }));

    return new Response(
      JSON.stringify({ clusters: out, used: { threshold, includeAnswer, method, n: pairs.length } }, null, 2),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );

  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
}

// --- helpers ---

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

function pairBySession(raw: LogRec[]): PairRec[] {
  const logs = [...raw]
    .filter(x => x && x.ts && x.role && typeof x.content !== "undefined")
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.ts.localeCompare(b.ts));

  const out: PairRec[] = [];
  const lastUserBySession: Record<string, LogRec | null> = {};
  for (const rec of logs) {
    if (rec.role === "user") {
      lastUserBySession[rec.sessionId] = rec;
    } else if (rec.role === "assistant") {
      const u = lastUserBySession[rec.sessionId];
      if (u) {
        out.push({
          ts: u.ts,
          userText: (u.content || "").toString(),
          assistantTs: rec.ts,
          assistantText: (rec.content || "").toString(),
        });
        lastUserBySession[rec.sessionId] = null;
      }
    }
  }
  // 保留沒有配對到 assistant 的 user
  for (const sess of Object.keys(lastUserBySession)) {
    const u = lastUserBySession[sess];
    if (u) out.push({ ts: u.ts, userText: (u.content || "").toString() });
  }
  return out;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function average(base: number[], v: number[], alpha: number) {
  const out = new Array(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = (base[i] * (1 - alpha)) + (v[i] * alpha);
  }
  return out;
}

async function embedBatch(texts: string[]) {
  const BATCH = 128;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });
    for (const item of resp.data) out.push(item.embedding as number[]);
  }
  return out;
}

/**
 * 用 4o-mini 補判兩段查詢是否為「同一意圖」
 * - 關鍵修正：把 messages 明確標成 ChatCompletionMessageParam[]，避免被寬化為 { role: string }
 */
async function sameIntentJudge(a: string, b: string, hasAnswer: boolean, openai: OpenAI) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "你是判斷兩段查詢是否為『同一意圖』的助理。只回答 JSON: {\"same\": true|false}。"
    },
    {
      role: "user",
      content:
        `請判斷兩個查詢是否同一意圖。\n` +
        `判斷標準：若回答解法/內容高度重疊，視為同一意圖。\n` +
        `A是否包含回答：${hasAnswer ? "是" : "否"}\n\n` +
        `查詢1：\n${a}\n\n查詢2：\n${b}`
    }
  ];

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages, // ✅ 型別正確
    });
    const txt = r.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(txt);
    return !!parsed.same;
  } catch {
    return false;
  }
}

