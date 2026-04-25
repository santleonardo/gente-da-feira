/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.9.1 (Filtro por Bairro & Moderação)
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_FSA = ["Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", "Cidade Nova", "Conceição", "Feira IX", "Feira X", "George Américo", "Humildes", "Jardim Cruzeiro", "Limoeiro", "Mangabeira", "Muchila", "Papagaio", "Queimadinha", "Rua Nova", "Santa Mônica", "SIM", "Sobradinho", "Tomba"].sort();

// --- INICIALIZAÇÃO ---
async function inicializarApp() {
    if (typeof supabase === 'undefined') return setTimeout(inicializarApp, 500);
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    popularMenusBairros();
    await verificarSessao();
}

document.addEventListener('DOMContentLoaded', inicializarApp);

// --- NAVEGAÇÃO ---
function mostrarTela(id) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-post', 'edit-profile-screen'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if(el) el.classList.add('hidden');
    });

    // Controla a visibilidade das abas de filtro (só aparecem no feed)
    const tabs = document.getElementById('feed-tabs');
    if (id === 'feed-container') tabs?.classList.remove('hidden');
    else tabs?.classList.add('hidden');
    
    const ativa = document.getElementById(id);
    if (ativa) {
        ativa.classList.remove('hidden');
        ativa.classList.add('animate-fade-in');
        if (id !== 'auth-screen') document.getElementById('main-nav')?.classList.remove('hidden');
    }
}

function popularMenusBairros() {
    const selects = [document.getElementById('post-zona'), document.getElementById('edit-bairro')];
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = select.id === 'post-zona' ? '<option value="Geral">📍 Toda a Cidade</option>' : '';
        BAIRROS_FSA.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b; opt.textContent = b;
            select.appendChild(opt);
        });
    });
}

// --- MODERAÇÃO E EXCLUSÃO ---

window.excluirPost = async (id) => {
    if (confirm("Tem certeza que deseja apagar este aviso?")) {
        const { error } = await _supabase.from('posts').delete().eq('id', id);
        if (error) alert("Erro ao apagar post: " + error.message);
        else window.mudarFeed('Geral');
    }
};

window.apagarComentario = async (id) => {
    if (confirm("Deseja remover este comentário?")) {
        const { error } = await _supabase.from('comments').delete().eq('id', id);
        if (error) alert("Erro ao apagar comentário: " + error.message);
        else carregarFeed();
    }
};

// --- FEED ENGINE ---

window.mudarFeed = (tipo = 'Geral') => {
    const btnGeral = document.getElementById('tab-geral');
    const btnLocal = document.getElementById('tab-local');
    
    if (tipo === 'Geral') {
        btnGeral?.classList.add('bg-feira-marinho', 'text-white');
        btnGeral?.classList.remove('bg-white', 'text-gray-400', 'border');
        btnLocal?.classList.add('bg-white', 'text-gray-400', 'border');
        btnLocal?.classList.remove('bg-feira-marinho', 'text-white');
    } else {
        btnLocal?.classList.add('bg-feira-marinho', 'text-white');
        btnLocal?.classList.remove('bg-white', 'text-gray-400', 'border');
        btnGeral?.classList.add('bg-white', 'text-gray-400', 'border');
        btnGeral?.classList.remove('bg-feira-marinho', 'text-white');
    }

    mostrarTela('feed-container');
    carregarFeed(tipo);
};

async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="text-center p-10 opacity-30 font-black text-xs uppercase tracking-widest animate-pulse">Sintonizando Feira...</div>';

    const { data: { session } } = await _supabase.auth.getSession();
    const userIdLogado = session?.user?.id;

    let bairroUsuario = null;
    if (filtro === 'Local' && userIdLogado) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', userIdLogado).single();
        bairroUsuario = p?.bairro;
    }
