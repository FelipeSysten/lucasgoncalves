const { ADMIN_USER, ADMIN_PASS, safeEq, makeToken } = require('./_utils');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const body = req.body || {};
  const user = typeof body.user === 'string' ? body.user : '';
  const pass = typeof body.pass === 'string' ? body.pass : '';
  if (user && pass && safeEq(user, ADMIN_USER) && safeEq(pass, ADMIN_PASS)) {
    return res.status(200).json({ token: makeToken() });
  }
  return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
};
