const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_DISPONIVEIS = ['Centro', 'Mangabeira', 'Queimadinha', 'Campo Limpo', 'Tomba', 'SIM', 'Feira IX', 'George Américo', 'Brasília', 'Sobradinho', 'Conceição', 'Kalilândia', 'Aviário', 'Baraúnas', 'Santa Mônica', 'Papagaio', 'Jardim Acácia'];

// 🔒 PAGINAÇÃO
const POSTS_POR_PAGINA = 20;
let paginaAtual = 0;
let carregandoMais = false;

// 🔒 SANITIZAÇÃO XSS - Função para escapar HTML
function escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// 🔒 PROMPT DE INSTALAÇÃO PWA
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar botão de instalação customizado
    const btnInstalar = document.getElementById('btn-instalar');
    if (btnInstalar) {
        btnInstalar.style.display = 'block';
    }
});

window.instalarPWA = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`Usuário ${outcome === 'accepted' ? 'aceitou' : 'recusou'} a instalação`);
    
    deferredPrompt = null;
    const btnInstalar = document.getElementById('btn-instalar');
    if (btnInstalar) {
        btnInstalar.style.display = 'none';
    }
};

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
            paginaAtual = 0; // Reset paginação
            carregarFeed(tabAtual);
        }
    }).subscribe();
    
    // 🔒 SCROLL INFINITO
    window.addEventListener('scroll', () => {
        if (carregandoMais) return;
        
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        
        if (scrollTop + clientHeight >= scrollHeight - 500) {
            const feedContainer = document.getElementById('feed-container');
            if (feedContainer && !feedContainer.classList.contains('hidden')) {
                carregarMaisPosts();
            }
        }
    });
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
    paginaAtual = 0;
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
    
    // 🔒 VALIDAÇÃO DE TAMANHO
    if (content.length > 1000) {
        return alert('O aviso deve ter no máximo 1000 caracteres!');
    }
    
    const checkboxes = document.querySelectorAll('input[name="bairro-publicar"]:checked');
    const bairrosSelecionados = Array.from(checkboxes).map(cb => cb.value);
    
    if (bairrosSelecionados.length === 0) return alert('Selecione pelo menos um bairro!');
    
    const { data: { session } } = await _supabase.auth.getSession();
    
    // 🔒 LOADING STATE
    const btnPublicar = document.querySelector('button[onclick="salvarPost()"]');
    const textoOriginal = btnPublicar.innerText;
    btnPublicar.innerText = 'Publicando...';
    btnPublicar.disabled = true;
    
    try {
        for (const bairro of bairrosSelecionados) {
            await _supabase.from('posts').insert({ 
                user_id: session.user.id, 
                content: content, 
                zona: bairro 
            });
        }
        
        document.getElementById('post-content').value = "";
        // Desmarcar checkboxes
        checkboxes.forEach(cb => cb.checked = false);
        irParaHome();
    } catch (error) {
        alert('Erro ao publicar: ' + error.message);
    } finally {
        btnPublicar.innerText = textoOriginal;
        btnPublicar.disabled = false;
    }
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

    window.profileId = null;

    document.getElementById('view-username').innerText = escaparHTML(perfil.username || "Morador");
    document.getElementById('view-bairro').innerText = escaparHTML(perfil.bairro || "Feira");
    document.getElementById('view-bio').innerText = escaparHTML(perfil.bio || "");

    const avatar = document.getElementById('view-avatar');
    if (avatar) {
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${escaparHTML(perfil.avatar_url)}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }
    }

    document.getElementById('feed-tabs')?.classList.add('hidden');
    mostrarTela('view-profile-screen');

    const btnEditar = document.getElementById('btn-editar-perfil');
    const followBtn = document.getElementById('follow-btn');
    const historico = document.getElementById('meu-historico-container');
    const tituloHistorico = document.getElementById('titulo-historico');

    if (btnEditar) btnEditar.style.display = 'block';
    if (followBtn) followBtn.style.display = 'none';
    if (historico) historico.style.display = 'block';
    if (tituloHistorico) {
        tituloHistorico.innerText = 'Seus avisos';
    }

    carregarFeed('Geral', session.user.id);

    document.getElementById('profile-username').value = perfil.username || "";
    document.getElementById('profile-bio').value = perfil.bio || "";
    document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";
    document.getElementById('profile-bairro').value = perfil.bairro || "Centro";
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const fileInput = document.getElementById('profile-avatar-file');
    
    let avatarUrl = document.getElementById('profile-avatar-url').value;
    
    // 🔒 LOADING STATE
    const btnSalvar = document.querySelector('button[onclick="salvarPerfil()"]');
    const textoOriginal = btnSalvar.innerText;
    btnSalvar.innerText = 'Salvando...';
    btnSalvar.disabled = true;
    
    try {
        if (fileInput?.files[0]) {
            const file = fileInput.files[0];
            
            // 🔒 VALIDAÇÃO DE ARQUIVO
            if (!file.type.startsWith('image/')) {
                alert('Por favor, selecione uma imagem válida');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                alert('A imagem deve ter no máximo 5MB');
                return;
            }
            
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
    } catch (error) {
        alert('Erro ao salvar perfil: ' + error.message);
    } finally {
        btnSalvar.innerText = textoOriginal;
        btnSalvar.disabled = false;
    }
};

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();

    if (!session) return;

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
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, POSTS_POR_PAGINA - 1); // 🔒 PAGINAÇÃO

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

    const { data: posts, error, count } = await query;

    if (error) {
        console.error('Erro no feed:', error);
        container.innerHTML = `<p class="text-red-500 text-center">Erro ao carregar feed</p>`;
        return;
    }

    renderizarPosts(posts || [], container, session?.user?.id);
    
    // 🔒 Adicionar indicador de "carregar mais" se houver mais posts
    if (count > POSTS_POR_PAGINA) {
        const btnMais = document.createElement('button');
        btnMais.id = 'btn-carregar-mais';
        btnMais.className = 'w-full py-4 text-feira-marinho font-bold text-sm';
        btnMais.innerText = 'Carregar mais avisos';
        btnMais.onclick = carregarMaisPosts;
        container.appendChild(btnMais);
    }
}

