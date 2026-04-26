const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_DISPONIVEIS = ['Centro', 'Mangabeira', 'Queimadinha', 'Campo Limpo', 'Tomba', 'SIM', 'Feira IX', 'George Américo', 'Brasília', 'Sobradinho', 'Conceição', 'Kalilândia', 'Aviário', 'Baraúnas', 'Santa Mônica', 'Papagaio', 'Jardim Acácia'];
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('btn-sair')?.classList.remove('hidden');
            document.getElementById('main-nav')?.classList.remove('hidden');
            irParaHome();
        } else {
            document.getElementById('btn-sair')?.classList.add('hidden');
            document.getElementById('main-nav')?.classList.add('hidden');
            document.getElementById('feed-tabs')?.classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        if (!document.getElementById('feed-container').classList.contains('hidden')) {
            const tabAtual = document.getElementById('tab-local').classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
            carregarFeed(tabAtual);
        }
    }).subscribe();
};

function mostrarTela(id) {
    const telas = ['auth-screen', 'feed-container', 'form-post', 'view-profile-screen', 'edit-profile-screen'];
    telas.forEach(t => document.getElementById(t)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

window.irParaHome = () => {
    document.getElementById('feed-tabs')?.classList.remove('hidden');
    mostrarTela('feed-container');
    carregarFeed('Geral');
};

// --- AVISOS ---
window.abrirPostagem = () => {
    document.getElementById('feed-tabs')?.classList.add('hidden');
    mostrarTela('form-post');
};

window.salvarPost = async () => {
    const content = document.getElementById('post-content').value.trim();
    if (!content) return alert('Digite algo para publicar!');
    
    const checkboxes = document.querySelectorAll('input[name="bairro-publicar"]:checked');
    const bairrosSelecionados = Array.from(checkboxes).map(cb => cb.value);
    
    if (bairrosSelecionados.length === 0) return alert('Selecione pelo menos um bairro!');
    
    const { data: { session } } = await _supabase.auth.getSession();
    
    // Publicar em cada bairro selecionado
    for (const bairro of bairrosSelecionados) {
        await _supabase.from('posts').insert({ 
            user_id: session.user.id, 
            content: content, 
            zona: bairro 
        });
    }
    
    document.getElementById('post-content').value = "";
    irParaHome();
};

// --- PERFIL ---
window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (perfil) {
        document.getElementById('view-username').innerText = perfil.username || "Morador";
        document.getElementById('view-bairro').innerText = perfil.bairro || "Feira";
        document.getElementById('view-bio').innerText = perfil.bio || "";
        
        const avatar = document.getElementById('view-avatar');
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${perfil.avatar_url}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }

        document.getElementById('profile-username').value = perfil.username || "";
        document.getElementById('profile-bio').value = perfil.bio || "";
        document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";
        document.getElementById('profile-bairro').value = perfil.bairro || "Centro";

        document.getElementById('feed-tabs').classList.add('hidden');
        mostrarTela('view-profile-screen');
        carregarFeed('Geral', session.user.id);
        window.profileId = perfil.id;
atualizarBotaoFollow();
    }
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const fileInput = document.getElementById('profile-avatar-file');
    
    let avatarUrl = document.getElementById('profile-avatar-url').value;
    
    // Se usuario selecionou uma imagem, fazer upload
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });
        
        if (uploadError) {
            alert('Erro ao fazer upload: ' + uploadError.message);
            return;
        }
        
        const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        avatarUrl = urlData.publicUrl;
    }
    
    await _supabase.from('profiles').update({
        username: document.getElementById('profile-username').value,
        bio: document.getElementById('profile-bio').value,
        avatar_url: avatarUrl,
        bairro: document.getElementById('profile-bairro').value
    }).eq('id', session.user.id);
    
    mostrarPerfilProprio();
};

// --- FEED E DADOS ---
async function carregarFeed(filtro = 'Geral', userIdFiltro = null) {
    const targetId = userIdFiltro ? 'meu-historico-feed' : 'feed-container';
    const container = document.getElementById(targetId);
    if (!container) return;
    
    container.innerHTML = '<p class="text-center text-gray-400 py-10 text-xs animate-pulse">Sintonizando Feira...</p>';

    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase.from('posts').select(`
        *,
        profiles:user_id (username, avatar_url, bairro),
        reactions (emoji_type, user_id),
        comments (
            *,
            profiles:user_id (username, avatar_url),
            comment_reactions (emoji_type, user_id)
        )
    `).order('created_at', { ascending: false });

    if (userIdFiltro) {
        query = query.eq('user_id', userIdFiltro);
    } else if (filtro === 'Local' && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts, error } = await query;
    
    if (error) {
        container.innerHTML = `<div class="p-6 text-center text-red-500 font-bold bg-red-50 rounded-2xl">Erro no Banco: ${error.message}</div>`;
        return;
    }

    renderizarPosts(posts || [], container, session?.user?.id);
}

