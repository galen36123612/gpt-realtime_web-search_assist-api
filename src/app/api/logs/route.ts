// 0811 add Blob

/*import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { sessionId, userId, role, content, eventId } = await req.json();
    if (!sessionId || !userId || !role || !content) {
      return new Response("Bad Request", { status: 400 });
    }
    const ts = new Date().toISOString();
    // 依日期分目錄，避免單一資料夾過多檔案
    const day = ts.slice(0, 10); // YYYY-MM-DD
    const key = `logs/${day}/${sessionId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.json`;

    const body = JSON.stringify({ ts, sessionId, userId, role, content, eventId }) + "\n";

    await put(key, body, {
      access: "public",
      contentType: "application/json",
    });

    return new Response("ok");
  } catch (e) {
    console.error("/api/logs error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}*/

// src/app/api/logs/route.ts
/*import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

function tpeDay(d = new Date()) {
  const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const now = new Date();
    const day = tpeDay(now);
    const ts = now.toISOString();
    const key = `logs/${day}/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;

    const payload = JSON.stringify({ ts, ...body });

    await put(key, payload, {
      access: "public", // Blob 目前只支援 public
      contentType: "application/json",
    });

    return NextResponse.json({ ok: true, key });
  } catch (e: any) {
    console.error("POST /api/logs error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}*/

// 0814 add get method

// app/api/logs/route.ts
/*import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

function tpeDay(d = new Date()) {
  const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10);
}

// 添加 GET 方法来处理直接访问
export async function GET() {
  return NextResponse.json({
    message: "Logs API is working",
    methods: ["GET", "POST"],
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log("📨 POST /api/logs - Request received");
    
    const body = await req.json();
    console.log("📋 Request body:", {
      role: body.role,
      hasContent: !!body.content,
      contentLength: body.content?.length,
      hasUserId: !!body.userId,
      hasSessionId: !!body.sessionId
    });

    // 验证必需字段
    if (!body.userId || !body.sessionId || !body.role || !body.content?.trim()) {
      console.error("❌ Missing required fields:", {
        userId: !!body.userId,
        sessionId: !!body.sessionId,
        role: !!body.role,
        content: !!body.content?.trim()
      });
      
      return NextResponse.json(
        { 
          ok: false, 
          error: "Missing required fields",
          required: ["userId", "sessionId", "role", "content"]
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const day = tpeDay(now);
    const ts = now.toISOString();
    
    // 生成更有意义的文件名
    const eventId = body.eventId || `${body.role}_${Date.now()}`;
    const key = `logs/${day}/${ts.replace(/[:.]/g, '-')}_${body.role}_${eventId}.json`;
    
    const payload = JSON.stringify({ 
      ts, 
      userId: body.userId,
      sessionId: body.sessionId,
      role: body.role,
      content: body.content.trim(),
      eventId: body.eventId
    });

    console.log("💾 Storing log:", {
      key,
      day,
      role: body.role,
      contentLength: payload.length
    });

    await put(key, payload, {
      access: "public",
      contentType: "application/json",
    });

    console.log("✅ Log stored successfully:", key);

    return NextResponse.json({ 
      ok: true, 
      key,
      day,
      timestamp: ts
    });

  } catch (e: any) {
    console.error("💥 POST /api/logs error:", e);
    return NextResponse.json(
      { 
        ok: false, 
        error: String(e?.message || e),
        details: e?.stack
      }, 
      { status: 500 }
    );
  }
}*/

// 0825 add emoji feedback logs-daily-app-transcript-report_html

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

function tpeDay(d = new Date()) {
  const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tpe.toISOString().slice(0, 10);
}

// 添加 GET 方法来处理直接访问
export async function GET() {
  return NextResponse.json({
    message: "Logs API is working",
    methods: ["GET", "POST"],
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log("📨 POST /api/logs - Request received");
    
    const body = await req.json();
    console.log("📋 Request body:", {
      role: body.role,
      hasContent: !!body.content,
      contentLength: body.content?.length,
      hasUserId: !!body.userId,
      hasSessionId: !!body.sessionId
    });

    // 验证必需字段
    if (!body.userId || !body.sessionId || !body.role || !body.content?.trim()) {
      console.error("❌ Missing required fields:", {
        userId: !!body.userId,
        sessionId: !!body.sessionId,
        role: !!body.role,
        content: !!body.content?.trim()
      });
      
      return NextResponse.json(
        { 
          ok: false, 
          error: "Missing required fields",
          required: ["userId", "sessionId", "role", "content"]
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const day = tpeDay(now);
    const ts = now.toISOString();
    
    // 生成更有意义的文件名
    const eventId = body.eventId || `${body.role}_${Date.now()}`;
    const key = `logs/${day}/${ts.replace(/[:.]/g, '-')}_${body.role}_${eventId}.json`;
    
    const payload = JSON.stringify({ 
      ts, 
      userId: body.userId,
      sessionId: body.sessionId,
      role: body.role,                   // 允許 "feedback"
      content: body.content.trim(),
      eventId: body.eventId,
      // 👇 可選：評分與對象
      rating: typeof body.rating === "number" ? body.rating : undefined,
      targetEventId: body.targetEventId || undefined
    });

    console.log("💾 Storing log:", {
      key,
      day,
      role: body.role,
      contentLength: payload.length
    });

    await put(key, payload, {
      access: "public",
      contentType: "application/json",
    });

    console.log("✅ Log stored successfully:", key);

    return NextResponse.json({ 
      ok: true, 
      key,
      day,
      timestamp: ts
    });

  } catch (e: any) {
    console.error("💥 POST /api/logs error:", e);
    return NextResponse.json(
      { 
        ok: false, 
        error: String(e?.message || e),
        details: e?.stack
      }, 
      { status: 500 }
    );
  }
}