// 🔒 FUNÇÃO PARA CARREGAR MAIS POSTS (SCROLL INFINITO)
async function carregarMaisPosts() {
    if (carregandoMais) return;
    
    carregandoMais = true;
    paginaAtual++;
    
    const btnMais = document.getElementById('btn-carregar-mais');
    if (btnMais) {
        btnMais.innerText = 'Carregando...';
        btnMais.disabled = true;
    }
    
    const { data: { session } } = await _supabase.auth.getSession();
    
    const inicio = paginaAtual * POSTS_POR_PAGINA;
    const fim = inicio + POSTS_POR_PAGINA - 1;
    
    const { data: posts, error } = await _supabase.from('posts').select(`
        *,
        profiles:user_id (username, avatar_url, bairro),
        reactions (emoji_type, user_id),
        comments (
            *,
            profiles:user_id (username, avatar_url),
            comment_reactions (emoji_type, user_id)
        )
    `)
    .order('created_at', { ascending: false })
    .range(inicio, fim);
    
    if (error) {
        console.error('Erro ao carregar mais:', error);
        if (btnMais) {
            btnMais.innerText = 'Erro ao carregar';
        }
        carregandoMais = false;
        return;
    }
    
    const container = document.getElementById('feed-container');
    if (btnMais) btnMais.remove();
    
    // Renderizar novos posts
    if (posts && posts.length > 0) {
        posts.forEach(post => {
            renderizarPost(post, container, session?.user?.id);
        });
    }
    
    // Se ainda há mais posts, adicionar botão novamente
    if (posts && posts.length === POSTS_POR_PAGINA) {
        const novoBtnMais = document.createElement('button');
        novoBtnMais.id = 'btn-carregar-mais';
        novoBtnMais.className = 'w-full py-4 text-feira-marinho font-bold text-sm';
        novoBtnMais.innerText = 'Carregar mais avisos';
        novoBtnMais.onclick = carregarMaisPosts;
        container.appendChild(novoBtnMais);
    }
    
    carregandoMais = false;
}

function renderizarPosts(posts, container, currentUserId) {
    if (posts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10 text-xs">Nenhum aviso encontrado.</p>';
        return;
    }
    
    container.innerHTML = "";

    posts.forEach(post => {
        renderizarPost(post, container, currentUserId);
    });
}

// 🔒 FUNÇÃO SEPARADA PARA RENDERIZAR UM POST
function renderizarPost(post, container, currentUserId) {
    const postEl = document.createElement('article');
    postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-4 animate-fade-in";
    
    const threadAberta = localStorage.getItem('thread_aberta');
    
    const avatarImg = post.profiles?.avatar_url 
        ? `style="background-image: url('${escaparHTML(post.profiles.avatar_url)}')"`
        : "";

    const iniciais = post.profiles?.avatar_url 
        ? "" 
        : escaparHTML((post.profiles?.username || "M")[0]);

    const reacoesHtml = EMOJIS.map(e => {
        const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
        const jaReagiu = post.reactions?.some(r => r.user_id === currentUserId && r.emoji_type === e);
        
        return `
            <button onclick="reagir('${post.id}', '${e}')" 
                class="flex items-center gap-1 transition-all hover:scale-110 ${jaReagiu ? 'opacity-100' : 'opacity-30'}">
                <span>${e}</span>
                <span class="text-[10px] font-black">${count || ''}</span>
            </button>
        `;
    }).join('');

    const commentsHtml = (post.comments || []).map(c => {
        const cAvatar = c.profiles?.avatar_url 
            ? `style="background-image: url('${escaparHTML(c.profiles.avatar_url)}')"`
            : "";

        const cReacoes = EMOJIS.map(e => {
            const count = c.comment_reactions?.filter(cr => cr.emoji_type === e).length || 0;
            return `
                <button onclick="reagirComentario('${c.id}', '${e}', '${post.id}')" class="text-[10px] opacity-70 hover:opacity-100">
                    ${e} ${count || ''}
                </button>
            `;
        }).join('');

        return `
        <div class="flex gap-3 bg-gray-50 p-3 rounded-2xl mb-2">
            <div class="w-6 h-6 rounded-lg bg-feira-yellow bg-cover bg-center flex items-center justify-center text-[10px] font-black"
                 ${cAvatar}>
                 ${c.profiles?.avatar_url ? '' : escaparHTML((c.profiles?.username || 'U')[0])}
            </div>
            <div class="flex-1">
                <div class="flex justify-between items-center">
                    <p class="text-[10px] font-black text-feira-marinho">
                        ${escaparHTML(c.profiles?.username || 'Morador')}
                    </p>
                    ${currentUserId === c.user_id 
                        ? `<button onclick="apagarComentario('${c.id}', '${post.id}')" class="text-red-500 text-[10px] hover:text-red-700">🗑️</button>` 
                        : ''}
                </div>
                <p class="text-xs text-gray-600 break-words">${escaparHTML(c.content)}</p>
                <div class="flex gap-2 mt-1">
                    ${cReacoes}
                </div>
            </div>
        </div>
        `;
    }).join('');

    postEl.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-xl bg-feira-yellow bg-cover bg-center flex items-center justify-center text-xs font-black"
                 ${avatarImg}>
                 ${iniciais}
            </div>
            <div class="flex-1">
                <h4 onclick="verPerfil('${post.user_id}')" 
                    class="font-black text-feira-marinho text-sm cursor-pointer hover:underline">
                    ${escaparHTML(post.profiles?.username || 'Morador')}
                </h4>
                <span class="text-[9px] text-gray-300 uppercase">
                    ${escaparHTML(post.zona || 'Geral')}
                </span>
            </div>
            ${currentUserId === post.user_id 
                ? `<button onclick="apagarPost('${post.id}')" class="text-red-500 text-xs hover:text-red-700 font-bold">🗑️ Apagar</button>` 
                : ''}
        </div>

        <p class="text-gray-600 text-sm mb-4 break-words whitespace-pre-wrap">
            ${escaparHTML(post.content)}
        </p>

        <div class="flex justify-between items-center pt-4 border-t border-gray-100">
            <div class="flex gap-4">
                ${reacoesHtml}
            </div>
            <button onclick="abrirThreads('${post.id}')" class="text-xs font-bold text-feira-bronze hover:text-feira-marinho">
                Conversas (${post.comments?.length || 0})
            </button>
        </div>

        <div id="thread-${post.id}" class="${threadAberta === post.id ? '' : 'hidden'} mt-4 pt-4 border-t border-dashed border-gray-100">
            <div class="max-h-60 overflow-y-auto mb-4 space-y-2">
                ${commentsHtml}
            </div>
            <div class="flex gap-2">
                <input id="in-${post.id}" type="text" placeholder="Comentar..." maxlength="500"
                    class="flex-1 bg-gray-50 rounded-xl p-3 text-xs focus:ring-2 ring-feira-yellow border-none">
                <button onclick="comentar('${post.id}')"
                    class="bg-feira-marinho text-white px-4 rounded-xl text-xs font-black hover:bg-opacity-90">
                    OK
                </button>
            </div>
        </div>
    `;

    container.appendChild(postEl);
}

// --- INTERAÇÕES ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { error } = await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    }
    // Não recarregar tudo, apenas atualizar o post específico
    atualizarPostLocal(postId);
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    localStorage.setItem('thread_aberta', postId);
    const { error } = await _supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') {
        await _supabase.from('comment_reactions').delete().match({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji });
    }
    atualizarPostLocal(postId);
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value.trim()) return;
    
    // 🔒 VALIDAÇÃO
    if (input.value.length > 500) {
        alert('O comentário deve ter no máximo 500 caracteres');
        return;
    }
    
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = '';
    localStorage.setItem('thread_aberta', postId);
    atualizarPostLocal(postId);
};

// 🔒 FUNÇÃO PARA ATUALIZAR APENAS UM POST (SEM RECARREGAR TUDO)
async function atualizarPostLocal(postId) {
    const { data: { session } } = await _supabase.auth.getSession();
    
    const { data: post } = await _supabase.from('posts').select(`
        *,
        profiles:user_id (username, avatar_url, bairro),
        reactions (emoji_type, user_id),
        comments (
            *,
            profiles:user_id (username, avatar_url),
            comment_reactions (emoji_type, user_id)
        )
    `).eq('id', postId).single();
    
    if (!post) return;
    
    // Encontrar o elemento do post e substituir
    const postElements = document.querySelectorAll('article');
    postElements.forEach(el => {
        const threadDiv = el.querySelector(`#thread-${postId}`);
        if (threadDiv) {
            const container = el.parentElement;
            el.remove();
            renderizarPost(post, container, session?.user?.id);
        }
    });
}