let query = _supabase
    .from('posts')
    .select(`
        *,
        profiles:user_id (username, bairro, avatar_url),
        reactions (emoji_type, user_id),
        comments (*, profiles:user_id (username)),
        comment_reactions (comment_id, emoji_type, user_id)
    `)
        .order('created_at', { ascending: false });

    if (filtro === 'Local' && bairroUsuario) {
        query = query.eq('zona', bairroUsuario);
    }

    const { data: posts, error } = await query;

    if (!error) {
        if (posts.length === 0 && filtro === 'Local') {
            container.innerHTML = `
                <div class="text-center p-20">
                    <span class="text-4xl block mb-4">📭</span>
                    <p class="text-gray-400 font-bold text-xs uppercase tracking-widest">Nada no bairro ${bairroUsuario || ''} ainda.</p>
                </div>`;
        } else {
            renderizarFeed(posts || [], container, userIdLogado);
        }
    }
}

function renderizarFeed(posts, container, userIdLogado) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        const isDonoPost = userIdLogado === post.user_id;
        const btnDeletePost = isDonoPost ? `<button onclick="excluirPost('${post.id}')" class="text-[9px] text-red-300 font-bold uppercase">Apagar</button>` : '';

        const avatar = post.profiles?.avatar_url 
            ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">`
            : `<span class="font-black text-feira-marinho">${(post.profiles?.username || 'M')[0].toUpperCase()}</span>`;

        // Reações do Post Principal
        const reacoesPostHtml = EMOJIS.map(emoji => {
            const count = post.reactions?.filter(r => r.emoji_type === emoji).length || 0;
            return `<button onclick="reagir('${post.id}', '${emoji}')" class="flex items-center gap-1">
                <span class="text-sm">${emoji}</span>
                <span class="text-[10px] font-black text-gray-400">${count || ''}</span>
            </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-5">
                <div onclick="verPerfilPublico('${post.user_id}')" class="w-12 h-12 rounded-2xl bg-feira-yellow flex items-center justify-center shadow-md cursor-pointer overflow-hidden border-2 border-white">
                    ${avatar}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <div>
                            <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                            <span class="text-[9px] font-black bg-gray-50 px-2 py-1 rounded-lg text-gray-400 uppercase tracking-tighter">${post.zona}</span>
                        </div>
                        ${btnDeletePost}
                    </div>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-6 leading-relaxed">${post.content}</p>
            <div class="flex items-center justify-between pt-5 border-t border-gray-50">
                <div class="flex gap-4">${reacoesPostHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[10px] font-black uppercase text-feira-marinho bg-feira-yellow/20 px-4 py-2 rounded-xl">Conversa (${post.comments?.length || 0})</button>
            </div>
            
            <div id="thread-${post.id}" class="hidden mt-4 space-y-3 pt-4 border-t border-dashed border-gray-100">
                ${post.comments?.map(c => {
                    const isDonoComentario = userIdLogado === c.user_id;
                    const reacoesComentHtml = EMOJIS.map(emoji => {
                        // Filtra as reações específicas deste comentário
                        const cCount = post.comment_reactions?.filter(cr => cr.comment_id === c.id && cr.emoji_type === emoji).length || 0;
                        return `<button onclick="reagirComentario('${c.id}', '${emoji}', '${post.id}')" class="flex items-center gap-1 opacity-70 hover:opacity-100">
                            <span class="text-[10px]">${emoji}</span>
                            <span class="text-[9px] font-bold text-gray-400">${cCount || ''}</span>
                        </button>`;
                    }).join('');

                    return `
                    <div class="bg-gray-50 p-4 rounded-2xl">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-xs text-gray-700 leading-snug">
                                <b class="text-feira-marinho">${c.profiles?.username || 'User'}:</b> ${c.content}
                            </span>
                            ${isDonoComentario ? `<button onclick="apagarComentario('${c.id}')" class="text-red-300 font-bold ml-2">×</button>` : ''}
                        </div>
                        <div class="flex gap-3 mt-1">
                            ${reacoesComentHtml}
                        </div>
                    </div>`;
                }).join('')}
                
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-white border border-gray-100 rounded-xl p-3 outline-none focus:ring-1 focus:ring-feira-yellow">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black uppercase shadow-sm">Enviar</button>
                </div>
            </div>
        `;
        container.appendChild(postEl);
    });
}

// --- IDENTIDADE E PERFIL ---

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if(p) {
        document.getElementById('edit-username').value = p.username || "";
        document.getElementById('edit-bio').value = p.bio || "";
        document.getElementById('edit-bairro').value = p.bairro || "Centro";
        mostrarTela('edit-profile-screen');
    }
};

