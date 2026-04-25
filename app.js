/**
 * GENTE DA FEIRA - HUB FSA 2026
 * Versão 5.2 - Motor Completo (Auth + Feed + Reações)
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

// --- 1. INICIALIZAÇÃO & SEGURANÇA ---
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Monitor de Login (A porta de entrada)
    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('main-nav')?.classList.remove('hidden');
            document.getElementById('feed-tabs')?.classList.remove('hidden');
            mostrarTela('feed-container');
            carregarFeed();
        } else {
            mostrarTela('auth-screen');
        }
    });

    // Realtime (Atualização automática de Feira)
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => carregarFeed()).subscribe();
};

// --- 2. GESTÃO DE TELAS ---
function mostrarTela(id) {
    // Esconde todas as seções e o container principal
    document.querySelectorAll('section, main').forEach(el => el.classList.add('hidden'));
    // Mostra a tela desejada
    const target = document.getElementById(id);
    if (target) target.classList.remove('hidden');
}

// --- 3. CORE: CARREGAR FEED ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    const { data: { session } } = await _supabase.auth.getSession();
    
    // Query Hierárquica (Ajuste que removeu o "Sintonizando")
    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url),
            reactions (emoji_type, user_id),
            comments (
                *, 
                profiles:user_id (username),
                comment_reactions (emoji_type, user_id)
            )
        `)
        .order('created_at', { ascending: false });

    if (filtro === 'Local' && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts, error } = await query;
    if (error) return console.error("Erro FSA:", error);

    renderizarFeed(posts || [], container, session?.user?.id);

    // Mantém a conversa aberta após atualizar
    const aberta = localStorage.getItem('thread_aberta');
    if (aberta) document.getElementById(`thread-${aberta}`)?.classList.remove('hidden');
}

// --- 4. RENDERIZAÇÃO VISUAL ---
function renderizarFeed(posts, container, userIdLogado) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        const reacoesPostHtml = EMOJIS.map(emoji => {
            const count = post.reactions?.filter(r => r.emoji_type === emoji).length || 0;
            return `<button onclick="reagir('${post.id}', '${emoji}')" class="flex items-center gap-1">
                <span class="text-sm">${emoji}</span>
                <span class="text-[10px] font-black text-gray-400">${count || ''}</span>
            </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-xl bg-feira-yellow flex items-center justify-center font-black text-feira-marinho">
                    ${(post.profiles?.username || 'M')[0].toUpperCase()}
                </div>
                <div>
                    <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                    <span class="text-[9px] font-bold text-gray-300 uppercase">${post.zona || 'Geral'}</span>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4 leading-relaxed">${post.content}</p>
            <div class="flex items-center justify-between pt-4 border-t border-gray-50">
                <div class="flex gap-4">${reacoesPostHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[10px] font-black uppercase text-feira-marinho bg-gray-50 px-3 py-2 rounded-lg">Conversa (${post.comments?.length || 0})</button>
            </div>
            
            <div id="thread-${post.id}" class="hidden mt-4 space-y-3 pt-4 border-t border-dashed border-gray-100">
                ${post.comments?.map(c => {
                    const cReacoes = EMOJIS.map(emoji => {
                        const count = c.comment_reactions?.filter(cr => cr.emoji_type === emoji).length || 0;
                        return `<button onclick="this.style.opacity='0.3'; reagirComentario('${c.id}', '${emoji}', '${post.id}')" class="flex items-center gap-1">
                            <span class="text-[10px]">${emoji}</span>
                            <span class="text-[9px] font-bold text-gray-400">${count || ''}</span>
                        </button>`;
                    }).join('');
                    return `<div class="bg-gray-50 p-3 rounded-2xl">
                        <p class="text-xs text-gray-600"><b>${c.profiles?.username || 'FSA'}:</b> ${c.content}</p>
                        <div class="flex gap-3 mt-2">${cReacoes}</div>
                    </div>`;
                }).join('')}
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 border-none rounded-xl p-3 outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black">ENVIAR</button>
                </div>
            </div>`;
        container.appendChild(postEl);
    });
}

// --- 5. AÇÕES DE AUTENTICAÇÃO ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro ao entrar: " + error.message);
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert(error.message); 
    else alert("Conta criada! Verifique seu e-mail e faça login.");
};

window.fazerLogout = async () => { 
    await _supabase.auth.signOut(); 
    localStorage.clear();
    location.reload(); 
};

// --- 6. AÇÕES DO FEED ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
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
    if (!session || !input.value.trim()) return;
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

window.abrirPostagem = () => mostrarTela('form-post');
window.mudarFeed = (tipo) => carregarFeed(tipo);
