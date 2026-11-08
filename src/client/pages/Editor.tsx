import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { renderMarkdown } from '../markdown'
import { canUpload, useApp } from '../App'

export default function Editor() {
  const { slug } = useParams() // 存在 = 编辑模式
  const { config, refresh } = useApp()
  const navigate = useNavigate()
  const editing = !!slug

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [pwAction, setPwAction] = useState<'keep' | 'set' | 'remove'>('keep')
  const [hadPw, setHadPw] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(!editing)

  useEffect(() => {
    if (!editing) return
    api<{ title: string; content: string; hasPw: boolean; canEdit: boolean }>(`/articles/${slug}`)
      .then((d) => {
        if (!d.canEdit) {
          setError('你没有编辑这篇文章的权限')
          return
        }
        setTitle(d.title)
        setContent(d.content)
        setHadPw(d.hasPw)
        setLoaded(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
  }, [editing, slug])

  if (!canUpload(config)) {
    return (
      <div className="card narrow center">
        <p>
          当前站点上传权限受限，需要
          {config.uploadMode === 'admin' ? '管理员' : '登录'}才能上传。
        </p>
        {!config.user && (
          <Link to="/login" className="btn btn-primary">
            去登录
          </Link>
        )}
      </div>
    )
  }
  if (error) return <div className="center error-text">{error}</div>
  if (!loaded) return <div className="muted">加载中…</div>

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('请填写标题')
    if (!content.trim()) return setError('请填写内容')
    setSaving(true)
    try {
      if (editing) {
        const pwParam = pwAction === 'keep' ? undefined : pwAction === 'remove' ? null : password
        await api(`/articles/${slug}`, {
          method: 'PUT',
          body: { title: title.trim(), content, password: pwParam },
        })
        navigate(`/a/${slug}`)
      } else {
        const { slug: newSlug } = await api<{ slug: string }>('/articles', {
          method: 'POST',
          body: { title: title.trim(), content, password },
        })
        await refresh()
        navigate(`/a/${newSlug}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="stack editor">
      <input
        className="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题（必填）"
        maxLength={200}
      />

      <div className="pw-row">
        {editing && hadPw ? (
          <>
            <label>
              <input
                type="radio"
                checked={pwAction === 'keep'}
                onChange={() => setPwAction('keep')}
              />{' '}
              保持原密码
            </label>
            <label>
              <input
                type="radio"
                checked={pwAction === 'set'}
                onChange={() => setPwAction('set')}
              />{' '}
              修改密码
            </label>
            <label>
              <input
                type="radio"
                checked={pwAction === 'remove'}
                onChange={() => setPwAction('remove')}
              />{' '}
              移除密码
            </label>
          </>
        ) : (
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="访问密码（留空 = 任何人可见）"
            maxLength={100}
          />
        )}
      </div>
      {editing && pwAction === 'set' && (
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="新访问密码"
          maxLength={100}
        />
      )}

      <div className="editor-toolbar">
        <button type="button" className="btn btn-sm" onClick={() => setPreview(!preview)}>
          {preview ? '继续编辑' : '预览'}
        </button>
        <span className="muted">支持 Markdown</span>
      </div>

      {preview ? (
        <div className="md preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      ) : (
        <textarea
          className="content-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="正文，支持 Markdown…"
        />
      )}

      {error && <div className="error-text">{error}</div>}
      <div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? '保存中…' : editing ? '保存修改' : '发布'}
        </button>
      </div>
    </form>
  )
}
