import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

export default function Register() {
  const { config, refresh } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (config.registerMode !== 'open') {
    return (
      <div className="card narrow center">
        <p>当前站点未开放注册，账号由管理员分配。</p>
        <Link to="/login" className="btn">
          去登录
        </Link>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/register', { method: 'POST', body: { username, password } })
      // 注册成功后直接登录
      await api('/login', { method: 'POST', body: { username, password } })
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
      setBusy(false)
    }
  }

  return (
    <div className="card narrow">
      <h2>注册</h2>
      <form onSubmit={submit} className="stack">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名（2-32 位）" autoFocus />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（至少 6 位）"
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '注册中…' : '注册并登录'}
        </button>
      </form>
    </div>
  )
}
