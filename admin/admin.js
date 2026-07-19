/* Painel CMS — SPA em JS puro sobre /api/content, /api/upload e /api/media. */
(function () {
'use strict';

var TOKEN_KEY = 'lg_admin_token';
var DEF_APPEAR = { primary: '#C9A227', secondary: '#F3DD8E', background: '#0A0908' };

var content = null;              // { settings, posts } vindo de /api/content
var storageOk = true;            // Blob conectado?
var texCat = [], slotCat = [], detCat = {};
var editingId = null, editorImg = '';

/* ─────────────────────────── utilidades ─────────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

function toast(msg, ok) {
  var t = $('toast');
  t.textContent = msg;
  t.className = (ok ? 'ok' : 'err') + ' show';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.className = ''; }, 4000);
}

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign(
    { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
    opts.headers || {}
  );
  return fetch(path, opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401 && path !== '/api/login') { logout(); throw new Error(j.error || 'Sessão expirada.'); }
      if (!r.ok) throw new Error(j.error || ('Erro ' + r.status));
      return j;
    });
  });
}

function saveContent() {
  return api('/api/content', {
    method: 'POST',
    body: JSON.stringify({ settings: content.settings, posts: content.posts })
  });
}

function busy(btn, on) { if (btn) btn.disabled = !!on; }

/* ─────────────────────────── sessão ─────────────────────────── */
$('login-form').addEventListener('submit', function (ev) {
  ev.preventDefault();
  $('login-status').textContent = '';
  var user = $('login-user').value.trim();
  var pass = $('login-pass').value;
  api('/api/login', { method: 'POST', body: JSON.stringify({ user: user, pass: pass }) })
    .then(function (j) {
      localStorage.setItem(TOKEN_KEY, j.token);
      sessionStorage.setItem('lg_default_login', (user === 'admin' && pass === 'admin') ? '1' : '');
      boot();
    })
    .catch(function (e) { $('login-status').textContent = e.message; });
});

$('btn-logout').addEventListener('click', logout);

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  $('app-view').hidden = true;
  $('login-view').hidden = false;
}

/* ─────────────────────────── boot ─────────────────────────── */
function boot() {
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  Promise.all([
    api('/api/content'),
    fetch('admin/texts-catalog.json').then(function (r) { return r.json(); }),
    fetch('admin/media-slots.json').then(function (r) { return r.json(); }),
    fetch('admin/details-catalog.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    var c = res[0];
    storageOk = c.storage !== false;
    content = {
      settings: Object.assign(
        { whatsapp: '', instagram: '', appearance: {}, texts: {}, images: {}, details: {} },
        c.settings || {}
      ),
      posts: c.posts || []
    };
    ['appearance', 'texts', 'images', 'details'].forEach(function (k) {
      if (!content.settings[k] || typeof content.settings[k] !== 'object') content.settings[k] = {};
    });
    texCat = res[1]; slotCat = res[2]; detCat = res[3];
    renderBanners();
    window.removeEventListener('hashchange', route);
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (e) { toast('Erro ao carregar o painel: ' + e.message, false); });
}

function renderBanners() {
  var b = [];
  if (!storageOk) {
    b.push('⚠️ <strong>Armazenamento não configurado.</strong> No painel da Vercel: projeto → ' +
      '<strong>Storage → Create Database → Blob</strong> → conecte e faça redeploy. Até lá o salvar não funciona.');
  }
  if (sessionStorage.getItem('lg_default_login') === '1') {
    b.push('🔒 Login padrão <strong>admin/admin</strong> em uso. Troque em ' +
      '<strong>Settings → Environment Variables</strong> na Vercel (ADMIN_USER e ADMIN_PASS) e faça redeploy.');
  }
  $('banners').innerHTML = b.map(function (x) { return '<div class="banner">' + x + '</div>'; }).join('');
}

/* ─────────────────────────── roteador ─────────────────────────── */
var ROUTES = {
  '': { title: 'Dashboard', view: viewDashboard },
  'postagens': { title: 'Postagens', view: viewPosts },
  'midia': { title: 'Mídia', view: viewMedia },
  'textos': { title: 'Textos', view: viewTexts },
  'aparencia': { title: 'Aparência', view: viewAppearance },
  'config': { title: 'Configurações', view: viewSettings }
};

function route() {
  if (!content) return;
  var h = location.hash.replace(/^#\/?/, '');
  if (!(h in ROUTES)) h = '';
  document.querySelectorAll('#sidebar nav a').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('data-route') === h);
  });
  $('page-title').textContent = ROUTES[h].title;
  $('topbar-actions').innerHTML = '';
  ROUTES[h].view();
}

/* ─────────────────────────── dashboard ─────────────────────────── */
function viewDashboard() {
  var s = content.settings;
  var custom = Object.keys(s.texts).length + Object.keys(s.details).length;
  var latest = content.posts.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).slice(0, 3);

  $('view').innerHTML =
    '<div class="stat-grid">' +
      '<div class="card stat"><div class="num">' + content.posts.length + '</div><div class="lbl">POSTAGENS</div></div>' +
      '<div class="card stat"><div class="num" id="dash-media">—</div><div class="lbl">IMAGENS NA GALERIA</div></div>' +
      '<div class="card stat"><div class="num">' + custom + '</div><div class="lbl">TEXTOS PERSONALIZADOS</div></div>' +
      '<div class="card stat"><div class="num" style="font-size:20px; padding-top:8px;">' +
        (storageOk ? '<span style="color:#8fce8f;">ATIVO</span>' : '<span style="color:#e08a8a;">PENDENTE</span>') +
      '</div><div class="lbl">ARMAZENAMENTO</div></div>' +
    '</div>' +
    '<div class="quick">' +
      '<a class="btn" href="#/postagens" id="dash-new-post">+ NOVA POSTAGEM</a>' +
      '<a class="btn btn-ghost" href="#/aparencia">🎨 EDITAR CORES</a>' +
      '<a class="btn btn-ghost" href="#/textos">✏️ EDITAR TEXTOS</a>' +
      '<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">VER SITE ↗</a>' +
    '</div>' +
    '<div class="section-gap">' +
      '<div class="view-head"><h2>ÚLTIMAS <span class="gold">POSTAGENS</span></h2></div>' +
      '<div id="dash-posts" style="display:flex; flex-direction:column; gap:10px;">' +
        (latest.length ? latest.map(function (p) {
          var d = new Date(p.date), when = isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
          return '<div class="row-item">' +
            (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<div style="width:52px;height:52px;border-radius:8px;background:#16130d;flex:none;"></div>') +
            '<div class="grow"><div class="t">' + esc(p.title) + '</div><div class="s">' + when + '</div></div>' +
            '<a class="btn btn-ghost btn-sm" href="#/postagens" data-edit-later="' + esc(p.id) + '">EDITAR</a>' +
          '</div>';
        }).join('') : '<div class="hint">Nenhuma postagem ainda.</div>') +
      '</div>' +
    '</div>';

  $('dash-new-post').addEventListener('click', function () { sessionStorage.setItem('lg_open_editor', 'new'); });
  document.querySelectorAll('[data-edit-later]').forEach(function (a) {
    a.addEventListener('click', function () { sessionStorage.setItem('lg_open_editor', a.getAttribute('data-edit-later')); });
  });

  api('/api/media').then(function (j) {
    var n = $('dash-media');
    if (n) n.textContent = j.storage === false ? '—' : String(j.files.length);
  }).catch(function () {});
}

/* ─────────────────────────── postagens ─────────────────────────── */
function viewPosts() {
  $('topbar-actions').innerHTML = '<button class="btn" id="btn-new-post" type="button">+ NOVA POSTAGEM</button>';
  $('view').innerHTML =
    '<div id="post-list" style="display:flex; flex-direction:column; gap:10px;"></div>' +
    '<div id="post-editor" class="card" hidden style="margin-top:20px; padding:22px;">' +
      '<h2 id="editor-title" style="margin:0; font-size:16px;">NOVA POSTAGEM</h2>' +
      '<label for="p-title">TÍTULO *</label><input id="p-title" type="text" maxlength="140">' +
      '<label for="p-kicker">CATEGORIA (opcional)</label><input id="p-kicker" type="text" maxlength="60" placeholder="Ex.: NOVIDADE, RESULTADO, AVISO…">' +
      '<label for="p-text">TEXTO *</label><textarea id="p-text" maxlength="2000"></textarea>' +
      '<label>IMAGEM (opcional)</label>' +
      '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">' +
        '<input id="p-img-file" type="file" accept="image/png,image/jpeg,image/webp" style="color:#9A958B; font-size:13px;">' +
        '<img id="p-img-preview" alt="" hidden style="height:64px; border-radius:8px; border:1px solid rgba(201,162,39,0.3);">' +
        '<button class="btn btn-ghost btn-sm" id="p-img-clear" type="button" hidden>REMOVER</button>' +
      '</div>' +
      '<label for="p-cta">TEXTO DO BOTÃO (opcional)</label><input id="p-cta" type="text" maxlength="60" placeholder="Ex.: QUERO PARTICIPAR">' +
      '<label for="p-msg">MENSAGEM DO WHATSAPP AO CLICAR (opcional)</label><input id="p-msg" type="text" maxlength="300">' +
      '<div style="display:flex; gap:10px; margin-top:20px;">' +
        '<button class="btn" id="btn-save-post" type="button">SALVAR POSTAGEM</button>' +
        '<button class="btn btn-ghost" id="btn-cancel-post" type="button">CANCELAR</button>' +
      '</div>' +
    '</div>';

  renderPostList();
  $('btn-new-post').addEventListener('click', function () { openEditor(null); });
  $('btn-cancel-post').addEventListener('click', function () { $('post-editor').hidden = true; });
  $('p-img-clear').addEventListener('click', function () { editorImg = ''; $('p-img-file').value = ''; updateImgPreview(); });
  $('p-img-file').addEventListener('change', onEditorImage);
  $('btn-save-post').addEventListener('click', savePost);

  var pending = sessionStorage.getItem('lg_open_editor');
  if (pending) {
    sessionStorage.removeItem('lg_open_editor');
    openEditor(pending === 'new' ? null : pending);
  }
}

function renderPostList() {
  var list = $('post-list');
  if (!list) return;
  var posts = content.posts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  if (!posts.length) {
    list.innerHTML = '<div class="hint">Nenhuma postagem ainda. Clique em “+ Nova postagem”.</div>';
    return;
  }
  list.innerHTML = posts.map(function (p) {
    var d = new Date(p.date), when = isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
    return '<div class="row-item">' +
      (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<div style="width:52px;height:52px;border-radius:8px;background:#16130d;flex:none;"></div>') +
      '<div class="grow"><div class="t">' + esc(p.title) + '</div>' +
      '<div class="s">' + esc(p.kicker || '') + (p.kicker && when ? ' • ' : '') + when + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-edit="' + esc(p.id) + '" type="button">EDITAR</button>' +
      '<button class="btn btn-danger btn-sm" data-del="' + esc(p.id) + '" type="button">EXCLUIR</button>' +
    '</div>';
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () { openEditor(b.getAttribute('data-edit')); });
  });
  list.querySelectorAll('[data-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-del');
      var p = content.posts.find(function (x) { return x.id === id; });
      if (!p || !confirm('Excluir a postagem "' + p.title + '"?')) return;
      content.posts = content.posts.filter(function (x) { return x.id !== id; });
      saveContent().then(function () { renderPostList(); toast('Postagem excluída.', true); })
        .catch(function (e) { toast(e.message, false); boot(); });
    });
  });
}

