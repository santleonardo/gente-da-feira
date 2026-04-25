/**
 * GENTE DA FEIRA - VERSÃO 8.0 (ESTABILIDADE TOTAL)
 * - Correção de Login e Navegação
 * - Publicação de Avisos Segura
 * - Visualização de Perfil com Histórico
 * - Ocultação de URLs de Imagem
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
            // Se estiver logado, garante que o menu e abas apareçam
            document.getElementById('main-nav')?.classList.remove('hidden');
            document.getElementById('feed-tabs')?.classList.remove('hidden');
            irParaHome();
            carregarDadosPerfil(session.user.id);
        } else {
            document.getElementById('main-nav')?.classList.add('hidden');
            document.getElementById('feed-tabs')?.classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    // Escuta em tempo real para o feed
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        const feedVisivel = !document.getElementById('feed-container').classList.contains('hidden');
        if (feedVisivel) carregarFeed();
    }).subscribe();
};

// --- NAVEGAÇÃO SEGURA ---
function mostrarTela(id) {
    const telas = ['auth-screen', 'feed-container', 'form-post', 'view-profile-screen', 'edit-profile-screen'];
    telas.forEach(telaId => {
        const el = document.getElementById(telaId);
        if (el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
    window.scrollTo(0, 0);
}

window.irParaHome = () => {
    document.getElementById('feed-tabs')?.classList.remove('hidden');
    mostrarTela('feed-container');
    carregarFeed('Geral');
};

// --- PERFIL (VER E EDITAR) ---
window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (perfil) {
        // 1. Preencher Visualização
        document.getElementById('view-username').innerText = perfil.username || "Sem nome";
        document.getElementById('view-bairro').innerText = perfil.bairro || "Geral";
        document.getElementById('view-bio').innerText = perfil.bio || "Olá, gente!";
        
        const avatar = document.getElementById('view-avatar');
        if (perfil.avatar_url) {
            avatar.style.backgroundImage = `url('${perfil.avatar_url}')`;
            avatar.innerText = "";
        } else {
            avatar.style.backgroundImage = "none";
            avatar.innerText = (perfil.username || "M")[0];
        }

        // 2. Preencher formulário de edição (URL fica num campo discreto)
        document.getElementById('profile-username').value = perfil.username || "";
        document.getElementById('profile-bairro').value = perfil.bairro || "Centro";
        document.getElementById('profile-bio').value = perfil.bio || "";
        document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";

        // 3. Carregar Histórico do Usuário
        carregarFeed('Geral', session.user.id);
        
        document.getElementById('feed-tabs')?.classList.add('hidden');
        mostrarTela('view-profile-screen');
    }
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const updates = {
        username: document.getElementById('profile-username').value,
        bairro: document.getElementById('profile-bairro').value,
        bio: document.getElementById('profile-bio').value,
        avatar_url: document.getElementById('profile-avatar-url').value
    };
    
    const { error } = await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (!error) {
        alert("Perfil atualizado!");
        window.mostrarPerfilProprio(); // Volta para o "Ver Perfil"
    }
};

// --- AVISOS (PUBLICAÇÃO) ---
window.abrirPostagem = () => {
    document.getElementById('feed-tabs')?.classList.add('hidden');
    mostrarTela('form-post');
};

window.salvarPost = async () => {
    const content = document.getElementById('post-content').value;
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!content || !session) return;

    // Pega o bairro do perfil para marcar o post automaticamente
    const { data: perfil } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();

    const { error } = await _supabase.from('posts').insert({
        user_id: session.user.id,
        content: content,
        zona: perfil?.bairro || 'Geral'
    });

    if (!error) {
        document.getElementById('post-content').value = "";
        irParaHome();
    }
};

// --- FEED (CORE) ---
async function carregarFeed(filtro = 'Geral', userIdFiltro = null) {
    const targetId = userIdFiltro ? 'meu-historico-feed' : 'feed-container';
    const container = document.getElementById(targetId);
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url),
            reactions (emoji_type, user_id),
            comments (id)
        `)
        .order('created_at', { ascending: false });

    if (userIdFiltro) {
        query = query.eq('user_id', userIdFiltro);
    } else if (filtro === 'Local' && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts } = await query;
    renderizarFeed(posts || [], container, session?.user?.id);
}

function renderizarFeed(posts, container, currentUserId) {
    container.innerHTML = posts.length === 0 ? '<p class="text-center text-gray-400 py-10 text-xs">Nenhum aviso aqui.</p>' : "";
    
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-4 animate-fade-in";
        
        const avatarStyle = post.profiles?.avatar_url 
            ? `style="background-image: url('${post.profiles.avatar_url}')"` 
            : "";
        const iniciais = post.profiles?.avatar_url ? "" : (post.profiles?.username || "M")[0];

        const reacoesHtml = EMOJIS.map(e => {
            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
            const jaReagiu = post.reactions?.some(r => r.user_id === currentUserId && r.emoji_type === e);
            return `<button onclick="reagir('${post.id}', '${e}')" class="flex items-center gap-1 transition-all active:scale-125 ${jaReagiu ? 'opacity-100' : 'opacity-30'}">
                        <span class="text-sm">${e}</span>
                        <span class="text-[10px] font-black">${count || ''}</span>
                    </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-xl bg-feira-yellow bg-cover bg-center flex items-center justify-center font-black text-feira-marinho text-xs" ${avatarStyle}>${iniciais}</div>
                <div>
                    <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                    <span class="text-[9px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</span>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4">${post.content}</p>
            <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <span class="text-[9px] font-black uppercase text-gray-300">Conversas (${post.comments?.length || 0})</span>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- OUTROS ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const { error } = await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    }
    carregarFeed();
};

window.mudarFeed = (tipo) => {
    const isGeral = tipo === 'Geral';
    document.getElementById('tab-geral').className = isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = !isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(tipo);
};

window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro ao entrar: " + error.message);
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };
