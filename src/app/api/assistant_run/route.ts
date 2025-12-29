// 1229 assist run
// app/api/assistant_run/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ASSISTANT_ID = process.env.ASSISTANT_ID!;

async function oai(path: string, init: RequestInit) {
  const res = await fetch(`https://api.openai.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function extractAssistantText(message: any): string {
  const parts = Array.isArray(message?.content) ? message.content : [];
  let out = "";
  for (const p of parts) {
    if (p?.type === "text" && p?.text?.value) out += p.text.value;
  }
  return out.trim();
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    if (!ASSISTANT_ID) return NextResponse.json({ error: "Missing ASSISTANT_ID" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const input = String(body?.input || "").trim();
    let thread_id = body?.thread_id ? String(body.thread_id) : "";

    if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });

    // 1) create thread if not provided
    if (!thread_id) {
      const t = await oai("/v1/threads", { method: "POST", body: JSON.stringify({}) });
      if (!t.ok) return NextResponse.json({ error: "thread_create_failed", details: t.json }, { status: 500 });
      thread_id = t.json.id;
    }

    // 2) add user message
    const m = await oai(`/v1/threads/${thread_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ role: "user", content: input }),
    });
    if (!m.ok) {
      return NextResponse.json({ error: "message_create_failed", details: m.json, thread_id }, { status: 500 });
    }

    // 3) run assistant
    const r = await oai(`/v1/threads/${thread_id}/runs`, {
      method: "POST",
      body: JSON.stringify({ assistant_id: ASSISTANT_ID }),
    });
    if (!r.ok) {
      return NextResponse.json({ error: "run_create_failed", details: r.json, thread_id }, { status: 500 });
    }

    const run_id = r.json.id;

    // 4) poll run (keep it short for serverless)
    const deadline = Date.now() + 25_000;
    let run = r.json;

    while ((run.status === "queued" || run.status === "in_progress") && Date.now() < deadline) {
      await new Promise((x) => setTimeout(x, 700));
      const rr = await oai(`/v1/threads/${thread_id}/runs/${run_id}`, { method: "GET" });
      if (!rr.ok) {
        return NextResponse.json({ error: "run_retrieve_failed", details: rr.json, thread_id, run_id }, { status: 500 });
      }
      run = rr.json;
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "run_not_completed", status: run.status, last_error: run.last_error, thread_id, run_id },
        { status: 504 }
      );
    }

    // 5) read latest assistant message
    const list = await oai(`/v1/threads/${thread_id}/messages?order=desc&limit=10`, { method: "GET" });
    if (!list.ok) {
      return NextResponse.json({ error: "messages_list_failed", details: list.json, thread_id, run_id }, { status: 500 });
    }

    const data = Array.isArray(list.json?.data) ? list.json.data : [];
    const latestAssistant = data.find((x: any) => x?.role === "assistant");
    const answer = extractAssistantText(latestAssistant);

    return NextResponse.json({ answer, thread_id, run_id });
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", message: String(e?.message || e) }, { status: 500 });
  }
}