window.apagarPost = async (postId) => {
    if (!confirm('Tem certeza que deseja apagar este aviso?')) return;
    
    const { error } = await _supabase.from('posts').delete().eq('id', postId);
    
    if (error) {
        alert('Erro ao apagar: ' + error.message);
    } else {
        // Remover elemento do DOM sem recarregar
        const postElements = document.querySelectorAll('article');
        postElements.forEach(el => {
            const threadDiv = el.querySelector(`#thread-${postId}`);
            if (threadDiv) {
                el.remove();
            }
        });
    }
};

window.apagarComentario = async (commentId, postId) => {
    if (!confirm('Tem certeza que deseja apagar este comentário?')) return;
    
    const { error } = await _supabase.from('comments').delete().eq('id', commentId);
    
    if (error) {
        alert('Erro ao apagar: ' + error.message);
    } else {
        localStorage.setItem('thread_aberta', postId);
        atualizarPostLocal(postId);
    }
};

window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); 
    else localStorage.removeItem('thread_aberta');
};

window.mudarFeed = (tipo) => {
    const tabs = ['geral', 'local', 'seguindo'];

    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (!el) return;

        if (t.toLowerCase() === tipo.toLowerCase()) {
            el.className = 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md';
        } else {
            el.className = 'flex-1 py-3 text-gray-400 font-bold text-[10px]';
        }
    });

    paginaAtual = 0;
    carregarFeed(tipo);
};

