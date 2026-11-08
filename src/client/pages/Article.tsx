import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtTime } from '../api'
import { renderMarkdown } from '../markdown'
import { useApp } from '../App'

interface ArticleData {
  slug: string
  title: string
  hasPw: boolean
  locked: boolean
  author: string | null
  created: number
  updated: number
  canEdit: boolean
  content?: string
}

export default function Article() {
  const { slug } = useParams()
  const { refresh } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState<ArticleData | null>(null)
  const [error, setError] = useState('')
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<ArticleData>(`/articles/${slug}`))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="center error-text">{error}</div>
  if (!data) return <div className="muted">加载中…</div>

  if (data.locked) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault()
      setPwError('')
      try {
        await api(`/articles/${slug}/unlock`, { method: 'POST', body: { password: pw } })
        setPw('')
        await load()
      } catch (err) {
        setPwError(err instanceof Error ? err.message : '密码错误')
      }
    }
    return (
      <div className="card narrow">
        <h2>🔒 {data.title}</h2>
        <p className="muted">这篇文章已被作者加密，请输入访问密码。</p>
        <form onSubmit={submit} className="stack">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="访问密码"
            autoFocus
          />
          {pwError && <div className="error-text">{pwError}</div>}
          <button className="btn btn-primary">解锁查看</button>
        </form>
      </div>
    )
  }

  const remove = async () => {
    if (!confirm('确定删除这篇文章？此操作不可恢复。')) return
    try {
      await api(`/articles/${slug}`, { method: 'DELETE' })
      navigate('/')
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(location.origin + `/a/${data.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <article>
      <h1 className="article-h1">{data.title}</h1>
      <div className="article-meta bar">
        <span>
          {data.author ? `作者 ${data.author}` : '匿名'} · 发布于 {fmtTime(data.created)}
          {data.updated > data.created && ` · 更新于 ${fmtTime(data.updated)}`}
        </span>
        <span className="bar-actions">
          <button className="btn btn-sm" onClick={copyLink}>
            {copied ? '已复制 ✓' : '复制链接'}
          </button>
          {data.canEdit && (
            <>
              <Link className="btn btn-sm" to={`/edit/${data.slug}`}>
                编辑
              </Link>
              <button className="btn btn-sm btn-danger" onClick={remove}>
                删除
              </button>
            </>
          )}
        </span>
      </div>
      <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.content ?? '') }} />
    </article>
  )
}
