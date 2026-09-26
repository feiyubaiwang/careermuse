# Career Muse

一个“电影职业女性 × AI职场咨询”的 Web MVP。

## 文件结构

- `index.html`：前端页面
- `api/chat.js`：Vercel Serverless Function，安全调用 DeepSeek API
- `package.json`：依赖
- `vercel.json`：Vercel 配置

## 最简单的部署方式：Vercel

### 1. 准备 DeepSeek API Key

在 DeepSeek API 平台创建 API key。

不要把 key 写进 `index.html`，也不要提交到 GitHub。

### 2. 上传到 GitHub

新建一个 GitHub repository，把本目录中的文件全部上传。

### 3. 导入 Vercel

在 Vercel 中选择 Import Project → 选择这个 GitHub repository。

Framework Preset 可以保持默认。

### 4. 添加环境变量

在 Vercel 项目：

Settings → Environment Variables

添加：

DEEPSEEK_API_KEY = 你的 DeepSeek API Key

可选：

DEEPSEEK_MODEL = deepseek-flash

### 5. Deploy

部署后，Vercel 会同时托管：

网页：
/

API：
/api/chat

前端已经通过 `/api/chat` 调用自己的后端，因此不需要在浏览器里暴露 DeepSeek API Key。

## 本地测试

安装 Node.js 后：

npm install
npm run dev

然后打开 Vercel CLI 给出的本地地址。

## 上线前建议增加

1. Rate limiting：防止 API 被刷爆。
2. Turnstile / CAPTCHA：降低机器人请求。
3. Analytics：记录角色选择、问题类型、会话完成率。
4. Token / usage limit：控制单个用户成本。
5. 数据库：如果未来要保存聊天记录或用户账户，再接 Supabase / Neon 等。
6. Streaming：让回答逐字出现，聊天体验会更像 ChatGPT。

## 模型

默认使用 `deepseek-flash`。如需更高能力，可将 `DEEPSEEK_MODEL` 改为 `deepseek-v4-pro`。
