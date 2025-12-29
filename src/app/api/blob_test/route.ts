// 0811 src/app/api/blob-test/route.ts 測試
import { put } from "@vercel/blob";
export const runtime = "nodejs";

export async function GET() {
  const key = `test/${Date.now()}.txt`;
  // 如需顯式帶 token（避免權限誤綁），打開下一行：
  // const token = process.env.BLOB_READ_WRITE_TOKEN;

  const r = await put(key, "hello blob", {
    access: "public",
    contentType: "text/plain",
    // token, // ← 有需要就帶上
  });
  return new Response(JSON.stringify({ ok: true, key, url: r.url }, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
