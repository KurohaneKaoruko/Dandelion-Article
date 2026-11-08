import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtTime } from '../api'
import { useApp } from '../App'

interface Item {
  slug: string
  title: string
  hasPw: boolean
  author: string | null
  created: number
  updated: number
}

export default function Home() {
  const { config } = useApp()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ articles: Item[] }>('/articles')
      .then((d) => setItems(d.articles))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
  }, [])

  if (error) return <div className="error-text">{error}</div>
  if (!items) return <div className="muted">加载中…</div>

  if (items.length === 0) {
    return (
      <div className="center muted">
        还没有文章。
        {config.uploadMode === 'anyone' && (
          <>
            点 <Link to="/new">写文章</Link> 发布第一篇吧。
          </>
        )}
      </div>
    )
  }

  return (
    <ul className="article-list">
      {items.map((a) => (
        <li key={a.slug}>
          <Link to={`/a/${a.slug}`} className="article-title">
            {a.hasPw && <span title="需要密码访问">🔒 </span>}
            {a.title}
          </Link>
          <div className="article-meta">
            {a.author ? `作者 ${a.author}` : '匿名'} · {fmtTime(a.created)}
          </div>
        </li>
      ))}
    </ul>
  )
}
