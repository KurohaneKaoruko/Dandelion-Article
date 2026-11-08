import { Hono } from 'hono'
import type { Env } from './env'
import { api } from './api'

const app = new Hono<{ Bindings: Env }>()

app.route('/api', api)

// 其余路径交给静态资源（SPA：未命中的路径返回 index.html，由前端路由接管）
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