function renderizarPosts(posts, container, currentUserId) {
    if (posts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10 text-xs">Nenhum aviso encontrado.</p>';
        return;
    }
    
    container.innerHTML = "";
    const threadAberta = localStorage.getItem('thread_aberta');

    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-4 animate-fade-in";
        
        const avatarImg = post.profiles?.avatar_url 
            ? `style="background-image: url('${post.profiles.avatar_url}')"` 
            : "";

        const iniciais = post.profiles?.avatar_url 
            ? "" 
            : (post.profiles?.username || "M")[0];

        // REAÇÕES DO POST
        const reacoesHtml = EMOJIS.map(e => {
            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
            const jaReagiu = post.reactions?.some(r => r.user_id === currentUserId && r.emoji_type === e);
            
            return `
                <button onclick="reagir('${post.id}', '${e}')" 
                    class="flex items-center gap-1 ${jaReagiu ? 'opacity-100' : 'opacity-30'}">
                    <span>${e}</span>
                    <span class="text-[10px] font-black">${count || ''}</span>
                </button>
            `;
        }).join('');

        // COMENTÁRIOS
        const commentsHtml = (post.comments || []).map(c => {
            const cAvatar = c.profiles?.avatar_url 
                ? `style="background-image: url('${c.profiles.avatar_url}')"` 
                : "";

            const cReacoes = EMOJIS.map(e => {
                const count = c.comment_reactions?.filter(cr => cr.emoji_type === e).length || 0;
                return `
                    <button onclick="reagirComentario('${c.id}', '${e}', '${post.id}')" class="text-[10px]">
                        ${e} ${count || ''}
                    </button>
                `;
            }).join('');

            return `
            <div class="flex gap-3 bg-gray-50 p-3 rounded-2xl mb-2">
                <div class="w-6 h-6 rounded-lg bg-feira-yellow bg-cover bg-center flex items-center justify-center text-[10px] font-black"
                     ${cAvatar}>
                     ${c.profiles?.avatar_url ? '' : (c.profiles?.username || 'U')[0]}
                </div>

                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <p class="text-[10px] font-black text-feira-marinho">
                            ${c.profiles?.username || 'Morador'}
                        </p>

                        ${currentUserId === c.user_id 
                            ? `<button onclick="apagarComentario('${c.id}', '${post.id}')" class="text-red-500 text-[10px]">🗑️</button>` 
                            : ''}
                    </div>

                    <p class="text-xs text-gray-600">${c.content}</p>

                    <div class="flex gap-2 mt-1">
                        ${cReacoes}
                    </div>
                </div>
            </div>
            `;
        }).join('');

        // HTML FINAL DO POST (CORRETO)
        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-xl bg-feira-yellow bg-cover bg-center flex items-center justify-center text-xs font-black"
                     ${avatarImg}>
                     ${iniciais}
                </div>

                <div>
                    <h4 class="font-black text-feira-marinho text-sm">
                        ${post.profiles?.username || 'Morador'}
                    </h4>
                    <span class="text-[9px] text-gray-300 uppercase">
                        ${post.zona || 'Geral'}
                    </span>
                </div>

                ${currentUserId === post.user_id 
                    ? `<button onclick="apagarPost('${post.id}')" class="ml-auto text-red-500 text-xs">🗑️</button>` 
                    : ''}
            </div>

            <p class="text-gray-600 text-sm mb-4">
                ${post.content}
            </p>

            <div class="flex justify-between items-center pt-4 border-t">
                <div class="flex gap-4">
                    ${reacoesHtml}
                </div>

                <button onclick="abrirThreads('${post.id}')" class="text-xs font-bold">
                    Conversas (${post.comments?.length || 0})
                </button>
            </div>

            <div id="thread-${post.id}" class="${threadAberta === post.id ? '' : 'hidden'} mt-4">
                <div class="max-h-40 overflow-y-auto mb-4">
                    ${commentsHtml}
                </div>

                <div class="flex gap-2">
                    <input id="in-${post.id}" type="text" placeholder="Comentar..."
                        class="flex-1 bg-gray-50 rounded-xl p-2 text-xs">

                    <button onclick="comentar('${post.id}')"
                        class="bg-feira-marinho text-white px-3 rounded-xl text-xs">
                        OK
                    </button>
                </div>
            </div>
        `;

        container.appendChild(postEl);
    });
}

// --- INTERAÇÕES ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { error } = await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') await _supabase.from('reactions').delete().match({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    carregarFeed();
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    localStorage.setItem('thread_aberta', postId);
    const { error } = await _supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') await _supabase.from('comment_reactions').delete().match({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji });
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value.trim()) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    localStorage.setItem('thread_aberta', postId);
    carregarFeed();
};
window.apagarPost = async (postId) => {
    if (!confirm('Tem certeza que deseja apagar este aviso?')) return;
    
    const { error } = await _supabase.from('posts').delete().eq('id', postId);
    
    if (error) {
        alert('Erro ao apagar: ' + error.message);
    } else {
        alert('Aviso apagado com sucesso!');
        carregarFeed();
    }
};

window.apagarComentario = async (commentId, postId) => {
    if (!confirm('Tem certeza que deseja apagar este comentário?')) return;
    
    const { error } = await _supabase.from('comments').delete().eq('id', commentId);
    
    if (error) {
        alert('Erro ao apagar: ' + error.message);
    } else {
        localStorage.setItem('thread_aberta', postId);
        carregarFeed();
    }
};
window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); else localStorage.removeItem('thread_aberta');
};

window.mudarFeed = (tipo) => {
    document.getElementById('tab-geral').className = tipo === 'Geral' ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = tipo !== 'Geral' ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(tipo);
};

window.fazerLogin = async () => {
    const { error } = await _supabase.auth.signInWithPassword({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
    if (error) alert(error.message);
};
window.fazerCadastro = async () => {
    const { error } = await _supabase.auth.signUp({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
    if (error) alert(error.message); else alert("Verifique o e-mail!");
};
window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };
// ==============================
// 🔥 SISTEMA DE FOLLOW
// ==============================

window.profileId = null;

async function seguirUsuario(targetId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    if (session.user.id === targetId) return;

    const { error } = await _supabase.from('relationships').insert({
        user_id: session.user.id,
        target_id: targetId,
        type: 'follow',
        status: 'accepted'
    });

    if (error) console.error(error.message);
}

async function deixarDeSeguir(targetId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    await _supabase.from('relationships')
        .delete()
        .eq('user_id', session.user.id)
        .eq('target_id', targetId)
        .eq('type', 'follow');
}

async function verificarFollow(targetId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return false;

    const { data } = await _supabase.from('relationships')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('target_id', targetId)
        .eq('type', 'follow')
        .maybeSingle();

    return !!data;
}

async function atualizarBotaoFollow() {
    const btn = document.getElementById('follow-btn');
    if (!btn || !window.profileId) return;

    const seguindo = await verificarFollow(window.profileId);
    btn.innerText = seguindo ? 'Seguindo' : 'Seguir';
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('follow-btn');

    if (btn) {
        btn.addEventListener('click', async () => {
            if (!window.profileId) return;

            const seguindo = await verificarFollow(window.profileId);

            if (seguindo) {
                await deixarDeSeguir(window.profileId);
            } else {
                await seguirUsuario(window.profileId);
            }

            atualizarBotaoFollow();
        });
    }
});
// ==============================
// 👤 VER PERFIL DE OUTRO USUÁRIO
// ==============================

window.verPerfil = async (userId) => {
    const { data: perfil } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!perfil) return;

    // SETA O ID GLOBAL
    window.profileId = perfil.id;

    // Preenche UI
    document.getElementById('view-username').innerText = perfil.username || "Morador";
    document.getElementById('view-bairro').innerText = perfil.bairro || "Feira";
    document.getElementById('view-bio').innerText = perfil.bio || "";

    const avatar = document.getElementById('view-avatar');
    if (perfil.avatar_url) {
        avatar.style.backgroundImage = `url('${perfil.avatar_url}')`;
        avatar.innerText = "";
    } else {
        avatar.style.backgroundImage = "none";
        avatar.innerText = (perfil.username || "M")[0];
    }

    document.getElementById('feed-tabs').classList.add('hidden');
    mostrarTela('view-profile-screen');

    atualizarBotaoFollow();
};