window.fazerLogin = async () => {
    const btn = document.querySelector('button[onclick="fazerLogin()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = 'Entrando...';
    btn.disabled = true;
    
    try {
        const { error } = await _supabase.auth.signInWithPassword({ 
            email: document.getElementById('auth-email').value, 
            password: document.getElementById('auth-password').value 
        });
        if (error) alert(error.message);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
};

window.fazerCadastro = async () => {
    const btn = document.querySelector('button[onclick="fazerCadastro()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = 'Criando...';
    btn.disabled = true;
    
    try {
        const { error } = await _supabase.auth.signUp({ 
            email: document.getElementById('auth-email').value, 
            password: document.getElementById('auth-password').value 
        });
        if (error) alert(error.message); 
        else alert("Verifique o e-mail!");
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
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

    const { error } = await _supabase
        .from('relationships')
        .upsert({
            user_id: session.user.id,
            target_id: targetId,
            type: 'follow',
            status: 'accepted'
        }, { onConflict: 'user_id,target_id,type' });

    if (error) console.error('seguirUsuario error:', error);
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

    btn.innerText = '...';

    if (!window.profileId) {
        btn.style.display = 'none';
        return;
    }

    const seguindo = await verificarFollow(window.profileId);

    btn.style.display = 'block';
    btn.innerText = seguindo ? 'Seguindo' : 'Seguir';
    btn.className = seguindo 
        ? 'w-full bg-gray-200 text-gray-600 py-3 rounded-2xl font-black uppercase text-xs'
        : 'w-full bg-feira-yellow text-feira-marinho py-3 rounded-2xl font-black uppercase text-xs';
}

async function setupFollowButton() {
    const btn = document.getElementById('follow-btn');
    if (!btn) return;

    btn.onclick = async () => {
        if (!window.profileId) return;

        const textoOriginal = btn.innerText;
        btn.innerText = '...';
        btn.disabled = true;

        const seguindo = await verificarFollow(window.profileId);

        if (seguindo) {
            await deixarDeSeguir(window.profileId);
        } else {
            await seguirUsuario(window.profileId);
        }

        await atualizarBotaoFollow();
        btn.disabled = false;
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

    window.profileId = isMeuPerfil ? null : perfil.id;

    document.getElementById('view-username').innerText = escaparHTML(perfil.username || "Morador");
    document.getElementById('view-bairro').innerText = escaparHTML(perfil.bairro || "Feira");
    document.getElementById('view-bio').innerText = escaparHTML(perfil.bio || "");

    const avatar = document.getElementById('view-avatar');
    if (avatar) {
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${escaparHTML(perfil.avatar_url)}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = escaparHTML((perfil.username || "M")[0]);
        }
    }

    mostrarTela('view-profile-screen');
    document.getElementById('feed-tabs')?.classList.add('hidden');

    const btnEditar = document.getElementById('btn-editar-perfil');
    const historico = document.getElementById('meu-historico-container');
    const tituloHistorico = document.getElementById('titulo-historico');
    const followBtn = document.getElementById('follow-btn');

    if (btnEditar) {
        btnEditar.style.display = isMeuPerfil ? 'block' : 'none';
    }

    if (historico) {
        historico.style.display = 'block';
    }

    if (tituloHistorico) {
        tituloHistorico.innerText = isMeuPerfil
            ? 'Seus avisos'
            : `Avisos de ${escaparHTML(perfil.username || 'usuário')}`;
    }

    carregarFeed('Geral', perfil.id);

    if (followBtn) {
        followBtn.style.display = isMeuPerfil ? 'none' : 'block';
    }

    if (!isMeuPerfil) {
        followBtn.innerText = '...';
        await atualizarBotaoFollow();
        setupFollowButton();
    }
};
// BUSCA PRINCIPAL
async function buscar() {
  const query = document.getElementById('searchInput').value;

  if (!query) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('categoria', `%${query}%`);

  if (error) {
    console.error(error);
    return;
  }

  renderResultados(data);
}

// RENDER RESULTADOS
function renderResultados(lista) {
  const container = document.getElementById('results');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = '<p>Nenhum resultado encontrado</p>';
    return;
  }

  lista.forEach(item => {
    container.innerHTML += `
      <div class="border p-3 rounded mb-2 bg-white">
        <h3 class="font-bold">${item.nome}</h3>
        <p class="text-sm">${item.categoria} - ${item.bairro}</p>
        <a href="https://wa.me/${item.telefone}" 
           class="text-blue-500 font-bold">
           Falar agora
        </a>
      </div>
    `;
  });
}