function openEditor(id) {
  editingId = id || null;
  var p = content.posts.find(function (x) { return x.id === id; }) || {};
  $('editor-title').textContent = editingId ? 'EDITAR POSTAGEM' : 'NOVA POSTAGEM';
  $('p-title').value = p.title || '';
  $('p-kicker').value = p.kicker || '';
  $('p-text').value = p.text || '';
  $('p-cta').value = p.cta || '';
  $('p-msg').value = p.msg || '';
  editorImg = p.img || '';
  $('p-img-file').value = '';
  updateImgPreview();
  $('post-editor').hidden = false;
  $('post-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateImgPreview() {
  $('p-img-preview').hidden = !editorImg;
  $('p-img-clear').hidden = !editorImg;
  if (editorImg) $('p-img-preview').src = editorImg;
}

function onEditorImage() {
  var file = this.files && this.files[0];
  if (!file) return;
  toast('Enviando imagem…', true);
  uploadImage(file).then(function (url) {
    editorImg = url;
    updateImgPreview();
    toast('Imagem enviada!', true);
  }).catch(function (e) { toast('Erro no envio: ' + e.message, false); });
}

function savePost() {
  var title = $('p-title').value.trim();
  var text = $('p-text').value.trim();
  if (!title || !text) { toast('Preencha pelo menos o título e o texto.', false); return; }
  var prev = content.posts.find(function (x) { return x.id === editingId; });
  var p = {
    id: editingId || String(Date.now()),
    title: title,
    kicker: $('p-kicker').value.trim(),
    text: text,
    img: editorImg,
    cta: $('p-cta').value.trim(),
    msg: $('p-msg').value.trim(),
    date: prev ? prev.date : new Date().toISOString()
  };
  if (editingId) content.posts = content.posts.map(function (x) { return x.id === editingId ? p : x; });
  else content.posts.push(p);
  busy($('btn-save-post'), true);
  saveContent().then(function () {
    $('post-editor').hidden = true;
    renderPostList();
    toast('Postagem salva!', true);
  }).catch(function (e) { toast(e.message, false); boot(); })
    .then(function () { busy($('btn-save-post'), false); });
}

/* ─────────────────────────── mídia ─────────────────────────── */
function viewMedia() {
  $('view').innerHTML =
    '<div class="view-head"><h2>IMAGENS DO <span class="gold">SITE</span></h2></div>' +
    '<p class="hint" style="margin:-8px 0 14px;">Substitua as fotos que aparecem no site público. “Restaurar” volta para a imagem original.</p>' +
    '<div class="media-grid" id="slot-grid"></div>' +
    '<div class="section-gap view-head"><h2>GALERIA DE <span class="gold">UPLOADS</span></h2>' +
      '<label class="btn" style="cursor:pointer;">ENVIAR IMAGEM<input id="gal-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>' +
    '</div>' +
    '<p class="hint" style="margin:-8px 0 14px;">Imagens hospedadas no Blob (usadas em postagens e substituições).</p>' +
    '<div class="media-grid" id="gal-grid"><div class="hint">Carregando…</div></div>';

  renderSlotGrid();
  $('gal-upload').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    toast('Enviando imagem…', true);
    uploadImage(file).then(function () { toast('Imagem enviada!', true); renderGallery(); })
      .catch(function (e) { toast('Erro no envio: ' + e.message, false); });
  });
  renderGallery();
}

function renderSlotGrid() {
  var grid = $('slot-grid');
  if (!grid) return;
  var over = content.settings.images;
  grid.innerHTML = slotCat.map(function (s) {
    var url = over[s.key] || s.default;
    return '<div class="card media-card">' +
      '<img src="' + esc(url) + '" alt="" loading="lazy">' +
      '<div class="body">' +
        '<div class="t">' + esc(s.label) + '</div>' +
        '<div class="s">' + (over[s.key] ? '<span class="gold">personalizada</span>' : 'padrão') + '</div>' +
        '<div class="acts">' +
          '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">SUBSTITUIR<input type="file" accept="image/png,image/jpeg,image/webp" data-slot-file="' + esc(s.key) + '" hidden></label>' +
          (over[s.key] ? '<button class="btn btn-danger btn-sm" data-slot-reset="' + esc(s.key) + '" type="button">RESTAURAR</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('[data-slot-file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      var key = inp.getAttribute('data-slot-file');
      toast('Enviando imagem…', true);
      uploadImage(file).then(function (url) {
        content.settings.images[key] = url;
        return saveContent();
      }).then(function () { toast('Imagem do site atualizada!', true); renderSlotGrid(); })
        .catch(function (e) { toast(e.message, false); });
    });
  });
  grid.querySelectorAll('[data-slot-reset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-slot-reset');
      delete content.settings.images[key];
      saveContent().then(function () { toast('Imagem restaurada para o padrão.', true); renderSlotGrid(); })
        .catch(function (e) { toast(e.message, false); });
    });
  });
}

