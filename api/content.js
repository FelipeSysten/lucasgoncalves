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
  const out = Object.assign({}, DEFAULT_CONTENT, saved, { storage: true });
  // Merge raso dentro de settings: um save antigo (sem appearance/texts/…)
  // não pode apagar as chaves novas do padrão.
  out.settings = Object.assign({}, DEFAULT_CONTENT.settings, saved.settings || {});
  return out;
}

function hexColor(v, fallback) {
  v = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

// Mapa { chave: string } com chaves slug e valores de texto limitados.
function stringMap(obj, maxKeys, maxLen) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(obj).slice(0, maxKeys)) {
    if (!/^[a-z0-9-]{1,80}$/.test(k)) continue;
    const v = String(obj[k] == null ? '' : obj[k]).slice(0, maxLen);
    if (v) out[k] = v;
  }
  return out;
}

function sanitizeDetails(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const id of Object.keys(obj).slice(0, 40)) {
    if (!/^[a-z0-9]{1,40}$/.test(id)) continue;
    const d = obj[id];
    if (!d || typeof d !== 'object') continue;
    const e = {};
    for (const f of ['kicker', 'title', 'desc', 'cta', 'ctaNote', 'msg']) {
      if (d[f]) e[f] = String(d[f]).slice(0, 2000);
    }
    if (Array.isArray(d.points)) {
      e.points = d.points.slice(0, 10).map((p) => String(p).slice(0, 200)).filter(Boolean);
    }
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}

function sanitize(body) {
  const s = (body && body.settings) || {};
  const a = s.appearance || {};
  const posts = Array.isArray(body && body.posts) ? body.posts : [];
  const DEF = DEFAULT_CONTENT.settings;
  return {
    settings: {
      whatsapp: String(s.whatsapp || DEF.whatsapp).replace(/\D/g, '').slice(0, 20),
      instagram: String(s.instagram || DEF.instagram).replace(/^@/, '').trim().slice(0, 60),
      appearance: {
        primary: hexColor(a.primary, DEF.appearance.primary),
        secondary: hexColor(a.secondary, DEF.appearance.secondary),
        background: hexColor(a.background, DEF.appearance.background)
      },
      texts: stringMap(s.texts, 300, 4000),
      images: stringMap(s.images, 100, 500),
      details: sanitizeDetails(s.details)
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

// Exposto para os testes validarem a sanitização sem tocar no Blob.
module.exports.sanitize = sanitize;
