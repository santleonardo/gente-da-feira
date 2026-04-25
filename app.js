/**
 * GENTE DA FEIRA - VERSÃO 9.0 (RESTAURAÇÃO COMPLETA)
 * - Recuperadas funções de Threads e Comentários
 * - Foto de Perfil corrigida (Background Image)
 * - Sistema de Login e Navegação Blindado
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

// --- INICIALIZAÇÃO ---
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('main-nav')?.classList.remove('hidden');
            document.getElementById('feed-tabs')?.classList.remove('hidden');
            irParaHome();
        } else {
            mostrarTela('auth-screen');
            document.getElementById('main-nav')?.classList.add('hidden');
            document.getElementById('feed-tabs')?.classList.add('hidden');
        }
    });

    // Realtime para Feed e Comentários
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        const queryAtiva = document.getElementById('tab-local')?.classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
        if (!document.getElementById('feed-container').classList.contains('hidden')) {
            carregarFeed(queryAtiva);
        }
    }).subscribe();
};

// --- NAVEGAÇÃO ---
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

// --- FUNÇÃO DE PERFIL (FOTO E DADOS) ---
window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (perfil) {
        // Preenche Visualização
        document.getElementById('view-username').innerText = perfil.username || "Morador";
        document.getElementById('view-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('view-bio').innerText = perfil.bio || "Gente da Feira!";
        
        const avatar = document.getElementById('view-avatar');
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${perfil.avatar_url}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }

        // Preenche Edição
        document.getElementById('profile-username').value = perfil.username || "";
        document.getElementById('profile-bio').value = perfil.bio || "";
        document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";
        document.getElementById('profile-bairro').value = perfil.bairro || "Centro";

        // Carrega Histórico do usuário
        carregarFeed('Geral', session.user.id);
        
        document.getElementById('feed-tabs')?.classList.add('hidden');
        mostrarTela('view-profile-screen');
    }
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const updates = {
        username: document.getElementById('profile-username').value,
        bio: document.getElementById('profile-bio').value,
        avatar_url: document.getElementById('profile-avatar-url').value,
        bairro: document.getElementById('profile-bairro').value,
        updated_at: new Date()
    };
    
    const { error } = await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (!error) {
        alert("Perfil atualizado!");
        window.mostrarPerfilProprio();
    }
};

// --- FEED E THREADS (LÓGICA RECUPERADA) ---
async function carregarFeed(filtro = 'Geral', userIdFiltro = null) {
    const targetId = userIdFiltro ? 'meu-historico-feed' : 'feed-container';
    const container = document.getElementById(targetId);
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase.from('posts').select(`
        *,
        profiles:user_id (username, avatar_url, bairro),
        reactions (emoji_type, user_id),
        comments (*, profiles:user_id (username, avatar_url))
    `).order('created_at', { ascending: false });

    if (userIdFiltro) {
        query = query.eq('user_id', userIdFiltro);
    } else if (filtro === 'Local' && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts } = await query;
    renderizarPosts(posts || [], container, session?.user?.id);
}

function renderizarPosts(posts, container, currentUserId) {
    container.innerHTML = "";
    const threadAberta = localStorage.getItem('thread_aberta');

    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-4 animate-fade-in";
        
        const avatarImg = post.profiles?.avatar_url ? `style="background-image: url('${post.profiles.avatar_url}')"` : "";
        const iniciais = post.profiles?.avatar_url ? "" : (post.profiles?.username || "M")[0];

        // Reações
        const reacoesHtml = EMOJIS.map(e => {
            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
            const jaReagiu = post.reactions?.some(r => r.user_id === currentUserId && r.emoji_type === e);
            return `<button onclick="reagir('${post.id}', '${e}')" class="flex items-center gap-1 transition-all active:scale-125 ${jaReagiu ? 'opacity-100' : 'opacity-30'}">
                        <span class="text-sm">${e}</span><span class="text-[10px] font-black">${count || ''}</span>
                    </button>`;
        }).join('');

        // Comentários (Threads)
        const commentsHtml = (post.comments || []).map(c => `
            <div class="flex gap-3 bg-gray-50 p-3 rounded-2xl mb-2">
                <div class="w-6 h-6 rounded-lg bg-feira-yellow bg-cover bg-center shrink-0" style="background-image: url('${c.profiles?.avatar_url || ''}')"></div>
                <div>
                    <p class="text-[10px] font-black text-feira-marinho">${c.profiles?.username || 'Morador'}</p>
                    <p class="text-xs text-gray-600">${c.content}</p>
                </div>
            </div>
        `).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-xl bg-feira-yellow bg-cover bg-center flex items-center justify-center font-black text-feira-marinho text-xs shadow-inner" ${avatarImg}>${iniciais}</div>
                <div>
                    <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                    <span class="text-[9px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</span>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4 leading-relaxed">${post.content}</p>
            <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[9px] font-black uppercase text-feira-bronze bg-feira-bege px-3 py-1 rounded-full">
                    Conversas (${post.comments?.length || 0})
                </button>
            </div>
            <div id="thread-${post.id}" class="${threadAberta === post.id ? '' : 'hidden'} mt-4 pt-4 border-t border-dashed border-gray-100">
                <div class="max-h-40 overflow-y-auto mb-4 no-scrollbar">${commentsHtml}</div>
                <div class="flex gap-2">
                    <input id="in-${post.id}" type="text" placeholder="Escreva aqui..." class="flex-1 bg-gray-50 border-none rounded-xl p-3 text-xs focus:ring-1 ring-feira-yellow">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white px-4 rounded-xl text-xs font-black">OK</button>
                </div>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- FUNÇÕES DE INTERAÇÃO (RECUPERADAS) ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const { error } = await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    }
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    const { data: { session } } = await _supabase.auth.getSession();
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content });
    input.value = "";
    localStorage.setItem('thread_aberta', postId);
    carregarFeed();
};

window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); else localStorage.removeItem('thread_aberta');
};

// --- AUTH ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro: " + error.message);
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };
