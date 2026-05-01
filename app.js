// ============================================================
// app.js — Lógica principal do Gente da Feira
// Conecta a UI do index.html com o Supabase
// v2.4.0 — Correções críticas: FK hints no chat, fluxo abrir conversa, header toggle
// ============================================================

import {
  supabase,
  getUsuarioAtual,
  loginEmail,
  cadastrar,
  logout,
  listarBairros,
  buscarPosts,
  buscarPostPorId,
  criarPost,
  atualizarPost,
  excluirPost,
  uploadImagemPost,
  uploadAvatar,
  buscarPerfil,
  buscarNotificacoes,
  contarNaoLidas,
  marcarLida,
  escutarNovosPosts,
  buscarOuCriarConversa,
  listarConversas,
  buscarMensagens,
  enviarMensagem,
  marcarMensagensLidas,
  escutarNovasMensagens,
  salvarPushSubscription,
  atualizarPerfil,
  criarReport,
  bloquearUsuario,
  desbloquearUsuario,
  verificarBloqueio,
  listarBloqueados,
} from './supabase.js';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  usuario: null,
  perfil: null,
  bairroAtual: null,
  bairros: [],
  categorias: [],
  filtroAtivo: 'todos',
  paginaAtual: 0,
  posts: [],
  carregandoMais: false,
  unsubscribeRealtime: null,
  unsubscribeChat: null,
  telaAtual: 'feed', // 'feed' | 'mapa' | 'chat' | 'detalhe'
  bloqueados: [], // cache de IDs de usuários bloqueados
  conversaAtual: null,
};

// ============================================================
// CHAVE VAPID — SUBSTITUA pela sua chave pública
// Painel Supabase → Settings → API → Web Push → VAPID Public Key
// ⚠️ A chave abaixo é um EXEMPLO e NÃO funcionará para enviar pushes.
//    Gere a sua no painel do Supabase e substitua aqui.
// ============================================================
const VAPID_PUBLIC_KEY = 'SUBSTITUA_PELA_SUA_CHAVE_VAPID_PUBLICA_AQUI';

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function init() {
  try {
    await verificarAuth();
    await carregarBairros();
    setupEventListeners();
    setupPushNotifications();

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        await verificarAuth();
        renderizarBadgeNotificacoes();
        renderizarBadgeMensagens();
      } else if (event === 'SIGNED_OUT') {
        Estado.usuario = null;
        Estado.perfil = null;
        renderizarAvatarHeader();
      }
    });

    await carregarFeed(true);
    iniciarRealtime();

    console.log('🚀 Gente da Feira v2.0 inicializado!');
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
    try {
      Estado.perfil = await buscarPerfil(Estado.usuario.id);
    } catch (err) {
      console.error('Erro ao buscar perfil:', err);
      Estado.perfil = null;
    }
    renderizarAvatarHeader();
    renderizarBadgeNotificacoes();
    renderizarBadgeMensagens();
    atualizarBadgesGrid();
    Estado.bloqueados = await listarBloqueados();
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

    if (Estado.perfil.avatar_url) {
      // Pré-carregar a imagem; se funcionar, aplicar como background do botão
      const img = new Image();
      img.onload = () => {
        if (btnPerfil) {
          btnPerfil.style.backgroundImage = `url(${escAttr(Estado.perfil.avatar_url)})`;
          btnPerfil.style.backgroundSize = 'cover';
          btnPerfil.style.backgroundPosition = 'center';
        }
        if (avatarEl) avatarEl.textContent = '';
      };
      img.onerror = () => {
        if (avatarEl) avatarEl.textContent = iniciais;
        if (btnPerfil) btnPerfil.style.backgroundImage = '';
      };
      img.src = Estado.perfil.avatar_url;
    } else {
      if (avatarEl) avatarEl.textContent = iniciais;
      if (btnPerfil) btnPerfil.style.backgroundImage = '';
    }
    if (btnPerfil) btnPerfil.title = 'Meu perfil / Sair';
  } else {
    if (avatarEl) avatarEl.textContent = '👤';
    if (btnPerfil) {
      btnPerfil.title = 'Fazer login';
      btnPerfil.style.backgroundImage = '';
    }
  }
}