function renderGallery() {
  var grid = $('gal-grid');
  if (!grid) return;
  api('/api/media').then(function (j) {
    if (j.storage === false) {
      grid.innerHTML = '<div class="hint">Galeria disponível após conectar o Blob Store na Vercel.</div>';
      return;
    }
    if (!j.files.length) {
      grid.innerHTML = '<div class="hint">Nenhuma imagem enviada ainda.</div>';
      return;
    }
    grid.innerHTML = j.files.map(function (f) {
      var name = f.pathname.replace(/^uploads\//, '').replace(/^\d+-/, '');
      var kb = Math.round((f.size || 0) / 1024);
      return '<div class="card media-card">' +
        '<img src="' + esc(f.url) + '" alt="" loading="lazy">' +
        '<div class="body">' +
          '<div class="t" style="word-break:break-all;">' + esc(name) + '</div>' +
          '<div class="s">' + kb + ' KB</div>' +
          '<div class="acts">' +
            '<button class="btn btn-ghost btn-sm" data-copy="' + esc(f.url) + '" type="button">COPIAR URL</button>' +
            '<button class="btn btn-danger btn-sm" data-del-file="' + esc(f.url) + '" type="button">EXCLUIR</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    grid.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        navigator.clipboard.writeText(b.getAttribute('data-copy'))
          .then(function () { toast('URL copiada!', true); })
          .catch(function () { toast('Não foi possível copiar.', false); });
      });
    });
    grid.querySelectorAll('[data-del-file]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Excluir esta imagem do armazenamento? Onde ela estiver em uso, vai quebrar.')) return;
        api('/api/media', { method: 'DELETE', body: JSON.stringify({ url: b.getAttribute('data-del-file') }) })
          .then(function () { toast('Imagem excluída.', true); renderGallery(); })
          .catch(function (e) { toast(e.message, false); });
      });
    });
  }).catch(function (e) { grid.innerHTML = '<div class="hint">Erro ao listar: ' + esc(e.message) + '</div>'; });
}

