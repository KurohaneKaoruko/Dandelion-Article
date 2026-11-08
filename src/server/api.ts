import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from './env'
import { pbkdf2Hash, pbkdf2Verify, hmacSign, hmacVerify, now } from './crypto'
import * as db from './db'

type C = { Bindings: Env }
type Ctx = Context<C>
export const api = new Hono<C>()

const SESSION_DAYS = 7
const LOCK_DAYS = 7
const USERNAME_RE = /^[a-zA-Z0-9_\-\u4e00-\u9fa5]{2,32}$/

api.use('*', async (c, next) => {
  await db.ensureInit(c.env.DB)
  await next()
})

// ---------- 内存级失败次数限制（防暴力试密码） ----------
// 免费版没有 Ratelimit 绑定，这里按隔离实例内存做软限制；如需强限制可接 Turnstile。
const attempts = new Map<string, number[]>()

function tooManyAttempts(key: string, max = 10, windowMs = 10 * 60_000): boolean {
  const t = Date.now()
  const arr = (attempts.get(key) ?? []).filter((x) => t - x < windowMs)
  arr.push(t)
  attempts.set(key, arr)
  return arr.length > max
}

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ?? 'local'
}

// ---------- 会话 ----------

async function secret(db_: D1Database): Promise<string> {
  const s = await db.getSettings(db_)
  return s['secret'] ?? ''
}

async function currentUser(c: Ctx): Promise<db.User | null> {
  const raw = getCookie(c, 's')
  if (!raw) return null
  // cookie = `${userId}.${exp}.${sig}`，payload 含 '.'，需从右侧切分
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  if (!(await hmacVerify(await secret(c.env.DB), payload, sig))) return null
  const [uid, exp] = payload.split('.')
  if (!uid || Number(exp) < now()) return null
  return db.getUserById(c.env.DB, Number(uid))
}

// 本地开发是 http，生产环境（Cloudflare）是 https：按请求协议决定 Secure 标记
function isSecure(c: Ctx): boolean {
  return new URL(c.req.raw.url).protocol === 'https:'
}

