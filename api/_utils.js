// Utilidades compartilhadas das funções /api (o prefixo "_" impede que a
// Vercel exponha este arquivo como endpoint).
const crypto = require('crypto');

// Credenciais do painel admin. Padrão: admin / admin.
// Em produção, defina ADMIN_USER e ADMIN_PASS nas Environment Variables
// do projeto na Vercel para trocar sem mexer no código.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const SECRET = process.env.SESSION_SECRET || 'lg-session::' + ADMIN_USER + '::' + ADMIN_PASS;

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // sessão de 12h

function hmac(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

// Comparação em tempo constante (hash primeiro para igualar tamanhos).
function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken() {
  const payload = String(Date.now() + TOKEN_TTL_MS);
  return payload + '.' + hmac(payload);
}

function checkToken(token) {
  const i = String(token || '').indexOf('.');
  if (i < 1) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(payload)))) return false;
  } catch (e) {
    return false;
  }
  return Number(payload) > Date.now();
}

function authed(req) {
  const h = req.headers['authorization'] || '';
  return checkToken(h.replace(/^Bearer\s+/i, ''));
}

// Conteúdo padrão usado enquanto nada foi salvo (e como fallback do site).
const DEFAULT_CONTENT = {
  settings: {
    whatsapp: '5573981132052',
    instagram: 'lucasgoncalves.personal'
  },
  posts: []
};

module.exports = { ADMIN_USER, ADMIN_PASS, safeEq, makeToken, authed, DEFAULT_CONTENT };
