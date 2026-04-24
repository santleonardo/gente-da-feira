/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.3.0 (Full Production Stack)
 * Desenvolvedor: Leonardo Almeida
 * * Descrição: Este arquivo gerencia a lógica central do PWA, incluindo:
 * - Autenticação e Gestão de Sessão persistente.
 * - Feed Hiper-local com filtragem por bairros de Feira de Santana.
 * - Sistema de Threads (Comentários aninhados) com recursividade.
 * - Engine de Reações (Emojis) para posts e comentários.
 * - Integração com Supabase Storage para Avatares.
 * - Sistema de Social (Seguidores e Bloqueios).
 */

console.log("🚀 Iniciando Gente da Feira v4.3.0...");

// --- 1. CONFIGURAÇÕES GLOBAIS E CONSTANTES ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["😍", "😂", "😡", "😢"];

// Lista exaustiva de bairros para validação e selects
const BAIRROS_FSA = [
    "Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", 
    "Cidade Nova", "Conceição", "Eucalipto", "Feira IX", "Feira X", "George Américo", 
    "Humildes", "Itatiaia", "Jardim Cruzeiro", "Lagoa Salgada", "Limoeiro", "Mangabeira", 
    "Muchila", "Novo Horizonte", "Papagaio", "Parque Ipê", "Ponto Central", "Queimadinha", 
    "Rua Nova", "Santa Mônica", "Santo Antônio dos Prazeres", "SIM", "Sobradinho", "Tomba"
].sort();

// --- 2. MOTOR DE INICIALIZAÇÃO ---
async function inicializarApp() {
    console.log("🛠️ Verificando dependências...");
    
    if (typeof supabase === 'undefined') {
        console.warn("⚠️ SDK do Supabase ainda não carregado. Tentando novamente...");
        return setTimeout(inicializarApp, 500);
    }

    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Conexão com Supabase estabelecida.");

    // Configuração de Canais Realtime para sincronização instantânea entre moradores
    const canalGlobal = _supabase.channel('public_changes');
    
    canalGlobal
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
            console.log("📝 Novo post detectado:", payload);
            carregarFeed();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => carregarFeed())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => carregarFeed())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => carregarFeed())
        .subscribe();

    // Inicialização da interface
    popularMenusBairros();
    await verificarSessao();
    carregarFeed();
    configurarDeepLinks();
}

document.addEventListener('DOMContentLoaded', inicializarApp);

// --- 3. GESTÃO DE INTERFACE (UI ENGINE) ---
function mostrarTela(idAlvo) {
    console.log(`📌 Navegando para: ${idAlvo}`);
    const todasTelas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    
    todasTelas.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('animate-fade-in');
        }
    });

    const ativa = document.getElementById(idAlvo);
    if (ativa) {
        ativa.classList.remove('hidden');
        ativa.classList.add('animate-fade-in');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
window.mostrarTela = mostrarTela;

function popularMenusBairros() {
    const ids = ['perfil-bairro', 'post-zona'];
    ids.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="Geral">Toda a Cidade</option>';
            BAIRROS_FSA.forEach(bairro => {
                const opt = document.createElement('option');
                opt.value = bairro;
                opt.textContent = bairro;
                select.appendChild(opt);
            });
        }
    });
}

