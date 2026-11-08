import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

export default function Password() {
  const { refresh } = useApp()
  const navigate = useNavigate()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk(false)
    if (newPw !== newPw2) return setError('两次输入的新密码不一致')
    setBusy(true)
    try {
      await api('/me/password', { method: 'POST', body: { old: oldPw, new: newPw } })
      setOldPw('')
      setNewPw('')
      setNewPw2('')
      setOk(true)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败')
    }
    setBusy(false)
  }

  return (
    <div className="card narrow">
      <h2>修改密码</h2>
      <form onSubmit={submit} className="stack">
        <input
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          placeholder="原密码"
          autoFocus
        />
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="新密码（至少 6 位）"
        />
        <input
          type="password"
          value={newPw2}
          onChange={(e) => setNewPw2(e.target.value)}
          placeholder="再输一遍新密码"
        />
        {error && <div className="error-text">{error}</div>}
        {ok && <div className="ok-text">密码已修改 ✓</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '提交中…' : '修改密码'}
        </button>
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          返回
        </button>
      </form>
    </div>
  )
}
