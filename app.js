const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

// --- INICIALIZAÇÃO ---
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Controle de Sessão
    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('main-nav').classList.remove('hidden');
            document.getElementById('feed-tabs').classList.remove('hidden');
            mostrarTela('feed-container');
            carregarFeed();
            carregarDadosPerfil(session.user.id);
        } else {
            document.getElementById('main-nav').classList.add('hidden');
            document.getElementById('feed-tabs').classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    // Realtime
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => carregarFeed()).subscribe();
};

// --- NAVEGAÇÃO ---
function mostrarTela(id) {
    document.querySelectorAll('section, main').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo(0,0);
}

// --- FEED & DADOS ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    const { data: { session } } = await _supabase.auth.getSession();

    const isLocal = filtro === 'Local';
    document.getElementById('tab-geral').className = !isLocal ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = isLocal ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white' : 'flex-1 py-3 text-gray-400 font-bold';

    let query = _supabase
        .from('posts')
        .select('*, profiles:user_id(username, bairro), reactions(emoji_type, user_id), comments(*, profiles:user_id(username), comment_reactions(emoji_type, user_id))')
        .order('created_at', { ascending: false });

    if (isLocal && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts } = await query;
    renderizarFeed(posts || [], container, session?.user?.id);

    const aberta = localStorage.getItem('thread_aberta');
    if (aberta) document.getElementById(`thread-${aberta}`)?.classList.remove('hidden');
}

function renderizarFeed(posts, container, userId) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        const reacoesHtml = EMOJIS.map(e => {
            const count = post.reactions?.filter(r => r.emoji_type === e).length || 0;
            return `<button onclick="reagir('${post.id}', '${e}')" class="flex items-center gap-1"><span class="text-sm">${e}</span><span class="text-[10px] font-black text-gray-400">${count || ''}</span></button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <div class="w-8 h-8 rounded-lg bg-feira-yellow flex items-center justify-center font-black text-feira-marinho text-xs">${(post.profiles?.username || 'M')[0]}</div>
                <div><h4 class="font-black text-feira-marinho text-xs">${post.profiles?.username || 'Morador'}</h4><p class="text-[8px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</p></div>
            </div>
            <p class="text-gray-600 text-sm mb-4 leading-relaxed">${post.content}</p>
            <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[9px] font-black uppercase text-feira-marinho bg-gray-50 px-3 py-2 rounded-lg">Conversa (${post.comments?.length || 0})</button>
            </div>
            <div id="thread-${post.id}" class="hidden mt-4 space-y-3 pt-4 border-t border-dashed border-gray-100">
                ${post.comments?.map(c => {
                    const cReacoes = EMOJIS.map(e => {
                        const count = c.comment_reactions?.filter(cr => cr.emoji_type === e).length || 0;
                        return `<button onclick="reagirComentario('${c.id}', '${e}', '${post.id}')" class="text-[10px]">${e} ${count || ''}</button>`;
                    }).join(' ');
                    return `<div class="bg-gray-50 p-3 rounded-2xl"><p class="text-xs text-gray-600"><b>${c.profiles?.username}:</b> ${c.content}</p><div class="flex gap-3 mt-2">${cReacoes}</div></div>`;
                }).join('')}
                <div class="flex gap-2"><input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 border-none rounded-xl p-3 outline-none"><button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black">OK</button></div>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- AÇÕES ---
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
    if (error) alert("Erro ou verifique e-mail."); else alert("Conta criada!");
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };

window.abrirPostagem = () => mostrarTela('form-post');

window.salvarPostagem = async () => {
    const content = document.getElementById('post-content').value;
    const { data: { session } } = await _supabase.auth.getSession();
    if (!content || !session) return;
    
    const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
    await _supabase.from('posts').insert({ user_id: session.user.id, content, zona: p?.bairro || 'Geral' });
    
    document.getElementById('post-content').value = "";
    mostrarTela('feed-container');
    carregarFeed();
};

window.carregarDadosPerfil = async (id) => {
    const { data } = await _supabase.from('profiles').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('profile-username').value = data.username || "";
        document.getElementById('profile-bairro').value = data.bairro || "Geral";
    }
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const username = document.getElementById('profile-username').value;
    const bairro = document.getElementById('profile-bairro').value;
    await _supabase.from('profiles').update({ username, bairro }).eq('id', session.user.id);
    alert("Perfil Atualizado!");
    mostrarTela('feed-container');
};

window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'post_id, user_id, emoji_type' });
    carregarFeed();
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    localStorage.setItem('thread_aberta', postId);
    await _supabase.from('comment_reactions').upsert({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'comment_id, user_id, emoji_type' });
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session || !input.value) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = "";
    localStorage.setItem('thread_aberta', postId);
    carregarFeed();
};

window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); else localStorage.removeItem('thread_aberta');
};

window.mudarFeed = (tipo) => carregarFeed(tipo);