// --- 4. CORE: SISTEMA DE FEED E FILTRAGEM ---
async function carregarFeed(filtroAtivo = 'geral') {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const uid = session?.user?.id;

    console.log(`🔍 Carregando feed: ${filtroAtivo}`);

    // Construção da Query Relacional (Posts -> Perfis -> Comentários -> Reações)
    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url),
            reactions (emoji_type, user_id),
            comments (
                *,
                profiles:user_id (username, avatar_url),
                reactions (emoji_type, user_id)
            )
        `)
        .order('created_at', { ascending: false });

    // Lógica de Filtro por Localidade
    if (filtroAtivo === 'bairro' && uid) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', uid).single();
        if (p?.bairro && p.bairro !== 'Geral') {
            query = query.eq('zona', p.bairro);
        }
    }

    // Aplicação de restrições (Bloqueios)
    if (uid) {
        const { data: blocks } = await _supabase.from('restrictions').select('target_id').eq('user_id', uid);
        const idsBloqueados = blocks?.map(b => b.target_id) || [];
        if (idsBloqueados.length > 0) {
            query = query.not('user_id', 'in', `(${idsBloqueados.join(',')})`);
        }
    }

    const { data: posts, error } = await query;
    if (error) {
        console.error("❌ Falha na busca de dados:", error);
        return;
    }

    renderizarPosts(posts, uid, container);
}

function renderizarPosts(posts, currentUid, container) {
    container.innerHTML = "";

    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-40">
                <span class="text-5xl mb-4">📭</span>
                <p class="font-black uppercase text-xs tracking-widest">Nenhum aviso nesta região</p>
            </div>`;
        return;
    }

    posts.forEach(post => {
        const postElement = document.createElement('article');
        postElement.className = "bg-white p-5 shadow-sm rounded-2xl border-l-[6px] border-feira-bronze mb-6 transition-all hover:shadow-md relative";
        postElement.setAttribute('data-post-id', post.id);

        const reactionsHtml = renderizarBarraReacoes(post.id, post.reactions, false);
        const commentsHtml = renderizarArvoreComentarios(post.comments, post.id, currentUid);

        postElement.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-12 h-12 bg-gray-100 rounded-full border-2 border-feira-bege overflow-hidden flex items-center justify-center text-xl shadow-inner">
                        ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-900 leading-tight">${escaparHTML(post.profiles?.username || "Morador")}</h4>
                        <span class="text-[9px] bg-feira-marinho text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">${post.zona}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="abrirMenuSocial('${post.user_id}', this)" class="text-gray-300 hover:text-black p-2 text-xl transition-colors">⋮</button>
                    ${currentUid === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-200 hover:text-red-600 p-1">🗑️</button>` : ''}
                </div>
            </div>

            <div class="text-gray-800 text-[15px] leading-relaxed mb-4 whitespace-pre-wrap font-medium">${escaparHTML(post.content)}</div>
            
            <div class="flex gap-4 border-y border-gray-50 py-3 mb-4 items-center overflow-x-auto no-scrollbar">
                ${reactionsHtml}
                <button onclick="compartilharPost('${post.id}')" class="ml-auto text-gray-300 hover:text-feira-marinho text-sm flex items-center gap-1 font-bold">
                   <small>PARTILHAR</small> 🔗
                </button>
            </div>

            <div class="space-y-3" id="thread-${post.id}">
                ${commentsHtml}
            </div>

            <div class="mt-4 pt-4 border-t border-gray-50">
                <div id="reply-box-${post.id}" class="hidden flex justify-between bg-feira-preto text-white text-[10px] p-2 rounded-t-xl font-black">
                    <span>RESPONDENDO A <span class="text-feira-bronze uppercase" id="reply-name-${post.id}"></span></span>
                    <button onclick="cancelarResposta('${post.id}')" class="px-2">✕</button>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="input-${post.id}" data-parent="" placeholder="Escrever um comentário..." 
                           class="flex-1 bg-gray-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-feira-bronze outline-none shadow-inner transition-all">
                    <button onclick="enviarComentario('${post.id}')" class="bg-feira-marinho text-white px-4 rounded-xl font-black text-[10px] uppercase active:scale-95 transition-transform shadow-md">Enviar</button>
                </div>
            </div>
        `;
        container.appendChild(postElement);
    });
}

// --- 5. SISTEMA DE COMENTÁRIOS EM THREADS (RECURSIVO) ---
function renderizarArvoreComentarios(listaTotal, postId, uidLogado) {
    if (!listaTotal || listaTotal.length === 0) return `<p class="text-[10px] text-gray-300 italic px-2">Sê o primeiro a comentar...</p>`;

    const raiz = listaTotal.filter(c => !c.parent_id);
    
    const gerarHtml = (comentario, nivel = 0) => {
        const filhos = listaTotal.filter(f => f.parent_id === comentario.id);
        const reacoes = renderizarBarraReacoes(comentario.id, comentario.reactions || [], true);
        
        return `
        <div class="${nivel > 0 ? 'ml-6 mt-2 border-l-2 border-gray-100 pl-3' : 'bg-gray-50 p-3 rounded-2xl mb-2'} animate-fade-in">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <span class="text-[12px] leading-snug">
                        <b class="text-black font-black cursor-pointer hover:underline" onclick="verPerfilPublico('${comentario.user_id}')">
                            ${escaparHTML(comentario.profiles?.username || 'Morador')}:
                        </b> 
                        ${escaparHTML(comentario.content)}
                    </span>
                </div>
                ${comentario.user_id === uidLogado ? `
                    <button onclick="apagarComentario('${comentario.id}')" class="text-gray-300 hover:text-red-500 transition-colors ml-2">
                        <small>✕</small>
                    </button>
                ` : ''}
            </div>
            <div class="flex gap-3 mt-2 items-center">
                <button onclick="prepararResposta('${postId}', '${comentario.id}', '${escaparHTML(comentario.profiles?.username)}')" 
                        class="text-[9px] font-black text-gray-400 uppercase tracking-tighter hover:text-feira-marinho">Responder</button>
                <div class="flex gap-2">${reacoes}</div>
            </div>
            ${filhos.map(f => gerarHtml(f, nivel + 1)).join('')}
        </div>`;
    };

    return raiz.map(c => gerarHtml(c)).join('');
}

function renderizarBarraReacoes(id, reacoes, ehComentario) {
    return EMOJIS.map(emoji => {
        const total = reacoes.filter(r => r.emoji_type === emoji).length;
        return `
            <button onclick="executarReacao('${id}', '${emoji}', ${ehComentario})" 
                    class="flex items-center gap-1 hover:scale-110 transition-transform">
                <span class="text-sm">${emoji}</span>
                <span class="text-[10px] font-black text-gray-400">${total > 0 ? total : ''}</span>
            </button>
        `;
    }).join('');
}

// --- 6. AÇÕES DE CONTEÚDO (POSTS & COMS) ---
window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    const btn = document.querySelector('button[onclick="enviarPost()"]');

    if (content.length < 3) return alert("Por favor, escreva um aviso válido.");

    btn.disabled = true;
    btn.innerText = "A PUBLICAR...";

    const { error } = await _supabase.from('posts').insert({
        content,
        zona,
        user_id: session.user.id
    });

    btn.disabled = false;
    btn.innerText = "PUBLICAR AVISO";

    if (!error) {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
        carregarFeed();
    } else {
        alert("Erro ao publicar: " + error.message);
    }
};

window.enviarComentario = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const input = document.getElementById(`input-${postId}`);
    const content = input.value.trim();
    const parentId = input.getAttribute('data-parent') || null;

    if (!content) return;

    const { error } = await _supabase.from('comments').insert({
        post_id: postId,
        user_id: session.user.id,
        content,
        parent_id: parentId
    });

    if (!error) {
        input.value = "";
        cancelarResposta(postId);
        carregarFeed();
    }
};

window.executarReacao = async (targetId, emoji, ehComentario) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const campoAlvo = ehComentario ? 'comment_id' : 'post_id';
    
    // Verifica se já reagiu com o mesmo emoji (Toggle)
    const { data: existente } = await _supabase.from('reactions')
        .select('id, emoji_type')
        .eq('user_id', session.user.id)
        .eq(campoAlvo, targetId)
        .maybeSingle();

    if (existente) {
        if (existente.emoji_type === emoji) {
            await _supabase.from('reactions').delete().eq('id', existente.id);
        } else {
            await _supabase.from('reactions').update({ emoji_type: emoji }).eq('id', existente.id);
        }
    } else {
        const novaReacao = { user_id: session.user.id, emoji_type: emoji };
        novaReacao[campoAlvo] = targetId;
        await _supabase.from('reactions').insert(novaReacao);
    }
    carregarFeed();
};

// --- 7. PERFIL, STORAGE E SOCIAL ---
window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const btn = document.getElementById('btn-save-perfil');
    if (btn) { btn.disabled = true; btn.innerText = "A GUARDAR..."; }

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value.trim(),
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value.trim(),
        updated_at: new Date()
    };

    // Upload de Imagem para o Bucket
    const fileInput = document.getElementById('perfil-upload');
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await _supabase.storage.from('avatars').upload(filePath, file);

        if (!uploadError) {
            const { data } = _supabase.storage.from('avatars').getPublicUrl(filePath);
            updates.avatar_url = data.publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    
    if (btn) { btn.disabled = false; btn.innerText = "SALVAR ALTERAÇÕES"; }

    if (!error) {
        alert("Perfil atualizado com sucesso em Feira!");
        verPerfilPublico(session.user.id);
    }
};

window.verPerfilPublico = async (uid) => {
    mostrarTela('user-dashboard');
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    
    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Morador";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem biografia.";
        
        const avatarImg = document.getElementById('img-perfil');
        if (perfil.avatar_url) {
            avatarImg.src = perfil.avatar_url;
            avatarImg.classList.remove('hidden');
        }

        // Carregar estatísticas e histórico
        const { data: posts } = await _supabase.from('posts').select('content, created_at').eq('user_id', uid).order('created_at', { ascending: false });
        document.getElementById('dash-count').innerText = posts?.length || 0;
        
        const histContainer = document.getElementById('historico-posts');
        histContainer.innerHTML = posts?.map(p => `
            <div class="p-4 bg-gray-50 rounded-xl mb-2 border border-gray-100 text-sm">
                ${escaparHTML(p.content)}
                <div class="text-[9px] mt-2 opacity-30 font-bold">${new Date(p.created_at).toLocaleDateString()}</div>
            </div>
        `).join('') || '<p class="text-center opacity-20 py-4">Ainda não há avisos.</p>';
    }
};

// --- 8. UTILIDADES, SEGURANÇA E AUTH ---
function escaparHTML(texto) {
    if (!texto) return "";
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

window.compartilharPost = (id) => {
    const url = `${window.location.origin}${window.location.pathname}#post-${id}`;
    if (navigator.share) {
        navigator.share({ title: 'Gente da Feira', text: 'Vê este aviso em Feira de Santana:', url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert("Link copiado para a área de transferência!"));
    }
};

async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    const btnAvisar = document.getElementById('btn-nav-avisar');
    
    if (session) {
        console.log("👤 Sessão ativa para:", session.user.email);
    }
}

window.fazerLogout = async () => {
    if (confirm("Desejas sair do Gente da Feira?")) {
        await _supabase.auth.signOut();
        location.reload();
    }
};

window.prepararResposta = (postId, commentId, nome) => {
    const box = document.getElementById(`reply-box-${postId}`);
    const input = document.getElementById(`input-${postId}`);
    const nameSpan = document.getElementById(`reply-name-${postId}`);
    
    input.setAttribute('data-parent', commentId);
    nameSpan.innerText = nome;
    box.classList.remove('hidden');
    input.placeholder = `A responder a ${nome}...`;
    input.focus();
};

window.cancelarResposta = (postId) => {
    const box = document.getElementById(`reply-box-${postId}`);
    const input = document.getElementById(`input-${postId}`);
    input.setAttribute('data-parent', "");
    box.classList.add('hidden');
    input.placeholder = "Escrever um comentário...";
};

function configurarDeepLinks() {
    const hash = window.location.hash;
    if (hash.includes('post-')) {
        const id = hash.split('-')[1];
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-4', 'ring-feira-bronze', 'ring-opacity-40');
            }
        }, 1500);
    }
}

window.mudarFeed = (tipo) => carregarFeed(tipo);
window.abrirPostagem = () => mostrarTela('form-post');
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id);
    else mostrarTela('auth-screen');
};

window.apagarComentario = async (id) => {
    if (confirm("Eliminar este comentário?")) {
        await _supabase.from('comments').delete().eq('id', id);
        carregarFeed();
    }
};

window.excluirPost = async (id) => {
    if (confirm("Tens a certeza que queres apagar este aviso?")) {
        await _supabase.from('posts').delete().eq('id', id);
        carregarFeed();
    }
};

// Inicializa o sistema se o DOM já estiver pronto
if (document.readyState === 'complete') inicializarApp();
