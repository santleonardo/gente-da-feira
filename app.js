function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');
}

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_DISPONIVEIS = ['Centro', 'Mangabeira', 'Queimadinha', 'Campo Limpo', 'Tomba', 'SIM', 'Feira IX', 'George Américo', 'Brasília', 'Sobradinho', 'Conceição', 'Kalilândia', 'Aviário', 'Baraúnas', 'Santa Mônica', 'Papagaio', 'Jardim Acácia'];

window.onload = async () => {

    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // ✅ AUTH LISTENER (COM PROFILE AUTO-CREATE)
   _supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {

        const { data: profile } = await _supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .maybeSingle();

        // 🔥 AQUI ESTÁ A MUDANÇA
        if (!profile) {
            showOnboarding();
            return;
        }

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
    // ✅ REALTIME
    _supabase.channel('fsa-updates')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            const feedContainer = document.getElementById('feed-container');
            if (feedContainer && !feedContainer.classList.contains('hidden')) {
                const tabLocal = document.getElementById('tab-local');
                const tabAtual = (tabLocal && tabLocal.classList.contains('bg-feira-marinho'))
                    ? 'Local'
                    : 'Geral';

                carregarFeed(tabAtual);
            }
        })
        .subscribe();
};

function showOnboarding() {
    mostrarTela('onboarding-screen');
}

window.finalizarOnboarding = async () => {
    const username = document.getElementById('onb-username').value.trim();
    const bairro = document.getElementById('onb-bairro').value;

    if (!username) return alert('Digite seu nome');
    if (!bairro) return alert('Selecione seu bairro');

    const { data: { session } } = await _supabase.auth.getSession();

    if (!session) {
        alert('Erro de sessão');
        return;
    }

    const { error } = await _supabase.from('profiles').insert({
        id: session.user.id,
        username: username,
        bairro: bairro
    });

    if (error) {
        alert('Erro ao salvar: ' + error.message);
        return;
    }

    irParaHome();
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
    
    if (!session) {
        alert('Você precisa estar logado!');
        return;
    }
    
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
    if (!session) return;

    const { data: perfil } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (!perfil) return;

    // 🔑 DEFINE QUE É SEU PERFIL
    window.profileId = null;

    // =========================
    // 🧠 DADOS DO PERFIL
    // =========================
    document.getElementById('view-username').innerText = perfil.username || "Morador";
    document.getElementById('view-bairro').innerText = perfil.bairro || "Feira";
    document.getElementById('view-bio').innerText = perfil.bio || "";

    // =========================
    // 🖼️ AVATAR
    // =========================
    const avatar = document.getElementById('view-avatar');
    if (avatar) {
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${safeUrl(perfil.avatar_url)}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }
    }

    // =========================
    // 🎬 TROCA DE TELA
    // =========================
    document.getElementById('feed-tabs')?.classList.add('hidden');
    mostrarTela('view-profile-screen');

    // =========================
    // 🎛️ CONTROLE DE UI
    // =========================
    const btnEditar = document.getElementById('btn-editar-perfil');
    const followBtn = document.getElementById('follow-btn');
    const historico = document.getElementById('meu-historico-container');
    const tituloHistorico = document.getElementById('titulo-historico');

    // BOTÃO EDITAR (sempre visível no seu perfil)
    if (btnEditar) btnEditar.style.display = 'block';

    // FOLLOW (nunca aparece no seu perfil)
    if (followBtn) followBtn.style.display = 'none';

    // HISTÓRICO (sempre visível)
    if (historico) historico.style.display = 'block';

    // 🔥 RESET DO TÍTULO (ESSENCIAL)
    if (tituloHistorico) {
        tituloHistorico.innerText = 'Seus avisos';
    }

    // =========================
    // 📦 CARREGAR SEUS POSTS
    // =========================
    carregarFeed('Geral', session.user.id);

    // =========================
    // ✏️ PREENCHER FORM DE EDIÇÃO
    // =========================
    document.getElementById('profile-username').value = perfil.username || "";
    document.getElementById('profile-bio').value = perfil.bio || "";
    document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";
    document.getElementById('profile-bairro').value = perfil.bairro || "Centro";
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        alert('Você precisa estar logado!');
        return;
    }
    
    const fileInput = document.getElementById('profile-avatar-file');
    
    let avatarUrl = document.getElementById('profile-avatar-url').value;
    
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

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();

    if (!session) return;

    // segurança: impede editar perfil de outro usuário
    if (window.profileId && session.user.id !== window.profileId) {
        alert('Você só pode editar seu próprio perfil.');
        return;
    }

    mostrarTela('edit-profile-screen');
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

    // =========================
    // 🎯 FILTROS
    // =========================

    if (userIdFiltro) {
        query = query.eq('user_id', userIdFiltro);

    } else if (filtro === 'Local' && session) {
        const { data: p } = await _supabase
            .from('profiles')
            .select('bairro')
            .eq('id', session.user.id)
            .single();

        if (p?.bairro) query = query.eq('zona', p.bairro);

    } else if (filtro === 'Seguindo' && session) {
        const { data: seguindo, error } = await _supabase
            .from('relationships')
            .select('target_id')
            .eq('user_id', session.user.id)
            .eq('type', 'follow');

        if (error) {
            console.error('Erro seguindo:', error);
            container.innerHTML = '<p class="text-red-500 text-center">Erro ao carregar</p>';
            return;
        }

        const ids = (seguindo || []).map(r => r.target_id);

        if (ids.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-10 text-xs">Você ainda não segue ninguém.</p>';
            return;
        }

        query = query.in('user_id', ids);
    }

    // ✅ EXECUTA QUERY (ESSENCIAL)
    const { data: posts, error } = await query;

    if (error) {
        console.error('Erro no feed:', error);
        container.innerHTML = `<p class="text-red-500 text-center">Erro ao carregar feed</p>`;
        return;
    }

    // ✅ RENDERIZA
    renderizarPosts(posts || [], container, session?.user?.id);
}