// ============================================================
// BAIRROS
// ============================================================
async function carregarBairros() {
  Estado.bairros = await listarBairros();

  const slugSalvo = localStorage.getItem('gdf_bairro_slug');
  const bairroSalvo = Estado.bairros.find(b => b.slug === slugSalvo);

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

  modal.querySelector('#overlay-bairro').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-modal-bairro').addEventListener('click', () => modal.remove());

  modal.querySelectorAll('.bairro-opcao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { slug, id, nome } = btn.dataset;
      Estado.bairroAtual = { slug, id, nome };
      localStorage.setItem('gdf_bairro_slug', slug);
      atualizarBairroUI();
      modal.remove();

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

  // Filtrar posts de usuários bloqueados
  const postsFiltrados = posts.filter(p => !Estado.bloqueados.includes(p.autor_id));

  if (limpar) {
    const skeleton = document.getElementById('skeleton-loader');
    const btnMais = document.getElementById('btn-carregar-mais');
    container.innerHTML = '';
    if (skeleton) container.appendChild(skeleton);
    if (btnMais) container.appendChild(btnMais);
  }

  if (postsFiltrados.length === 0 && Estado.posts.length === 0) {
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

  postsFiltrados.forEach(post => {
    container.insertBefore(criarCardPost(post), document.getElementById('skeleton-loader'));
  });
}

function criarCardPost(post) {
  const artigo = document.createElement('article');
  artigo.className = 'bg-white rounded-2xl shadow-sm overflow-hidden smooth-enter border border-gray-100 cursor-pointer';
  artigo.dataset.postId = post.id;

  const nomeAutor = esc(post.autor?.nome || 'Anônimo');
  const iniciais = esc(nomeAutor.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase());
  const cor = escAttr(post.categoria?.cor || '#F59E0B');
  const icone = esc(post.categoria?.icone || '💬');
  const tempoAtras = formatarTempo(post.criado_em);
  const preco = post.preco_a_partir
    ? `<span class="font-semibold text-green-600">A partir de R$ ${Number(post.preco_a_partir).toFixed(2).replace('.', ',')}</span>`
    : '';
  const tags = (post.tags || [])
    .map(t => `<span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">${esc(t)}</span>`)
    .join('');

  // Imagem do post (se existir)
  const imagemHtml = post.imagem_url
    ? `<div class="w-full h-48 bg-gray-100 overflow-hidden">
         <img src="${escAttr(post.imagem_url)}" alt="${escAttr(post.titulo)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'">
       </div>`
    : '';

  const botaoContato = post.contato_whatsapp
    ? `<a href="https://wa.me/55${post.contato_whatsapp.replace(/\D/g, '')}?text=Oi%2C%20vi%20seu%20post%20no%20Gente%20da%20Feira!"
          target="_blank" rel="noopener" onclick="event.stopPropagation()"
          class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          <span>WhatsApp</span>
        </a>`
    : '';

  artigo.innerHTML = `
    ${imagemHtml}
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          ${htmlAvatar(post.autor?.avatar_url, nomeAutor, 'w-11 h-11 rounded-xl', 'text-sm', '', `background: ${cor}`)}
          <div>
            <p class="font-semibold text-slate-900 text-sm">${nomeAutor}</p>
            <p class="text-xs text-gray-500">${esc(post.bairro?.nome || '')} • ${tempoAtras}</p>
          </div>
        </div>
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
              style="background:${cor}20; color:${cor}">
          ${icone} ${esc(post.categoria?.nome || '')}
        </span>
      </div>

      <h3 class="font-bold text-slate-900 mb-1">${esc(post.titulo)}</h3>
      <p class="text-sm text-gray-700 mb-3 line-clamp-3">${esc(post.descricao)}</p>

      ${preco ? `<div class="mb-2">${preco} • <span class="text-gray-600 text-sm">Atende hoje</span></div>` : ''}
      ${tags ? `<div class="flex flex-wrap gap-2 mb-3">${tags}</div>` : ''}
    </div>

    <div class="px-4 pb-4 flex gap-2">
      <button class="btn-ver-perfil flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-3 px-4 rounded-xl transition-all"
              data-autor-id="${escAttr(post.autor?.id)}" onclick="event.stopPropagation()">
        Ver Perfil
      </button>
      ${botaoContato}
    </div>
  `;

  // Clicar no card (fora dos botões) abre detalhe do post
  artigo.addEventListener('click', (e) => {
    if (e.target.closest('.btn-ver-perfil') || e.target.closest('a')) return;
    abrirDetalhePost(post.id);
  });

  registrarVisualizacaoPost(post.id);
  return artigo;
}

// ============================================================
// CONTAGEM DE VISUALIZAÇÕES (deduplicada por sessão)
// ============================================================
const postsVisualizados = new Set();

async function registrarVisualizacaoPost(postId) {
  // Não incrementar se já visualizou nesta sessão
  if (postsVisualizados.has(postId)) return;
  postsVisualizados.add(postId);

  try {
    await supabase.rpc('incrementar_visualizacoes', { post_id: postId });
  } catch (_) {}
}

function limparFeed() {
  const container = document.getElementById('lista-feed');
  if (!container) return;
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
// FEATURE 1: DETALHE DO POST
// ============================================================
async function abrirDetalhePost(postId) {
  document.getElementById('modal-detalhe-post')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-detalhe-post';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
      <div class="p-6 text-center text-gray-500">
        <div class="skeleton h-8 w-3/4 mx-auto rounded mb-4"></div>
        <div class="skeleton h-4 w-1/2 mx-auto rounded"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  let post;
  try {
    post = await buscarPostPorId(postId);
  } catch (err) {
    modal.remove();
    mostrarToast('Erro ao carregar post', 'erro');
    return;
  }

  const nomeAutor = esc(post.autor?.nome || 'Anônimo');
  const iniciais = esc(nomeAutor.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase());
  const cor = escAttr(post.categoria?.cor || '#F59E0B');
  const icone = esc(post.categoria?.icone || '💬');
  const tempoAtras = formatarTempo(post.criado_em);
  const preco = post.preco_a_partir
    ? `<span class="font-semibold text-green-600 text-lg">A partir de R$ ${Number(post.preco_a_partir).toFixed(2).replace('.', ',')}</span>`
    : '';
  const tags = (post.tags || [])
    .map(t => `<span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">${esc(t)}</span>`)
    .join('');

  // Verificar se o post é do usuário logado
  const isDono = Estado.usuario && post.autor_id === Estado.usuario.id;

  const imagemHtml = post.imagem_url
    ? `<div class="w-full h-56 bg-gray-100 overflow-hidden -mx-6 -mt-6 mb-4">
         <img src="${escAttr(post.imagem_url)}" alt="${escAttr(post.titulo)}" class="w-full h-full object-cover" onerror="this.parentElement.style.display='none'">
       </div>`
    : '';

  // Botões de editar/excluir para o dono
  const botoesDono = isDono ? `
    <div class="flex gap-2 mt-4">
      <button id="btn-editar-post" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        Editar
      </button>
      <button id="btn-excluir-post" class="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        Excluir
      </button>
    </div>
  ` : '';

  // Botão de chat (só se NÃO for o dono e estiver logado)
  const botaoChat = (!isDono && Estado.usuario) ? `
    <button id="btn-chat-com-autor" class="w-full bg-terra-sol hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-3" data-autor-id="${escAttr(post.autor_id)}" data-autor-nome="${escAttr(post.autor?.nome || 'Usuário')}" data-post-id="${escAttr(post.id)}">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      Enviar Mensagem
    </button>
  ` : '';

  // Botão Reportar (só se NÃO for o dono e estiver logado)
  const botaoReportar = (!isDono && Estado.usuario) ? `
    <button id="btn-reportar-post" class="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-3 text-sm" data-post-id="${escAttr(post.id)}" data-post-titulo="${escAttr(post.titulo)}">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
      Denunciar publicação
    </button>
  ` : '';

  const botaoWhatsapp = post.contato_whatsapp
    ? `<a href="https://wa.me/55${post.contato_whatsapp.replace(/\D/g, '')}?text=Oi%2C%20vi%20seu%20post%20no%20Gente%20da%20Feira!"
          target="_blank" rel="noopener"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-3">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          WhatsApp
        </a>`
    : '';

  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-detalhe"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
      <!-- Header -->
      <div class="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 class="text-lg font-bold text-slate-900">Detalhes</h2>
        <button id="fechar-detalhe" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <div class="p-6">
        ${imagemHtml}

        <!-- Autor e categoria -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            ${htmlAvatar(post.autor?.avatar_url, nomeAutor, 'w-12 h-12 rounded-xl', 'text-sm', '', `background: ${cor}`)}
            <div>
              <p class="font-semibold text-slate-900">${nomeAutor}</p>
              <p class="text-xs text-gray-500">${esc(post.bairro?.nome || '')} • ${tempoAtras}</p>
            </div>
          </div>
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                style="background:${cor}20; color:${cor}">
            ${icone} ${post.categoria?.nome || ''}
          </span>
        </div>

        <!-- Título e descrição -->
        <h3 class="text-xl font-bold text-slate-900 mb-2">${esc(post.titulo)}</h3>
        <p class="text-sm text-gray-700 mb-4 leading-relaxed">${esc(post.descricao)}</p>

        ${preco ? `<div class="mb-3">${preco}</div>` : ''}
        ${tags ? `<div class="flex flex-wrap gap-2 mb-3">${tags}</div>` : ''}

        <!-- Visualizações -->
        <div class="flex items-center gap-1 text-xs text-gray-400 mb-4">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          ${post.visualizacoes || 0} visualizações
        </div>

        <!-- Ações -->
        ${botaoWhatsapp}
        ${botaoChat}
        ${botaoReportar}
        ${botoesDono}
      </div>
    </div>
  `;

  // Eventos do modal de detalhe
  modal.querySelector('#overlay-detalhe').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-detalhe').addEventListener('click', () => modal.remove());

  // Botão editar
  modal.querySelector('#btn-editar-post')?.addEventListener('click', () => {
    modal.remove();
    abrirModalEditarPost(post);
  });

  // Botão excluir
  modal.querySelector('#btn-excluir-post')?.addEventListener('click', async () => {
    if (confirm('Tem certeza que deseja excluir esta publicação? Essa ação não pode ser desfeita.')) {
      try {
        await excluirPost(post.id);
        modal.remove();
        mostrarToast('Publicação excluída ✅');
        await carregarFeed(true);
      } catch (err) {
        mostrarToast('Erro ao excluir. Tente novamente.', 'erro');
      }
    }
  });

  // Botão chat
  modal.querySelector('#btn-chat-com-autor')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#btn-chat-com-autor');
    const autorId = btn.dataset.autorId;
    const postIdChat = btn.dataset.postId;
    btn.textContent = 'Abrindo chat...';
    btn.disabled = true;

    try {
      const conversa = await buscarOuCriarConversa(autorId, postIdChat);
      const outroNome = btn.dataset.autorNome || 'Usuário';
      modal.remove();
      abrirTelaChat(conversa.id, outroNome);
    } catch (err) {
      mostrarToast('Erro ao abrir chat', 'erro');
      btn.textContent = 'Enviar Mensagem';
      btn.disabled = false;
    }
  });

  // Botão reportar post
  modal.querySelector('#btn-reportar-post')?.addEventListener('click', () => {
    const btn = modal.querySelector('#btn-reportar-post');
    abrirModalReportar('post', btn.dataset.postId, `a publicação "${btn.dataset.postTitulo}"`);
  });
}

// ============================================================
// FEATURE 2: EDITAR / EXCLUIR POST
// ============================================================
async function abrirModalEditarPost(post) {
  document.getElementById('modal-editar-post')?.remove();

  // Buscar categorias
  let categorias = [];
  try {
    const { data } = await supabase.from('categorias').select('*').order('nome');
    categorias = data || [];
  } catch (_) {}

  const modal = document.createElement('div');
  modal.id = 'modal-editar-post';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-editar"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Editar Publicação</h2>
        <button id="fechar-modal-editar" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <div class="space-y-4" id="form-editar">
        <!-- Categoria -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Categoria *</label>
          <div class="grid grid-cols-3 gap-2" id="seletor-categoria-editar">
            ${categorias.map(c => `
              <button type="button" data-id="${c.id}" data-slug="${c.slug}"
                class="cat-btn-editar border-2 rounded-xl p-2 text-center text-sm hover:border-yellow-400 transition-all
                  ${post.categoria?.id === c.id ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200'}">
                <div class="text-xl mb-1">${c.icone}</div>
                <div class="font-medium text-xs">${c.nome}</div>
              </button>`).join('')}
          </div>
          <input type="hidden" id="editar-categoria-id" value="${escAttr(post.categoria?.id || '')}">
        </div>

        <!-- Título -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Título *</label>
          <input type="text" id="editar-titulo" value="${escAttr(post.titulo || '')}"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <!-- Descrição -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Descrição *</label>
          <textarea id="editar-descricao" rows="3"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none">${esc(post.descricao || '')}</textarea>
        </div>

        <!-- Preço -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Preço a partir de (opcional)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
            <input type="number" id="editar-preco" min="0" step="0.01" value="${escAttr(post.preco_a_partir || '')}"
              class="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
          </div>
        </div>

        <!-- WhatsApp -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">WhatsApp para contato (opcional)</label>
          <input type="tel" id="editar-whatsapp" value="${escAttr(post.contato_whatsapp || '')}"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <!-- Imagem atual -->
        ${post.imagem_url ? `
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Imagem atual</label>
            <img src="${escAttr(post.imagem_url)}" alt="Imagem do post" class="w-full h-32 object-cover rounded-xl mb-2">
            <p class="text-xs text-gray-500">Para trocar a imagem, use o campo abaixo</p>
          </div>
        ` : ''}

        <!-- Upload de nova imagem -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Nova imagem (opcional)</label>
          <input type="file" id="editar-imagem" accept="image/*"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-yellow-50 file:text-yellow-700 file:font-semibold file:text-xs">
          <p id="editar-imagem-preview" class="text-xs text-gray-500 mt-1"></p>
        </div>

        <!-- Erro -->
        <div id="erro-editar" class="hidden text-sm text-red-600 bg-red-50 p-3 rounded-xl"></div>

        <!-- Botão salvar -->
        <button id="btn-confirmar-editar"
          class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95 hover:shadow-lg">
          Salvar alterações
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#overlay-editar').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-modal-editar').addEventListener('click', () => modal.remove());

  // Selecionar categoria
  modal.querySelectorAll('.cat-btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.cat-btn-editar').forEach(b => {
        b.classList.remove('border-yellow-500', 'bg-yellow-50');
        b.classList.add('border-gray-200');
      });
      btn.classList.remove('border-gray-200');
      btn.classList.add('border-yellow-500', 'bg-yellow-50');
      document.getElementById('editar-categoria-id').value = btn.dataset.id;
    });
  });

  // Preview da imagem
  modal.querySelector('#editar-imagem')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const previewEl = document.getElementById('editar-imagem-preview');
    if (file && previewEl) {
      previewEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    }
  });

  // Salvar
  modal.querySelector('#btn-confirmar-editar').addEventListener('click', async () => {
    const erroEl = document.getElementById('erro-editar');
    erroEl.classList.add('hidden');

    const categoriaId = document.getElementById('editar-categoria-id').value;
    const titulo = document.getElementById('editar-titulo').value.trim();
    const descricao = document.getElementById('editar-descricao').value.trim();
    const preco = document.getElementById('editar-preco').value;
    const whatsapp = document.getElementById('editar-whatsapp').value.trim();
    const imagemFile = document.getElementById('editar-imagem')?.files?.[0];

    if (!titulo) { mostrarErroModal(erroEl, 'Preencha o título'); return; }
    if (!descricao) { mostrarErroModal(erroEl, 'Preencha a descrição'); return; }

    const btnSalvar = document.getElementById('btn-confirmar-editar');
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    try {
      let imagemUrl = post.imagem_url;

      // Se tem nova imagem, fazer upload
      if (imagemFile) {
        btnSalvar.textContent = 'Enviando imagem...';
        imagemUrl = await uploadImagemPost(imagemFile);
      }

      btnSalvar.textContent = 'Salvando...';

      await atualizarPost(post.id, {
        titulo,
        descricao,
        categoria_id: categoriaId || post.categoria?.id,
        preco_a_partir: preco ? parseFloat(preco) : null,
        contato_whatsapp: whatsapp || null,
        imagem_url: imagemUrl,
      });

      modal.remove();
      mostrarToast('Publicação atualizada! ✏️');
      await carregarFeed(true);
    } catch (err) {
      mostrarErroModal(erroEl, err.message || 'Erro ao salvar. Tente novamente.');
      btnSalvar.textContent = 'Salvar alterações';
      btnSalvar.disabled = false;
    }
  });
}

// ============================================================
// FEATURE 3: UPLOAD DE FOTO NO POST (integração no modal publicar)
// ============================================================
// A lógica de upload está integrada no abrirModalPublicar() abaixo,
// que agora inclui um campo de imagem com preview.

async function abrirModalPublicar() {
  if (!Estado.usuario) {
    abrirModalLogin('Para publicar, faça login primeiro.');
    return;
  }

  document.getElementById('modal-publicar')?.remove();

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

        <!-- 🆕 UPLOAD DE IMAGEM -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Foto (opcional)</label>
          <div id="upload-imagem-area" class="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-yellow-400 transition-colors cursor-pointer">
            <div id="upload-imagem-placeholder" class="flex flex-col items-center gap-2">
              <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p class="text-sm text-gray-500">Toque para adicionar uma foto</p>
              <p class="text-xs text-gray-400">JPG, PNG até 10MB (compressão automática)</p>
            </div>
            <div id="upload-imagem-preview-container" class="hidden">
              <img id="upload-imagem-preview-img" class="w-full h-40 object-cover rounded-lg mb-2" src="" alt="Preview">
              <p id="upload-imagem-nome" class="text-xs text-gray-500"></p>
              <button id="btn-remover-imagem" type="button" class="mt-2 text-xs text-red-600 hover:text-red-800 font-semibold">Remover foto</button>
            </div>
          </div>
          <input type="file" id="input-imagem" accept="image/*" class="hidden">
        </div>

        <!-- Preço -->
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-2">Preço a partir de (opcional)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
            <input type="number" id="input-preco" min="0" step="0.01"
              placeholder="80,00"
              class="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
          </div>
        </div>

        <!-- WhatsApp -->
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

  // Upload de imagem — clique na área
  const uploadArea = modal.querySelector('#upload-imagem-area');
  const inputImagem = modal.querySelector('#input-imagem');

  uploadArea.addEventListener('click', (e) => {
    if (e.target.id === 'btn-remover-imagem') return;
    inputImagem.click();
  });

  inputImagem.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      mostrarToast('Imagem muito grande! Máximo 10MB.', 'erro');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const previewImg = document.getElementById('upload-imagem-preview-img');
      const nomeEl = document.getElementById('upload-imagem-nome');
      const placeholder = document.getElementById('upload-imagem-placeholder');
      const previewContainer = document.getElementById('upload-imagem-preview-container');

      previewImg.src = ev.target.result;
      nomeEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      placeholder.classList.add('hidden');
      previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // Remover imagem
  modal.querySelector('#btn-remover-imagem')?.addEventListener('click', (e) => {
    e.stopPropagation();
    inputImagem.value = '';
    document.getElementById('upload-imagem-placeholder')?.classList.remove('hidden');
    document.getElementById('upload-imagem-preview-container')?.classList.add('hidden');
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
    const imagemFile = inputImagem.files?.[0];

    if (!categoriaId) { mostrarErroModal(erroEl, 'Selecione uma categoria'); return; }
    if (!titulo) { mostrarErroModal(erroEl, 'Preencha o título'); return; }
    if (!descricao) { mostrarErroModal(erroEl, 'Preencha a descrição'); return; }
    if (!Estado.bairroAtual?.id) { mostrarErroModal(erroEl, 'Selecione um bairro primeiro'); return; }

    const btnPublicar = document.getElementById('btn-confirmar-publicar');
    btnPublicar.textContent = 'Publicando...';
    btnPublicar.disabled = true;

    try {
      let imagemUrl = null;

      // Upload da imagem se existir
      if (imagemFile) {
        btnPublicar.textContent = 'Enviando foto...';
        imagemUrl = await uploadImagemPost(imagemFile);
      }

      btnPublicar.textContent = 'Publicando...';

      await criarPost({
        titulo,
        descricao,
        categoriaId,
        bairroId: Estado.bairroAtual.id,
        precoAPartir: preco ? parseFloat(preco) : null,
        contatoWhatsapp: whatsapp || null,
        imagemUrl,
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
// FEATURE 4: MAPA COM LOCALIZAÇÃO (Leaflet.js)
// ============================================================
let mapaInstancia = null;
let marcadores = [];

function abrirTelaMapa() {
  const secao = document.getElementById('secao-mapa');
  const feed = document.getElementById('zona-feed');
  const feedSections = [document.getElementById('zona-contexto'), document.getElementById('zona-intencao'), document.getElementById('zona-utilidade')];

  // Esconder feed, mostrar mapa
  feed.style.display = 'none';
  feedSections.forEach(s => s.style.display = 'none');
  secao.classList.remove('hidden');

  Estado.telaAtual = 'mapa';

  // Inicializar mapa se necessário
  setTimeout(() => {
    if (!mapaInstancia) {
      mapaInstancia = L.map('mapa-container').setView(
        [Estado.bairroAtual?.latitude || -12.2432, Estado.bairroAtual?.longitude || -38.9567],
        14
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapaInstancia);
    } else {
      mapaInstancia.setView(
        [Estado.bairroAtual?.latitude || -12.2432, Estado.bairroAtual?.longitude || -38.9567],
        14
      );
    }

    // Carregar posts no mapa
    carregarPostsNoMapa();
  }, 100);
}

function fecharTelaMapa() {
  const secao = document.getElementById('secao-mapa');
  const feed = document.getElementById('zona-feed');
  const feedSections = [document.getElementById('zona-contexto'), document.getElementById('zona-intencao'), document.getElementById('zona-utilidade')];

  secao.classList.add('hidden');
  feed.style.display = '';
  feedSections.forEach(s => s.style.display = '');
  Estado.telaAtual = 'feed';
}

async function carregarPostsNoMapa() {
  if (!mapaInstancia) return;

  // Limpar marcadores antigos
  marcadores.forEach(m => mapaInstancia.removeLayer(m));
  marcadores = [];

  try {
    const posts = await buscarPosts({
      bairroSlug: Estado.bairroAtual?.slug,
      limite: 50,
    });

    posts.forEach(post => {
      // Se o post tem coordenadas próprias, usar; senão, usar do bairro
      const lat = post.latitude || post.bairro?.latitude;
      const lng = post.longitude || post.bairro?.longitude;

      if (!lat || !lng) return;

      const icone = post.categoria?.icone || '💬';
      const cor = post.categoria?.cor || '#F59E0B';

      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: cor,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(mapaInstancia);

      marker.bindPopup(`
        <div style="min-width: 200px; font-family: system-ui;">
          <strong style="font-size: 14px;">${esc(icone)} ${esc(post.titulo)}</strong>
          <p style="font-size: 12px; color: #666; margin: 4px 0;">${esc(post.descricao?.substring(0, 80))}${post.descricao?.length > 80 ? '...' : ''}</p>
          <p style="font-size: 11px; color: #999;">${esc(post.autor?.nome || 'Anônimo')} • ${formatarTempo(post.criado_em)}</p>
        </div>
      `);

      // Ao clicar no marcador, abre o popup;
      // Ao clicar no popup, abre o detalhe do post
      marker.on('popupopen', () => {
        // Usar timeout pequeno para garantir que o popup DOM existe
        setTimeout(() => {
          const popupEl = marker.getPopup()?.getElement();
          if (popupEl) {
            popupEl.style.cursor = 'pointer';
            popupEl.addEventListener('click', () => abrirDetalhePost(post.id));
          }
        }, 50);
      });

      marcadores.push(marker);
    });

    // Adicionar marcador do bairro central
    if (Estado.bairroAtual?.latitude) {
      const bairroMarker = L.marker([Estado.bairroAtual.latitude, Estado.bairroAtual.longitude])
        .addTo(mapaInstancia)
        .bindPopup(`<strong>📍 ${Estado.bairroAtual.nome}</strong>`)
        .openPopup();
      marcadores.push(bairroMarker);
    }

  } catch (err) {
    console.error('Erro ao carregar posts no mapa:', err);
  }
}

// ============================================================
// FEATURE 5: CHAT / MENSAGENS
// ============================================================
/**
 * Abre a tela de chat.
 * @param {string} [conversaId] - Se informado, abre direto nesta conversa
 * @param {string} [outroNome] - Nome do outro participante
 */
async function abrirTelaChat(conversaId, outroNome) {
  if (!Estado.usuario) {
    abrirModalLogin('Para ver suas mensagens, faça login primeiro.');
    return;
  }

  const secao = document.getElementById('secao-chat');
  const feed = document.getElementById('zona-feed');
  const feedSections = [document.getElementById('zona-contexto'), document.getElementById('zona-intencao'), document.getElementById('zona-utilidade')];

  feed.style.display = 'none';
  feedSections.forEach(s => s.style.display = 'none');
  secao.classList.remove('hidden');
  Estado.telaAtual = 'chat';

  // Se tem uma conversa específica, abrir direto nela
  if (conversaId) {
    await abrirConversa(conversaId, outroNome || 'Usuário');
  } else {
    await carregarListaConversas();
  }
}

function fecharTelaChat() {
  const secao = document.getElementById('secao-chat');
  const feed = document.getElementById('zona-feed');
  const feedSections = [document.getElementById('zona-contexto'), document.getElementById('zona-intencao'), document.getElementById('zona-utilidade')];

  secao.classList.add('hidden');
  feed.style.display = '';
  feedSections.forEach(s => s.style.display = '');
  Estado.telaAtual = 'feed';

  // Parar de escutar mensagens
  if (Estado.unsubscribeChat) {
    Estado.unsubscribeChat();
    Estado.unsubscribeChat = null;
  }
  Estado.conversaAtual = null;
}

async function carregarListaConversas() {
  const container = document.getElementById('lista-conversas');
  const conversaView = document.getElementById('conversa-view');
  const headerChat = document.getElementById('chat-header');
  const headerLista = document.getElementById('chat-header-lista');

  if (!container) return;

  // Mostrar lista, esconder conversa
  container.classList.remove('hidden');
  conversaView?.classList.add('hidden');
  if (headerChat) headerChat.classList.add('hidden');
  if (headerLista) headerLista.classList.remove('hidden');

  container.innerHTML = '<div class="p-6 text-center text-gray-400"><div class="skeleton h-8 w-3/4 mx-auto rounded mb-3"></div><div class="skeleton h-4 w-1/2 mx-auto rounded"></div></div>';

  try {
    const conversas = await listarConversas();

    if (conversas.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <div class="text-5xl mb-4">💬</div>
          <p class="font-medium">Nenhuma conversa ainda</p>
          <p class="text-sm mt-1">Toque em "Enviar Mensagem" em um post para começar</p>
        </div>`;
      return;
    }

    container.innerHTML = conversas.map(c => `
      <button class="conversa-item w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100"
              data-conversa-id="${escAttr(c.id)}" data-outro-nome="${escAttr(c.outroPerfil?.nome || 'Usuário')}">
        ${htmlAvatar(c.outroPerfil?.avatar_url, c.outroPerfil?.nome || 'Usuário', 'w-12 h-12 rounded-full', 'text-sm')}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <p class="font-semibold text-slate-900 text-sm truncate">${esc(c.outroPerfil?.nome || 'Usuário')}</p>
            ${c.naoLidas > 0 ? `<span class="bg-terra-sol text-white text-xs font-bold rounded-full px-2 py-0.5">${c.naoLidas}</span>` : ''}
          </div>
          <p class="text-xs text-gray-500 truncate">${esc(c.ultimaMensagem?.conteudo || (c.post ? 'Sobre: ' + c.post.titulo : 'Conversa iniciada'))}</p>
          ${c.ultimaMensagem ? `<p class="text-xs text-gray-400 mt-0.5">${formatarTempo(c.ultimaMensagem.criado_em)}</p>` : ''}
        </div>
      </button>
    `).join('');

    container.querySelectorAll('.conversa-item').forEach(btn => {
      btn.addEventListener('click', () => {
        abrirConversa(btn.dataset.conversaId, btn.dataset.outroNome);
      });
    });
  } catch (err) {
    console.error('Erro ao carregar conversas:', err);
    container.innerHTML = `
      <div class="p-6 text-center text-gray-500">
        <div class="text-5xl mb-4">�\uDCA1</div>
        <p class="font-medium text-red-500">Erro ao carregar conversas</p>
        <p class="text-sm mt-1 text-gray-400">${esc(err.message || 'Tente novamente mais tarde')}</p>
        <button class="mt-4 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold" id="btn-retry-conversas">
          Tentar novamente
        </button>
      </div>`;
    container.querySelector('#btn-retry-conversas')?.addEventListener('click', () => carregarListaConversas());
  }
}

async function abrirConversa(conversaId, outroNome) {
  const container = document.getElementById('lista-conversas');
  const conversaView = document.getElementById('conversa-view');
  const headerChat = document.getElementById('chat-header');
  const headerLista = document.getElementById('chat-header-lista');
  const nomeOutro = document.getElementById('chat-nome-outro');

  // Esconder lista, mostrar conversa
  container.classList.add('hidden');
  conversaView?.classList.remove('hidden');
  headerChat?.classList.remove('hidden');
  if (headerLista) headerLista.classList.add('hidden');
  if (nomeOutro) nomeOutro.textContent = outroNome;

  Estado.conversaAtual = conversaId;
  // Guardar ID do outro participante para o botão de bloqueio
  const { data: convData } = await supabase
    .from('conversas')
    .select('participante_1, participante_2')
    .eq('id', conversaId)
    .single();
  if (convData) {
    Estado.chatOutroId = convData.participante_1 === Estado.usuario.id
      ? convData.participante_2
      : convData.participante_1;
    Estado.chatOutroNome = outroNome;
  }

  // Carregar mensagens
  const mensagensContainer = document.getElementById('chat-mensagens');
  if (!mensagensContainer) return;

  mensagensContainer.innerHTML = '<div class="p-6 text-center text-gray-400">Carregando...</div>';

  try {
    const mensagens = await buscarMensagens(conversaId);
    renderizarMensagens(mensagens);
    await marcarMensagensLidas(conversaId);
    renderizarBadgeMensagens();
  } catch (err) {
    mensagensContainer.innerHTML = '<div class="p-6 text-center text-red-500 text-sm">Erro ao carregar mensagens</div>';
  }

  // Escutar novas mensagens em tempo real
  if (Estado.unsubscribeChat) Estado.unsubscribeChat();
  Estado.unsubscribeChat = escutarNovasMensagens(conversaId, async (novaMsg) => {
    // Recarregar a mensagem completa com dados do remetente
    try {
      const msgs = await buscarMensagens(conversaId);
      renderizarMensagens(msgs);
      await marcarMensagensLidas(conversaId);
    } catch (_) {}
  });

  // Scroll para o fundo
  setTimeout(() => {
    mensagensContainer.scrollTop = mensagensContainer.scrollHeight;
  }, 100);
}

function renderizarMensagens(mensagens) {
  const container = document.getElementById('chat-mensagens');
  if (!container) return;

  container.innerHTML = mensagens.map(msg => {
    const isMinha = msg.remetente_id === Estado.usuario?.id;
    const nome = esc(msg.remetente?.nome || 'Usuário');

    return `
      <div class="flex ${isMinha ? 'justify-end' : 'justify-start'} mb-3">
        <div class="max-w-[80%] ${isMinha ? 'bg-terra-sol text-white' : 'bg-gray-100 text-slate-900'} rounded-2xl ${isMinha ? 'rounded-br-md' : 'rounded-bl-md'} px-4 py-2.5">
          <p class="text-sm leading-relaxed">${esc(msg.conteudo)}</p>
          <p class="text-[10px] ${isMinha ? 'text-white/60' : 'text-gray-400'} mt-1 text-right">${formatarTempo(msg.criado_em)}</p>
        </div>
      </div>
    `;
  }).join('');

  // Scroll para o fundo
  container.scrollTop = container.scrollHeight;
}

function setupChatEnvio() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-enviar');

  const enviar = async () => {
    if (!Estado.conversaAtual) return;
    const conteudo = input?.value?.trim();
    if (!conteudo) return;

    input.value = '';
    try {
      const msg = await enviarMensagem(Estado.conversaAtual, conteudo);
      // Recarregar mensagens
      const mensagens = await buscarMensagens(Estado.conversaAtual);
      renderizarMensagens(mensagens);
    } catch (err) {
      mostrarToast('Erro ao enviar mensagem', 'erro');
    }
  };

  btn?.addEventListener('click', enviar);
  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviar();
  });
}

