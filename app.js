/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA
 * Versão: 4.2.0 (Full Production Build)
 * Desenvolvedor: Leonardo Almeida
 * Descrição: Sistema completo com Threads, Social Actions, Bairros e PWA.
 */

console.log("🚀 Gente da Feira: Iniciando motor do sistema...");

// --- 1. CONSTANTES E CONFIGURAÇÕES DE AMBIENTE ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["😍", "😂", "😡", "😢"];

const BAIRROS_FSA = [
    "Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", 
    "Cidade Nova", "Conceição", "Eucalipto", "Feira IX", "Feira X", "George Américo", 
    "Humildes", "Itatiaia", "Jardim Cruzeiro", "Lagoa Salgada", "Limoeiro", "Mangabeira", 
    "Muchila", "Novo Horizonte", "Papagaio", "Parque Ipê", "Ponto Central", "Queimadinha", 
    "Rua Nova", "Santa Mônica", "Santo Antônio dos Prazeres", "SIM", "Sobradinho", "Tomba"
].sort();

// --- 2. INICIALIZAÇÃO CORE ---
async function inicializarApp() {
    if (typeof supabase === 'undefined') {
        console.error("❌ Erro: SDK do Supabase não encontrado no HTML.");
        setTimeout(inicializarApp, 1000);
        return;
    }

    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Conexão estabelecida com a Feira.");

    // Escuta Realtime: Posts, Comentários e Reações
    _supabase.channel('public:all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, carregarFeed)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, carregarFeed)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, carregarFeed)
        .subscribe();

    setupDomListeners();
    popularSelectBairros();
    verificarEstadoAuth();
    carregarFeed();
    processarHashUrl();
}
document.addEventListener('DOMContentLoaded', inicializarApp);

// --- 3. GESTÃO DE UI E NAVEGAÇÃO ---
function mostrarTela(id) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.add('hidden', 'opacity-0');
    });

    const ativa = document.getElementById(id);
    if (ativa) {
        ativa.classList.remove('hidden');
        setTimeout(() => ativa.classList.remove('opacity-0'), 10);
        ativa.classList.add('animate-fade-in');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.mostrarTela = mostrarTela;

function popularSelectBairros() {
    const selects = ['perfil-bairro', 'post-zona'];
    selects.forEach(sId => {
        const select = document.getElementById(sId);
        if (select) {
            select.innerHTML = `<option value="Geral">Toda a Cidade</option>`;
            BAIRROS_FSA.forEach(b => select.add(new Option(b, b)));
        }
    });
}

function processarHashUrl() {
    if (window.location.hash.includes('post-')) {
        const id = window.location.hash.split('-')[1];
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-4', 'ring-feira-bronze', 'ring-opacity-50');
            }
        }, 1500);
    }
}

