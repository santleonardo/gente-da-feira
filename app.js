// ============================================================
// app.js — Lógica principal do Gente da Feira
// Conecta a UI do index.html com o Supabase
// ============================================================

import {
  supabase,
  getUsuarioAtual,
  loginEmail,
  cadastrar,
  logout,
  listarBairros,
  buscarPosts,
  criarPost,
  buscarPerfil,
  buscarNotificacoes,
  contarNaoLidas,
  marcarLida,
  escutarNovosPosts
} from './supabase.js';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  usuario: null,
  perfil: null,
  bairroAtual: null, // objeto { id, nome, slug }
  bairros: [],
  categorias: [],
  filtroAtivo: 'todos',
  paginaAtual: 0,
  posts: [],
  carregandoMais: false,
  unsubscribeRealtime: null,
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function init() {
  try {
    // Verificar autenticação
    await verificarAuth();

    // Carregar bairros e definir bairro inicial
    await carregarBairros();

    // Configurar event listeners
    setupEventListeners();

    // Configurar escuta de autenticação (mudanças de login/logout)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        await verificarAuth();
        renderizarBadgeNotificacoes();
      } else if (event === 'SIGNED_OUT') {
        Estado.usuario = null;
        Estado.perfil = null;
        renderizarAvatarHeader();
      }
    });

    // Carregar feed inicial
    await carregarFeed(true);

    // Iniciar escuta de novos posts em tempo real
    iniciarRealtime();

    console.log('🚀 Gente da Feira inicializado!');
  } catch (err) {
    console.error('Erro na inicialização:', err);
    mostrarToast('Erro ao carregar o app. Tente novamente.', 'erro');
  }
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
async function verificarAuth() {
  Estado.usuario = await getUsuarioAtual();
  if (Estado.usuario) {
    Estado.perfil = await buscarPerfil(Estado.usuario.id);
    renderizarAvatarHeader();
    renderizarBadgeNotificacoes();
    atualizarBadgesGrid(); // Atualiza contadores do grid 2x2
  } else {
    renderizarAvatarHeader();
  }
}

function renderizarAvatarHeader() {
  const avatarEl = document.getElementById('avatar-iniciais');
  const btnPerfil = document.getElementById('btn-perfil');

  if (Estado.usuario && Estado.perfil) {
    const nome = Estado.perfil.nome || Estado.usuario.email || '?';
    const iniciais = nome
      .split(' ')
      .map(p => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    if (avatarEl) avatarEl.textContent = iniciais;
    if (btnPerfil) btnPerfil.title = 'Meu perfil / Sair';
  } else {
    if (avatarEl) avatarEl.textContent = '👤';
    if (btnPerfil) btnPerfil.title = 'Fazer login';
  }
}

// ============================================================
// BAIRROS
// ============================================================
async function carregarBairros() {
  Estado.bairros = await listarBairros();

  // Tentar recuperar bairro salvo no localStorage
  const slugSalvo = localStorage.getItem('gdf_bairro_slug');
  const bairroSalvo = Estado.bairros.find(b => b.slug === slugSalvo);

  // Padrão: Mangabeira, ou o primeiro da lista
  Estado.bairroAtual =
    bairroSalvo ||
    Estado.bairros.find(b => b.slug === 'mangabeira') ||
    Estado.bairros[0];

  atualizarBairroUI();
}

function atualizarBairroUI() {
  if (!Estado.bairroAtual) return;
  const el = document.getElementById('bairro-atual');
  if (el) el.textContent = Estado.bairroAtual.nome;

  const busca = document.getElementById('busca-intencao');
  if (busca) busca.placeholder = `O que você precisa na ${Estado.bairroAtual.nome} agora?`;
}

function abrirModalBairro() {
  // Remove modal anterior se existir
  document.getElementById('modal-bairro')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-bairro';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-bairro"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-slate-900">Escolha seu bairro</h2>
        <button id="fechar-modal-bairro" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-2" id="lista-bairros-modal">
        ${Estado.bairros
          .map(
            b => `
          <button 
            data-slug="${b.slug}" 
            data-id="${b.id}"
            data-nome="${b.nome}"
            class="bairro-opcao p-3 text-sm font-medium text-left rounded-xl border-2 transition-all
              ${Estado.bairroAtual?.slug === b.slug
                ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                : 'border-gray-200 hover:border-yellow-400 text-slate-700'
              }">
            ${b.nome}
          </button>`
          )
          .join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Fechar ao clicar no overlay ou no X
  modal.querySelector('#overlay-bairro').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-modal-bairro').addEventListener('click', () => modal.remove());

  // Selecionar bairro
  modal.querySelectorAll('.bairro-opcao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { slug, id, nome } = btn.dataset;
      Estado.bairroAtual = { slug, id, nome };
      localStorage.setItem('gdf_bairro_slug', slug);
      atualizarBairroUI();
      modal.remove();

      // Reiniciar realtime com novo bairro
      if (Estado.unsubscribeRealtime) Estado.unsubscribeRealtime();
      iniciarRealtime();

      await carregarFeed(true);
      mostrarToast(`Bairro alterado para ${nome} 📍`);
    });
  });
}

