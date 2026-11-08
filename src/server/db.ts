import { pbkdf2Hash, hex, now, randomId } from './crypto'

export interface User {
  id: number
  username: string
  pw: string
  role: 'admin' | 'user'
  mustChange: number
  created: number
}

export interface Article {
  slug: string
  title: string
  content: string
  pw: string | null
  authorId: number | null
  created: number
  updated: number
}

export interface AdminUserRow {
  id: number
  username: string
  role: 'admin' | 'user'
  mustChange: number
  created: number
  articles: number
}

// 与根目录 schema.sql 保持一致（服务启动时自动执行，幂等）
// 注意：D1 的 exec() 按行切分语句，多行 SQL 会报 incomplete input，因此这里用 batch 逐条执行
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pw TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    must_change INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS articles (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    pw TEXT,
    author_id INTEGER,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created DESC)`,
]

export const DEFAULT_ADMIN_USERNAME = 'admin'
export const DEFAULT_ADMIN_PASSWORD = 'admin123' // 弱口令，登录后强制提示修改

let initPromise: Promise<void> | null = null

/** 每个隔离实例只执行一次：建表 + 首次播种（默认管理员、随机签名密钥、默认设置） */
export function ensureInit(db: D1Database): Promise<void> {
  if (!initPromise) {
    initPromise = doInit(db).catch((e) => {
      initPromise = null
      throw e
    })
  }
  return initPromise
}

async function doInit(db: D1Database): Promise<void> {
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)))
  const done = await db.prepare(`SELECT value FROM settings WHERE key = 'init_done'`).first<{ value: string }>()
  if (done) return

  const secret = hex(crypto.getRandomValues(new Uint8Array(32)))
  const adminHash = await pbkdf2Hash(DEFAULT_ADMIN_PASSWORD)
  await db.batch([
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('init_done', '1')`),
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('secret', ?1)`).bind(secret),
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('site_name', ?1)`).bind('蒲公英'),
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('upload_mode', 'anyone')`),
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('register_mode', 'open')`),
    db
      .prepare(
        `INSERT OR IGNORE INTO users (username, pw, role, must_change, created) VALUES (?1, ?2, 'admin', 1, ?3)`,
      )
      .bind(DEFAULT_ADMIN_USERNAME, adminHash, now()),
  ])
}

// ---------- settings ----------

export async function getSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>()
  return Object.fromEntries(results.map((r) => [r.key, r.value]))
}

export async function setSettings(db: D1Database, kv: Record<string, string>): Promise<void> {
  const stmts = Object.entries(kv).map(([k, v]) =>
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)`).bind(k, v),
  )
  if (stmts.length) await db.batch(stmts)
}

// ---------- users ----------

const rowToUser = (r: Record<string, unknown>): User => ({
  id: r.id as number,
  username: r.username as string,
  pw: r.pw as string,
  role: r.role as 'admin' | 'user',
  mustChange: r.must_change as number,
  created: r.created as number,
})

export async function getUserByName(db: D1Database, username: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE username = ?1`).bind(username).first()
  return row ? rowToUser(row) : null
}

export async function getUserById(db: D1Database, id: number): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first()
  return row ? rowToUser(row) : null
}

export async function createUser(
  db: D1Database,
  username: string,
  hash: string,
  role: 'admin' | 'user',
  mustChange: boolean,
): Promise<void> {
  await db
    .prepare(`INSERT INTO users (username, pw, role, must_change, created) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(username, hash, role, mustChange ? 1 : 0, now())
    .run()
}

export async function listUsers(db: D1Database): Promise<AdminUserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.username, u.role, u.must_change, u.created, COUNT(a.slug) AS articles
       FROM users u LEFT JOIN articles a ON a.author_id = u.id
       GROUP BY u.id ORDER BY u.created DESC`,
    )
    .all()
  return results as unknown as AdminUserRow[]
}

export async function updateUserPassword(db: D1Database, id: number, hash: string): Promise<void> {
  await db
    .prepare(`UPDATE users SET pw = ?2, must_change = 0 WHERE id = ?1`)
    .bind(id, hash)
    .run()
}

export async function updateUserRole(db: D1Database, id: number, role: 'admin' | 'user'): Promise<void> {
  await db.prepare(`UPDATE users SET role = ?2 WHERE id = ?1`).bind(id, role).run()
}

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run()
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).first<{ n: number }>()
  return row?.n ?? 0
}

// ---------- articles ----------

export async function createArticle(
  db: D1Database,
  data: { title: string; content: string; pw: string | null; authorId: number | null },
): Promise<string> {
  // 短 ID 冲突时重试
  for (let i = 0; i < 5; i++) {
    const slug = randomId(8)
    const ok = await db
      .prepare(`INSERT OR IGNORE INTO articles (slug, title, content, pw, author_id, created, updated)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`)
      .bind(slug, data.title, data.content, data.pw, data.authorId, now())
      .run()
    if (ok.meta.changes) return slug
  }
  throw new Error('生成链接失败，请重试')
}

interface ArticleRow {
  slug: string
  title: string
  content: string
  pw: string | null
  author_id: number | null
  created: number
  updated: number
}

export async function getArticle(db: D1Database, slug: string): Promise<Article | null> {
  const row = await db.prepare(`SELECT * FROM articles WHERE slug = ?1`).bind(slug).first<ArticleRow>()
  if (!row) return null
  return {
    slug: row.slug,
    title: row.title,
    content: row.content,
    pw: row.pw,
    authorId: row.author_id,
    created: row.created,
    updated: row.updated,
  }
}

export interface ArticleListItem {
  slug: string
  title: string
  hasPw: boolean
  author: string | null
  created: number
  updated: number
}

export async function listArticles(db: D1Database, limit = 200): Promise<ArticleListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT a.slug, a.title, a.pw IS NOT NULL AS has_pw, a.created, a.updated, u.username AS author
       FROM articles a LEFT JOIN users u ON a.author_id = u.id
       ORDER BY a.created DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{ slug: string; title: string; has_pw: number; created: number; updated: number; author: string | null }>()
  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    hasPw: !!r.has_pw,
    author: r.author,
    created: r.created,
    updated: r.updated,
  }))
}

/** pw: undefined = 不修改；null = 移除密码；string = 设置新密码 */
export async function updateArticle(
  db: D1Database,
  slug: string,
  data: { title: string; content: string; pw: string | null | undefined },
): Promise<void> {
  if (data.pw === undefined) {
    await db
      .prepare(`UPDATE articles SET title = ?2, content = ?3, updated = ?4 WHERE slug = ?1`)
      .bind(slug, data.title, data.content, now())
      .run()
  } else {
    await db
      .prepare(`UPDATE articles SET title = ?2, content = ?3, pw = ?4, updated = ?5 WHERE slug = ?1`)
      .bind(slug, data.title, data.content, data.pw, now())
      .run()
  }
}

export async function deleteArticle(db: D1Database, slug: string): Promise<void> {
  await db.prepare(`DELETE FROM articles WHERE slug = ?1`).bind(slug).run()
}