/* ─────────────────────────── textos ─────────────────────────── */
function viewTexts() {
  $('topbar-actions').innerHTML = '<button class="btn" id="btn-save-texts" type="button">SALVAR TEXTOS</button>';

  var groups = {};
  texCat.forEach(function (f) { (groups[f.group] = groups[f.group] || []).push(f); });

  var htmlOut = '<p class="hint" style="margin:0 0 16px;">Campos vazios usam o texto original do site (mostrado como dica). O botão ↺ restaura o padrão do campo.</p>';
  Object.keys(groups).forEach(function (g, gi) {
    var fields = groups[g];
    var customized = fields.filter(function (f) { return content.settings.texts[f.key]; }).length;
    htmlOut += '<details class="group"' + (gi === 0 ? ' open' : '') + '>' +
      '<summary>' + esc(g.toUpperCase()) + '<span class="n">' + fields.length + ' campos' + (customized ? ' • ' + customized + ' personalizados' : '') + '</span></summary>' +
      '<div class="fields">' +
      fields.map(function (f) {
        var v = content.settings.texts[f.key] || '';
        var long = (f.default || '').length > 70;
        var ctrl = long
          ? '<textarea data-text-key="' + esc(f.key) + '" placeholder="' + esc(f.default) + '">' + esc(v) + '</textarea>'
          : '<input type="text" data-text-key="' + esc(f.key) + '" placeholder="' + esc(f.default) + '" value="' + esc(v) + '">';
        return '<div class="field-row"><div><label>' + esc(f.label.toUpperCase()) + '</label>' + ctrl + '</div>' +
          '<button class="reset-btn" data-text-reset="' + esc(f.key) + '" type="button" title="Restaurar padrão">↺</button></div>';
      }).join('') +
      '</div></details>';
  });

  // modais de detalhe (serviços, programas, oferta, contato…)
  htmlOut += '<div class="section-gap view-head"><h2>MODAIS DE <span class="gold">DETALHE</span></h2></div>' +
    '<p class="hint" style="margin:-8px 0 14px;">Conteúdo das telas que abrem ao clicar em serviços, programas e oferta — inclusive a mensagem enviada no WhatsApp.</p>';
  Object.keys(detCat).forEach(function (id) {
    var def = detCat[id];
    var ov = content.settings.details[id] || {};
    var customized = Object.keys(ov).length;
    function fld(label, field, long) {
      var v = ov[field] || '';
      var ph = esc(def[field] || '');
      var ctrl = long
        ? '<textarea data-det="' + id + ':' + field + '" placeholder="' + ph + '">' + esc(v) + '</textarea>'
        : '<input type="text" data-det="' + id + ':' + field + '" placeholder="' + ph + '" value="' + esc(v) + '">';
      return '<label>' + label + '</label>' + ctrl;
    }
    var pointsV = Array.isArray(ov.points) ? ov.points.join('\n') : '';
    htmlOut += '<details class="group">' +
      '<summary>' + esc(def.title) + '<span class="n">' + (customized ? 'personalizado' : 'padrão') + '</span></summary>' +
      '<div class="fields">' +
        fld('TÍTULO', 'title') + fld('SELO (KICKER)', 'kicker') + fld('DESCRIÇÃO', 'desc', true) +
        '<label>LISTA “O QUE ESTÁ INCLUSO” (um item por linha)</label>' +
        '<textarea data-det="' + id + ':points" placeholder="' + esc((def.points || []).join('\n')) + '">' + esc(pointsV) + '</textarea>' +
        fld('TEXTO DO BOTÃO', 'cta') + fld('FRASE ACIMA DO BOTÃO', 'ctaNote') +
        fld('MENSAGEM DO WHATSAPP', 'msg', true) +
        '<div style="margin-top:14px;"><button class="btn btn-danger btn-sm" data-det-reset="' + id + '" type="button">RESTAURAR PADRÃO DESTE MODAL</button></div>' +
      '</div></details>';
  });

  $('view').innerHTML = htmlOut;

  document.querySelectorAll('[data-text-reset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = document.querySelector('[data-text-key="' + b.getAttribute('data-text-reset') + '"]');
      if (el) el.value = '';
    });
  });
  document.querySelectorAll('[data-det-reset]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-det^="' + b.getAttribute('data-det-reset') + ':"]').forEach(function (el) { el.value = ''; });
    });
  });
  $('btn-save-texts').addEventListener('click', saveTexts);
}

