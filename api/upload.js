const { authed } = require('./_utils');

// Recebe { name, type, data } com a imagem em base64 (o admin já reduz a
// imagem no navegador antes de enviar) e devolve { url } público no Blob.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  if (!authed(req)) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: 'Armazenamento não configurado: no painel da Vercel, abra o projeto → Storage → Create Database → Blob e conecte ao projeto.'
    });
  }
  try {
    const body = req.body || {};
    const type = String(body.type || '');
    if (!/^image\/(png|jpe?g|webp|avif)$/.test(type)) {
      return res.status(400).json({ error: 'Formato inválido: use PNG, JPG ou WebP.' });
    }
    const buf = Buffer.from(String(body.data || ''), 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Imagem vazia.' });
    if (buf.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem maior que 3MB após compressão.' });
    }
    const safe = String(body.name || 'imagem').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 60) || 'imagem';
    const { put } = require('@vercel/blob');
    const blob = await put('uploads/' + Date.now() + '-' + safe, buf, {
      access: 'public',
      contentType: type
    });
    return res.status(200).json({ url: blob.url });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
