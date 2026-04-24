console.log("Sistema Gente da Feira - Versão 4.2 (Integrada & Extensa)");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;

// Lista de Bairros Oficiais de Feira de Santana
const BAIRROS_FSA = [
    "Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", 
    "Cidade Nova", "Conceição", "Eucalipto", "Feira IX", "Feira X", "George Américo", 
    "Humildes", "Itatiaia", "Jardim Cruzeiro", "Lagoa Salgada", "Limoeiro", "Mangabeira", 
    "Muchila", "Novo Horizonte", "Papagaio", "Parque Ipê", "Ponto Central", "Queimadinha", 
    "Rua Nova", "Santa Mônica", "Santo Antônio dos Prazeres", "SIM", "Sobradinho", "Tomba"
].sort();

// Emojis unificados para Posts e Comentários
const EMOJIS = ["😍", "😂", "😡", "😢"];

// --- 2. INICIALIZAÇÃO DO SISTEMA ---
function inicializarSupabase() {
    console.log("Tentando conectar ao Supabase...");
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // Configuração do Realtime para atualização instantânea
        _supabase
            .channel('fluxo-avisos-feira')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => carregarFeed())
            .subscribe();

        popularSelectBairros();
        carregarFeed();
        verificarHash(); 
    } else {
        console.warn("Supabase ainda não carregado, tentando novamente...");
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
            BAIRROS_FSA.forEach(b => {
                const opt = new Option(b, b);
                el.add(opt);
            });
        }
    });
}

function verificarHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#post-')) {
        const postId = hash.split('-')[1];
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${postId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-feira-bronze');
            }
        }, 1000);
    }
}

// --- 3. INTERFACE E NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const ativa = document.getElementById(telaAtiva);
    if (ativa) {
        ativa.classList.remove('hidden');
        ativa.classList.add('animate-fade-in');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.mostrarTela = mostrarTela;

function escaparHTML(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, m => map[m]);
}

// --- 4. LÓGICA DE THREADS (RESPOSTAS EM CASCATA) ---
window.prepararResposta = (postId, commentId, username) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    const nameSpan = document.getElementById(`reply-to-name-${postId}`);
    
    input.setAttribute('data-parent-id', commentId);
    input.placeholder = `Respondendo a ${username}...`;
    input.focus();
    
    if(nameSpan) nameSpan.innerText = username;
    if(indicator) indicator.classList.remove('hidden');
    
    const container = input.parentElement;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelarResposta = (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    input.setAttribute('data-parent-id', "");
    input.placeholder = "Escreva um comentário...";
    if(indicator) indicator.classList.add('hidden');
};