function saveTexts() {
  var texts = {};
  document.querySelectorAll('[data-text-key]').forEach(function (el) {
    var key = el.getAttribute('data-text-key');
    var def = (texCat.find(function (f) { return f.key === key; }) || {}).default || '';
    var v = el.value.trim();
    if (v && v !== def) texts[key] = v;
  });
  var details = {};
  document.querySelectorAll('[data-det]').forEach(function (el) {
    var kv = el.getAttribute('data-det').split(':');
    var id = kv[0], field = kv[1];
    var def = detCat[id] || {};
    var v = el.value.trim();
    if (!v) return;
    if (field === 'points') {
      var arr = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (arr.join('\n') !== (def.points || []).join('\n')) (details[id] = details[id] || {}).points = arr;
    } else if (v !== (def[field] || '')) {
      (details[id] = details[id] || {})[field] = v;
    }
  });
  content.settings.texts = texts;
  content.settings.details = details;
  busy($('btn-save-texts'), true);
  saveContent().then(function () { toast('Textos salvos! O site já está atualizado.', true); })
    .catch(function (e) { toast(e.message, false); })
    .then(function () { busy($('btn-save-texts'), false); });
}

/* ─────────────────────────── aparência ─────────────────────────── */
function viewAppearance() {
  var ap = Object.assign({}, DEF_APPEAR, content.settings.appearance || {});
  function colorRow(id, label, val, hintTxt) {
    return '<label>' + label + '</label>' +
      '<div class="color-row">' +
        '<input type="color" id="' + id + '" value="' + esc(val) + '">' +
        '<input type="text" id="' + id + '-hex" value="' + esc(val) + '" maxlength="7" spellcheck="false">' +
        '<span class="hint" style="margin:0;">' + hintTxt + '</span>' +
      '</div>';
  }
  $('view').innerHTML =
    '<div class="appear-grid">' +
      '<div class="card" style="padding:22px;">' +
        '<h2 style="margin:0; font-size:16px;">CORES DO <span class="gold">TEMA</span></h2>' +
        colorRow('ap-primary', 'COR PRIMÁRIA', ap.primary || DEF_APPEAR.primary, 'Botões, destaques e detalhes (padrão: dourado).') +
        colorRow('ap-secondary', 'COR SECUNDÁRIA', ap.secondary || DEF_APPEAR.secondary, 'Tom claro dos gradientes de título.') +
        colorRow('ap-background', 'COR DE FUNDO', ap.background || DEF_APPEAR.background, 'Fundo do site; os tons dos cards acompanham.') +
        '<div style="display:flex; gap:10px; margin-top:24px; flex-wrap:wrap;">' +
          '<button class="btn" id="btn-save-appear" type="button">SALVAR CORES</button>' +
          '<button class="btn btn-ghost" id="btn-reset-appear" type="button">RESTAURAR PADRÃO</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:14px;">A prévia ao lado atualiza em tempo real. Derivados (dourado escuro, tons dos cards) são calculados automaticamente.</p>' +
      '</div>' +
      '<div>' +
        '<div class="hint" style="margin:0 0 8px;">PRÉVIA AO VIVO (layout de celular)</div>' +
        '<iframe id="appearance-preview" src="index.html" title="Prévia do site"></iframe>' +
      '</div>' +
    '</div>';

  function current() {
    return {
      primary: $('ap-primary').value,
      secondary: $('ap-secondary').value,
      background: $('ap-background').value
    };
  }
  function preview() {
    var f = $('appearance-preview');
    try { if (f.contentWindow && f.contentWindow.applyAppearance) f.contentWindow.applyAppearance(current()); } catch (e) {}
  }
  ['ap-primary', 'ap-secondary', 'ap-background'].forEach(function (id) {
    var pick = $(id), hex = $(id + '-hex');
    pick.addEventListener('input', function () { hex.value = pick.value.toUpperCase(); preview(); });
    hex.addEventListener('input', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) { pick.value = hex.value.trim(); preview(); }
    });
  });
  $('appearance-preview').addEventListener('load', preview);
  $('btn-reset-appear').addEventListener('click', function () {
    [['ap-primary', DEF_APPEAR.primary], ['ap-secondary', DEF_APPEAR.secondary], ['ap-background', DEF_APPEAR.background]]
      .forEach(function (pair) { $(pair[0]).value = pair[1]; $(pair[0] + '-hex').value = pair[1]; });
    preview();
  });
  $('btn-save-appear').addEventListener('click', function () {
    content.settings.appearance = current();
    busy($('btn-save-appear'), true);
    saveContent().then(function () { toast('Cores salvas! O site já está com o novo tema.', true); })
      .catch(function (e) { toast(e.message, false); })
      .then(function () { busy($('btn-save-appear'), false); });
  });
}