// ============================================================
// FEED DE POSTS
// ============================================================
async function carregarFeed(reiniciar = false) {
  if (reiniciar) {
    Estado.paginaAtual = 0;
    Estado.posts = [];
    limparFeed();
    mostrarSkeletonFeed();
  }

  try {
    const novos = await buscarPosts({
      bairroSlug: Estado.bairroAtual?.slug,
      categoriaSlug: Estado.filtroAtivo,
      limite: 10,
      pagina: Estado.paginaAtual,
    });

    Estado.posts = [...Estado.posts, ...novos];
    esconderSkeletonFeed();
    renderizarPosts(novos, reiniciar);

    // Esconder "carregar mais" se não há mais resultados
    const btnMais = document.getElementById('btn-carregar-mais');
    if (btnMais) {
      btnMais.style.display = novos.length < 10 ? 'none' : 'block';
    }
  } catch (err) {
    console.error('Erro ao carregar feed:', err);
    esconderSkeletonFeed();
    mostrarErroFeed();
  }
}

function renderizarPosts(posts, limpar = false) {
  const container = document.getElementById('lista-feed');
  if (!container) return;

  if (limpar) {
    // CORREÇÃO: preserva skeleton e botão ao limpar
    const skeleton = document.getElementById('skeleton-loader');
    const btnMais = document.getElementById('btn-carregar-mais');
    container.innerHTML = '';
    if (skeleton) container.appendChild(skeleton);
    if (btnMais) container.appendChild(btnMais);
  }

  if (posts.length === 0 && Estado.posts.length === 0) {
    const vazio = document.createElement('div');
    vazio.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <div class="text-5xl mb-4">🔍</div>
        <p class="font-medium">Nenhum resultado encontrado</p>
        <p class="text-sm mt-1">Tente outro filtro ou bairro</p>
      </div>`;
    container.insertBefore(vazio, document.getElementById('skeleton-loader'));
    return;
  }

  posts.forEach(post => {
    container.insertBefore(criarCardPost(post), document.getElementById('skeleton-loader'));
  });
}

function criarCardPost(post) {
  const artigo = document.createElement('article');
  artigo.className = 'bg-white rounded-2xl shadow-sm overflow-hidden smooth-enter border border-gray-100';
  artigo.dataset.postId = post.id;

  const nomeAutor = post.autor?.nome || 'Anônimo';
  const iniciais = nomeAutor.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const cor = post.categoria?.cor || '#F59E0B';
  const icone = post.categoria?.icone || '💬';
  const tempoAtras = formatarTempo(post.criado_em);
  const preco = post.preco_a_partir
    ? `<span class="font-semibold text-green-600">A partir de R$ ${Number(post.preco_a_partir).toFixed(2).replace('.', ',')}</span>`
    : '';
  const tags = (post.tags || [])
    .map(t => `<span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">${t}</span>`)
    .join('');

  const botaoContato = post.contato_whatsapp
    ? `<a href="https://wa.me/55${post.contato_whatsapp.replace(/\D/g, '')}?text=Oi%2C%20vi%20seu%20post%20no%20Gente%20da%20Feira!"
          target="_blank" rel="noopener"
          class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          <span>WhatsApp</span>
        </a>`
    : `<button class="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-xl">Ver mais</button>`;

  artigo.innerHTML = `
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-sm"
               style="background: ${cor}">
            ${iniciais}
          </div>
          <div>
            <p class="font-semibold text-slate-900 text-sm">${nomeAutor}</p>
            <p class="text-xs text-gray-500">${post.bairro?.nome || ''} • ${tempoAtras}</p>
          </div>
        </div>
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
              style="background:${cor}20; color:${cor}">
          ${icone} ${post.categoria?.nome || ''}
        </span>
      </div>

      <h3 class="font-bold text-slate-900 mb-1">${post.titulo}</h3>
      <p class="text-sm text-gray-700 mb-3">${post.descricao}</p>

      ${preco ? `<div class="mb-2">${preco} • <span class="text-gray-600 text-sm">Atende hoje</span></div>` : ''}
      ${tags ? `<div class="flex flex-wrap gap-2 mb-3">${tags}</div>` : ''}
    </div>

    <div class="px-4 pb-4 flex gap-2">
      <button class="btn-ver-perfil flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-3 px-4 rounded-xl transition-all"
              data-autor-id="${post.autor?.id}">
        Ver Perfil
      </button>
      ${botaoContato}
    </div>
  `;

  // Registrar visualização ao montar o card
  registrarVisualizacaoPost(post.id);

  return artigo;
}

async function registrarVisualizacaoPost(postId) {
  try {
    await supabase.rpc('incrementar_visualizacoes', { post_id: postId });
  } catch (_) {
    // Silencioso — não crítico
  }
}

function limparFeed() {
  const container = document.getElementById('lista-feed');
  if (!container) return;
  // Mantém o skeleton-loader e btn-carregar-mais no DOM
  const filhos = [...container.children];
  filhos.forEach(el => {
    if (!['skeleton-loader', 'btn-carregar-mais'].includes(el.id)) {
      el.remove();
    }
  });
}

function mostrarSkeletonFeed() {
  document.getElementById('skeleton-loader')?.classList.remove('hidden');
}

function esconderSkeletonFeed() {
  document.getElementById('skeleton-loader')?.classList.add('hidden');
}

function mostrarErroFeed() {
  const container = document.getElementById('lista-feed');
  if (!container) return;

  // CORREÇÃO: preserva skeleton e botão ao mostrar erro
  const skeleton = document.getElementById('skeleton-loader');
  const btnMais = document.getElementById('btn-carregar-mais');
  container.innerHTML = '';

  const erro = document.createElement('div');
  erro.innerHTML = `
    <div class="text-center py-12 text-gray-500">
      <div class="text-5xl mb-4">⚠️</div>
      <p class="font-medium">Erro ao carregar o feed</p>
      <button id="btn-tentar-novamente" class="mt-3 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold">
        Tentar novamente
      </button>
    </div>`;
  container.appendChild(erro);

  if (skeleton) container.appendChild(skeleton);
  if (btnMais) container.appendChild(btnMais);

  document.getElementById('btn-tentar-novamente')?.addEventListener('click', () => carregarFeed(true));
}

// ============================================================
// BUSCA
// ============================================================
let timeoutBusca = null;

function handleBusca(query) {
  clearTimeout(timeoutBusca);
  const container = document.getElementById('sugestoes-rapidas');
  const lista = document.getElementById('lista-sugestoes');

  if (!query || query.length < 2) {
    container?.classList.add('hidden');
    return;
  }

  container?.classList.remove('hidden');
  if (lista) lista.innerHTML = '<div class="p-3 text-sm text-gray-500">Buscando...</div>';

  timeoutBusca = setTimeout(async () => {
    try {
      const resultados = await buscarPosts({
        bairroSlug: Estado.bairroAtual?.slug,
        busca: query,
        limite: 5,
      });

      if (!lista) return;

      if (resultados.length === 0) {
        lista.innerHTML = '<div class="p-3 text-sm text-gray-500">Nenhum resultado encontrado</div>';
        return;
      }

      lista.innerHTML = resultados.map(p => `
        <button class="sugestao-item w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left transition-colors"
                data-post-id="${p.id}">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
               style="background:${p.categoria?.cor || '#F59E0B'}20">
            ${p.categoria?.icone || '💬'}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-900 text-sm truncate">${p.titulo}</div>
            <div class="text-xs text-gray-500">${p.categoria?.nome || ''} • ${p.bairro?.nome || ''}</div>
          </div>
        </button>
      `).join('');

      // Clicar em sugestão fecha dropdown e rola até o post
      lista.querySelectorAll('.sugestao-item').forEach(btn => {
        btn.addEventListener('click', () => {
          container?.classList.add('hidden');
          const postEl = document.querySelector(`[data-post-id="${btn.dataset.postId}"]`);
          postEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    } catch (err) {
      console.error('Erro na busca:', err);
      if (lista) lista.innerHTML = '<div class="p-3 text-sm text-red-500">Erro na busca</div>';
    }
  }, 400);
}

// ============================================================
// MODAL PUBLICAR
// ============================================================
async function abrirModalPublicar() {
  if (!Estado.usuario) {
    abrirModalLogin('Para publicar, faça login primeiro.');
    return;
  }

  document.getElementById('modal-publicar')?.remove();

  // Buscar categorias do Supabase
  let categorias = [];
  try {
    const { data } = await supabase.from('categorias').select('*').order('nome');
    categorias = data || [];
  } catch (_) {}

  const modal = document.createElement('div');
  modal.id = 'modal-publicar';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-publicar"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Nova Publicação</h2>
        <button id="fechar-modal-publicar" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <div class="space-y-4" id="form-publicar">
        <!-- Categoria -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Categoria *</label>
          <div class="grid grid-cols-3 gap-2" id="seletor-categoria">
            ${categorias.map(c => `
              <button type="button" data-id="${c.id}" data-slug="${c.slug}"
                class="cat-btn border-2 border-gray-200 rounded-xl p-2 text-center text-sm hover:border-yellow-400 transition-all">
                <div class="text-xl mb-1">${c.icone}</div>
                <div class="font-medium text-xs">${c.nome}</div>
              </button>`).join('')}
          </div>
          <input type="hidden" id="input-categoria-id">
        </div>

        <!-- Título -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Título *</label>
          <input type="text" id="input-titulo"
            placeholder="Ex: Eletricista disponível hoje"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <!-- Descrição -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Descrição *</label>
          <textarea id="input-descricao" rows="3"
            placeholder="Descreva o que você oferece ou precisa..."
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"></textarea>
        </div>

        <!-- Preço (opcional) -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Preço a partir de (opcional)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
            <input type="number" id="input-preco" min="0" step="0.01"
              placeholder="80,00"
              class="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
          </div>
        </div>

        <!-- WhatsApp (opcional) -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">WhatsApp para contato (opcional)</label>
          <input type="tel" id="input-whatsapp"
            placeholder="75 9 9999-0000"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <!-- Erro -->
        <div id="erro-publicar" class="hidden text-sm text-red-600 bg-red-50 p-3 rounded-xl"></div>

        <!-- Botão publicar -->
        <button id="btn-confirmar-publicar"
          class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95 hover:shadow-lg">
          Publicar agora ✨
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Fechar
  modal.querySelector('#overlay-publicar').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-modal-publicar').addEventListener('click', () => modal.remove());

  // Selecionar categoria
  modal.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('border-yellow-500', 'bg-yellow-50'));
      btn.classList.add('border-yellow-500', 'bg-yellow-50');
      document.getElementById('input-categoria-id').value = btn.dataset.id;
    });
  });

  // Publicar
  modal.querySelector('#btn-confirmar-publicar').addEventListener('click', async () => {
    const erroEl = document.getElementById('erro-publicar');
    erroEl.classList.add('hidden');

    const categoriaId = document.getElementById('input-categoria-id').value;
    const titulo = document.getElementById('input-titulo').value.trim();
    const descricao = document.getElementById('input-descricao').value.trim();
    const preco = document.getElementById('input-preco').value;
    const whatsapp = document.getElementById('input-whatsapp').value.trim();

    if (!categoriaId) { mostrarErroModal(erroEl, 'Selecione uma categoria'); return; }
    if (!titulo) { mostrarErroModal(erroEl, 'Preencha o título'); return; }
    if (!descricao) { mostrarErroModal(erroEl, 'Preencha a descrição'); return; }
    if (!Estado.bairroAtual?.id) { mostrarErroModal(erroEl, 'Selecione um bairro primeiro'); return; }

    const btnPublicar = document.getElementById('btn-confirmar-publicar');
    btnPublicar.textContent = 'Publicando...';
    btnPublicar.disabled = true;

    try {
      await criarPost({
        titulo,
        descricao,
        categoriaId,
        bairroId: Estado.bairroAtual.id,
        precoAPartir: preco ? parseFloat(preco) : null,
        contatoWhatsapp: whatsapp || null,
      });

      modal.remove();
      mostrarToast('Publicação criada com sucesso! 🎉');
      await carregarFeed(true);
    } catch (err) {
      mostrarErroModal(erroEl, err.message || 'Erro ao publicar. Tente novamente.');
      btnPublicar.textContent = 'Publicar agora ✨';
      btnPublicar.disabled = false;
    }
  });
}

function mostrarErroModal(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ============================================================
// MODAL LOGIN / CADASTRO
// ============================================================
function abrirModalLogin(mensagem = '') {
  document.getElementById('modal-auth')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-auth';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-auth"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Entrar / Cadastrar</h2>
        <button id="fechar-auth" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      ${mensagem ? `<p class="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-xl mb-4">${mensagem}</p>` : ''}

      <!-- Tabs Login / Cadastro -->
      <div class="flex bg-gray-100 rounded-xl p-1 mb-5">
        <button id="tab-login" class="auth-tab flex-1 py-2 rounded-lg font-semibold text-sm bg-white shadow text-slate-900">
          Entrar
        </button>
        <button id="tab-cadastro" class="auth-tab flex-1 py-2 rounded-lg font-semibold text-sm text-gray-500">
          Cadastrar
        </button>
      </div>

      <!-- Form Login -->
      <div id="form-login" class="space-y-3">
        <input type="email" id="auth-email" placeholder="Seu e-mail"
          class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        <input type="password" id="auth-senha" placeholder="Senha"
          class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        <div id="campo-nome" class="hidden">
          <input type="text" id="auth-nome" placeholder="Seu nome completo"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>
        <div id="erro-auth" class="hidden text-sm text-red-600 bg-red-50 p-3 rounded-xl"></div>
        <button id="btn-auth-confirmar"
          class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95">
          Entrar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-auth').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-auth').addEventListener('click', () => modal.remove());

  let modoAtual = 'login';

  const switchTab = (modo) => {
    modoAtual = modo;
    const isLogin = modo === 'login';
    document.getElementById('tab-login').className = `auth-tab flex-1 py-2 rounded-lg font-semibold text-sm ${isLogin ? 'bg-white shadow text-slate-900' : 'text-gray-500'}`;
    document.getElementById('tab-cadastro').className = `auth-tab flex-1 py-2 rounded-lg font-semibold text-sm ${!isLogin ? 'bg-white shadow text-slate-900' : 'text-gray-500'}`;
    document.getElementById('campo-nome').classList.toggle('hidden', isLogin);
    document.getElementById('btn-auth-confirmar').textContent = isLogin ? 'Entrar' : 'Cadastrar';
    document.getElementById('erro-auth').classList.add('hidden');
  };

  modal.querySelector('#tab-login').addEventListener('click', () => switchTab('login'));
  modal.querySelector('#tab-cadastro').addEventListener('click', () => switchTab('cadastro'));

  modal.querySelector('#btn-auth-confirmar').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const senha = document.getElementById('auth-senha').value;
    const nome = document.getElementById('auth-nome')?.value.trim();
    const erroEl = document.getElementById('erro-auth');
    const btnConfirmar = document.getElementById('btn-auth-confirmar');

    erroEl.classList.add('hidden');

    if (!email || !senha) {
      erroEl.textContent = 'Preencha e-mail e senha';
      erroEl.classList.remove('hidden');
      return;
    }

    btnConfirmar.textContent = modoAtual === 'login' ? 'Entrando...' : 'Cadastrando...';
    btnConfirmar.disabled = true;

    try {
      if (modoAtual === 'login') {
        await loginEmail(email, senha);
      } else {
        await cadastrar(email, senha, nome || email);
      }
      modal.remove();
      await verificarAuth();
      mostrarToast(modoAtual === 'login' ? 'Bem-vindo(a) de volta! 👋' : 'Conta criada com sucesso! 🎉');
    } catch (err) {
      let msg = err.message || 'Erro desconhecido';
      if (msg.includes('Invalid login')) msg = 'E-mail ou senha incorretos';
      if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado';
      if (msg.includes('Password should')) msg = 'A senha deve ter pelo menos 6 caracteres';
      erroEl.textContent = msg;
      erroEl.classList.remove('hidden');
      btnConfirmar.textContent = modoAtual === 'login' ? 'Entrar' : 'Cadastrar';
      btnConfirmar.disabled = false;
    }
  });
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
async function renderizarBadgeNotificacoes() {
  try {
    const count = await contarNaoLidas();
    const badge = document.getElementById('badge-notif');
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (_) {}
}

async function abrirPainelNotificacoes() {
  if (!Estado.usuario) {
    abrirModalLogin('Faça login para ver suas notificações.');
    return;
  }

  document.getElementById('painel-notif')?.remove();

  let notifs = [];
  try {
    notifs = await buscarNotificacoes();
  } catch (_) {}

  const painel = document.createElement('div');
  painel.id = 'painel-notif';
  painel.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  painel.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-notif"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-slate-900">Notificações</h2>
        <button id="fechar-notif" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>
      ${notifs.length === 0
        ? '<div class="text-center py-10 text-gray-500"><div class="text-4xl mb-3">🔔</div><p>Nenhuma notificação</p></div>'
        : notifs.map(n => `
          <div class="notif-item flex gap-3 p-3 rounded-xl mb-2 cursor-pointer ${n.lida ? 'bg-gray-50' : 'bg-yellow-50'}"
               data-id="${n.id}">
            <div class="w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.lida ? 'bg-gray-300' : 'bg-yellow-500'}"></div>
            <div>
              <p class="font-semibold text-sm text-slate-900">${n.titulo}</p>
              <p class="text-sm text-gray-600">${n.mensagem}</p>
              <p class="text-xs text-gray-400 mt-1">${formatarTempo(n.criado_em)}</p>
            </div>
          </div>`).join('')
      }
    </div>
  `;

  document.body.appendChild(painel);
  painel.querySelector('#overlay-notif').addEventListener('click', () => painel.remove());
  painel.querySelector('#fechar-notif').addEventListener('click', () => painel.remove());

  painel.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      await marcarLida(el.dataset.id);
      el.classList.remove('bg-yellow-50');
      el.classList.add('bg-gray-50');
      el.querySelector('.w-2').classList.remove('bg-yellow-500');
      el.querySelector('.w-2').classList.add('bg-gray-300');
      renderizarBadgeNotificacoes();
    });
  });
}

// ============================================================
// REALTIME
// ============================================================
function iniciarRealtime() {
  if (!Estado.bairroAtual?.id) return;
  if (Estado.unsubscribeRealtime) Estado.unsubscribeRealtime();

  Estado.unsubscribeRealtime = escutarNovosPosts(Estado.bairroAtual.id, (novoPost) => {
    mostrarToast('📢 Nova publicação no seu bairro!');
    carregarFeed(true);
  });
}

// ============================================================
// BADGES DO GRID 2x2
// ============================================================
async function atualizarBadgesGrid() {
  if (!Estado.bairroAtual?.id) return;

  try {
    // Buscar contagens por categoria
    const { data: categorias } = await supabase.from('categorias').select('id, slug');
    if (!categorias) return;

    for (const cat of categorias) {
      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('ativo', true)
        .eq('categoria_id', cat.id)
        .eq('bairro_id', Estado.bairroAtual.id)
        .gte('expira_em', new Date().toISOString());

      const mapa = {
        'vagas': 'badge-vagas',
        'promocoes': 'badge-promocoes',
        'servicos': 'badge-servicos',
        'avisos': 'badge-avisos'
      };

      const elId = mapa[cat.slug];
      if (elId) {
        const el = document.getElementById(elId);
        if (el) el.textContent = count || 0;
      }

      // Atualizar também badges das tabs
      const tabBadge = document.querySelector(`.tab-badge[data-badge="${cat.slug}"]`);
      if (tabBadge) tabBadge.textContent = count || 0;
    }
  } catch (err) {
    console.error('Erro ao atualizar badges:', err);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Seletor de bairro (header)
  document.getElementById('btn-selecionar-bairro')?.addEventListener('click', abrirModalBairro);

  // Botão notificações
  document.getElementById('btn-notificacoes')?.addEventListener('click', abrirPainelNotificacoes);

  // Avatar/Perfil — CORREÇÃO: abre modal de logout se logado
  document.getElementById('btn-perfil')?.addEventListener('click', () => {
    if (Estado.usuario) {
      abrirModalPerfil();
    } else {
      abrirModalLogin();
    }
  });

  // Busca
  document.getElementById('busca-intencao')?.addEventListener('input', e => {
    handleBusca(e.target.value);
  });

  // Fechar dropdown de busca ao clicar fora
  document.addEventListener('click', e => {
    const busca = document.getElementById('busca-intencao');
    const sugestoes = document.getElementById('sugestoes-rapidas');
    if (sugestoes && !busca?.contains(e.target) && !sugestoes.contains(e.target)) {
      sugestoes.classList.add('hidden');
    }
  });

  // Pills de busca rápida
  document.querySelectorAll('.pill-busca').forEach(pill => {
    pill.addEventListener('click', e => {
      const query = e.target.dataset.query || e.target.textContent.trim();
      const input = document.getElementById('busca-intencao');
      if (input) input.value = query;
      handleBusca(query);
    });
  });

  // Cards de utilidade (grid 2x2)
  document.querySelectorAll('.card-utilidade').forEach(card => {
    card.addEventListener('click', e => {
      const categoria = e.currentTarget.dataset.categoria;
      ativarFiltro(categoria === 'vagas' ? 'vagas' : categoria);
      document.getElementById('zona-feed')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Tabs do feed
  document.querySelectorAll('.tab-filtro').forEach(tab => {
    tab.addEventListener('click', e => {
      ativarFiltro(e.currentTarget.dataset.filtro);
    });
  });

  // Bottom nav
  document.querySelectorAll('.nav-item, .nav-item-destaque').forEach(nav => {
    nav.addEventListener('click', e => {
      const route = e.currentTarget.dataset.route;
      handleNavegacao(route);
    });
  });

  // Carregar mais
  document.getElementById('btn-carregar-mais')?.addEventListener('click', async () => {
    if (Estado.carregandoMais) return;
    Estado.carregandoMais = true;
    Estado.paginaAtual++;
    await carregarFeed(false);
    Estado.carregandoMais = false;
  });

  // CORREÇÃO: Event delegation para "Ver Perfil" nos cards
  document.getElementById('lista-feed')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-ver-perfil');
    if (btn) {
      const autorId = btn.dataset.autorId;
      if (autorId) {
        abrirModalPerfilUsuario(autorId);
      }
    }
  });
}

function ativarFiltro(filtro) {
  Estado.filtroAtivo = filtro;

  document.querySelectorAll('.tab-filtro').forEach(tab => {
    const ativo = tab.dataset.filtro === filtro;
    tab.classList.toggle('text-terra-sol', ativo);
    tab.classList.toggle('border-terra-sol', ativo);
    tab.classList.toggle('text-gray-600', !ativo);
    tab.classList.toggle('border-transparent', !ativo);
  });

  carregarFeed(true);
}

function handleNavegacao(route) {
  document.querySelectorAll('.nav-item').forEach(nav => {
    const ativo = nav.dataset.route === route;
    nav.querySelectorAll('svg, span').forEach(el => {
      el.classList.toggle('text-terra-sol', ativo);
      el.classList.toggle('text-gray-500', !ativo);
    });
  });

  switch (route) {
    case 'publicar':
      abrirModalPublicar();
      break;
    case 'mapa':
      mostrarToast('Mapa em breve 🗺️');
      break;
    case 'mensagens':
      mostrarToast('Mensagens em breve 💬');
      break;
    case 'bairro':
      abrirModalBairro();
      break;
    default:
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ============================================================
// MODAL PERFIL DO USUÁRIO LOGADO
// ============================================================
function abrirModalPerfil() {
  document.getElementById('modal-perfil')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-perfil';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-perfil"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Meu Perfil</h2>
        <button id="fechar-perfil" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <div class="text-center mb-6">
        <div class="w-20 h-20 rounded-full bg-terra-sol mx-auto flex items-center justify-center text-noite-feira font-bold text-2xl mb-3">
          ${Estado.perfil?.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '👤'}
        </div>
        <h3 class="font-bold text-lg">${Estado.perfil?.nome || 'Usuário'}</h3>
        <p class="text-sm text-gray-500">${Estado.usuario?.email || ''}</p>
      </div>

      <div class="space-y-3">
        <button id="btn-logout" class="w-full bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Sair da conta
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-perfil').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-perfil').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-logout').addEventListener('click', async () => {
    try {
      await logout();
      Estado.usuario = null;
      Estado.perfil = null;
      renderizarAvatarHeader();
      modal.remove();
      mostrarToast('Você saiu da conta 👋');
      await carregarFeed(true);
    } catch (err) {
      mostrarToast('Erro ao sair. Tente novamente.', 'erro');
    }
  });
}

// ============================================================
// MODAL PERFIL DE OUTRO USUÁRIO
// ============================================================
async function abrirModalPerfilUsuario(userId) {
  document.getElementById('modal-perfil-usuario')?.remove();

  let perfil = null;
  try {
    perfil = await buscarPerfil(userId);
  } catch (err) {
    mostrarToast('Erro ao carregar perfil', 'erro');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'modal-perfil-usuario';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-perfil-u"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Perfil</h2>
        <button id="fechar-perfil-u" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <div class="text-center mb-6">
        <div class="w-20 h-20 rounded-full bg-terra-sol mx-auto flex items-center justify-center text-noite-feira font-bold text-2xl mb-3">
          ${perfil?.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?'}
        </div>
        <h3 class="font-bold text-lg">${perfil?.nome || 'Usuário'}</h3>
        <p class="text-sm text-gray-500">${perfil?.bairro?.nome || ''}</p>
        ${perfil?.bio ? `<p class="text-sm text-gray-600 mt-2">${perfil.bio}</p>` : ''}
      </div>

      ${perfil?.whatsapp ? `
        <a href="https://wa.me/55${perfil.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener"
           class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          Chamar no WhatsApp
        </a>
      ` : ''}
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-perfil-u').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-perfil-u').addEventListener('click', () => modal.remove());
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/** Formata datas relativas ("há 2 horas", "ontem", etc.) */
function formatarTempo(dataISO) {
  if (!dataISO) return '';
  const diff = (Date.now() - new Date(dataISO).getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'ontem';
  return new Date(dataISO).toLocaleDateString('pt-BR');
}

/** Exibe uma mensagem toast flutuante */
function mostrarToast(msg, tipo = 'sucesso') {
  const existente = document.getElementById('toast-gdf');
  existente?.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-gdf';
  const bg = tipo === 'erro' ? 'bg-red-600' : 'bg-slate-900';
  toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] ${bg} text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-2xl smooth-enter max-w-xs text-center`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// INICIAR
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
