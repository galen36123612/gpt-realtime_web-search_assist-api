// 0811 Add daily report only time and count

/*import { list } from "@vercel/blob";

export const runtime = "nodejs";

function toCsv(rows: any[]) {
  if (!rows.length) return "day,role,count\n";
  const headers = Object.keys(rows[0]);
  const lines = rows.map(r => headers.map(h => String(r[h]).replace(/"/g, '""')).join(","));
  return headers.join(",") + "\n" + lines.join("\n");
}

export async function GET() {
  // 你也可以改成昨天的報表：new Date(Date.now() - 86400000)
  const d = new Date();
  const day = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const prefix = `logs/${day}/`;

  const { blobs } = await list({ prefix }); // 列出當天所有物件
  let userCount = 0;
  let assistantCount = 0;

  // 下載每個物件並累計
  for (const b of blobs) {
    const res = await fetch(b.url);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json.role === "user") userCount++;
      if (json.role === "assistant") assistantCount++;
    } catch {
      // 忽略不合法內容
    }
  }

  const csv = toCsv([
    { day, role: "assistant", count: assistantCount },
    { day, role: "user", count: userCount },
  ]);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}*/

// 0811 user Q and A

/*import { list } from "@vercel/blob";

export const runtime = "nodejs";

type LogRec = {
  ts: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  eventId?: string;
};

function tpeDay(d?: string) {
  const base = d ? new Date(d) : new Date();
  const tpe = new Date(base.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toCsv(rows: any[], headers: string[]) {
  const headerLine = headers.join(",");
  const lines = rows.map((r) =>
    headers
      .map((h) => {
        const v = (r as any)[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      })
      .join(",")
  );
  return headerLine + "\n" + lines.join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const day = url.searchParams.get("day") || tpeDay();
  const detail = url.searchParams.get("detail") === "1";
  const flat = url.searchParams.get("flat") === "1";
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const prefix = `logs/${day}/`;
  const { blobs } = await list({ prefix });

  // 讀取當天所有 log（只收 user/assistant）
  const logs: LogRec[] = [];
  for (const b of blobs) {
    const res = await fetch(b.url);
    if (!res.ok) continue;
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      if (j.role === "user" || j.role === "assistant") logs.push(j);
    } catch {}
  }

  logs.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.ts.localeCompare(b.ts));

  // 平鋪 raw 訊息（debug/稽核用）
  if (flat) {
    if (format === "csv") {
      const csv = toCsv(logs, ["ts", "sessionId", "userId", "role", "content"]);
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ day, total: logs.length, logs }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // 只要計數
  if (!detail) {
    const counts = logs.reduce((acc, r) => ((acc[r.role] = (acc[r.role] || 0) + 1), acc), {} as Record<string, number>);
    const out = [
      { day, role: "assistant", count: counts["assistant"] || 0 },
      { day, role: "user", count: counts["user"] || 0 },
    ];
    if (format === "csv") {
      const csv = toCsv(out, ["day", "role", "count"]);
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // detail=1：配對「使用者 → 助手」
  const pairs: Array<{
    day: string;
    sessionId: string;
    userTs: string;
    userText: string;
    assistantTs: string;
    assistantText: string;
  }> = [];

  const lastUserBySession: Record<string, LogRec | null> = {};
  for (const rec of logs) {
    if (rec.role === "user") {
      lastUserBySession[rec.sessionId] = rec;
    } else if (rec.role === "assistant") {
      const u = lastUserBySession[rec.sessionId];
      if (u) {
        pairs.push({
          day,
          sessionId: rec.sessionId,
          userTs: u.ts,
          userText: u.content,
          assistantTs: rec.ts,
          assistantText: rec.content,
        });
        lastUserBySession[rec.sessionId] = null;
      }
    }
  }

  if (format === "csv") {
    const csv = toCsv(pairs, ["day", "sessionId", "userTs", "userText", "assistantTs", "assistantText"]);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ day, totalPairs: pairs.length, pairs }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}*/

// 0825 add emoji feedback logs-daily-app-transcript-report_html

