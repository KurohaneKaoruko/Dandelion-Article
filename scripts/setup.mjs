#!/usr/bin/env node
// 一键准备 Cloudflare 部署：
//   前置：npx wrangler login（或设置 CLOUDFLARE_API_TOKEN 环境变量）
//   用法：npm run setup    （首次：找到/创建 D1、自动回填 database_id、初始化远端表）
// 之后部署只需：npm run deploy
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
const NAME = 'dandelion-db'

// 1) 登录检查
let who = ''
try {
  who = sh('npx wrangler whoami')
} catch {}
if (/not authenticated/i.test(who)) {
  console.error('✘ 尚未登录 Cloudflare。请先运行：\n    npx wrangler login\n  或设置 CLOUDFLARE_API_TOKEN 环境变量后重试。')
  process.exit(1)
}
console.log('✔ 已登录 Cloudflare')

// 2) 查找或创建 D1 数据库
let dbId
try {
  const arr = JSON.parse(sh('npx wrangler d1 list --json'))
  dbId = arr.find((d) => d.name === NAME)?.database_id
} catch {}
if (dbId) {
  console.log(`✔ 找到已有数据库 ${NAME}（${dbId}）`)
} else {
  console.log(`… 创建 D1 数据库 ${NAME} …`)
  const out = sh(`npx wrangler d1 create ${NAME}`)
  dbId = out.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i)?.[1]
  if (!dbId) console.error('✘ 未能解析 database_id，请手动填入 wrangler.toml 后再运行 npm run deploy'), process.exit(1)
  console.log(`✔ 数据库已创建（${dbId}）`)
}

// 3) 回填 wrangler.toml
const toml = readFileSync('wrangler.toml', 'utf8')
if (!toml.includes(`database_id = "${dbId}"`)) {
  writeFileSync('wrangler.toml', toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${dbId}"`))
  console.log('✔ database_id 已写入 wrangler.toml')
}

// 4) 初始化远端表结构（幂等；即使失败也没关系，应用首次请求会自动建表）
try {
  sh('npx wrangler d1 execute DB --remote --file=./schema.sql')
  console.log('✔ 远端表结构已初始化')
} catch {
  console.warn('⚠ 远端建表跳过（应用首次请求会自动建表）')
}

console.log('\n一切就绪，运行以下命令完成部署：\n    npm run deploy')