async function setSession(c: Ctx, userId: number): Promise<void> {
  const exp = now() + SESSION_DAYS * 86400
  const payload = `${userId}.${exp}`
  const sig = await hmacSign(await secret(c.env.DB), payload)
  setCookie(c, 's', `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
    secure: isSecure(c),
  })
}

async function articleUnlocked(c: Ctx, slug: string): Promise<boolean> {
  const raw = getCookie(c, `p_${slug}`)
  if (!raw) return false
  const [exp, sig] = raw.split('.')
  if (!exp || !sig || Number(exp) < now()) return false
  return hmacVerify(await secret(c.env.DB), `${slug}.${exp}`, sig)
}

async function setUnlockCookie(c: Ctx, slug: string): Promise<void> {
  const exp = now() + LOCK_DAYS * 86400
  const sig = await hmacSign(await secret(c.env.DB), `${slug}.${exp}`)
  setCookie(c, `p_${slug}`, `${exp}.${sig}`, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: LOCK_DAYS * 86400,
    secure: isSecure(c),
  })
}

function publicUser(u: db.User) {
  return { id: u.id, username: u.username, role: u.role, mustChange: !!u.mustChange }
}

function jsonError(message: string, status: 400 | 401 | 403 | 404 | 429 = 400) {
  return Response.json({ error: message }, { status })
}

async function readBody<T>(c: Ctx): Promise<T | null> {
  try {
    return (await c.req.json()) as T
  } catch {
    return null
  }
}

// ---------- 公共接口 ----------

// 站点配置 + 当前登录状态（首页/导航栏用）
api.get('/config', async (c) => {
  const [s, user] = await Promise.all([db.getSettings(c.env.DB), currentUser(c)])
  return c.json({
    siteName: s['site_name'] ?? '蒲公英',
    uploadMode: s['upload_mode'] ?? 'anyone',
    registerMode: s['register_mode'] ?? 'open',
    user: user ? publicUser(user) : null,
  })
})

api.post('/register', async (c) => {
  const s = await db.getSettings(c.env.DB)
  if (s['register_mode'] !== 'open') return jsonError('当前站点未开放注册，请联系管理员分配账号', 403)
  const body = await readBody<{ username?: string; password?: string }>(c)
  const username = body?.username?.trim() ?? ''
  const password = body?.password ?? ''
  if (!USERNAME_RE.test(username)) return jsonError('用户名需为 2-32 位字母、数字、_ - 或中文')
  if (password.length < 6) return jsonError('密码至少 6 位')
  if (await db.getUserByName(c.env.DB, username)) return jsonError('用户名已存在')
  await db.createUser(c.env.DB, username, await pbkdf2Hash(password), 'user', false)
  return c.json({ ok: true })
})

api.post('/login', async (c) => {
  const body = await readBody<{ username?: string; password?: string }>(c)
  const username = body?.username?.trim() ?? ''
  const password = body?.password ?? ''
  if (tooManyAttempts(`login:${clientIp(c)}:${username}`)) return jsonError('尝试过于频繁，请 10 分钟后再试', 429)
  const user = await db.getUserByName(c.env.DB, username)
  if (!user || !(await pbkdf2Verify(password, user.pw))) return jsonError('用户名或密码错误', 401)
  await setSession(c, user.id)
  return c.json({ user: publicUser(user) })
})

api.post('/logout', (c) => {
  deleteCookie(c, 's', { path: '/' })
  return c.json({ ok: true })
})

api.get('/me', async (c) => {
  const user = await currentUser(c)
  return c.json({ user: user ? publicUser(user) : null })
})

// 修改自己的密码
api.post('/me/password', async (c) => {
  const user = await currentUser(c)
  if (!user) return jsonError('请先登录', 401)
  const body = await readBody<{ old?: string; new?: string }>(c)
  const oldPw = body?.old ?? ''
  const newPw = body?.new ?? ''
  if (!(await pbkdf2Verify(oldPw, user.pw))) return jsonError('原密码错误', 401)
  if (newPw.length < 6) return jsonError('新密码至少 6 位')
  await db.updateUserPassword(c.env.DB, user.id, await pbkdf2Hash(newPw))
  return c.json({ ok: true })
})

// ---------- 文章 ----------

function canUpload(user: db.User | null, uploadMode: string): boolean {
  if (uploadMode === 'anyone') return true
  if (!user) return false
  if (uploadMode === 'users') return true
  return user.role === 'admin' // admin
}

function canEditArticle(user: db.User | null, article: db.Article): boolean {
  if (!user) return false
  return user.role === 'admin' || article.authorId === user.id
}

api.get('/articles', async (c) => {
  return c.json({ articles: await db.listArticles(c.env.DB) })
})

api.post('/articles', async (c) => {
  const [s, user] = await Promise.all([db.getSettings(c.env.DB), currentUser(c)])
  if (!canUpload(user, s['upload_mode'] ?? 'anyone')) return jsonError('当前上传权限为「仅管理员」或「需登录」，你无权上传', 403)
  const body = await readBody<{ title?: string; content?: string; password?: string }>(c)
  const title = body?.title?.trim() ?? ''
  const content = body?.content ?? ''
  const password = body?.password ?? ''
  if (!title || title.length > 200) return jsonError('标题必填且不超过 200 字')
  if (!content) return jsonError('内容不能为空')
  if (content.length > 500_000) return jsonError('内容过长（上限 50 万字符）')
  if (password.length > 100) return jsonError('密码过长')
  const slug = await db.createArticle(c.env.DB, {
    title,
    content,
    pw: password ? await pbkdf2Hash(password) : null,
    authorId: user?.id ?? null,
  })
  return c.json({ slug })
})

api.get('/articles/:slug', async (c) => {
  const slug = c.req.param('slug')
  const article = await db.getArticle(c.env.DB, slug)
  if (!article) return jsonError('文章不存在', 404)
  const [user, unlocked] = await Promise.all([currentUser(c), articleUnlocked(c, slug)])
  const locked = !!article.pw && !unlocked
  const author = article.authorId ? (await db.getUserById(c.env.DB, article.authorId))?.username ?? null : null
  return c.json({
    slug: article.slug,
    title: article.title,
    hasPw: !!article.pw,
    locked,
    author,
    created: article.created,
    updated: article.updated,
    canEdit: canEditArticle(user, article),
    content: locked ? undefined : article.content,
  })
})

api.post('/articles/:slug/unlock', async (c) => {
  const slug = c.req.param('slug')
  const article = await db.getArticle(c.env.DB, slug)
  if (!article) return jsonError('文章不存在', 404)
  if (tooManyAttempts(`unlock:${clientIp(c)}:${slug}`)) return jsonError('尝试过于频繁，请 10 分钟后再试', 429)
  const body = await readBody<{ password?: string }>(c)
  const password = body?.password ?? ''
  if (!article.pw || !(await pbkdf2Verify(password, article.pw))) return jsonError('密码错误', 401)
  await setUnlockCookie(c, slug)
  return c.json({ ok: true })
})

api.put('/articles/:slug', async (c) => {
  const slug = c.req.param('slug')
  const [article, user] = await Promise.all([db.getArticle(c.env.DB, slug), currentUser(c)])
  if (!article) return jsonError('文章不存在', 404)
  if (!canEditArticle(user, article)) return jsonError('没有编辑权限', 403)
  const body = await readBody<{ title?: string; content?: string; password?: string | null }>(c)
  const title = body?.title?.trim() ?? ''
  const content = body?.content ?? ''
  if (!title || title.length > 200) return jsonError('标题必填且不超过 200 字')
  if (!content) return jsonError('内容不能为空')
  let pw: string | null | undefined = undefined
  if (body?.password === null) pw = null
  else if (typeof body?.password === 'string' && body.password !== '') pw = await pbkdf2Hash(body.password)
  await db.updateArticle(c.env.DB, slug, { title, content, pw })
  return c.json({ ok: true })
})

api.delete('/articles/:slug', async (c) => {
  const slug = c.req.param('slug')
  const [article, user] = await Promise.all([db.getArticle(c.env.DB, slug), currentUser(c)])
  if (!article) return jsonError('文章不存在', 404)
  if (!canEditArticle(user, article)) return jsonError('没有删除权限', 403)
  await db.deleteArticle(c.env.DB, slug)
  return c.json({ ok: true })
})

// ---------- 管理员接口 ----------

api.use('/admin/*', async (c, next) => {
  const user = await currentUser(c)
  if (!user || user.role !== 'admin') return jsonError('需要管理员权限', 403)
  c.set('admin' as never, user)
  await next()
})

api.get('/admin/users', async (c) => {
  return c.json({ users: await db.listUsers(c.env.DB) })
})

api.post('/admin/users', async (c) => {
  const body = await readBody<{ username?: string; password?: string; role?: string }>(c)
  const username = body?.username?.trim() ?? ''
  const password = body?.password ?? ''
  const role = body?.role === 'admin' ? 'admin' : 'user'
  if (!USERNAME_RE.test(username)) return jsonError('用户名需为 2-32 位字母、数字、_ - 或中文')
  if (password.length < 6) return jsonError('密码至少 6 位')
  if (await db.getUserByName(c.env.DB, username)) return jsonError('用户名已存在')
  // 管理员分配的账号：must_change=1，首次登录后会被引导改密
  await db.createUser(c.env.DB, username, await pbkdf2Hash(password), role, true)
  return c.json({ ok: true })
})

api.post('/admin/users/:id/password', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await readBody<{ password?: string }>(c)
  const password = body?.password ?? ''
  if (password.length < 6) return jsonError('密码至少 6 位')
  if (!(await db.getUserById(c.env.DB, id))) return jsonError('用户不存在', 404)
  await db.updateUserPassword(c.env.DB, id, await pbkdf2Hash(password))
  return c.json({ ok: true })
})

api.post('/admin/users/:id/role', async (c) => {
  const admin = c.get('admin' as never) as db.User
  const id = Number(c.req.param('id'))
  const body = await readBody<{ role?: string }>(c)
  const role = body?.role === 'admin' ? 'admin' : 'user'
  if (id === admin.id) return jsonError('不能修改自己的角色')
  if (!(await db.getUserById(c.env.DB, id))) return jsonError('用户不存在', 404)
  if (role === 'user' && (await db.countAdmins(c.env.DB)) <= 1) return jsonError('站点至少需要保留一名管理员')
  await db.updateUserRole(c.env.DB, id, role)
  return c.json({ ok: true })
})

api.delete('/admin/users/:id', async (c) => {
  const admin = c.get('admin' as never) as db.User
  const id = Number(c.req.param('id'))
  if (id === admin.id) return jsonError('不能删除自己的账号')
  const target = await db.getUserById(c.env.DB, id)
  if (!target) return jsonError('用户不存在', 404)
  if (target.role === 'admin' && (await db.countAdmins(c.env.DB)) <= 1) return jsonError('站点至少需要保留一名管理员')
  await db.deleteUser(c.env.DB, id)
  return c.json({ ok: true })
})

api.post('/admin/settings', async (c) => {
  const body = await readBody<{ siteName?: string; uploadMode?: string; registerMode?: string }>(c)
  const kv: Record<string, string> = {}
  if (body?.siteName !== undefined) {
    const name = body.siteName.trim()
    if (!name || name.length > 50) return jsonError('站点名必填且不超过 50 字')
    kv['site_name'] = name
  }
  if (body?.uploadMode !== undefined) {
    if (!['anyone', 'users', 'admin'].includes(body.uploadMode)) return jsonError('uploadMode 取值非法')
    kv['upload_mode'] = body.uploadMode
  }
  if (body?.registerMode !== undefined) {
    if (!['open', 'invite'].includes(body.registerMode)) return jsonError('registerMode 取值非法')
    kv['register_mode'] = body.registerMode
  }
  await db.setSettings(c.env.DB, kv)
  return c.json({ ok: true })
})
