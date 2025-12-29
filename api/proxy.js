// /api/proxy.js

// 這裡換成你真實要呼叫的、帶有金鑰或配置的 ChatGPT API 端點
// 注意：為了安全，不應該將敏感的 agentConfig 寫死在前端，而是在此處處理
const TARGET_URL = 'https://weider-digest-hk.vercel.app/?agentConfig=simpleExample';

export default async function handler(request, response) {
  // 為了安全，最好不要讓前端傳遞完整的 URL，
  // 而是只傳遞必要的參數，然後由後端組合。
  // 這裡作為一個簡單的代理範例，我們先直接轉發。

  try {
    const proxyResponse = await fetch(TARGET_URL, {
      method: request.method,
      headers: {
        // 複製必要的 header，可以過濾掉 host 等敏感 header
        'Content-Type': 'application/json',
        'Authorization': request.headers.authorization || '', // 如果需要轉發認證 header
      },
      // 如果是 POST 請求，則轉發 body
      body: request.body,
      // 支援串流
      duplex: 'half'
    });

    // 設定 CORS header，允許任何來源的前端呼叫這個 API
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 處理 preflight request
    if (request.method === 'OPTIONS') {
      return response.status(200).end();
    }
    
    // 將從目標 API 收到的 header 寫回給使用者
    proxyResponse.headers.forEach((value, key) => {
        // Vercel 會自動處理 content-encoding 等，避免手動設定
        if (key.toLowerCase() !== 'content-encoding') {
            response.setHeader(key, value);
        }
    });

    // 將回應以串流方式直接傳回給使用者
    // readableStrean.pipeTo() 是處理串流的標準方式
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: response.getHeaders()
    });


  } catch (error) {
    console.error('Proxy Error:', error);
    return response.status(502).json({ error: 'Bad Gateway' });
  }
}
