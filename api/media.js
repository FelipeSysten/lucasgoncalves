const { authed } = require('./_utils');

// GET    → lista as imagens em uploads/ no Blob (galeria do painel).
// DELETE → exclui um arquivo de uploads/ (body: { url }).
// Ambos exigem sessão de admin.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authed(req)) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  try {
    if (req.method === 'GET') {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(200).json({ files: [], storage: false });
      }
      const { list } = require('@vercel/blob');
      const files = [];
      let cursor;
      do {
        const page = await list({ prefix: 'uploads/', limit: 1000, cursor });
        for (const b of page.blobs) {
          files.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
        }
        cursor = page.cursor;
      } while (cursor);
      files.sort((x, y) => String(y.uploadedAt).localeCompare(String(x.uploadedAt)));
      return res.status(200).json({ files, storage: true });
    }

    if (req.method === 'DELETE') {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({
          error: 'Armazenamento não configurado: no painel da Vercel, abra o projeto → Storage → Create Database → Blob e conecte ao projeto.'
        });
      }
      const url = String((req.body && req.body.url) || '');
      // Só permite excluir dentro de uploads/ — protege o site-content.json.
      if (!/^https:\/\/[^/]+\/uploads\//.test(url)) {
        return res.status(400).json({ error: 'URL inválida: só é possível excluir arquivos de uploads/.' });
      }
      const { del } = require('@vercel/blob');
      await del(url);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
