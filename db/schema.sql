-- Banco dedicado exclusivamente ao Asphalt Boys (Cloudflare D1).
-- Executar no Cloudflare D1 Console antes de ativar o painel público.
CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('destinos','paradas','rotas')),
  destino_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado')),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ab_content_public ON site_content (status,kind,destino_id);
