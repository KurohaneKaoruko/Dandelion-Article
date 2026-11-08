# 🌼 蒲公英 (dandelion)

轻量文章分享站：网页上直接写文章、可给文章设访问密码、生成短链接分享给他人。
跑在 Cloudflare Workers + D1 上，**完全在免费额度内**（静态资源不限量，动态请求 10 万次/天）。

## 功能

- **上传**：网页编辑器（Markdown + 实时预览），生成 `/a/xxxxxxxx` 短链接
- **文章密码**：每篇文章可设访问密码（PBKDF2 哈希存储），访客输一次密码后 7 天内免输
- **通用权限配置**（管理后台可随时切换）：
  - 谁能上传：`任何人` / `账号登录` / `仅管理员`
  - 注册方式：`开放注册` / `管理员分配账号`
- **账号体系**：改密、管理员建号/重置密码/升降权限/删除
- **安全**：口令 PBKDF2 哈希、HMAC 签名 Cookie（HttpOnly）、恒定时间比较、登录/解锁失败限速

## 默认管理员

| 用户名 | 密码 | 说明 |
|---|---|---|
| `admin` | `admin123` | 弱口令仅用于首次登录，**登录后顶栏会提示立即修改** |

## 本地开发

```bash
npm install
npm run db:local        # 建表（首次）；其实服务启动也会自动建表，这步可选
npm run dev:server      # 跑 wrangler dev（API，http://127.0.0.1:8787）
# 另开一个终端
npm run dev:client      # 跑 Vite（前端，http://localhost:5173，/api 已代理到 8787）
```

生产模式验证：`npm run build && npm run dev:server` 后直接访问 http://127.0.0.1:0.0.0.0:8787（wrangler dev 默认地址，即 127.0.0.1:8dev

## 部署到 Cloudflare（全程免费）

```bash
npx wrangler login
npx wrangler d1 create dandelion-db
# 把返回的 database_id 填入 wrangler.toml
npm run db:remote       # 远端建表（也可跳过，首次请求会自动建）
npm run deploy          # 构建 + 部署
```

部署完成后 Wrangler 会输出 `https://dandelion.<你的子域>.workers.dev`。

## 后续可加的功能

- 图片上传到 R2（免费 10GB，出站流量免费）
- Cloudflare Turnstile 防暴力试密码（免费）
- 链接有效期（阅后即焚）
