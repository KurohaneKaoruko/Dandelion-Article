import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom'
import { api } from './api'
import Home from './pages/Home'
import Article from './pages/Article'
import Editor from './pages/Editor'
import Login from './pages/Login'
import Register from './pages/Register'
import Admin from './pages/Admin'
import Password from './pages/Password'

export type Role = 'admin' | 'user'
export type UploadMode = 'anyone' | 'users' | 'admin'
export type RegisterMode = 'open' | 'invite'

export interface UserInfo {
  id: number
  username: string
  role: Role
  mustChange: boolean
}

export interface Config {
  siteName: string
  uploadMode: UploadMode
  registerMode: RegisterMode
  user: UserInfo | null
}

const Ctx = createContext<{ config: Config; refresh: () => Promise<void> } | null>(null)

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('App context missing')
  return v
}

export function canUpload(cfg: Config): boolean {
  if (cfg.uploadMode === 'anyone') return true
  if (!cfg.user) return false
  return cfg.uploadMode === 'users' || cfg.user.role === 'admin'
}

const UPLOAD_MODE_LABEL: Record<UploadMode, string> = {
  anyone: '任何人',
  users: '登录用户',
  admin: '仅管理员',
}

function Nav() {
  const { config, refresh } = useApp()
  const navigate = useNavigate()

  const logout = async () => {
    await api('/logout', { method: 'POST' })
    await refresh()
    navigate('/')
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          🌼 {config.siteName}
        </Link>
        <nav className="nav-actions">
          {canUpload(config) && (
            <Link to="/new" className="btn btn-primary">
              写文章
            </Link>
          )}
          {config.user?.role === 'admin' && (
            <NavLink to="/admin" className="btn">
              管理
            </NavLink>
          )}
          {config.user ? (
            <>
              <span className="nav-user">
                {config.user.username}
                {config.user.role === 'admin' ? '（管理员）' : ''}
              </span>
              <NavLink to="/me/password" className="btn">
                改密码
              </NavLink>
              <button className="btn" onClick={logout}>
                退出
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn">
              登录
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setConfig(await api<Config>('/config'))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (error) return <div className="page center error-text">{error}</div>
  if (!config) return <div className="page center muted">加载中…</div>

  return (
    <Ctx.Provider value={{ config, refresh }}>
      <Nav />
      {config.user?.mustChange && (
        <div className="banner">
          你正在使用初始密码，请尽快
          <Link to="/me/password">修改密码</Link>
        </div>
      )}
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/a/:slug" element={<Article />} />
          <Route path="/new" element={<Editor />} />
          <Route path="/edit/:slug" element={<Editor />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/me/password" element={<Password />} />
          <Route path="*" element={<div className="center muted">404 · 页面不存在</div>} />
        </Routes>
      </main>
      <footer className="footer">
        🌼 {config.siteName} · 上传权限：{UPLOAD_MODE_LABEL[config.uploadMode]}
      </footer>
    </Ctx.Provider>
  )
}
