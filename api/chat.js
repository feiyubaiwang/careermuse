import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

const DAILY_LIMIT = 10; // 每个 IP 每天最多 10 条消息

const C = {
  miranda: { name: "Miranda 米兰达", role: "权力谋略家", framework: "先看权力结构、决策权、资源、信息、责任和筹码。" },
  elle: { name: "Elle 艾丽", role: "自信挑战者", framework: "拆掉自我怀疑，寻找真实优势，不用别人的标准定义自己的价值。" },
  jules: { name: "Jules 朱尔斯", role: "组织构建者", framework: "判断问题来自个人、团队还是系统，关注职责、流程、授权和协作。" },
  molly: { name: "Molly 茉莉", role: "人脉架构师", framework: "看清机会、关键人物、影响决策的人、用户价值和自然进入路径。" },
  katherine: { name: "Katherine 凯瑟琳", role: "安静的专家", framework: "区分事实、判断和情绪，用证据和成果证明专业价值。" }
};

const BASE = `你是一个以电影职业女性为灵感、抽象其职场思维框架的 AI 工具。不要声称自己就是电影角色本人；不要复现、编造或假装引用电影台词；不要模仿演员。只把人物作为高层次的虚构职业思维原型。给具体、可执行的职场建议，不要泛泛而谈或只给鸡汤。使用用户的语言。不要替用户做最终决定，要说明可选路径、取舍和下一步。`;

function single(c) {
  return `${BASE}\n当前顾问：${c.name}｜${c.role}\n思维框架：${c.framework}\n回答结构：1.先判断问题本质 2.她会怎么看 3.2-4个具体动作 4.如适用给一句自然职场话术。语气：冷静、聪明、直接、有洞察力。`;
}
function all() {
  return `${BASE}\n多人聊天室：五位顾问分别回答同一个问题。\nMiranda｜权力谋略家：${C.miranda.framework}\nElle｜自信挑战者：${C.elle.framework}\nJules｜组织构建者：${C.jules.framework}\nMolly｜人脉架构师：${C.molly.framework}\nKatherine｜安静的专家：${C.katherine.framework}\n要求：五个人必须明显不同；每人约120-220个中文字符；不要选赢家；不要写电影原台词。只输出合法JSON：{"answers":[{"id":"miranda","answer":"..."},{"id":"elle","answer":"..."},{"id":"jules","answer":"..."},{"id":"molly","answer":"..."},{"id":"katherine","answer":"..."}]}`;
}

// 取客户端 IP（Vercel 会设置 x-forwarded-for）
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown";
}

// 按 IP + 当天日期计数；未配置 Upstash 时放行
async function checkRateLimit(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true, remaining: DAILY_LIMIT };

  const today = new Date().toISOString().slice(0, 10); // UTC 日期
  const key = `ratelimit:${ip}:${today}`;
  const auth = { Authorization: `Bearer ${token}` };

  const incrRes = await fetch(`${url}/incr/${encodeURIComponent(key)}`, { headers: auth }).then(r => r.json()).catch(() => null);
  const count = incrRes && typeof incrRes.result === "number" ? incrRes.result : 1;
  if (count === 1) {
    fetch(`${url}/expire/${encodeURIComponent(key)}/172800`, { headers: auth }).catch(() => {}); // 2 天后自动清理
  }
  return { allowed: count <= DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count), used: count };
}

export default async function handler(req, res) {
  res.setHeader("x-build", "48c6138-early");
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", build: "ba543cb-rawfetch" });
  if (!process.env.DEEPSEEK_API_KEY) return res.status(500).json({ error: "Missing DEEPSEEK_API_KEY" });

  try {
    const { mode = "single", character, message, history = [] } = req.body || {};
    return res.status(200).json({ step: "body_ok", mode, hasMessage: !!message, bodyType: typeof req.body });
    if (!message) return res.status(400).json({ error: "Message is required" });

    // 每日限额校验
    const ip = getClientIp(req);
    const rl = await checkRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({ error: "今日消息已达上限", detail: "每位用户每天 10 条，明天 0 点重置", remaining: 0, limit: DAILY_LIMIT });
    }

    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    if (mode === "all") {
      const r = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: all() },
          { role: "user", content: `用户的职场问题：\n${String(message).slice(0, 5000)}` }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });
      let raw = ((r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || "").replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      let p;
      try { p = JSON.parse(raw); } catch { return res.status(502).json({ error: "AI returned invalid group response", detail: raw.slice(0, 1000) }); }
      return res.status(200).json({ answers: Array.isArray(p.answers) ? p.answers : [], remaining: rl.remaining, limit: DAILY_LIMIT });
    }

    const c = C[character] || C.miranda;
    const safe = Array.isArray(history) ? history.slice(-8) : [];
    const input = safe.map(m => `${m.role === "assistant" ? "顾问" : "用户"}：${String(m.content || "").slice(0, 3000)}`).join("\n\n");

    // 诊断：直接 fetch DeepSeek，返回原始状态与响应体片段
    const dres = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: single(c) },
          { role: "user", content: input || `用户的职场问题：\n${String(message).slice(0, 5000)}` }
        ],
        temperature: 0.8
      })
    });
    const dtext = await dres.text();
    return res.status(200).json({ diag_status: dres.status, diag_ct: dres.headers.get("content-type"), diag_body: dtext.slice(0, 800) });
  } catch (e) {
    return res.status(500).json({
      error: "AI request failed",
      detail: e && e.message ? e.message : "Unknown error",
      status: e && e.status,
      code: e && e.code,
      name: e && e.constructor ? e.constructor.name : null
    });
  }
}