/*import { list } from "@vercel/blob";

export const runtime = "nodejs";

type LogRec = {
  ts: string;
  sessionId: string;
  userId: string;
  role: string; // 放寬類型，flat=1 會包含 feedback
  content: string;
  eventId?: string;
  rating?: number;
  targetEventId?: string;
};

function tpeDay(d?: string) {
  const base = d ? new Date(d) : new Date();
  const tpe = new Date(base.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toCsv(rows: any[], headers: string[]) {
  const headerLine = headers.join(",");
  const lines = rows.map((r) =>
    headers
      .map((h) => {
        const v = (r as any)[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      })
      .join(",")
  );
  return headerLine + "\n" + lines.join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const day = url.searchParams.get("day") || tpeDay();
  const detail = url.searchParams.get("detail") === "1";
  const flat = url.searchParams.get("flat") === "1";
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const prefix = `logs/${day}/`;
  const { blobs } = await list({ prefix });

  // 讀取當天所有 log（只收 user/assistant）
  const logs: LogRec[] = [];
  for (const b of blobs) {
    const res = await fetch(b.url);
    if (!res.ok) continue;
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      if (flat) {
        // flat=1：全部帶回（含 feedback）
        logs.push(j);
      } else {
        // 其它模式：維持舊邏輯，只統計 user/assistant
        if (j.role === "user" || j.role === "assistant") logs.push(j);
      }
    } catch {}
  }

  logs.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.ts.localeCompare(b.ts));

  // 平鋪 raw 訊息（debug/稽核用）
  if (flat) {
    if (format === "csv") {
      const csv = toCsv(
        logs, 
        ["ts", "sessionId", "userId", "role", "content", "eventId", "rating", "targetEventId"]
      );
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ day, total: logs.length, logs }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // 只要計數
  if (!detail) {
    const counts = logs.reduce((acc, r) => ((acc[r.role] = (acc[r.role] || 0) + 1), acc), {} as Record<string, number>);
    const out = [
      { day, role: "assistant", count: counts["assistant"] || 0 },
      { day, role: "user", count: counts["user"] || 0 },
    ];
    if (format === "csv") {
      const csv = toCsv(out, ["day", "role", "count"]);
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // detail=1：配對「使用者 → 助手」
  const pairs: Array<{
    day: string;
    sessionId: string;
    userTs: string;
    userText: string;
    assistantTs: string;
    assistantText: string;
  }> = [];

  const lastUserBySession: Record<string, LogRec | null> = {};
  for (const rec of logs) {
    if (rec.role === "user") {
      lastUserBySession[rec.sessionId] = rec;
    } else if (rec.role === "assistant") {
      const u = lastUserBySession[rec.sessionId];
      if (u) {
        pairs.push({
          day,
          sessionId: rec.sessionId,
          userTs: u.ts,
          userText: u.content,
          assistantTs: rec.ts,
          assistantText: rec.content,
        });
        lastUserBySession[rec.sessionId] = null;
      }
    }
  }

  if (format === "csv") {
    const csv = toCsv(pairs, ["day", "sessionId", "userTs", "userText", "assistantTs", "assistantText"]);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ day, totalPairs: pairs.length, pairs }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}*/

// 0825 fixing the report_html satisfy scale missing

import { list } from "@vercel/blob";

export const runtime = "nodejs";

type LogRec = {
  ts: string;
  sessionId: string;
  userId: string;
  role: string;                  // 放寬以容納 "feedback"
  content: string;
  eventId?: string;
  rating?: number;               // feedback 可能有
  targetEventId?: string;        // feedback 可能有（常見為 item_*）

  // ↓ 合併到 assistant 後新增的欄位
  ratingTs?: string;
  ratingEventId?: string;
  feedbackTargetId?: string;
};

