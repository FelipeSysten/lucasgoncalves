const { authed, DEFAULT_CONTENT } = require('./_utils');

const KEY = 'site-content.json';

async function readContent() {
  // Sem Blob Store conectado, o site funciona com o conteúdo padrão.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Object.assign({}, DEFAULT_CONTENT, { storage: false });
  }
  const { list } = require('@vercel/blob');
  const { blobs } = await list({ prefix: KEY });
  const b = blobs.find((x) => x.pathname === KEY);
  if (!b) return Object.assign({}, DEFAULT_CONTENT, { storage: true });
  // Cache-bust: o blob fica atrás de CDN; a query string força a versão nova.
  const r = await fetch(b.url + '?v=' + Date.now(), { cache: 'no-store' });
  const saved = await r.json();
  return Object.assign({}, DEFAULT_CONTENT, saved, { storage: true });
}

function sanitize(body) {
  const s = (body && body.settings) || {};
  const posts = Array.isArray(body && body.posts) ? body.posts : [];
  return {
    settings: {
      whatsapp: String(s.whatsapp || DEFAULT_CONTENT.settings.whatsapp).replace(/\D/g, '').slice(0, 20),
      instagram: String(s.instagram || DEFAULT_CONTENT.settings.instagram).replace(/^@/, '').trim().slice(0, 60)
    },
    posts: posts.slice(0, 200).map((p) => ({
      id: String(p.id || Date.now()),
      title: String(p.title || '').slice(0, 140),
      kicker: String(p.kicker || '').slice(0, 60),
      text: String(p.text || '').slice(0, 2000),
      img: String(p.img || '').slice(0, 500),
      cta: String(p.cta || '').slice(0, 60),
      msg: String(p.msg || '').slice(0, 300),
      date: String(p.date || new Date().toISOString()).slice(0, 30)
    }))
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readContent());
    }
    if (req.method === 'POST') {
      if (!authed(req)) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({
          error: 'Armazenamento não configurado: no painel da Vercel, abra o projeto → Storage → Create Database → Blob e conecte ao projeto. Depois faça um redeploy.'
        });
      }
      const content = sanitize(req.body);
      const { put } = require('@vercel/blob');
      await put(KEY, JSON.stringify(content), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json'
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
