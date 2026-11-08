-- 蒲公英 · 数据库结构
-- 本地：npm run db:local   远端：npm run db:remote
-- 即便不执行本文件，服务首次请求时也会自动建表（幂等）

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  pw          TEXT NOT NULL,            -- PBKDF2-SHA256，格式 salt.hash
  role        TEXT NOT NULL DEFAULT 'user',  -- admin | user
  must_change INTEGER NOT NULL DEFAULT 0,    -- 1 = 提示修改初始密码
  created     INTEGER NOT NULL          -- unix 秒
);

CREATE TABLE IF NOT EXISTS articles (
  slug      TEXT PRIMARY KEY,           -- 短链接 ID
  title     TEXT NOT NULL,
  content   TEXT NOT NULL,              -- Markdown 原文
  pw        TEXT,                       -- 文章访问密码哈希，NULL = 不加密
  author_id INTEGER,                    -- NULL = 匿名上传
  created   INTEGER NOT NULL,
  updated   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created DESC);