// Badge de mensagens na bottom nav
async function renderizarBadgeMensagens() {
  if (!Estado.usuario) return;
  try {
    // Query leve em 2 passos: buscar IDs das conversas, depois contar não lidas
    const { data: minhasConversas } = await supabase
      .from('conversas')
      .select('id')
      .or(`participante_1.eq.${Estado.usuario.id},participante_2.eq.${Estado.usuario.id}`);

    if (!minhasConversas || minhasConversas.length === 0) {
      const badge = document.getElementById('badge-msg-nav');
      if (badge) badge.classList.add('hidden');
      return;
    }

    const conversaIds = minhasConversas.map(c => c.id);

    const { count } = await supabase
      .from('mensagens')
      .select('*', { count: 'exact', head: true })
      .eq('lida', false)
      .neq('remetente_id', Estado.usuario.id)
      .in('conversa_id', conversaIds);

    const totalNaoLidas = count || 0;
    const badge = document.getElementById('badge-msg-nav');
    if (badge) {
      if (totalNaoLidas > 0) {
        badge.textContent = totalNaoLidas > 9 ? '9+' : totalNaoLidas;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (_) {}
}

// ============================================================
// FEATURE 6: PUSH NOTIFICATIONS
// ============================================================
async function setupPushNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  // Se já tem permissão, registrar subscription
  if (Notification.permission === 'granted') {
    await registrarPushSubscription();
  }
}

async function solicitarPermissaoPush() {
  if (!('Notification' in window)) {
    mostrarToast('Seu navegador não suporta notificações', 'erro');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    mostrarToast('Notificações ativadas! 🔔');
    await registrarPushSubscription();
  } else {
    mostrarToast('Notificações desativadas. Você pode ativar nas configurações do navegador.');
  }
}

async function registrarPushSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Já existe, salvar no Supabase
      await salvarPushSubscription(subscription);
      return;
    }

    // Criar nova subscription
    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await salvarPushSubscription(newSubscription);
    console.log('✅ Push subscription registrada!');
  } catch (err) {
    console.warn('Push subscription falhou:', err.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
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
                data-post-id="${escAttr(p.id)}">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
               style="background:${escAttr(p.categoria?.cor || '#F59E0B')}20">
            ${esc(p.categoria?.icone || '💬')}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-900 text-sm truncate">${esc(p.titulo)}</div>
            <div class="text-xs text-gray-500">${esc(p.categoria?.nome || '')} • ${esc(p.bairro?.nome || '')}</div>
          </div>
        </button>
      `).join('');

      lista.querySelectorAll('.sugestao-item').forEach(btn => {
        btn.addEventListener('click', () => {
          container?.classList.add('hidden');
          abrirDetalhePost(btn.dataset.postId);
        });
      });
    } catch (err) {
      console.error('Erro na busca:', err);
      if (lista) lista.innerHTML = '<div class="p-3 text-sm text-red-500">Erro na busca</div>';
    }
  }, 400);
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

      <div class="flex bg-gray-100 rounded-xl p-1 mb-5">
        <button id="tab-login" class="auth-tab flex-1 py-2 rounded-lg font-semibold text-sm bg-white shadow text-slate-900">Entrar</button>
        <button id="tab-cadastro" class="auth-tab flex-1 py-2 rounded-lg font-semibold text-sm text-gray-500">Cadastrar</button>
      </div>

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
          class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95">Entrar</button>
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
        <div class="flex items-center gap-2">
          <button id="btn-ativar-push" class="text-xs px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors font-semibold">
            🔔 Ativar push
          </button>
          <button id="fechar-notif" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
        </div>
      </div>
      ${notifs.length === 0
        ? '<div class="text-center py-10 text-gray-500"><div class="text-4xl mb-3">🔔</div><p>Nenhuma notificação</p></div>'
        : notifs.map(n => `
          <div class="notif-item flex gap-3 p-3 rounded-xl mb-2 cursor-pointer ${n.lida ? 'bg-gray-50' : 'bg-yellow-50'}"
               data-id="${escAttr(n.id)}">
            <div class="w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.lida ? 'bg-gray-300' : 'bg-yellow-500'}"></div>
            <div>
              <p class="font-semibold text-sm text-slate-900">${esc(n.titulo)}</p>
              <p class="text-sm text-gray-600">${esc(n.mensagem)}</p>
              <p class="text-xs text-gray-400 mt-1">${formatarTempo(n.criado_em)}</p>
            </div>
          </div>`).join('')
      }
    </div>
  `;

  document.body.appendChild(painel);
  painel.querySelector('#overlay-notif').addEventListener('click', () => painel.remove());
  painel.querySelector('#fechar-notif').addEventListener('click', () => painel.remove());

  // Botão ativar push
  painel.querySelector('#btn-ativar-push')?.addEventListener('click', () => {
    solicitarPermissaoPush();
  });

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
  document.getElementById('btn-selecionar-bairro')?.addEventListener('click', abrirModalBairro);
  document.getElementById('btn-notificacoes')?.addEventListener('click', abrirPainelNotificacoes);

  document.getElementById('btn-perfil')?.addEventListener('click', () => {
    if (Estado.usuario) {
      abrirModalPerfil();
    } else {
      abrirModalLogin();
    }
  });

  document.getElementById('busca-intencao')?.addEventListener('input', e => {
    handleBusca(e.target.value);
  });

  document.addEventListener('click', e => {
    const busca = document.getElementById('busca-intencao');
    const sugestoes = document.getElementById('sugestoes-rapidas');
    if (sugestoes && !busca?.contains(e.target) && !sugestoes.contains(e.target)) {
      sugestoes.classList.add('hidden');
    }
  });

  document.querySelectorAll('.pill-busca').forEach(pill => {
    pill.addEventListener('click', e => {
      const query = e.target.dataset.query || e.target.textContent.trim();
      const input = document.getElementById('busca-intencao');
      if (input) input.value = query;
      handleBusca(query);
    });
  });

  document.querySelectorAll('.card-utilidade').forEach(card => {
    card.addEventListener('click', e => {
      const categoria = e.currentTarget.dataset.categoria;
      ativarFiltro(categoria === 'vagas' ? 'vagas' : categoria);
      document.getElementById('zona-feed')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.tab-filtro').forEach(tab => {
    tab.addEventListener('click', e => {
      ativarFiltro(e.currentTarget.dataset.filtro);
    });
  });

  // Bottom nav — atualizada para as novas features
  document.querySelectorAll('.nav-item, .nav-item-destaque').forEach(nav => {
    nav.addEventListener('click', e => {
      const route = e.currentTarget.dataset.route;
      handleNavegacao(route);
    });
  });

  document.getElementById('btn-carregar-mais')?.addEventListener('click', async () => {
    if (Estado.carregandoMais) return;
    Estado.carregandoMais = true;
    Estado.paginaAtual++;
    await carregarFeed(false);
    Estado.carregandoMais = false;
  });

  // Event delegation para "Ver Perfil" nos cards
  document.getElementById('lista-feed')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-ver-perfil');
    if (btn) {
      const autorId = btn.dataset.autorId;
      if (autorId) {
        abrirModalPerfilUsuario(autorId);
      }
    }
  });

  // Chat — botão voltar
  document.getElementById('chat-voltar')?.addEventListener('click', () => {
    if (Estado.telaAtual === 'chat' && Estado.conversaAtual) {
      // Voltar para lista de conversas
      if (Estado.unsubscribeChat) {
        Estado.unsubscribeChat();
        Estado.unsubscribeChat = null;
      }
      Estado.conversaAtual = null;
      Estado.chatOutroId = null;
      Estado.chatOutroNome = null;
      carregarListaConversas();
    }
  });

  // Botão bloquear no header do chat
  document.getElementById('btn-bloquear-chat')?.addEventListener('click', () => {
    if (Estado.chatOutroId && Estado.chatOutroNome) {
      toggleBloqueio(Estado.chatOutroId, Estado.chatOutroNome);
    }
  });

  // Chat — fechar tela
  document.getElementById('chat-fechar')?.addEventListener('click', fecharTelaChat);

  // Mapa — fechar
  document.getElementById('mapa-fechar')?.addEventListener('click', fecharTelaMapa);

  // Chat envio
  setupChatEnvio();
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
  // Fechar telas especiais se estiver abertas
  if (Estado.telaAtual === 'mapa') fecharTelaMapa();
  if (Estado.telaAtual === 'chat') fecharTelaChat();

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
      abrirTelaMapa();
      break;
    case 'mensagens':
      abrirTelaChat();
      break;
    case 'bairro':
      abrirModalBairro();
      break;
    default:
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ============================================================
// MODAL PERFIL DO USUÁRIO LOGADO (com edição e upload de avatar)
// ============================================================
function abrirModalPerfil() {
  document.getElementById('modal-perfil')?.remove();

  const perfil = Estado.perfil || {};
  const avatarHtml = perfil.avatar_url
    ? `<img src="${escAttr(perfil.avatar_url)}" alt="Avatar" class="absolute inset-0 w-full h-full object-cover" onerror="this.remove()">`
    : '';

  const bairrosOptions = Estado.bairros.map(b =>
    `<option value="${escAttr(b.id)}" ${perfil.bairro_id === b.id ? 'selected' : ''}>${esc(b.nome)}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-perfil';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-perfil"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Meu Perfil</h2>
        <button id="fechar-perfil" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>

      <!-- Avatar com upload -->
      <div class="text-center mb-6">
        <div class="relative w-24 h-24 rounded-full bg-terra-sol mx-auto flex items-center justify-center text-noite-feira font-bold text-3xl overflow-hidden cursor-pointer group" id="avatar-upload-area">
          ${avatarHtml}
          <span class="${perfil.avatar_url ? 'hidden' : ''}" id="avatar-iniciais-perfil">${esc(perfil.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '👤')}</span>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">Toque para trocar a foto</p>
        <input type="file" id="input-avatar" accept="image/*" class="hidden">
        <p id="avatar-status" class="text-xs text-gray-400 mt-1"></p>
      </div>

      <!-- Campos editáveis -->
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">Nome</label>
          <input type="text" id="perfil-nome" value="${escAttr(perfil.nome || '')}"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">Bio</label>
          <textarea id="perfil-bio" rows="2" placeholder="Conte um pouco sobre você..."
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none">${esc(perfil.bio || '')}</textarea>
        </div>

        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">WhatsApp</label>
          <input type="tel" id="perfil-whatsapp" value="${escAttr(perfil.whatsapp || '')}" placeholder="75 9 9999-0000"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
        </div>

        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">Bairro</label>
          <select id="perfil-bairro"
            class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
            <option value="">Selecione seu bairro</option>
            ${bairrosOptions}
          </select>
        </div>

        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" id="perfil-profissional" ${perfil.is_profissional ? 'checked' : ''}
            class="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400">
          <span class="text-sm text-slate-700 font-medium">Sou profissional / presto serviços</span>
        </label>
      </div>

      <!-- E-mail (somente leitura) -->
      <div class="mt-4">
        <label class="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
        <p class="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">${esc(Estado.usuario?.email || '')}</p>
      </div>

      <!-- Erro -->
      <div id="erro-perfil" class="hidden text-sm text-red-600 bg-red-50 p-3 rounded-xl mt-4"></div>

      <!-- Botão salvar -->
      <button id="btn-salvar-perfil"
        class="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95 hover:shadow-lg mt-5">
        Salvar alterações
      </button>

      <!-- Separador -->
      <div class="border-t border-gray-200 my-5"></div>

      <!-- Ações -->
      <div class="space-y-3">
        <button id="btn-meus-posts" class="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          Minhas Publicações
        </button>

        <button id="btn-push-notif" class="w-full bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          Ativar Notificações
        </button>

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

  // ---- Upload de Avatar ----
  const avatarArea = modal.querySelector('#avatar-upload-area');
  const inputAvatar = modal.querySelector('#input-avatar');
  const avatarStatus = modal.querySelector('#avatar-status');

  avatarArea.addEventListener('click', () => inputAvatar.click());

  inputAvatar.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      mostrarToast('Imagem muito grande! Máximo 5MB.', 'erro');
      return;
    }

    avatarStatus.textContent = 'Enviando foto...';

    try {
      const url = await uploadAvatar(file);

      // Atualizar a pré-visualização no modal
      const imgExistente = avatarArea.querySelector('img');
      if (imgExistente) imgExistente.remove();

      const novasIniciais = avatarArea.querySelector('#avatar-iniciais-perfil');
      if (novasIniciais) novasIniciais.classList.add('hidden');

      const novaImg = document.createElement('img');
      novaImg.src = url;
      novaImg.alt = 'Avatar';
      novaImg.className = 'absolute inset-0 w-full h-full object-cover';
      novaImg.onerror = () => novaImg.remove();
      avatarArea.appendChild(novaImg);

      // Atualizar Estado e header
      Estado.perfil.avatar_url = url;
      renderizarAvatarHeader();

      avatarStatus.textContent = 'Foto atualizada! ✅';
      mostrarToast('Foto de perfil atualizada! 📸');
    } catch (err) {
      avatarStatus.textContent = '';
      mostrarToast(err.message || 'Erro ao enviar foto', 'erro');
    }
  });

  // ---- Salvar Perfil ----
  modal.querySelector('#btn-salvar-perfil').addEventListener('click', async () => {
    const erroEl = document.getElementById('erro-perfil');
    erroEl.classList.add('hidden');

    const nome = document.getElementById('perfil-nome').value.trim();
    const bio = document.getElementById('perfil-bio').value.trim();
    const whatsapp = document.getElementById('perfil-whatsapp').value.trim();
    const bairroId = document.getElementById('perfil-bairro').value;
    const isProfissional = document.getElementById('perfil-profissional').checked;

    if (!nome) {
      erroEl.textContent = 'O nome é obrigatório';
      erroEl.classList.remove('hidden');
      return;
    }

    const btnSalvar = document.getElementById('btn-salvar-perfil');
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    try {
      const dadosAtualizados = {
        nome,
        bio: bio || null,
        whatsapp: whatsapp || null,
        bairro_id: bairroId || null,
        is_profissional: isProfissional,
      };

      const perfilAtualizado = await atualizarPerfil(dadosAtualizados);

      // Atualizar Estado global
      Estado.perfil = perfilAtualizado;
      renderizarAvatarHeader();

      btnSalvar.textContent = 'Salvo! ✅';
      mostrarToast('Perfil atualizado! ✏️');

      setTimeout(() => {
        btnSalvar.textContent = 'Salvar alterações';
        btnSalvar.disabled = false;
      }, 2000);
    } catch (err) {
      erroEl.textContent = err.message || 'Erro ao salvar. Tente novamente.';
      erroEl.classList.remove('hidden');
      btnSalvar.textContent = 'Salvar alterações';
      btnSalvar.disabled = false;
    }
  });

  // ---- Ações ----
  modal.querySelector('#btn-push-notif')?.addEventListener('click', () => {
    solicitarPermissaoPush();
  });

  modal.querySelector('#btn-meus-posts')?.addEventListener('click', () => {
    modal.remove();
    abrirModalMeusPosts();
  });

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
// MEUS POSTS (modal para ver/editar/excluir)
// ============================================================
async function abrirModalMeusPosts() {
  if (!Estado.usuario) return;

  document.getElementById('modal-meus-posts')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-meus-posts';
  modal.className = 'fixed inset-0 z-[100] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-meus-posts"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-slate-900">Minhas Publicações</h2>
        <button id="fechar-meus-posts" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>
      <div id="lista-meus-posts" class="space-y-3">
        <div class="text-center py-8 text-gray-400">Carregando...</div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-meus-posts').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-meus-posts').addEventListener('click', () => modal.remove());

  try {
    const { data: meusPosts } = await supabase
      .from('posts')
      .select(`id, titulo, descricao, ativo, criado_em, categoria:categorias(id, nome, slug, icone, cor), bairro:bairros(id, nome)`)
      .eq('autor_id', Estado.usuario.id)
      .order('criado_em', { ascending: false });

    const lista = document.getElementById('lista-meus-posts');
    if (!lista) return;

    if (!meusPosts || meusPosts.length === 0) {
      lista.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <div class="text-4xl mb-3">📝</div>
          <p class="font-medium">Você ainda não publicou nada</p>
          <p class="text-sm mt-1">Use o botão "+" para criar sua primeira publicação</p>
        </div>`;
      return;
    }

    lista.innerHTML = meusPosts.map(p => `
      <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors" data-post-id="${escAttr(p.id)}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm">${esc(p.categoria?.icone || '💬')}</span>
            <p class="font-semibold text-sm text-slate-900 truncate">${esc(p.titulo)}</p>
            ${!p.ativo ? '<span class="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Inativo</span>' : ''}
          </div>
          <p class="text-xs text-gray-500">${esc(p.categoria?.nome || '')} • ${esc(p.bairro?.nome || '')} • ${formatarTempo(p.criado_em)}</p>
        </div>
        <div class="flex gap-1">
          <button class="btn-editar-meu-post p-2 hover:bg-blue-50 rounded-lg text-blue-600" data-post-id="${escAttr(p.id)}" title="Editar">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="btn-excluir-meu-post p-2 hover:bg-red-50 rounded-lg text-red-600" data-post-id="${escAttr(p.id)}" title="Excluir">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Eventos de editar e excluir
    lista.querySelectorAll('.btn-editar-meu-post').forEach(btn => {
      btn.addEventListener('click', async () => {
        modal.remove();
        // Buscar post completo e abrir modal de edição
        try {
          const post = await buscarPostPorId(btn.dataset.postId);
          abrirModalEditarPost(post);
        } catch (_) {
          mostrarToast('Erro ao carregar post', 'erro');
        }
      });
    });

    lista.querySelectorAll('.btn-excluir-meu-post').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Excluir esta publicação?')) {
          try {
            await excluirPost(btn.dataset.postId);
            mostrarToast('Publicação excluída ✅');
            btn.closest('[data-post-id]')?.remove();
            await carregarFeed(true);
          } catch (err) {
            mostrarToast('Erro ao excluir', 'erro');
          }
        }
      });
    });

  } catch (err) {
    console.error('Erro ao carregar meus posts:', err);
  }
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
        ${htmlAvatar(perfil?.avatar_url, perfil?.nome || 'Usuário', 'w-20 h-20 rounded-full mx-auto', 'text-2xl', 'bg-terra-sol', '', 'text-noite-feira')}
        <h3 class="font-bold text-lg mt-3">${esc(perfil?.nome || 'Usuário')}</h3>
        <p class="text-sm text-gray-500">${esc(perfil?.bairro?.nome || '')}</p>
        ${perfil?.bio ? `<p class="text-sm text-gray-600 mt-2">${esc(perfil.bio)}</p>` : ''}
      </div>

      ${perfil?.whatsapp ? `
        <a href="https://wa.me/55${perfil.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener"
           class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
          </svg>
          WhatsApp
        </a>
      ` : ''}

      ${Estado.usuario && userId !== Estado.usuario.id ? `
        <button id="btn-chat-perfil" class="w-full bg-terra-sol hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-3" data-user-id="${escAttr(userId)}">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          Enviar Mensagem
        </button>
        <div class="flex gap-2 mt-3">
          <button id="btn-bloquear-perfil" class="flex-1 ${Estado.bloqueados.includes(userId) ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-700'} font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm" data-user-id="${escAttr(userId)}" data-user-nome="${escAttr(perfil?.nome || 'Usuário')}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
            ${Estado.bloqueados.includes(userId) ? 'Desbloquear' : 'Bloquear'}
          </button>
          <button id="btn-reportar-perfil" class="flex-1 bg-orange-50 text-orange-600 font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm" data-user-id="${escAttr(userId)}" data-user-nome="${escAttr(perfil?.nome || 'Usuário')}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            Denunciar
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-perfil-u').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-perfil-u').addEventListener('click', () => modal.remove());

  // Chat pelo perfil
  modal.querySelector('#btn-chat-perfil')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#btn-chat-perfil');
    btn.textContent = 'Abrindo chat...';
    btn.disabled = true;
    try {
      const conversa = await buscarOuCriarConversa(btn.dataset.userId);
      modal.remove();
      abrirTelaChat(conversa.id, perfil?.nome || 'Usuário');
    } catch (err) {
      mostrarToast('Erro ao abrir chat', 'erro');
    }
  });

  // Bloquear/Desbloquear pelo perfil
  modal.querySelector('#btn-bloquear-perfil')?.addEventListener('click', function () {
    toggleBloqueio(this.dataset.userId, this.dataset.userNome, this);
  });

  // Reportar perfil
  modal.querySelector('#btn-reportar-perfil')?.addEventListener('click', () => {
    const btn = modal.querySelector('#btn-reportar-perfil');
    abrirModalReportar('perfil', btn.dataset.userId, `o perfil de ${btn.dataset.userNome}`);
  });
}

// ============================================================
// REPORTAR / BLOQUEAR
// ============================================================

const REPORT_MOTIVOS = [
  { valor: 'scam_fraude', label: 'Golpe / Fraude', emoji: '🎭' },
  { valor: 'assedio',     label: 'Assédio', emoji: '⚠️' },
  { valor: 'discurso_odio', label: 'Discurso de ódio', emoji: '🚫' },
  { valor: 'conteudo_sexual', label: 'Conteúdo sexual', emoji: '🔞' },
  { valor: 'impersonation', label: 'Falsa identidade', emoji: '🎭' },
  { valor: 'desinformacao', label: 'Desinformação', emoji: '📰' },
  { valor: 'spam',         label: 'Spam', emoji: '📢' },
  { valor: 'doxing',       label: 'Exposição de dados', emoji: '🔓' },
  { valor: 'outro',        label: 'Outro', emoji: '💬' },
];

/**
 * Abre modal de denúncia (report)
 * @param {'post'|'mensagem'|'perfil'|'conversa'} tipo
 * @param {string} itemId - UUID do item
 * @param {string} contexto - Texto descritivo (ex: "o post 'Vaga Dev'")
 */
function abrirModalReportar(tipo, itemId, contexto = '') {
  document.getElementById('modal-reportar')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-reportar';
  modal.className = 'fixed inset-0 z-[200] flex items-end justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="overlay-report"></div>
    <div class="relative bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-slate-900">Denunciar</h2>
        <button id="fechar-report" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
      </div>
      <p class="text-sm text-gray-600 mb-4">Denunciar ${esc(contexto || tipo)}:</p>

      <div class="space-y-2" id="report-motivos">
        ${REPORT_MOTIVOS.map(m => `
          <label class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors border border-gray-100">
            <input type="radio" name="report-motivo" value="${escAttr(m.valor)}" class="w-4 h-4 text-red-600 focus:ring-red-500">
            <span class="text-lg">${m.emoji}</span>
            <span class="text-sm font-medium text-slate-800">${esc(m.label)}</span>
          </label>
        `).join('')}
      </div>

      <div class="mt-4">
        <label class="block text-sm font-semibold text-slate-700 mb-1">Detalhes (opcional)</label>
        <textarea id="report-descricao" rows="2" placeholder="Conte o que aconteceu..."
          class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"></textarea>
      </div>

      <div id="report-erro" class="hidden text-sm text-red-600 bg-red-50 p-3 rounded-xl mt-3"></div>

      <button id="btn-enviar-report"
        class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl text-sm transition-all active:scale-95 mt-4">
        Enviar denúncia
      </button>
      <p class="text-xs text-gray-400 text-center mt-2">Denúncias falsas podem resultar em suspensão.</p>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#overlay-report').addEventListener('click', () => modal.remove());
  modal.querySelector('#fechar-report').addEventListener('click', () => modal.remove());

  modal.querySelector('#btn-enviar-report').addEventListener('click', async () => {
    const motivoSelecionado = modal.querySelector('input[name="report-motivo"]:checked');
    const erroEl = modal.getElementById('report-erro');
    erroEl.classList.add('hidden');

    if (!motivoSelecionado) {
      erroEl.textContent = 'Selecione um motivo para a denúncia.';
      erroEl.classList.remove('hidden');
      return;
    }

    const btn = modal.querySelector('#btn-enviar-report');
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    try {
      await criarReport(tipo, itemId, motivoSelecionado.value, modal.querySelector('#report-descricao').value.trim());
      modal.remove();
      mostrarToast('Denúncia enviada. Obrigado por ajudar a comunidade.');
    } catch (err) {
      erroEl.textContent = err.message || 'Erro ao enviar denúncia. Tente novamente.';
      erroEl.classList.remove('hidden');
      btn.textContent = 'Enviar denúncia';
      btn.disabled = false;
    }
  });
}

