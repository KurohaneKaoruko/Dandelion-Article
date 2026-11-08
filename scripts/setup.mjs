#!/usr/bin/env node
// 自动准备 D1 数据库（在 Cloudflare Workers Builds 构建环境或本地均可运行）：
//   1. 查找或创建 D1 数据库
//   2. 把 database_id 写回 wrangler.toml
//   3. 初始化表结构（幂等，失败不影响部署：应用首次请求也会自动建表）
// Workers Builds 的构建环境自带账号级 API 凭证（CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID），
// 所以在「选仓库自动部署」时无需任何手动登录。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
const NAME = 'dandelion-db'

// 0) 环境检查：本地没有登录时给出明确提示；Workers Builds 中自动具备凭证
const env = {
  token: process.env.CLOUDFLARE_API_TOKEN,
  account: process.env.CLOUDFLARE_ACCOUNT_ID,
}
if (!env.token) {
  let who = ''
  try {
    who = sh('npx wrangler whoami')
  } catch {}
  if (/not authenticated/i.test(who)) {
    console.error('✘ 缺少 Cloudflare 凭证。在 Cloudflare Git 构建中应自动注入 CLOUDFLARE_API_TOKEN；本地使用请先 npx wrangler login')
    process.exit(1)
  }
}
console.log(`✔ Cloudflare 凭证就绪${env.account ? `（account: ${env.account}）` : ''}`)

// 1) 查找或创建 D1 数据库
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
  if (!dbId) {
    console.error('✘ 未能解析 database_id')
    process.exit(1)
  }
  console.log(`✔ 数据库已创建（${dbId}）`)
}

// 2) 回填 wrangler.toml（构建环境里改的是构建副本，不影响仓库文件）
const toml = readFileSync('wrangler.toml', 'utf8')
if (!toml.includes(`database_id = "${dbId}"`)) {
  writeFileSync('wrangler.toml', toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${dbId}"`))
  console.log('✔ database_id 已写入 wrangler.toml')
}

// 3) 初始化表结构（幂等；即使失败也没关系，应用首次请求会自动建表）
try {
  sh('npx wrangler d1 execute DB --remote --file=./schema.sql')
  console.log('✔ 远端表结构已初始化')
} catch {
  console.warn('⚠ 远端建表跳过（应用首次请求会自动建表）')
}

console.log('\n✔ 数据库准备完成，继续部署…')