function safeUrl(url) {
    if (!url) return '';
    const clean = String(url).trim();

    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        return '';
    }

    return clean.replace(/["'()]/g, '');
}

// ==========================
// 🔥 RENDER SEGURO
// ==========================
function renderizarPosts(posts, container, currentUserId) {
    container.innerHTML = '';

    if (!posts || posts.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-400 py-10 text-xs';
        p.textContent = 'Nenhum aviso encontrado.';
        container.appendChild(p);
        return;
    }

    const threadAberta = localStorage.getItem('thread_aberta');

    posts.forEach(post => {
        const article = document.createElement('article');
        article.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border mb-4";

        // ======================
        // HEADER
        // ======================
        const header = document.createElement('div');
        header.className = 'flex items-center gap-4 mb-4';

        const avatar = document.createElement('div');
        avatar.className = 'w-10 h-10 rounded-xl bg-feira-yellow flex items-center justify-center text-xs font-black';

        const avatarUrl = safeUrl(post.profiles?.avatar_url);
        if (avatarUrl) {
            avatar.style.backgroundImage = `url("${avatarUrl}")`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = (post.profiles?.username || 'M')[0];
        }

        const info = document.createElement('div');

        const username = document.createElement('h4');
        username.className = 'font-black text-feira-marinho text-sm cursor-pointer';
        username.textContent = post.profiles?.username || 'Morador';

        username.addEventListener('click', () => {
            verPerfil(post.user_id);
        });

        const zona = document.createElement('span');
        zona.className = 'text-[9px] text-gray-300 uppercase';
        zona.textContent = post.zona || 'Geral';

        info.appendChild(username);
        info.appendChild(zona);

        header.appendChild(avatar);
        header.appendChild(info);

        if (currentUserId === post.user_id) {
            const del = document.createElement('button');
            del.textContent = '🗑️';
            del.className = 'ml-auto text-red-500 text-xs';
            del.addEventListener('click', () => apagarPost(post.id));
            header.appendChild(del);
        }

        // ======================
        // CONTENT
        // ======================
        const content = document.createElement('p');
        content.className = 'text-gray-600 text-sm mb-4';
        content.textContent = post.content;

        // ======================
        // REAÇÕES
        // ======================
        const footer = document.createElement('div');
        footer.className = 'flex justify-between items-center pt-4 border-t';

        const reactions = document.createElement('div');
        reactions.className = 'flex gap-4';

        EMOJIS.forEach(e => {
            const btn = document.createElement('button');
            btn.className = 'flex items-center gap-1';

            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;

            btn.innerHTML = `<span>${e}</span><span class="text-[10px] font-black">${count || ''}</span>`;

            btn.addEventListener('click', () => reagir(post.id, e));

            reactions.appendChild(btn);
        });

        const threadBtn = document.createElement('button');
        threadBtn.className = 'text-xs font-bold';
        threadBtn.textContent = `Conversas (${post.comments?.length || 0})`;

        threadBtn.addEventListener('click', () => {
            toggleThread(post.id);
        });

        footer.appendChild(reactions);
        footer.appendChild(threadBtn);

        // ======================
        // THREAD
        // ======================
        const thread = document.createElement('div');
        thread.id = `thread-${post.id}`;
        thread.className = 'mt-4';

        if (threadAberta !== post.id) {
            thread.style.display = 'none';
        }

        const commentsBox = document.createElement('div');
        commentsBox.className = 'max-h-40 overflow-y-auto mb-4';

        (post.comments || []).forEach(c => {
            const cWrap = document.createElement('div');
            cWrap.className = 'flex gap-3 bg-gray-50 p-3 rounded-2xl mb-2';

            const cAvatar = document.createElement('div');
            cAvatar.className = 'w-6 h-6 rounded-lg bg-feira-yellow flex items-center justify-center text-[10px] font-black';

            const cAvatarUrl = safeUrl(c.profiles?.avatar_url);
            if (cAvatarUrl) {
                cAvatar.style.backgroundImage = `url("${cAvatarUrl}")`;
                cAvatar.style.backgroundSize = 'cover';
            } else {
                cAvatar.textContent = (c.profiles?.username || 'M')[0];
            }

            const cBody = document.createElement('div');
            cBody.className = 'flex-1';

            const cUser = document.createElement('p');
            cUser.className = 'text-[10px] font-black';
            cUser.textContent = c.profiles?.username || 'Morador';

            const cText = document.createElement('p');
            cText.className = 'text-xs text-gray-600';
            cText.textContent = c.content;

            cBody.appendChild(cUser);
            cBody.appendChild(cText);

            // 🔥 REAÇÕES DO COMENTÁRIO
            const cReactions = document.createElement('div');
            cReactions.className = 'flex gap-2 mt-1';

            EMOJIS.forEach(e => {
                const btn = document.createElement('button');
                btn.className = 'text-[10px] flex items-center gap-1';

                const count = c.comment_reactions?.filter(cr => cr.emoji_type === e).length || 0;

                btn.textContent = count ? `${e} ${count}` : e;

                btn.addEventListener('click', () => {
                    reagirComentario(c.id, e, post.id);
                });

                cReactions.appendChild(btn);
            });

            cBody.appendChild(cReactions);

            // ✅ ESSENCIAL (você esqueceu isso)
            cWrap.appendChild(cAvatar);
            cWrap.appendChild(cBody);
            commentsBox.appendChild(cWrap);
        });

        const inputWrap = document.createElement('div');
        inputWrap.className = 'flex gap-2';

        const input = document.createElement('input');
        input.placeholder = 'Comentar...';
        input.className = 'flex-1 bg-gray-50 rounded-xl p-2 text-xs';

        const send = document.createElement('button');
        send.textContent = 'OK';
        send.className = 'bg-feira-marinho text-white px-3 rounded-xl text-xs';

        send.addEventListener('click', () => {
            comentar(post.id, input.value);
            input.value = '';
        });

        inputWrap.appendChild(input);
        inputWrap.appendChild(send);

        thread.appendChild(commentsBox);
        thread.appendChild(inputWrap);

        // ======================
        // APPEND
        // ======================
        article.appendChild(header);
        article.appendChild(content);
        article.appendChild(footer);
        article.appendChild(thread);

        container.appendChild(article);
    });
}

// ==========================
// THREAD CONTROL
// ==========================
function toggleThread(id) {
    const el = document.getElementById(`thread-${id}`);
    if (!el) return;

    if (el.style.display === 'none') {
        el.style.display = 'block';
        localStorage.setItem('thread_aberta', id);
    } else {
        el.style.display = 'none';
        localStorage.removeItem('thread_aberta');
    }
}

// --- INTERAÇÕES ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        alert('Você precisa estar logado!');
        return;
    }
    
    const { error } = await _supabase.from('reactions').insert({ 
        post_id: postId, 
        user_id: session.user.id, 
        emoji_type: emoji 
    });
    
    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ 
            post_id: postId, 
            user_id: session.user.id, 
            emoji_type: emoji 
        });
    }
    
    carregarFeed();
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        alert('Você precisa estar logado!');
        return;
    }
    
    localStorage.setItem('thread_aberta', postId);
    
    const { error } = await _supabase.from('comment_reactions').insert({ 
        comment_id: commentId, 
        user_id: session.user.id, 
        emoji_type: emoji 
    });
    
    if (error && error.code === '23505') {
        await _supabase.from('comment_reactions').delete().match({ 
            comment_id: commentId, 
            user_id: session.user.id, 
            emoji_type: emoji 
        });
    }
    
    carregarFeed();
};

window.comentar = async (postId, text) => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        alert('Você precisa estar logado!');
        return;
    }
    
    if (!text.trim()) return;

    await _supabase.from('comments').insert({
        post_id: postId,
        user_id: session.user.id,
        content: text
    });

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

window.mudarFeed = (tipo) => {
    const tabs = ['geral', 'local', 'seguindo'];

    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (!el) return;

        if (t.toLowerCase() === tipo.toLowerCase()) {
            el.className = 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md';
        } else {
            el.className = 'flex-1 py-3 text-gray-400 font-bold';
        }
    });

    carregarFeed(tipo);
};

window.fazerLogin = async () => {
    const { error } = await _supabase.auth.signInWithPassword({ 
        email: document.getElementById('auth-email').value, 
        password: document.getElementById('auth-password').value 
    });
    
    if (error) alert(error.message);
};

window.fazerCadastro = async () => {
    const { error } = await _supabase.auth.signUp({ 
        email: document.getElementById('auth-email').value, 
        password: document.getElementById('auth-password').value 
    });
    
    if (error) alert(error.message); 
    else alert("Verifique o e-mail!");
};

window.fazerLogout = async () => { 
    await _supabase.auth.signOut(); 
    location.reload(); 
};

// ==============================
// 🔥 SISTEMA DE FOLLOW
// ==============================

window.profileId = null;

async function seguirUsuario(targetId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    if (session.user.id === targetId) return;

    await _supabase
        .from('relationships')
        .upsert({
            user_id: session.user.id,
            target_id: targetId,
            type: 'follow',
            status: 'accepted'
        }, { onConflict: 'user_id,target_id,type' });
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

    const { data, error } = await _supabase
        .from('relationships')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('target_id', targetId)
        .eq('type', 'follow')
        .limit(1);

    if (error) {
        console.error('verificarFollow erro:', error.message);
        return false;
    }

    return data.length > 0;
}

async function atualizarBotaoFollow() {
    const btn = document.getElementById('follow-btn');
    if (!btn) return;

    // estado neutro enquanto carrega
    btn.innerText = '...';

    if (!window.profileId) {
        btn.style.display = 'none';
        return;
    }

    const seguindo = await verificarFollow(window.profileId);

    btn.style.display = 'block';
    btn.innerText = seguindo ? 'Seguindo' : 'Seguir';
}

async function setupFollowButton() {
    const btn = document.getElementById('follow-btn');
    if (!btn) return;

    btn.onclick = async () => {
        if (!window.profileId) return;

        const seguindo = await verificarFollow(window.profileId);

        if (seguindo) {
            await deixarDeSeguir(window.profileId);
        } else {
            await seguirUsuario(window.profileId);
        }

        await atualizarBotaoFollow();
    };
}

window.verPerfil = async (userId) => {
    const { data: perfil } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!perfil) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const isMeuPerfil = session?.user?.id === perfil.id;

    // 🔑 controle global
    window.profileId = isMeuPerfil ? null : perfil.id;

    // =========================
    // 🧠 DADOS DO PERFIL
    // =========================
    document.getElementById('view-username').innerText = perfil.username || "Morador";
    document.getElementById('view-bairro').innerText = perfil.bairro || "Feira";
    document.getElementById('view-bio').innerText = perfil.bio || "";

    // =========================
    // 🖼️ AVATAR
    // =========================
    const avatar = document.getElementById('view-avatar');
    if (avatar) {
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${safeUrl(perfil.avatar_url)}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }
    }

    // =========================
    // 🎬 TROCA DE TELA
    // =========================
    mostrarTela('view-profile-screen');
    document.getElementById('feed-tabs')?.classList.add('hidden');

    // =========================
    // 🎛️ CONTROLE DE UI
    // =========================
    const btnEditar = document.getElementById('btn-editar-perfil');
    const historico = document.getElementById('meu-historico-container');
    const tituloHistorico = document.getElementById('titulo-historico');
    const followBtn = document.getElementById('follow-btn');

    // BOTÃO EDITAR
    if (btnEditar) {
        btnEditar.style.display = isMeuPerfil ? 'block' : 'none';
    }

    // HISTÓRICO (AGORA SEMPRE VISÍVEL)
    if (historico) {
        historico.style.display = 'block';
    }

    // TÍTULO DINÂMICO 🔥
    if (tituloHistorico) {
        tituloHistorico.innerText = isMeuPerfil
            ? 'Seus avisos'
            : `Avisos de ${perfil.username || 'usuário'}`;
    }

    // =========================
    // 📦 CARREGAR POSTS
    // =========================
    carregarFeed('Geral', perfil.id);

    // =========================
    // 🔥 FOLLOW SYSTEM
    // =========================
    if (followBtn) {
        followBtn.style.display = isMeuPerfil ? 'none' : 'block';
    }

    if (!isMeuPerfil) {
        followBtn.innerText = '...';
        await atualizarBotaoFollow();
        setupFollowButton();
    }
};