/**
 * Alterna bloqueio/desbloqueio de um usuário
 * @param {string} bloqueadoId - UUID do usuário
 * @param {string} nome - Nome do usuário (para exibir no toast)
 * @param {HTMLElement} [btn] - Botão que disparou a ação (para atualizar texto)
 */
async function toggleBloqueio(bloqueadoId, nome, btn = null) {
  const estaBloqueado = Estado.bloqueados.includes(bloqueadoId);

  if (estaBloqueado) {
    if (!confirm(`Desbloquear ${nome}?`)) return;
    try {
      await desbloquearUsuario(bloqueadoId);
      Estado.bloqueados = Estado.bloqueados.filter(id => id !== bloqueadoId);
      mostrarToast(`${nome} foi desbloqueado`);
      if (btn) {
        btn.textContent = 'Bloquear';
        btn.className = btn.className.replace('bg-gray-100 text-gray-700', 'bg-red-50 text-red-700');
      }
      // Recarregar feed para mostrar posts desbloqueados
      await carregarFeed(true);
    } catch (err) {
      mostrarToast('Erro ao desbloquear.', 'erro');
    }
  } else {
    if (!confirm(`Bloquear ${nome}? Você não verá mais os posts nem mensagens dessa pessoa.`)) return;
    try {
      await bloquearUsuario(bloqueadoId);
      Estado.bloqueados.push(bloqueadoId);
      mostrarToast(`${nome} foi bloqueado`);
      if (btn) {
        btn.textContent = 'Desbloquear';
        btn.className = btn.className.replace('bg-red-50 text-red-700', 'bg-gray-100 text-gray-700');
      }
      // Recarregar feed para esconder posts bloqueados
      await carregarFeed(true);
    } catch (err) {
      mostrarToast('Erro ao bloquear.', 'erro');
    }
  }
}


// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Gera HTML para avatar (foto ou iniciais).
 * A imagem fica em posição absoluta sobre as iniciais;
 * se falhar ao carregar (onerror), é removida e as iniciais aparecem.
 * @param {string|null} avatarUrl - URL da foto de avatar
 * @param {string} nome - Nome do usuário (para gerar iniciais)
 * @param {string} classe - Classes CSS de tamanho e forma (ex: 'w-11 h-11 rounded-xl')
 * @param {string} textoClasse - Classes CSS do texto das iniciais
 * @param {string} corBg - Classe CSS de cor de fundo (ex: 'bg-terra-sol')
 * @param {string} styleAttr - Estilo inline adicional (ex: 'background: #3B82F6')
 * @param {string} textoCor - Classe CSS de cor do texto (ex: 'text-white' ou 'text-noite-feira')
 */
function htmlAvatar(avatarUrl, nome, classe = 'w-11 h-11 rounded-full', textoClasse = 'text-sm', corBg = 'bg-terra-sol', styleAttr = '', textoCor = 'text-white') {
  const iniciais = esc((nome || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase());
  const style = styleAttr ? ` style="${styleAttr}"` : '';
  if (avatarUrl) {
    return `<div class="${classe} ${corBg} flex items-center justify-center ${textoCor} font-bold ${textoClasse} flex-shrink-0 overflow-hidden relative"${style}>
      <img src="${escAttr(avatarUrl)}" alt="${escAttr(nome || 'Avatar')}" class="absolute inset-0 w-full h-full object-cover" onerror="this.remove()" aria-hidden="true">
      ${iniciais}
    </div>`;
  }
  return `<div class="${classe} ${corBg} flex items-center justify-center ${textoCor} font-bold ${textoClasse} flex-shrink-0"${style}>${iniciais}</div>`;
}

/**
 * Sanitiza texto para prevenir XSS ao injetar em innerHTML.
 * Escapa caracteres HTML perigosos (<, >, &, ", ').
 * Deve ser usada em TODO conteúdo que vem do banco de dados
 * antes de ser inserido no DOM via innerHTML.
 */
function esc(texto) {
  if (texto == null) return '';
  const el = document.createElement('span');
  el.textContent = String(texto);
  return el.innerHTML;
}

/**
 * Sanitiza valor para uso em atributo HTML (ex: value="...", data-...="...").
 * Escapa <, >, &, ", ' e caracteres de controle.
 */
function escAttr(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove caracteres de controle
}

function formatarTempo(dataISO) {
  if (!dataISO) return '';
  const diff = (Date.now() - new Date(dataISO).getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'ontem';
  return new Date(dataISO).toLocaleDateString('pt-BR');
}

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
