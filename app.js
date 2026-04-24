console.log("Sistema Gente da Feira - Versão 4.3 (Estabilizada)");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;

const BAIRROS_FSA = [
    "Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", 
    "Cidade Nova", "Conceição", "Eucalipto", "Feira IX", "Feira X", "George Américo", 
    "Humildes", "Itatiaia", "Jardim Cruzeiro", "Lagoa Salgada", "Limoeiro", "Mangabeira", 
    "Muchila", "Novo Horizonte", "Papagaio", "Parque Ipê", "Ponto Central", "Queimadinha", 
    "Rua Nova", "Santa Mônica", "Santo Antônio dos Prazeres", "SIM", "Sobradinho", "Tomba"
].sort();

const EMOJIS = ["😍", "😂", "😡", "😢"];

// --- 2. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        _supabase.channel('fluxo-avisos-feira')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => carregarFeed())
            .subscribe();

        popularSelectBairros();
        carregarFeed();
        verificarHash(); 
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

// --- 3. INTERFACE ---
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
    const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
    return String(str).replace(/[&<>"']/g, m => map[m]);
}

// --- 4. THREADS ---
window.prepararResposta = (postId, commentId, username) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    const nameSpan = document.getElementById(`reply-to-name-${postId}`);
    
    input.setAttribute('data-parent-id', commentId);
    input.placeholder = `Respondendo a ${username}...`;
    input.focus();
    
    if(nameSpan) nameSpan.innerText = username;
    if(indicator) indicator.classList.remove('hidden');
    input.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelarResposta = (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    input.setAttribute('data-parent-id', "");
    input.placeholder = "Escreva um comentário...";
    if(indicator) indicator.classList.add('hidden');
};

// --- 5. FEED ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    let IDsRestritos = [];
    if (currentUserId) {
        const { data: restricoes } = await _supabase.from('restrictions').select('target_id').eq('user_id', currentUserId);
        IDsRestritos = restricoes?.map(r => r.target_id) || [];
    }

    let query = _supabase.from('posts').select(`
            *, 
            profiles:user_id(username, bairro, avatar_url),
            reactions(emoji_type, user_id),
            comments(*, profiles:user_id(username), reactions(emoji_type, user_id))
        `).order('created_at', { ascending: false });

    if (apenasZona && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', currentUserId).single();
        if (p?.bairro && p.bairro !== 'Geral') query = query.eq('zona', p.bairro);
    }

    if (IDsRestritos.length > 0) query = query.not('user_id', 'in', `(${IDsRestritos.join(',')})`);

    const { data: posts, error } = await query;
    if (error) return console.error(error);

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
                    <p class="text-[11px] text-gray-700"><b>${escaparHTML(c.profiles?.username || "Morador")}:</b> ${escaparHTML(c.content)}</p>
                    ${c.user_id === currentUserId ? `<button onclick="apagarComentario('${c.id}')" class="text-gray-300 hover:text-red-500 text-[10px]">🗑️</button>` : ''}
                </div>
                <div class="flex gap-3 mt-1 items-center">
                    <button onclick="prepararResposta('${post.id}', '${c.id}', '${escaparHTML(c.profiles?.username || "Morador")}')" class="text-[9px] font-black uppercase text-gray-400">Responder</button>
                    <div class="flex gap-2">${EMOJIS.map(e => `<button onclick="reagir('${c.id}', '${e}', true)" class="text-[10px]">${e} <span class="text-gray-500">${contagemReacoes.filter(r => r.emoji_type === e).length || ''}</span></button>`).join('')}</div>
                </div>
                ${filhos.length > 0 ? `<div class="mt-1">${filhos.map(filho => renderComentario(filho, level + 1)).join('')}</div>` : ''}
            </div>`;
        };

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-[#8B6D45] mb-4";
        div.setAttribute('data-post-id', post.id);
        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}</div>
                    <div><h3 class="font-bold text-sm text-gray-800">${escaparHTML(post.profiles?.username || "Morador")}</h3><p class="text-[9px] text-white font-black uppercase bg-[#8B6D45] px-1.5 rounded-sm w-fit">${escaparHTML(post.zona || "Geral")}</p></div>
                </div>
                <div class="flex gap-3 items-center">
                    <div class="relative group">
                        <button class="text-gray-400 p-1 text-xl" onclick="this.nextElementSibling.classList.toggle('hidden')">⋮</button>
                        <div class="hidden absolute right-0 bg-white shadow-2xl border rounded-xl w-44 z-[100] py-2 group-hover:block">
                            <button onclick="socialAction('${post.user_id}', 'follow')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-gray-50">➕ Seguir</button>
                            <button onclick="socialAction('${post.user_id}', 'block')" class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-red-600 hover:bg-red-50">🚫 Bloquear</button>
                        </div>
                    </div>
                    <button onclick="compartilharPost(${post.id})" class="text-gray-300">🔗</button>
                    ${currentUserId === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-300">🗑️</button>` : ''}
                </div>
            </div>
            <p class="text-sm mb-4 whitespace-pre-wrap">${escaparHTML(post.content)}</p>
            <div class="flex gap-5 border-y border-gray-50 py-2 mb-3">${EMOJIS.map(e => `<button onclick="reagir('${post.id}', '${e}', false)" class="text-sm">${e} <span class="text-[11px] text-gray-500 font-black">${postReacts.filter(r => r.emoji_type === e).length || ''}</span></button>`).join('')}</div>
            <div class="space-y-1">${mainComments.length > 0 ? mainComments.map(c => renderComentario(c)).join('') : '<p class="text-[10px] text-gray-400 italic">Comente algo...</p>'}</div>
            <div class="mt-4 pt-2 border-t">
                <div id="reply-indicator-${post.id}" class="hidden flex justify-between items-center text-[9px] font-black text-white bg-black px-3 py-1.5 rounded-t-lg"><span class="uppercase">Respondendo a <span id="reply-to-name-${post.id}" class="text-[#8B6D45]"></span></span><button onclick="cancelarResposta('${post.id}')">✕</button></div>
                <div class="flex gap-2">
                    <input type="text" id="comment-input-${post.id}" placeholder="Escreva..." class="flex-1 text-xs p-3 border rounded-xl bg-gray-50">
                    <button onclick="comentar(${post.id})" class="bg-black text-[#8B6D45] px-5 py-2 rounded-xl text-xs font-black uppercase">Enviar</button>
                </div>
            </div>`;
        container.appendChild(div);
    });
}

// --- 6. SOCIAL ---
window.socialAction = async (targetId, actionType) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    if (session.user.id === targetId) return alert("Ação inválida.");
    try {
        if (actionType === 'follow') {
            await _supabase.from('connections').upsert({ requester_id: session.user.id, target_id: targetId, status: 'following' });
            alert("Seguindo!");
        } else if (actionType === 'block' && confirm("Bloquear usuário?")) {
            await _supabase.from('restrictions').insert({ user_id: session.user.id, target_id: targetId, type: 'block' });
            carregarFeed();
        }
    } catch (e) { alert("Erro na ação social."); }
};

// --- 7. CONTEÚDO ---
window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    const { error } = await _supabase.from('comments').insert([{ post_id: postId, user_id: session.user.id, content, parent_id: input.getAttribute('data-parent-id') || null }]);
    if (!error) { input.value = ""; cancelarResposta(postId); }
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    if (content.length < 5) return alert("Muito curto.");
    const { error } = await _supabase.from('posts').insert([{ content, user_id: session.user.id, zona }]);
    if (!error) { document.getElementById('post-content').value = ""; mostrarTela('feed-container'); }
};

window.reagir = async (id, emoji, isComment = false) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    const campoId = isComment ? 'comment_id' : 'post_id';
    const { data: ex } = await _supabase.from('reactions').select('id, emoji_type').eq('user_id', session.user.id).eq(campoId, id).maybeSingle();
    if (ex) {
        if (ex.emoji_type === emoji) await _supabase.from('reactions').delete().eq('id', ex.id);
        else await _supabase.from('reactions').update({ emoji_type: emoji }).eq('id', ex.id);
    } else {
        const nova = { user_id: session.user.id, emoji_type: emoji }; nova[campoId] = id;
        await _supabase.from('reactions').insert([nova]);
    }
};

// --- 8. PERFIL (RESTAURADO) ---
window.verPerfilPublico = async function(userId) {
    mostrarTela('user-dashboard');
    const [{ data: perfil }, { data: posts }] = await Promise.all([
        _supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Morador";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem bio.";
        
        // Sincroniza campos do formulário para edição
        if(document.getElementById('perfil-nome')) document.getElementById('perfil-nome').value = perfil.username || "";
        if(document.getElementById('perfil-bairro')) document.getElementById('perfil-bairro').value = perfil.bairro || "Feira de Santana";
        if(document.getElementById('perfil-bio')) document.getElementById('perfil-bio').value = perfil.bio || "";

        const img = document.getElementById('img-perfil'), emo = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) { img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden'); }
        else { img.classList.add('hidden'); emo.classList.remove('hidden'); }
    }
    
    document.getElementById('dash-count').innerText = posts?.length || 0;
    const hist = document.getElementById('historico-posts');
    hist.innerHTML = posts?.length ? posts.map(p => `<div class="bg-white p-3 rounded-lg border mb-2 text-sm"><p>${escaparHTML(p.content)}</p></div>`).join('') : "Vazio.";

    const { data: { session } } = await _supabase.auth.getSession();
    const acoes = document.getElementById('dash-acoes');
    if (acoes) acoes.classList.toggle('hidden', session?.user.id !== userId);
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    
    const btn = document.querySelector('button[onclick="salvarPerfil()"]');
    if(btn) { btn.disabled = true; btn.innerText = "SALVANDO..."; }

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value.trim(),
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value.trim(),
        updated_at: new Date()
    };

    const fileInput = document.getElementById('perfil-upload');
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const path = `avatars/${session.user.id}-${Date.now()}`;
        const { data: up } = await _supabase.storage.from('avatars').upload(path, file);
        if (up) updates.avatar_url = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    if(btn) { btn.disabled = false; btn.innerText = "SALVAR"; }
    
    if (error) alert(error.message); 
    else verPerfilPublico(session.user.id);
};

// --- 9. AUTH & UTILS ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value, pass = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (!error) { carregarFeed(); mostrarTela('feed-container'); } else alert("Erro no login.");
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); mostrarTela('auth-screen'); };
window.mudarFeed = (t) => carregarFeed(t !== 'global');
window.abrirPostagem = async () => { const { data: { session } } = await _supabase.auth.getSession(); session ? mostrarTela('form-post') : mostrarTela('auth-screen'); };
window.gerenciarBotaoPerfil = async () => { const { data: { session } } = await _supabase.auth.getSession(); session ? verPerfilPublico(session.user.id) : mostrarTela('auth-screen'); };
window.apagarComentario = async (id) => { if (confirm("Apagar?")) await _supabase.from('comments').delete().eq('id', id); };
window.excluirPost = async (id) => { if (confirm("Excluir?")) { await _supabase.from('posts').delete().eq('id', id); carregarFeed(); } };
window.compartilharPost = (id) => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#post-${id}`); alert("Link copiado!"); };
