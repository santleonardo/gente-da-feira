/**
 * GENTE DA FEIRA - VERSÃO ESTÁVEL 7.0
 * CORREÇÕES: Publicação de avisos, Foto de Perfil, Visualização vs Edição.
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('main-nav')?.classList.remove('hidden');
            document.getElementById('feed-tabs')?.classList.remove('hidden');
            document.querySelector('header button')?.classList.remove('hidden');
            irParaHome();
        } else {
            document.getElementById('main-nav')?.classList.add('hidden');
            document.getElementById('feed-tabs')?.classList.add('hidden');
            document.querySelector('header button')?.classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        if (!document.getElementById('feed-container').classList.contains('hidden')) carregarFeed();
    }).subscribe();
};

// --- NAVEGAÇÃO ---
function mostrarTela(id) {
    document.querySelectorAll('section, main').forEach(el => el.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    window.scrollTo(0,0);
}

window.irParaHome = () => {
    document.getElementById('feed-tabs').classList.remove('hidden');
    mostrarTela('feed-container');
    carregarFeed('Geral');
};

// --- AVISOS (PUBLICAÇÃO) ---
window.abrirPostagem = () => {
    document.getElementById('feed-tabs').classList.add('hidden'); // Limpa o visual para focar no post
    mostrarTela('form-post');
};

window.salvarPost = async () => {
    const content = document.getElementById('post-content').value;
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!content || !session) return alert("Escreva algo antes de enviar!");

    // Busca o bairro do perfil para marcar o post automaticamente
    const { data: perfil } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();

    const { error } = await _supabase.from('posts').insert({
        user_id: session.user.id,
        content: content,
        zona: perfil?.bairro || 'Geral'
    });

    if (!error) {
        document.getElementById('post-content').value = "";
        irParaHome();
    } else {
        alert("Erro ao publicar: " + error.message);
    }
};

// --- FEED (COM FOTOS E BIO) ---
async function carregarFeed(filtro = 'Geral', userIdFiltro = null) {
    const targetId = userIdFiltro ? 'meu-historico-feed' : 'feed-container';
    const container = document.getElementById(targetId);
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase
        .from('posts')
        .select(`*, profiles:user_id (username, bairro, avatar_url, bio), reactions (emoji_type, user_id), comments (id, content, profiles:user_id (username))`)
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
    container.innerHTML = posts.length === 0 ? '<p class="text-center text-gray-400 py-10 text-xs">Nenhum aviso por aqui ainda.</p>' : "";
    
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-4 animate-fade-in";
        
        // CORREÇÃO: Foto de Perfil em vez de URL
        const avatarHtml = post.profiles?.avatar_url 
            ? `<div class="w-10 h-10 rounded-xl shadow-sm bg-cover bg-center" style="background-image: url('${post.profiles.avatar_url}')"></div>`
            : `<div class="w-10 h-10 rounded-xl bg-feira-yellow flex items-center justify-center font-black text-feira-marinho text-xs">${(post.profiles?.username || 'M')[0]}</div>`;

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
                ${avatarHtml}
                <div>
                    <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                    <span class="text-[9px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</span>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4 leading-relaxed">${post.content}</p>
            <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="document.getElementById('thread-${post.id}').classList.toggle('hidden')" class="text-[9px] font-black uppercase text-gray-400">Conversa (${post.comments?.length || 0})</button>
            </div>
            <div id="thread-${post.id}" class="hidden mt-4 pt-4 border-t border-dashed border-gray-100">
                <div class="flex gap-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 rounded-xl p-3 outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black">ENVIAR</button>
                </div>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- PERFIL (VER VS EDITAR) ---
window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (perfil) {
        // Preenche a tela de VISUALIZAÇÃO
        document.getElementById('view-username').innerText = perfil.username || "Sem nome";
        document.getElementById('view-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('view-bio').innerText = perfil.bio || "Olá! Sou gente da feira.";
        
        const viewAvatar = document.getElementById('view-avatar');
        if (perfil.avatar_url) {
            viewAvatar.style.backgroundImage = `url('${perfil.avatar_url}')`;
            viewAvatar.innerText = "";
        } else {
            viewAvatar.style.backgroundImage = "none";
            viewAvatar.innerText = (perfil.username || "M")[0];
        }

        // Preenche os inputs da tela de EDIÇÃO (sem mostrar a URL para o usuário, apenas no input hidden se você tiver um)
        document.getElementById('profile-username').value = perfil.username || "";
        document.getElementById('profile-bairro').value = perfil.bairro || "Centro";
        document.getElementById('profile-bio').value = perfil.bio || "";
        document.getElementById('profile-avatar-url').value = perfil.avatar_url || "";

        // Carrega Histórico
        carregarFeed('Geral', session.user.id);
        
        document.getElementById('feed-tabs').classList.add('hidden');
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
    await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    alert("Perfil atualizado!");
    mostrarPerfilProprio(); // Volta para a visualização
};

// --- FUNÇÕES DE INTERAÇÃO ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { error } = await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error && error.code === '23505') {
        await _supabase.from('reactions').delete().match({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    }
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = "";
    carregarFeed();
};

window.mudarFeed = (tipo) => {
    const isGeral = tipo === 'Geral';
    document.getElementById('tab-geral').className = isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = !isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(tipo);
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };
