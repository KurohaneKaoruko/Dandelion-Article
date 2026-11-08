import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

export default function Login() {
  const { refresh } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } = await api<{ user: { role: string } }>('/login', {
        method: 'POST',
        body: { username, password },
      })
      await refresh()
      navigate(user.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
      setBusy(false)
    }
  }

  return (
    <div className="card narrow">
      <h2>登录</h2>
      <form onSubmit={submit} className="stack">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