/* ─────────────────────────── configurações ─────────────────────────── */
function viewSettings() {
  var s = content.settings;
  $('view').innerHTML =
    '<div class="card" style="padding:22px; max-width:560px;">' +
      '<h2 style="margin:0; font-size:16px;">MECANISMO DO <span class="gold">SITE</span></h2>' +
      '<label for="s-whatsapp">NÚMERO DO WHATSAPP</label>' +
      '<input id="s-whatsapp" type="text" value="' + esc(s.whatsapp || '') + '" placeholder="5573981132052">' +
      '<div class="hint">Somente dígitos: país (55) + DDD + número. Vale para todos os botões do site.</div>' +
      '<label for="s-instagram">USUÁRIO DO INSTAGRAM</label>' +
      '<input id="s-instagram" type="text" value="' + esc(s.instagram || '') + '" placeholder="llucas_goncalves">' +
      '<div class="hint">Sem o @. Os botões e o @ exibido no site seguem este valor.</div>' +
      '<button class="btn" id="btn-save-settings" type="button" style="margin-top:22px;">SALVAR CONFIGURAÇÕES</button>' +
    '</div>';

  $('btn-save-settings').addEventListener('click', function () {
    var wa = $('s-whatsapp').value.replace(/\D/g, '');
    if (wa.length < 12) { toast('Número inválido: use país + DDD + número (ex.: 5573981132052).', false); return; }
    content.settings.whatsapp = wa;
    content.settings.instagram = $('s-instagram').value.replace(/^@/, '').trim();
    busy($('btn-save-settings'), true);
    saveContent().then(function () { toast('Configurações salvas!', true); })
      .catch(function (e) { toast(e.message, false); })
      .then(function () { busy($('btn-save-settings'), false); });
  });
}

/* ─────────────────────────── upload compartilhado ─────────────────────────── */
function uploadImage(file) {
  return createImageBitmap(file).then(function (bmp) {
    var MAX = 1600;
    var scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Falha ao processar a imagem.'));
        var fr = new FileReader();
        fr.onload = function () {
          api('/api/upload', {
            method: 'POST',
            body: JSON.stringify({ name: file.name, type: blob.type, data: String(fr.result).split(',')[1] })
          }).then(function (j) { resolve(j.url); }, reject);
        };
        fr.onerror = function () { reject(new Error('Falha ao ler a imagem.')); };
        fr.readAsDataURL(blob);
      }, 'image/webp', 0.85);
    });
  });
}

/* ─────────────────────────── início ─────────────────────────── */
if (token()) boot();
})();
