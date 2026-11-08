import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtTime } from '../api'
import { useApp, type UploadMode, type RegisterMode } from '../App'

interface UserRow {
  id: number
  username: string
  role: 'admin' | 'user'
  mustChange: number
  created: number
  articles: number
}

const UPLOAD_OPTIONS: { value: UploadMode; label: string; desc: string }[] = [
  { value: 'anyone', label: '任何人', desc: '不需要登录，任何人都能上传文章' },
  { value: 'users', label: '账号登录', desc: '需要登录后才能上传' },
  { value: 'admin', label: '仅管理员', desc: '只有管理员能上传' },
]

const REGISTER_OPTIONS: { value: RegisterMode; label: string; desc: string }[] = [
  { value: 'open', label: '开放注册', desc: '任何人在注册页自行注册' },
  { value: 'invite', label: '管理员分配', desc: '关闭注册页，账号由管理员在下方创建' },
]

function SettingsPanel() {
  const { config, refresh } = useApp()
  const [siteName, setSiteName] = useState(config.siteName)
  const [msg, setMsg] = useState('')

  const save = async (kv: Record<string, string>) => {
    setMsg('')
    try {
      await api('/admin/settings', { method: 'POST', body: kv })
      await refresh()
      setMsg('已保存 ✓')
      setTimeout(() => setMsg(''), 1500)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <section className="card">
      <h3>站点设置</h3>

      <div className="field">
        <label>站点名称</label>
        <div className="field-row">
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} maxLength={50} />
          <button className="btn" onClick={() => save({ siteName })}>
            保存
          </button>
        </div>
      </div>

      <div className="field">
        <label>谁能上传</label>
        {UPLOAD_OPTIONS.map((o) => (
          <label key={o.value} className="radio-row">
            <input
              type="radio"
              name="upload"
              checked={config.uploadMode === o.value}
              onChange={() => save({ uploadMode: o.value })}
            />
            <b>{o.label}</b>
            <span className="muted">— {o.desc}</span>
          </label>
        ))}
      </div>

      <div className="field">
        <label>注册方式</label>
        {REGISTER_OPTIONS.map((o) => (
          <label key={o.value} className="radio-row">
            <input
              type="radio"
              name="register"
              checked={config.registerMode === o.value}
              onChange={() => save({ registerMode: o.value })}
            />
            <b>{o.label}</b>
            <span className="muted">— {o.desc}</span>
          </label>
        ))}
      </div>
      {msg && <div className="ok-text">{msg}</div>}
    </section>
  )
}

function UsersPanel() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api<{ users: UserRow[] }>('/admin/users')
      setUsers(d.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="error-text">{error}</div>
  if (!users) return <div className="muted">加载中…</div>

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2000)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/admin/users', { method: 'POST', body: { username, password, role } })
      setUsername('')
      setPassword('')
      setRole('user')
      flash('账号已创建 ✓')
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : '创建失败')
    }
  }

  const resetPw = async (u: UserRow) => {
    const pw = prompt(`为「${u.username}」设置新密码（至少 6 位）：`)
    if (!pw) return
    try {
      await api(`/admin/users/${u.id}/password`, { method: 'POST', body: { password: pw } })
      flash('密码已重置 ✓（该用户下次登录后建议自行修改）')
    } catch (err) {
      alert(err instanceof Error ? err.message : '重置失败')
    }
  }

  const changeRole = async (u: UserRow) => {
    const to = u.role === 'admin' ? 'user' : 'admin'
    if (!confirm(`将「${u.username}」的角色改为 ${to === 'admin' ? '管理员' : '普通用户'}？`)) return
    try {
      await api(`/admin/users/${u.id}/role`, { method: 'POST', body: { role: to } })
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : '修改失败')
    }
  }

  const remove = async (u: UserRow) => {
    if (!confirm(`删除账号「${u.username}」？其文章将保留但失去作者信息。`)) return
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <section className="card">
      <h3>账号管理</h3>
      <table className="table">
        <thead>
          <tr>
            <th>用户名</th>
            <th>角色</th>
            <th>文章数</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {u.username}
                {!!u.mustChange && <span title="仍在使用初始/分配的密码"> ⚠️</span>}
              </td>
              <td>{u.role === 'admin' ? '管理员' : '用户'}</td>
              <td>{u.articles}</td>
              <td>{fmtTime(u.created)}</td>
              <td className="bar-actions">
                <button className="btn btn-sm" onClick={() => resetPw(u)}>
                  重置密码
                </button>
                <button className="btn btn-sm" onClick={() => changeRole(u)}>
                  {u.role === 'admin' ? '降为用户' : '升为管理员'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ marginTop: 16 }}>创建账号</h4>
      <form onSubmit={create} className="field-row">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="初始密码"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}>
          <option value="user">用户</option>
          <option value="admin">管理员</option>
        </select>
        <button className="btn btn-primary">创建</button>
      </form>
      <p className="muted">创建后请把用户名和初始密码发给对方，并提醒对方登录后修改密码。</p>
      {msg && <div className="ok-text">{msg}</div>}
    </section>
  )
}

export default function Admin() {
  const { config } = useApp()
  const [articles, setArticles] = useState<
    { slug: string; title: string; hasPw: boolean; author: string | null; created: number }[] | null
  >(null)

  const isAdmin = config.user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    api<{ articles: typeof articles }>('/articles')
      .then((d) => setArticles(d.articles))
      .catch(() => setArticles([]))
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="card narrow center">
        <p>需要管理员权限。</p>
        <Link to="/login" className="btn btn-primary">
          去登录
        </Link>
      </div>
    )
  }

  const removeArticle = async (slug: string, title: string) => {
    if (!confirm(`删除文章「${title}」？不可恢复。`)) return
    try {
      await api(`/articles/${slug}`, { method: 'DELETE' })
      setArticles((prev) => prev?.filter((a) => a.slug !== slug) ?? null)
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className="stack-lg">
      <h2 className="page-h2">管理后台</h2>
      <SettingsPanel />

      <section className="card">
        <h3>全部文章</h3>
        {!articles ? (
          <div className="muted">加载中…</div>
        ) : articles.length === 0 ? (
          <div className="muted">还没有文章。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>标题</th>
                <th>作者</th>
                <th>发布时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.slug}>
                  <td>
                    <Link to={`/a/${a.slug}`}>
                      {a.hasPw ? '🔒 ' : ''}
                      {a.title}
                    </Link>
                  </td>
                  <td>{a.author ?? '匿名'}</td>
                  <td>{fmtTime(a.created)}</td>
                  <td className="bar-actions">
                    <Link className="btn btn-sm" to={`/edit/${a.slug}`}>
                      编辑
                    </Link>
                    <button className="btn btn-sm btn-danger" onClick={() => removeArticle(a.slug, a.title)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <UsersPanel />
    </div>
  )
}