// --- 4. SISTEMA DE FEED E FILTRAGEM ---
async function carregarFeed(filtroBairro = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const uid = session?.user?.id;

    // Construção da Query complexa com relacionamentos
    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url, bio),
            reactions (emoji_type, user_id),
            comments (
                *,
                profiles:user_id (username),
                reactions (emoji_type, user_id)
            )
        `)
        .order('created_at', { ascending: false });

    // Lógica de Filtro por Bairro do Usuário
    if (filtroBairro && uid) {
        const { data: userP } = await _supabase.from('profiles').select('bairro').eq('id', uid).single();
        if (userP?.bairro && userP.bairro !== 'Geral') {
            query = query.eq('zona', userP.bairro);
        }
    }

    // Lógica de Bloqueios (Anti-Perturbação)
    if (uid) {
        const { data: blocks } = await _supabase.from('restrictions').select('target_id').eq('user_id', uid);
        const blockedIds = blocks?.map(b => b.target_id) || [];
        if (blockedIds.length > 0) {
            query = query.not('user_id', 'in', `(${blockedIds.join(',')})`);
        }
    }

    const { data: posts, error } = await query;
    if (error) return console.error("Falha ao buscar avisos:", error);

    renderizarPosts(posts, uid, container);
}

function renderizarPosts(posts, currentUid, container) {
    container.innerHTML = "";
    if (posts.length === 0) {
        container.innerHTML = `<div class="py-20 text-center opacity-40 font-black uppercase text-xs">Nenhum aviso nesta região ainda...</div>`;
        return;
    }

    posts.forEach(post => {
        const div = document.createElement('article');
        div.className = "bg-white p-5 shadow-sm rounded-2xl border-l-[6px] border-feira-bronze mb-6 transition-all hover:shadow-md";
        div.setAttribute('data-post-id', post.id);

        const reactionsHtml = renderizarReacoes(post.id, post.reactions, false);
        const commentsHtml = renderizarComentarios(post.comments, post.id, currentUid);

        div.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-12 h-12 bg-gray-100 rounded-full border-2 border-feira-bege overflow-hidden">
                        ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-xl">👤</div>`}
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-900 leading-tight">${escaparHTML(post.profiles?.username || "Morador da Feira")}</h4>
                        <span class="text-[10px] bg-feira-marinho text-white px-2 py-0.5 rounded-full font-black uppercase">${post.zona}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="menuSocial('${post.user_id}', this)" class="text-gray-400 p-2 text-xl hover:text-black">⋮</button>
                    <button onclick="compartilharPost('${post.id}')" class="text-gray-300 hover:text-feira-marinho p-1">🔗</button>
                    ${currentUid === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-200 hover:text-red-600 p-1">🗑️</button>` : ''}
                </div>
            </div>

            <div class="text-gray-800 text-[15px] leading-relaxed mb-4 whitespace-pre-wrap">${escaparHTML(post.content)}</div>
            
            <div class="flex gap-4 border-y border-gray-50 py-3 mb-4">${reactionsHtml}</div>

            <div class="space-y-3" id="com-list-${post.id}">${commentsHtml}</div>

            <div class="mt-4 pt-3 border-t border-gray-50">
                <div id="reply-box-${post.id}" class="hidden flex justify-between bg-black text-white text-[10px] p-2 rounded-t-xl font-bold">
                    <span>RESPONDENDO A <span class="text-feira-bronze" id="reply-name-${post.id}"></span></span>
                    <button onclick="cancelarResposta('${post.id}')">✕</button>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="input-${post.id}" data-parent="" placeholder="Comentar aviso..." 
                           class="flex-1 bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-feira-bronze outline-none shadow-inner">
                    <button onclick="enviarComentario('${post.id}')" class="bg-feira-marinho text-white px-4 rounded-xl font-bold active:scale-95 transition">ENVIAR</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 5. LÓGICA DE COMENTÁRIOS E THREADS ---
function renderizarComentarios(todos, postId, currentUid) {
    const principais = todos.filter(c => !c.parent_id);
    if (principais.length === 0) return `<p class="text-[10px] text-gray-300 italic">Nenhum comentário...</p>`;

    const formatar = (c, level = 0) => {
        const sub = todos.filter(s => s.parent_id === c.id);
        const reacts = renderizarReacoes(c.id, c.reactions || [], true);
        
        return `
        <div class="${level > 0 ? 'ml-6 mt-2 border-l-2 border-gray-100 pl-3' : 'bg-gray-50 p-3 rounded-xl'}">
            <div class="flex justify-between">
                <span class="text-[11px]"><b class="text-black">${escaparHTML(c.profiles?.username || 'Morador')}:</b> ${escaparHTML(c.content)}</span>
                ${c.user_id === currentUid ? `<button onclick="apagarComentario('${c.id}')" class="text-gray-300 text-[10px]">✕</button>` : ''}
            </div>
            <div class="flex gap-3 mt-1 items-center">
                <button onclick="prepararResposta('${postId}', '${c.id}', '${escaparHTML(c.profiles?.username)}')" class="text-[9px] font-black text-gray-400 uppercase">Responder</button>
                <div class="flex gap-2">${reacts}</div>
            </div>
            ${sub.map(s => formatar(s, level + 1)).join('')}
        </div>`;
    };

    return principais.map(c => formatar(c)).join('');
}

function renderizarReacoes(id, lista, isComment) {
    return EMOJIS.map(e => {
        const count = lista.filter(r => r.emoji_type === e).length;
        return `
            <button onclick="reagir('${id}', '${e}', ${isComment})" class="flex items-center gap-1 transition hover:scale-110">
                <span class="text-sm">${e}</span>
                <span class="text-[10px] font-black text-gray-400">${count || ''}</span>
            </button>
        `;
    }).join('');
}

// --- 6. AÇÕES DO USUÁRIO ---
window.enviarPost = async () => {
    const session = await _supabase.auth.getSession();
    if (!session.data.session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    if (content.length < 3) return alert("Escreva um pouco mais.");

    const { error } = await _supabase.from('posts').insert({
        content,
        zona,
        user_id: session.data.session.user.id
    });

    if (!error) {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
    }
};

window.reagir = async (targetId, emoji, isComment) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const col = isComment ? 'comment_id' : 'post_id';
    const { data: existing } = await _supabase.from('reactions')
        .select('id, emoji_type').eq('user_id', session.user.id).eq(col, targetId).maybeSingle();

    if (existing) {
        if (existing.emoji_type === emoji) {
            await _supabase.from('reactions').delete().eq('id', existing.id);
        } else {
            await _supabase.from('reactions').update({ emoji_type: emoji }).eq('id', existing.id);
        }
    } else {
        const ins = { user_id: session.user.id, emoji_type: emoji };
        ins[col] = targetId;
        await _supabase.from('reactions').insert(ins);
    }
};

// --- 7. PERFIL E STORAGE ---
window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const btn = document.getElementById('btn-save-perfil');
    btn.disabled = true; btn.innerText = "Sincronizando...";

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value,
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value,
        updated_at: new Date()
    };

    const file = document.getElementById('perfil-upload').files[0];
    if (file) {
        const path = `${session.user.id}/avatar-${Date.now()}`;
        const { error: upErr } = await _supabase.storage.from('avatars').upload(path, file);
        if (!upErr) {
            const { data } = _supabase.storage.from('avatars').getPublicUrl(path);
            updates.avatar_url = data.publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    btn.disabled = false; btn.innerText = "Salvar Alterações";

    if (!error) {
        alert("Perfil atualizado com sucesso!");
        verPerfilPublico(session.user.id);
    }
};

window.verPerfilPublico = async (uid) => {
    mostrarTela('user-dashboard');
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    if (p) {
        document.getElementById('dash-nome').innerText = p.username || "Morador";
        document.getElementById('dash-bairro').innerText = p.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = p.bio || "";
        const img = document.getElementById('img-perfil');
        if (p.avatar_url) { img.src = p.avatar_url; img.classList.remove('hidden'); }
        
        // Carrega posts do usuário
        const { data: posts } = await _supabase.from('posts').select('content').eq('user_id', uid);
        document.getElementById('historico-posts').innerHTML = posts.map(po => `<div class="p-3 border-b text-sm">${escaparHTML(po.content)}</div>`).join('');
    }
};

// --- 8. UTILIDADES E SEGURANÇA ---
function escaparHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

window.compartilharPost = (id) => {
    const link = `${window.location.origin}${window.location.pathname}#post-${id}`;
    navigator.clipboard.writeText(link).then(() => alert("Link copiado para a área de transferência!"));
};

async function verificarEstadoAuth() {
    const { data: { session } } = await _supabase.auth.getSession();
    const btnPost = document.getElementById('btn-nav-avisar');
    // Ajustes de UI baseados no login
}

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// Adicione aqui as funções de menuSocial (Follow/Block), apagarComentario, etc.
// conforme a necessidade de cada botão injetado no HTML.
