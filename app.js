console.log("Sistema Gente da Feira - Versão 4.0 (Social + Threads + Emojis)");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;

// AJUSTE #5: Lista de Bairros Oficiais
const BAIRROS_FSA = [
    "Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", 
    "Cidade Nova", "Conceição", "Eucalipto", "Feira IX", "Feira X", "George Américo", 
    "Humildes", "Itatiaia", "Jardim Cruzeiro", "Lagoa Salgada", "Limoeiro", "Mangabeira", 
    "Muchila", "Novo Horizonte", "Papagaio", "Parque Ipê", "Ponto Central", "Queimadinha", 
    "Rua Nova", "Santa Mônica", "Santo Antônio dos Prazeres", "SIM", "Sobradinho", "Tomba"
].sort();

// NOVA FUNCIONALIDADE: Emojis unificados para Posts e Comentários
const EMOJIS = ["😍", "😂", "😡", "😢"];

// --- 2. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // AJUSTE #2: Realtime inteligente
        _supabase
            .channel('fluxo-avisos-feira')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => carregarFeed())
            .subscribe();

        popularSelectBairros();
        carregarFeed();
        verificarHash(); // AJUSTE #7: Deep Linking
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

function popularSelectBairros() {
    const selects = ['perfil-bairro', 'post-zona'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<option value="Geral">Geral (Feira de Santana)</option>`;
            BAIRROS_FSA.forEach(b => el.add(new Option(b, b)));
        }
    });
}

// AJUSTE #7: Detectar Link de Post Específico
function verificarHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#post-')) {
        const postId = hash.split('-')[1];
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${postId}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    }
}

// --- 3. UI E NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
    window.scrollTo(0,0);
}
window.mostrarTela = mostrarTela;

function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// --- 4. LÓGICA DE THREADS ---
window.prepararResposta = (postId, commentId, username) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    const nameSpan = document.getElementById(`reply-to-name-${postId}`);
    
    input.setAttribute('data-parent-id', commentId);
    input.placeholder = `Respondendo a ${username}...`;
    input.focus();
    
    if(nameSpan) nameSpan.innerText = username;
    if(indicator) indicator.classList.remove('hidden');
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelarResposta = (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    input.setAttribute('data-parent-id', "");
    input.placeholder = "Escreva um comentário...";
    if(indicator) indicator.classList.add('hidden');
};

// --- 5. LÓGICA DO FEED (INTEGRADA COM FILTROS SOCIAIS) ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    // NOVO: Buscar restrições de bloqueio antes de listar o feed
    let IDsRestritos = [];
    if (currentUserId) {
        const { data: restricoes } = await _supabase
            .from('restrictions')
            .select('target_id')
            .eq('user_id', currentUserId);
        IDsRestritos = restricoes?.map(r => r.target_id) || [];
    }

    // Query Otimizada com JOINS
    let query = _supabase
        .from('posts')
        .select(`
            *, 
            profiles:user_id(username, bairro, avatar_url),
            reactions(emoji_type, user_id),
            comments(
                *, 
                profiles:user_id(username),
                reactions(emoji_type, user_id)
            )
        `)
        .order('created_at', { ascending: false });

    if (apenasZona && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', currentUserId).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    // Filtra para não mostrar posts de usuários bloqueados
    if (IDsRestritos.length > 0) {
        query = query.not('user_id', 'in', `(${IDsRestritos.join(',')})`);
    }

    const { data: posts, error } = await query;
    if (error) return console.error(error);

    container.innerHTML = "";

    posts.forEach(post => {
        const postReacts = post.reactions || [];
        const postComments = post.comments || [];
        const mainComments = postComments.filter(c => !c.parent_id);

        // FUNÇÃO RECURSIVA: Renderiza comentários e suas respostas em cascata (THREADS)
        const renderComentario = (c, isReply = false) => {
            const contagemReacoes = c.reactions || [];
            const filhos = postComments.filter(filho => filho.parent_id === c.id);
            
            return `
            <div class="${isReply ? 'ml-5 mt-2 border-l-2 border-gray-300 pl-3 py-1' : 'bg-gray-50 p-3 rounded-lg border-l-2 border-[#FFD700] mb-3'}">
                <div class="flex justify-between items-start">
                    <p class="text-[11px] text-gray-700 leading-relaxed">
                        <b class="text-black">${escaparHTML(c.profiles?.username || "Morador")}:</b> ${escaparHTML(c.content)}
                    </p>
                    ${c.user_id === currentUserId ? `
                        <button onclick="apagarComentario('${c.id}')" class="text-gray-300 hover:text-red-500 text-[10px] ml-2 transition">🗑️</button>
                    ` : ''}
                </div>
                
                <div class="flex gap-3 mt-2 items-center">
                    <button onclick="prepararResposta('${post.id}', '${c.id}', '${escaparHTML(c.profiles?.username || "Morador")}')" 
                            class="text-[9px] font-black uppercase text-gray-400 hover:text-black transition">
                        Responder
                    </button>
                    
                    <div class="flex gap-2 border-l border-gray-300 pl-3">
                        ${EMOJIS.map(e => `
                            <button onclick="reagir('${c.id}', '${e}', true)" class="text-xs filter grayscale hover:grayscale-0 transition flex items-center gap-1">
                                ${e} <span class="text-[9px] text-gray-500 font-bold">${contagemReacoes.filter(r => r.emoji_type === e).length || ''}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                ${filhos.length > 0 ? `
                    <div class="mt-2 animate-fade-in">
                        ${filhos.map(filho => renderComentario(filho, true)).join('')}
                    </div>
                ` : ''}
            </div>`;
        };

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-[#FFD700] mb-4 animate-fade-in";
        div.setAttribute('data-post-id', post.id);
        
        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">
                        ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-gray-800">${escaparHTML(post.profiles?.username || "Morador")}</h3>
                        <p class="text-[10px] text-black font-black uppercase bg-[#FFD700] px-1 rounded w-fit">${escaparHTML(post.zona || "Geral")}</p>
                    </div>
                </div>
                <div class="flex gap-3 items-center">
                    <div class="relative group">
                        <button class="text-gray-400 hover:text-black p-1 text-xl">⋮</button>
                        <div class="hidden group-hover:block absolute right-0 bg-white shadow-2xl border rounded-xl w-40 z-[100] py-1 animate-fade-in">
                            <button onclick="socialAction('${post.user_id}', 'follow')" class="w-full text-left px-4 py-2 text-[10px] font-black uppercase hover:bg-gray-50">➕ Seguir</button>
                            <button onclick="socialAction('${post.user_id}', 'add_friend')" class="w-full text-left px-4 py-2 text-[10px] font-black uppercase hover:bg-gray-50">🤝 Add Amigo</button>
                            <hr class="my-1">
                            <button onclick="socialAction('${post.user_id}', 'mute')" class="w-full text-left px-4 py-2 text-[10px] font-black uppercase hover:bg-gray-50 text-orange-500">🔇 Silenciar</button>
                            <button onclick="socialAction('${post.user_id}', 'block')" class="w-full text-left px-4 py-2 text-[10px] font-black uppercase hover:bg-red-50 text-red-600">🚫 Bloquear</button>
                        </div>
                    </div>

                    <button onclick="compartilharPost(${post.id})" class="text-gray-300 hover:text-black">🔗</button>
                    ${currentUserId === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-300 hover:text-red-500">🗑️</button>` : ''}
                </div>
            </div>
            <p class="text-gray-700 text-sm mb-4 whitespace-pre-wrap">${escaparHTML(post.content)}</p>
            
            <div class="flex gap-4 border-t border-b border-gray-100 py-2 mb-3">
                ${EMOJIS.map(e => `
                    <button onclick="reagir('${post.id}', '${e}', false)" class="text-sm filter grayscale hover:grayscale-0 transition flex items-center gap-1">
                        ${e} <span class="text-[10px] text-gray-500 font-bold">${postReacts.filter(r => r.emoji_type === e).length || ''}</span>
                    </button>
                `).join('')}
            </div>

            <div class="space-y-1 mb-3">
                ${mainComments.length > 0 ? mainComments.map(c => renderComentario(c, false)).join('') : '<p class="text-xs text-gray-400 italic">Nenhum comentário ainda.</p>'}
            </div>

            <div class="mt-4">
                <div id="reply-indicator-${post.id}" class="hidden flex justify-between items-center text-[10px] font-black text-white bg-black px-3 py-1 rounded-t-lg w-full">
                    <span>RESPONDENDO A <span id="reply-to-name-${post.id}" class="text-[#FFD700]"></span></span>
                    <button onclick="cancelarResposta('${post.id}')" class="text-white hover:text-red-400">✕</button>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="comment-input-${post.id}" data-parent-id="" placeholder="Escreva um comentário..." 
                           class="flex-1 text-xs p-2.5 border rounded-xl outline-none focus:border-black transition-all">
                    <button id="btn-comment-${post.id}" onclick="comentar(${post.id})" class="bg-black text-[#FFD700] px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform">ENVIAR</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 6. INTERAÇÕES DE CONTEÚDO ---
window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const input = document.getElementById(`comment-input-${postId}`);
    const btn = document.getElementById(`btn-comment-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    btn.disabled = true; btn.innerText = "...";

    const { error } = await _supabase.from('comments').insert([{ 
        post_id: postId, user_id: session.user.id, content: content,
        parent_id: input.getAttribute('data-parent-id') || null
    }]);

    btn.disabled = false; btn.innerText = "ENVIAR";
    if (!error) { input.value = ""; cancelarResposta(postId); }
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    const btn = document.querySelector('#form-post button[onclick="enviarPost()"]');

    if (content.length < 10 || content.length > 500) {
        return alert("O aviso deve ter entre 10 e 500 caracteres.");
    }

    btn.disabled = true; btn.innerText = "PUBLICANDO...";

    const { error } = await _supabase.from('posts').insert([{ content, user_id: session.user.id, zona }]);
    
    btn.disabled = false; btn.innerText = "PUBLICAR AVISO";
    
    if (error) alert("Erro ao postar. Tente novamente.");
    else {
        document.getElementById('post-content').value = ""; 
        mostrarTela('feed-container');
    }
};

window.reagir = async (id, emoji, isComment = false) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const userId = session.user.id;
    const campoId = isComment ? 'comment_id' : 'post_id';

    const { data: existente } = await _supabase.from('reactions').select('id, emoji_type').eq('user_id', userId).eq(campoId, id).maybeSingle();

    if (existente) {
        if (existente.emoji_type === emoji) {
            await _supabase.from('reactions').delete().eq('id', existente.id);
        } else {
            await _supabase.from('reactions').update({ emoji_type: emoji }).eq('id', existente.id);
        }
    } else {
        const novaReacao = { user_id: userId, emoji_type: emoji };
        novaReacao[campoId] = id;
        await _supabase.from('reactions').insert([novaReacao]);
    }
};

// --- 7. NOVAS FUNÇÕES SOCIAIS ---
window.socialAction = async (targetId, actionType) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    const userId = session.user.id;

    if (userId === targetId) return alert("Ação inválida consigo mesmo.");

    if (actionType === 'follow') {
        await _supabase.from('connections').upsert({ requester_id: userId, target_id: targetId, status: 'following' });
        alert("Seguindo!");
    } else if (actionType === 'add_friend') {
        await _supabase.from('connections').upsert({ requester_id: userId, target_id: targetId, status: 'friend_pending' });
        alert("Solicitação enviada!");
    } else if (actionType === 'mute' || actionType === 'block') {
        if (confirm(`Confirmar esta ação?`)) {
            await _supabase.from('restrictions').insert({ user_id: userId, target_id: targetId, type: actionType });
            actionType === 'block' ? location.reload() : carregarFeed();
        }
    }
};

// --- 8. PERFIL E DASHBOARD ---
window.verPerfilPublico = async function(userId) {
    mostrarTela('user-dashboard');
    const [{ data: perfil }, { data: posts }] = await Promise.all([
        _supabase.from('profiles').select('*').eq('id', userId).single(),
        _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Morador";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem bio definida.";
        const img = document.getElementById('img-perfil'), emo = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) { img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden'); }
        else { img.classList.add('hidden'); emo.classList.remove('hidden'); }
    }
    document.getElementById('dash-count').innerText = posts?.length || 0;
    const historico = document.getElementById('historico-posts');
    historico.innerHTML = posts?.length ? posts.map(p => `<div class="bg-gray-50 p-3 rounded-xl border mb-2 text-sm"><p class="text-gray-700">${escaparHTML(p.content)}</p></div>`).join('') : "<p class='text-center text-gray-400 text-xs py-4'>Nenhum aviso.</p>";

    const { data: { session } } = await _supabase.auth.getSession();
    document.getElementById('dash-acoes').classList.toggle('hidden', session?.user.id !== userId);
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const btn = document.querySelector('#form-perfil button[onclick="salvarPerfil()"]');
    btn.disabled = true; btn.innerText = "SALVANDO...";

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value,
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value,
        updated_at: new Date()
    };

    const fileInput = document.getElementById('perfil-upload');
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const path = `${session.user.id}/avatar-${Date.now()}`;
        const { data: up } = await _supabase.storage.from('avatars').upload(path, file);
        if (up) updates.avatar_url = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    btn.disabled = false; btn.innerText = "SALVAR ALTERAÇÕES";
    if (error) alert(error.message); else verPerfilPublico(session.user.id);
};

// --- 9. AUTH ---
window.fazerLogin = async () => {
    const btn = document.querySelector('#auth-screen button[onclick="fazerLogin()"]');
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    btn.disabled = true; btn.innerText = "ENTRANDO...";
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); btn.disabled = false; btn.innerText = "ENTRAR"; } 
    else { carregarFeed(); mostrarTela('feed-container'); }
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert(error.message); else alert("Conta criada! Verifique seu e-mail.");
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); mostrarTela('auth-screen'); };

// --- 10. CONTROLES GLOBAIS ---
window.mudarFeed = (tipo) => { carregarFeed(tipo !== 'global'); };
window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) mostrarTela('auth-screen'); else mostrarTela('form-post');
};
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};
window.apagarComentario = async (id) => {
    if (confirm("Apagar seu comentário?")) await _supabase.from('comments').delete().eq('id', id);
};
window.excluirPost = async (id) => {
    if (confirm("Apagar aviso permanentemente?")) { await _supabase.from('posts').delete().eq('id', id); carregarFeed(); }
};
window.compartilharPost = (id) => {
    const url = `${window.location.origin}${window.location.pathname}#post-${id}`;
    navigator.clipboard.writeText(url); alert("Link copiado!");
};