function tpeDay(d?: string) {
  const base = d ? new Date(d) : new Date();
  const tpe = new Date(base.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toCsv(rows: any[], headers: string[]) {
  const headerLine = headers.join(",");
  const lines = rows.map((r) =>
    headers
      .map((h) => {
        const v = (r as any)[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      })
      .join(",")
  );
  return headerLine + "\n" + lines.join("\n");
}

// 從 feedback.content 解析 target / value（若沒帶 rating/targetEventId 欄位也可）
function parseFeedbackFields(log: LogRec) {
  const txt = String(log.content || "");
  const mVal = /value=(\d{1,3})/.exec(txt);
  const mTarget = /target=([^\s]+)/.exec(txt);
  const rating = typeof log.rating === "number" ? log.rating : (mVal ? parseInt(mVal[1], 10) : undefined);
  const targetEventId = log.targetEventId || (mTarget ? mTarget[1] : undefined);
  return { rating, targetEventId };
}

function ms(ts: string) {
  return new Date(ts).getTime();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const day = url.searchParams.get("day") || tpeDay();
  const detail = url.searchParams.get("detail") === "1";
  const flat = url.searchParams.get("flat") === "1";
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const prefix = `logs/${day}/`;
  const { blobs } = await list({ prefix });

  // 讀取當天所有 log（包含 user/assistant/feedback）
  const all: LogRec[] = [];
  for (const b of blobs) {
    const res = await fetch(b.url);
    if (!res.ok) continue;
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      if (j && j.ts && j.role) all.push(j);
    } catch {
      /* ignore parse errors */
    }
  }

  // 依時間排序（舊到新）
  all.sort((a, b) => a.ts.localeCompare(b.ts));

  // 只抓需要的角色
  const assistants = all.filter((r) => r.role === "assistant");
  const feedbacks = all
    .filter((r) => r.role === "feedback")
    .map((f) => {
      const { rating, targetEventId } = parseFeedbackFields(f);
      return { ...f, rating, targetEventId };
    })
    .filter((f) => typeof f.rating === "number");

  // 用時間窗合併 feedback → 最近的 assistant
  const WINDOW_MS = 2 * 60 * 1000; // 2 分鐘
  for (const fb of feedbacks) {
    const fms = ms(fb.ts);

    // 1) 先嘗試用 targetEventId 直接對上 assistant.eventId
    let target = assistants.find(
      (a) => a.eventId && fb.targetEventId && a.eventId === fb.targetEventId
    );

    // 2) 若無，找「feedback 前」最近的 assistant（時間窗內）
    if (!target) {
      let best: { a: LogRec; d: number } | null = null;
      for (const a of assistants) {
        const d = fms - ms(a.ts);
        if (d >= 0 && d <= WINDOW_MS) {
          if (!best || d < best.d) best = { a, d };
        }
      }
      target = best?.a;
    }

    // 3) 若仍無，找「feedback 後」最近的 assistant（時間窗內）
    if (!target) {
      let best: { a: LogRec; d: number } | null = null;
      for (const a of assistants) {
        const d = ms(a.ts) - fms;
        if (d >= 0 && d <= WINDOW_MS) {
          if (!best || d < best.d) best = { a, d };
        }
      }
      target = best?.a;
    }

    if (target) {
      (target as any).rating = fb.rating;
      (target as any).ratingTs = fb.ts;
      (target as any).ratingEventId = fb.eventId;
      (target as any).feedbackTargetId = fb.targetEventId;
    }
  }

  // === flat：只輸出 user/assistant（feedback 已合併進 assistant）===
  if (flat) {
    const merged = all.filter((r) => r.role === "user" || r.role === "assistant");
    return new Response(JSON.stringify({ day, total: merged.length, logs: merged }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // === 只要計數（維持舊行為）===
  if (!detail) {
    const ua = all.filter((r) => r.role === "user" || r.role === "assistant");
    const counts = ua.reduce(
      (acc, r) => ((acc[r.role] = (acc[r.role] || 0) + 1), acc),
      {} as Record<string, number>
    );
    const out = [
      { day, role: "assistant", count: counts["assistant"] || 0 },
      { day, role: "user", count: counts["user"] || 0 },
    ];
    if (format === "csv") {
      const csv = toCsv(out, ["day", "role", "count"]);
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // === detail=1：配對「使用者 → 助手」（以 session、時間排序；feedback 已合併）===
  const base = all.filter((r) => r.role === "user" || r.role === "assistant");
  base.sort(
    (a, b) =>
      (a.sessionId || "").localeCompare(b.sessionId || "") ||
      a.ts.localeCompare(b.ts)
  );

  const pairs: Array<{
    day: string;
    sessionId: string;
    userTs: string;
    userText: string;
    assistantTs: string;
    assistantText: string;
    rating?: number;
    ratingTs?: string;
    feedbackTargetId?: string;
  }> = [];

  const lastUserBySession: Record<string, LogRec | null> = {};
  for (const rec of base) {
    if (rec.role === "user") {
      lastUserBySession[rec.sessionId || ""] = rec;
    } else if (rec.role === "assistant") {
      const u = lastUserBySession[rec.sessionId || ""];
      if (u) {
        pairs.push({
          day,
          sessionId: rec.sessionId,
          userTs: u.ts,
          userText: u.content,
          assistantTs: rec.ts,
          assistantText: rec.content,
          rating: (rec as any).rating,
          ratingTs: (rec as any).ratingTs,
          feedbackTargetId: (rec as any).feedbackTargetId,
        });
        lastUserBySession[rec.sessionId || ""] = null;
      }
    }
  }

  if (format === "csv") {
    const headers = [
      "day",
      "sessionId",
      "userTs",
      "userText",
      "assistantTs",
      "assistantText",
      "rating",
      "ratingTs",
      "feedbackTargetId",
    ];
    const csv = toCsv(pairs, headers);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ day, totalPairs: pairs.length, pairs }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}