// --- 5. LÓGICA DO FEED E FILTROS ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    // 1. Criar a query base
    let query = _supabase
        .from('posts')
        .select(`
            *, 
            profiles:user_id(username, bairro, avatar_url),
            reactions(emoji_type, user_id),
            comments(*, profiles:user_id(username), reactions(emoji_type, user_id))
        `)
        .order('created_at', { ascending: false });

    // 2. Aplicar Filtro de Bairro
    if (apenasZona && currentUserId) {
        const { data: userProfile } = await _supabase
            .from('profiles')
            .select('bairro')
            .eq('id', currentUserId)
            .single();

        if (userProfile?.bairro && userProfile.bairro !== 'Geral') {
            query = query.eq('zona', userProfile.bairro);
        }
    }

    // 3. Filtro de bloqueio
    if (currentUserId) {
        const { data: restricoes } = await _supabase
            .from('restrictions')
            .select('target_id')
            .eq('user_id', currentUserId);
        
        const IDsBloqueados = restricoes?.map(r => r.target_id) || [];
        if (IDsBloqueados.length > 0) {
            query = query.not('user_id', 'in', `(${IDsBloqueados.join(',')})`);
        }
    }

    const { data: posts, error } = await query;
    if (error) return console.error("Erro no feed:", error);

    // 4. Renderização
    container.innerHTML = "";

    posts.forEach(post => {
        const postReacts = post.reactions || [];
        const postComments = post.comments || [];
        const mainComments = postComments.filter(c => !c.parent_id);

        const renderComentario = (c, level = 0) => {
            const isReply = level > 0;
            const contagemReacoes = c.reactions || [];
            const filhos = postComments.filter(filho => filho.parent_id === c.id);
            
            return `
            <div class="${isReply ? 'ml-6 mt-2 border-l-2 border-gray-200 pl-3' : 'bg-gray-50 p-3 rounded-lg border-l-2 border-[#8B6D45] mb-2'}">
                <div class="flex justify-between items-start">
                    <p class="text-[11px] text-gray-700">
                        <b class="text-black font-bold">${escaparHTML(c.profiles?.username || "Morador")}:</b> 
                        ${escaparHTML(c.content)}
                    </p>
                    ${c.user_id === currentUserId ? `
                        <button onclick="apagarComentario('${c.id}')" class="text-gray-300 hover:text-red-500 text-[10px] transition">🗑️</button>
                    ` : ''}
                </div>
                
                <div class="flex gap-3 mt-1 items-center">
                    <button onclick="prepararResposta('${post.id}', '${c.id}', '${escaparHTML(c.profiles?.username || "Morador")}')" 
                            class="text-[9px] font-black uppercase text-gray-400 hover:text-black">
                        Responder
                    </button>
                    
                    <div class="flex gap-2">
                        ${EMOJIS.map(e => `
                            <button onclick="reagir('${c.id}', '${e}', true)" class="text-[10px] transition hover:scale-110 flex items-center gap-0.5">
                                ${e} <span class="font-bold text-gray-500">${contagemReacoes.filter(r => r.emoji_type === e).length || ''}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                ${filhos.length > 0 ? `
                    <div class="mt-1">
                        ${filhos.map(filho => renderComentario(filho, level + 1)).join('')}
                    </div>
                ` : ''}
            </div>`;
        };

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-[#8B6D45] mb-4";
        div.setAttribute('data-post-id', post.id);
        
        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">
                        ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-gray-800">${escaparHTML(post.profiles?.username || "Morador")}</h3>
                        <p class="text-[9px] text-white font-black uppercase bg-[#8B6D45] px-1.5 rounded-sm w-fit">${escaparHTML(post.zona || "Geral")}</p>
                    </div>
                </div>
                <div class="flex gap-3 items-center">
                    <div class="relative group">
                        <button class="text-gray-400 hover:text-black p-1 text-xl focus:outline-none" onclick="this.nextElementSibling.classList.toggle('hidden')">⋮</button>
                        <div class="hidden absolute right-0 bg-white shadow-2xl border rounded-xl w-44 z-[100] py-2 animate-fade-in group-hover:block">
                            <button onclick="socialAction('${post.user_id}', 'follow')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-gray-50 transition">➕ Seguir Morador</button>
                            <button onclick="socialAction('${post.user_id}', 'add_friend')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-gray-50 transition">🤝 Solicitar Amizade</button>
                            <hr class="my-1 border-gray-100">
                            <button onclick="socialAction('${post.user_id}', 'mute')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-orange-50 text-orange-500">🔇 Silenciar</button>
                            <button onclick="socialAction('${post.user_id}', 'block')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-red-50 text-red-600">🚫 Bloquear Usuário</button>
                        </div>
                    </div>
                    <button onclick="compartilharPost(${post.id})" class="text-gray-300 hover:text-black transition">🔗</button>
                    ${currentUserId === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-300 hover:text-red-500 transition">🗑️</button>` : ''}
                </div>
            </div>

            <p class="text-gray-800 text-sm mb-4 leading-relaxed whitespace-pre-wrap">${escaparHTML(post.content)}</p>
            
            <div class="flex gap-5 border-t border-b border-gray-50 py-2.5 mb-3">
                ${EMOJIS.map(e => `
                    <button onclick="reagir('${post.id}', '${e}', false)" class="text-sm transition hover:scale-125 flex items-center gap-1.5">
                        ${e} <span class="text-[11px] text-gray-500 font-black">${postReacts.filter(r => r.emoji_type === e).length || ''}</span>
                    </button>
                `).join('')}
            </div>

            <div class="comments-section space-y-1">
                ${mainComments.length > 0 ? mainComments.map(c => renderComentario(c)).join('') : '<p class="text-[10px] text-gray-400 italic py-2">Seja o primeiro a comentar...</p>'}
            </div>

            <div class="mt-4 pt-2 border-t border-gray-50">
                <div id="reply-indicator-${post.id}" class="hidden flex justify-between items-center text-[9px] font-black text-white bg-black px-3 py-1.5 rounded-t-lg w-full">
                    <span class="uppercase">Respondendo a <span id="reply-to-name-${post.id}" class="text-[#8B6D45]"></span></span>
                    <button onclick="cancelarResposta('${post.id}')" class="text-white hover:text-red-400 font-bold text-xs">✕</button>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="comment-input-${post.id}" data-parent-id="" placeholder="Escreva um comentário..." 
                           class="flex-1 text-xs p-3 border border-gray-200 rounded-xl outline-none focus:border-feira-bronze transition-all shadow-inner bg-gray-50">
                    <button id="btn-comment-${post.id}" onclick="comentar(${post.id})" class="bg-black text-[#8B6D45] px-5 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform uppercase">Enviar</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 6. AÇÕES SOCIAIS E FEEDBACK ---
window.socialAction = async (targetId, actionType) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    
    const userId = session.user.id;
    if (userId === targetId) return alert("Ação inválida consigo mesmo.");

    try {
        if (actionType === 'follow') {
            await _supabase.from('connections').upsert({ requester_id: userId, target_id: targetId, status: 'following' });
            alert("✅ Você agora está seguindo este morador!");
        } else if (actionType === 'add_friend') {
            await _supabase.from('connections').upsert({ requester_id: userId, target_id: targetId, status: 'friend_pending' });
            alert("🤝 Solicitação de amizade enviada!");
        } else if (actionType === 'mute' || actionType === 'block') {
            const confirmacao = confirm(actionType === 'block' ? "Bloquear este usuário? Os avisos dele sumirão para você." : "Deseja silenciar este usuário?");
            if (confirmacao) {
                await _supabase.from('restrictions').insert({ user_id: userId, target_id: targetId, type: actionType });
                alert(actionType === 'block' ? "🚫 Bloqueado com sucesso." : "🔇 Silenciado.");
                carregarFeed(); 
            }
        }
    } catch (e) {
        alert("Erro ao processar ação social.");
    }
};

// --- 7. INTERAÇÕES DE CONTEÚDO (POSTS/COMS/REAC) ---
window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const input = document.getElementById(`comment-input-${postId}`);
    const btn = document.getElementById(`btn-comment-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    btn.disabled = true; 
    btn.innerText = "...";

    const { error } = await _supabase.from('comments').insert([{ 
        post_id: postId, 
        user_id: session.user.id, 
        content: content,
        parent_id: input.getAttribute('data-parent-id') || null
    }]);

    btn.disabled = false; 
    btn.innerText = "ENVIAR";
    
    if (error) {
        alert("Erro ao enviar comentário.");
    } else {
        input.value = ""; 
        cancelarResposta(postId);
    }
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    const btn = document.querySelector('#form-post button[onclick="enviarPost()"]');

    if (content.length < 5) return alert("O aviso é muito curto!");
    if (content.length > 800) return alert("O aviso é muito longo!");

    btn.disabled = true; 
    btn.innerText = "PUBLICANDO...";

    const { error } = await _supabase.from('posts').insert([{ 
        content, 
        user_id: session.user.id, 
        zona 
    }]);
    
    btn.disabled = false; 
    btn.innerText = "PUBLICAR AVISO";
    
    if (error) {
        alert("Erro ao postar.");
    } else {
        document.getElementById('post-content').value = ""; 
        mostrarTela('feed-container');
    }
};

window.reagir = async (id, emoji, isComment = false) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const userId = session.user.id;
    const campoId = isComment ? 'comment_id' : 'post_id';

    const { data: existente } = await _supabase.from('reactions')
        .select('id, emoji_type')
        .eq('user_id', userId)
        .eq(campoId, id)
        .maybeSingle();

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
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem informações adicionais.";
        
        const img = document.getElementById('img-perfil');
        const emo = document.getElementById('emoji-perfil');
        
        if (perfil.avatar_url) {
            img.src = perfil.avatar_url;
            img.classList.remove('hidden');
            emo.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            emo.classList.remove('hidden');
        }

        // Preencher formulário de edição caso seja o dono
        const nomeInput = document.getElementById('perfil-nome');
        const bairroSelect = document.getElementById('perfil-bairro');
        const bioInput = document.getElementById('perfil-bio');
        if(nomeInput) nomeInput.value = perfil.username || "";
        if(bairroSelect) bairroSelect.value = perfil.bairro || "Geral";
        if(bioInput) bioInput.value = perfil.bio || "";
    }
    
    document.getElementById('dash-count').innerText = posts?.length || 0;
    const historico = document.getElementById('historico-posts');
    historico.innerHTML = posts?.length 
        ? posts.map(p => `<div class="bg-white p-3 rounded-xl border border-gray-100 mb-2 text-sm shadow-sm"><p class="text-gray-700">${escaparHTML(p.content)}</p></div>`).join('') 
        : "<p class='text-center text-gray-400 text-[10px] py-10 uppercase font-black'>Nenhum aviso publicado.</p>";

    const { data: { session } } = await _supabase.auth.getSession();
    document.getElementById('dash-acoes').classList.toggle('hidden', session?.user.id !== userId);
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Sessão expirada.");
    
    const btn = document.querySelector('#form-perfil button[onclick="salvarPerfil()"]');
    btn.disabled = true; btn.innerText = "SALVANDO...";

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value.trim(),
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value.trim(),
        updated_at: new Date()
    };

    const fileInput = document.getElementById('perfil-upload');
    if (fileInput?.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const path = `${session.user.id}/avatar-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await _supabase.storage.from('avatars').upload(path, file);
        
        if (!uploadError) {
            const { data: { publicUrl } } = _supabase.storage.from('avatars').getPublicUrl(path);
            updates.avatar_url = publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    btn.disabled = false; btn.innerText = "SALVAR ALTERAÇÕES";
    
    if (error) alert("Erro ao salvar: " + error.message);
    else {
        alert("Perfil atualizado!");
        verPerfilPublico(session.user.id);
    }
};

// --- 9. AUTENTICAÇÃO ---
window.fazerLogin = async () => {
    const btn = document.querySelector('#auth-screen button[onclick="fazerLogin()"]');
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    btn.disabled = true; btn.innerText = "ENTRANDO...";
    
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Dados incorretos.");
        btn.disabled = false; btn.innerText = "ENTRAR";
    } else {
        carregarFeed(); 
        mostrarTela('feed-container');
    }
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert(error.message); else alert("Conta criada! Verifique seu e-mail.");
};

window.fazerLogout = async () => { 
    await _supabase.auth.signOut(); 
    mostrarTela('auth-screen'); 
};

// --- 10. FUNÇÕES DE UTILIDADE ---
window.mudarFeed = (tipo) => carregarFeed(tipo === 'bairro');

window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) mostrarTela('auth-screen'); else mostrarTela('form-post');
};

window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};

window.apagarComentario = async (id) => {
    if (confirm("Apagar seu comentário?")) {
        await _supabase.from('comments').delete().eq('id', id);
    }
};

window.excluirPost = async (id) => {
    if (confirm("Apagar aviso permanentemente?")) { 
        await _supabase.from('posts').delete().eq('id', id); 
        carregarFeed(); 
    }
};

window.compartilharPost = (id) => {
    const url = `${window.location.origin}${window.location.pathname}#post-${id}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("Link do aviso copiado!");
    });
};