window.salvarPerfilCompleto = async () => {
    const btn = document.getElementById('btn-save-profile');
    const fileInput = document.getElementById('input-file');
    const { data: { session } } = await _supabase.auth.getSession();
    
    btn.disabled = true;
    btn.innerText = "Sincronizando...";

    let avatar_url = null;
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = `${session.user.id}-${Date.now()}`;
        const { error: uploadError } = await _supabase.storage.from('avatars').upload(fileName, file);
        if (!uploadError) {
            const { data: { publicUrl } } = _supabase.storage.from('avatars').getPublicUrl(fileName);
            avatar_url = publicUrl;
        }
    }

    const updates = {
        id: session.user.id,
        username: document.getElementById('edit-username').value,
        bio: document.getElementById('edit-bio').value,
        bairro: document.getElementById('edit-bairro').value,
        updated_at: new Date()
    };
    if(avatar_url) updates.avatar_url = avatar_url;

    const { error } = await _supabase.from('profiles').upsert(updates);
    if (error) {
        alert("Erro: " + error.message);
        btn.disabled = false;
        btn.innerText = "Guardar Alterações";
    } else {
        location.reload();
    }
};

window.verPerfilPublico = async (uid) => {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    const { data: posts } = await _supabase.from('posts').select('id').eq('user_id', uid);

    if (p) {
        document.getElementById('dash-nome').innerText = p.username || "Morador";
        document.getElementById('dash-bairro').innerText = p.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = p.bio || "Olá, sou de Feira!";
        document.getElementById('dash-count').innerText = posts?.length || 0;
        
        const img = document.getElementById('img-perfil');
        const fallback = document.getElementById('avatar-fallback');
        
        if(p.avatar_url) {
            img.src = p.avatar_url;
            img.classList.remove('hidden');
            fallback.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
        }

        const { data: { session } } = await _supabase.auth.getSession();
        const editArea = document.getElementById('edit-button-area');
        if(editArea) {
            editArea.innerHTML = (session && session.user.id === uid) 
                ? `<button onclick="abrirEdicaoPerfil()" class="mt-4 bg-feira-yellow text-feira-marinho px-6 py-2 rounded-xl font-black text-[10px] uppercase shadow-md">Editar Perfil</button>`
                : '';
        }

        mostrarTela('user-dashboard');
    }
};

// --- AÇÕES SOCIAIS ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value || !session) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = "";
    carregarFeed();
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;
    if(!content || !session) return;
    await _supabase.from('posts').insert({ content, zona, user_id: session.user.id });
    document.getElementById('post-content').value = "";
    window.mudarFeed('Geral');
};

window.abrirThreads = (id) => document.getElementById(`thread-${id}`).classList.toggle('hidden');
window.abrirPostagem = () => mostrarTela('form-post');
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};

async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) { window.mudarFeed('Geral'); } else { mostrarTela('auth-screen'); }
}

window.tentarLogar = async () => {
    const { error } = await _supabase.auth.signInWithPassword({ 
        email: document.getElementById('auth-email').value, 
        password: document.getElementById('auth-password').value 
    });
    if (error) alert(error.message); else window.location.reload();
};

window.fazerLogout = async () => { if(confirm("Sair?")) { await _supabase.auth.signOut(); location.reload(); }};

window.previewImagem = (event) => {
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.querySelector('#edit-profile-screen .w-24.h-24');
        preview.style.backgroundImage = `url(${reader.result})`;
        preview.style.backgroundSize = 'cover';
    };
    reader.readAsDataURL(event.target.files[0]);
};
window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    
    // 1. Envia a reação
    await _supabase.from('comment_reactions').upsert({ 
        comment_id: commentId, 
        user_id: session.user.id, 
        emoji_type: emoji 
    }, { onConflict: 'comment_id, user_id, emoji_type' }); // Upsert evita duplicidade

    // 2. Guarda que esta thread estava aberta
    localStorage.setItem('thread_aberta', postId);

    // 3. Recarrega o feed
    await carregarFeed();

    // 4. Reabre a thread automaticamente após o reload
    const threadId = localStorage.getItem('thread_aberta');
    if (threadId) {
        const el = document.getElementById(`thread-${threadId}`);
        if (el) el.classList.remove('hidden');
    }
};
