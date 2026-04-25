/**
 * GENTE DA FEIRA - VERSÃO 6.0 (RESTAURO TOTAL)
 * Preserva: Fotos, Bio, Navegação e Filtros.
 * Corrige: Clique nas Reações e Visibilidade do Botão Sair.
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

// --- 1. INICIALIZAÇÃO E SEGURANÇA ---
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Gerenciador de Sessão (Controla o que aparece na tela)
    _supabase.auth.onAuthStateChange((event, session) => {
        const btnSair = document.getElementById('btn-sair') || document.querySelector('button[onclick="fazerLogout()"]');
        
        if (session) {
            // Logado: Mostra App, Esconde Login
            if(btnSair) btnSair.classList.remove('hidden');
            document.getElementById('main-nav')?.classList.remove('hidden');
            document.getElementById('feed-tabs')?.classList.remove('hidden');
            mostrarTela('feed-container');
            carregarFeed();
            carregarDadosPerfil(session.user.id);
        } else {
            // Deslogado: Mostra Login, Esconde App
            if(btnSair) btnSair.classList.add('hidden');
            document.getElementById('main-nav')?.classList.add('hidden');
            document.getElementById('feed-tabs')?.classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    // Realtime: Atualiza o feed automaticamente quando alguém posta ou reage
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        const filtroAtual = document.getElementById('tab-local')?.classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
        carregarFeed(filtroAtual);
    }).subscribe();
};

// --- 2. NAVEGAÇÃO ---
function mostrarTela(id) {
    document.querySelectorAll('section, main').forEach(el => el.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    window.scrollTo(0,0);
}

window.irParaHome = () => {
    mostrarTela('feed-container');
    carregarFeed('Geral');
};

// --- 3. MOTOR DO FEED (COM FOTOS E BIO) ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const isLocal = filtro === 'Local';

    // UI das Abas
    const tabGeral = document.getElementById('tab-geral');
    const tabLocal = document.getElementById('tab-local');
    if(tabGeral && tabLocal) {
        tabGeral.className = !isLocal ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
        tabLocal.className = isLocal ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    }

    // Query robusta: busca posts + dados do autor (foto/bio) + reações + comentários
    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url, bio),
            reactions (emoji_type, user_id),
            comments (
                *, 
                profiles:user_id (username, avatar_url),
                comment_reactions (emoji_type, user_id)
            )
        `)
        .order('created_at', { ascending: false });

    if (isLocal && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts } = await query;
    renderizarFeed(posts || [], container, session?.user?.id);

    // Mantém a thread aberta se o usuário estava interagindo nela
    const aberta = localStorage.getItem('thread_aberta');
    if (aberta) document.getElementById(`thread-${aberta}`)?.classList.remove('hidden');
}

function renderizarFeed(posts, container, userId) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        // Foto de Perfil (Avatar)
        const avatarImg = post.profiles?.avatar_url 
            ? `<img src="${post.profiles.avatar_url}" class="w-10 h-10 rounded-xl object-cover shadow-sm">`
            : `<div class="w-10 h-10 rounded-xl bg-feira-yellow flex items-center justify-center font-black text-feira-marinho">${(post.profiles?.username || 'M')[0]}</div>`;

        // Lógica de Reações (Botões que agora funcionam)
        const reacoesHtml = EMOJIS.map(e => {
            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
            const jaReagiu = post.reactions?.some(r => r.user_id === userId && r.emoji_type === e);
            return `
                <button onclick="reagir('${post.id}', '${e}')" class="flex items-center gap-1 transition-all active:scale-125 ${jaReagiu ? 'opacity-100' : 'opacity-30 hover:opacity-100'}">
                    <span class="text-sm">${e}</span>
                    <span class="text-[10px] font-black ${jaReagiu ? 'text-feira-marinho' : 'text-gray-400'}">${count || ''}</span>
                </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-4 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                ${avatarImg}
                <div>
                    <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                    <div class="flex gap-2 items-center">
                        <span class="text-[9px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</span>
                        ${post.profiles?.bio ? `<span class="text-[9px] text-feira-bronze italic">• ${post.profiles.bio.substring(0,20)}...</span>` : ''}
                    </div>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4 leading-relaxed">${post.content}</p>
            <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[10px] font-black uppercase text-feira-marinho bg-gray-50 px-3 py-2 rounded-lg">Conversa (${post.comments?.length || 0})</button>
            </div>
            <div id="thread-${post.id}" class="hidden mt-4 space-y-3 pt-4 border-t border-dashed border-gray-100">
                ${post.comments?.map(c => `
                    <div class="bg-gray-100/50 p-3 rounded-2xl flex gap-3">
                        <img src="${c.profiles?.avatar_url || 'https://via.placeholder.com/30'}" class="w-6 h-6 rounded-lg object-cover">
                        <div class="flex-1">
                            <p class="text-xs text-gray-600"><b>${c.profiles?.username}:</b> ${c.content}</p>
                        </div>
                    </div>
                `).join('')}
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 border-none rounded-xl p-3 outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black">ENVIAR</button>
                </div>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- 4. AÇÕES DE INTERAÇÃO (REAÇÕES FIX) ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    // Tenta inserir a reação. Se já existir (erro 23505), removemos para fazer o efeito de "desmarcar".
    const { error } = await _supabase.from('reactions').insert({ 
        post_id: postId, user_id: session.user.id, emoji_type: emoji 
    });

    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ 
            post_id: postId, user_id: session.user.id, emoji_type: emoji 
        });
    }
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value || !session) return;

    await _supabase.from('comments').insert({ 
        post_id: postId, user_id: session.user.id, content: input.value 
    });
    input.value = "";
    localStorage.setItem('thread_aberta', postId);
    carregarFeed();
};

// --- 5. PERFIL E DADOS ---
window.carregarDadosPerfil = async (id) => {
    const { data } = await _supabase.from('profiles').select('*').eq('id', id).single();
    if (data) {
        if(document.getElementById('profile-username')) document.getElementById('profile-username').value = data.username || "";
        if(document.getElementById('profile-bairro')) document.getElementById('profile-bairro').value = data.bairro || "Geral";
        if(document.getElementById('profile-bio')) document.getElementById('profile-bio').value = data.bio || "";
        if(document.getElementById('profile-avatar-url')) document.getElementById('profile-avatar-url').value = data.avatar_url || "";
        
        const preview = document.getElementById('profile-avatar-preview');
        if(preview && data.avatar_url) preview.style.backgroundImage = `url(${data.avatar_url})`;
    }
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const updates = {
        username: document.getElementById('profile-username').value,
        bairro: document.getElementById('profile-bairro').value,
        bio: document.getElementById('profile-bio').value,
        avatar_url: document.getElementById('profile-avatar-url').value
    };

    const { error } = await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (!error) {
        alert("Perfil de Feira atualizado!");
        mostrarTela('feed-container');
    }
};

// --- 6. AUTHENTICATION ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert(error.message); else alert("Verifique seu e-mail!");
};

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// Auxiliares
window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); else localStorage.removeItem('thread_aberta');
};
window.abrirPostagem = () => mostrarTela('form-post');
window.mudarFeed = (tipo) => carregarFeed(tipo);
window.verPerfilPublico = (id) => console.log("Ver perfil de:", id); // Espaço para expansão futura
