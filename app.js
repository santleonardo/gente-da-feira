/**
 * GENTE DA FEIRA - HUB FSA 2026
 * Versão 5.1 - Fix Estrutural de Reações
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];

window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await carregarFeed();
    
    // Ouvinte em tempo real
    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        const queryAtiva = document.getElementById('tab-local')?.classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
        carregarFeed(queryAtiva);
    }).subscribe();
};

async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();
    const userIdLogado = session?.user?.id;

    // QUERY CORRIGIDA: comment_reactions agora está DENTRO de comments
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

    if (filtro === 'Local' && userIdLogado) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', userIdLogado).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts, error } = await query;

    if (error) {
        console.error("Erro na Query:", error);
        container.innerHTML = `<div class="text-center p-10 text-xs font-bold text-red-400 uppercase">Erro de Sincronia. Tente atualizar a página.</div>`;
        return;
    }

    renderizarFeed(posts || [], container, userIdLogado);

    // Reabrir thread se necessário
    const aberta = localStorage.getItem('thread_aberta');
    if (aberta) {
        const el = document.getElementById(`thread-${aberta}`);
        if (el) el.classList.remove('hidden');
    }
}

function renderizarFeed(posts, container, userIdLogado) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        // Reações do Post Principal
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
                    const reacoesComentHtml = EMOJIS.map(emoji => {
                        // AQUI ESTAVA O ERRO: Buscamos as reações direto do objeto do comentário 'c'
                        const cCount = c.comment_reactions?.filter(cr => cr.emoji_type === emoji).length || 0;
                        return `
                            <button onclick="this.style.opacity='0.3'; reagirComentario('${c.id}', '${emoji}', '${post.id}')" class="flex items-center gap-1 hover:bg-white p-1 rounded-md transition-all">
                                <span class="text-[10px]">${emoji}</span>
                                <span class="text-[9px] font-bold text-gray-400">${cCount || ''}</span>
                            </button>`;
                    }).join('');

                    return `
                    <div class="bg-gray-50 p-3 rounded-2xl">
                        <p class="text-xs text-gray-600"><b class="text-feira-marinho">${c.profiles?.username || 'User'}:</b> ${c.content}</p>
                        <div class="flex gap-3 mt-2">${reacoesComentHtml}</div>
                    </div>`;
                }).join('')}
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 border-none rounded-xl p-3 outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-black uppercase">Enviar</button>
                </div>
            </div>
        `;
        container.appendChild(postEl);
    });
}

// --- FUNÇÕES DE INTERAÇÃO ---

window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faz login para reagir!");
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'post_id, user_id, emoji_type' });
    carregarFeed();
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    
    localStorage.setItem('thread_aberta', postId);
    
    const { error } = await _supabase.from('comment_reactions').upsert({ 
        comment_id: commentId, 
        user_id: session.user.id, 
        emoji_type: emoji 
    }, { onConflict: 'comment_id, user_id, emoji_type' });

    if (error) console.error("Erro ao reagir:", error);
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faz login para comentar!");

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

window.mudarFeed = (tipo) => {
    const isGeral = tipo === 'Geral';
    document.getElementById('tab-geral').className = isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = !isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(tipo);
};
