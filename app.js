/**
 * GENTE DA FEIRA - VERSÃO 7.0 (SISTEMA COMPLETO)
 * Mantém: Reações, Realtime, Temas e Histórico.
 * Adiciona: Deleção de posts/coments, Upload de Foto e Post por Bairro.
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_FSA = ["Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", "Cidade Nova", "Conceição", "Feira IX", "Feira X", "George Américo", "Humildes", "Jardim Cruzeiro", "Limoeiro", "Mangabeira", "Muchila", "Papagaio", "Queimadinha", "Rua Nova", "Santa Mônica", "SIM", "Sobradinho", "Tomba"].sort();

// --- INICIALIZAÇÃO ---
window.onload = async () => {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    _supabase.auth.onAuthStateChange((event, session) => {
        const btnSair = document.getElementById('btn-sair');
        const nav = document.getElementById('main-nav');
        if (session) {
            btnSair?.classList.remove('hidden');
            nav?.classList.remove('hidden');
            irParaHome();
        } else {
            btnSair?.classList.add('hidden');
            nav?.classList.add('hidden');
            mostrarTela('auth-screen');
        }
    });

    _supabase.channel('fsa-updates').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        const queryAtiva = document.getElementById('tab-local')?.classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
        carregarFeed(queryAtiva);
    }).subscribe();
};

// --- CORE: FEED & POSTAGEM ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    const { data: { session } } = await _supabase.auth.getSession();
    
    let query = _supabase.from('posts').select('*, profiles(*), reactions(*), comments(*, profiles(*), comment_reactions(*))').order('created_at', { ascending: false });

    if (filtro === 'Local' && session) {
        const { data: profile } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (profile?.bairro) query = query.eq('bairro', profile.bairro);
    }

    const { data: posts } = await query;
    if (!posts) return container.innerHTML = '<p class="text-center p-20 font-bold text-gray-300 uppercase tracking-widest">Sintonizando Feira...</p>';

    container.innerHTML = posts.map(p => {
        const minhaReacao = p.reactions.find(r => r.user_id === session?.user?.id);
        const threadAberta = localStorage.getItem('thread_aberta') == p.id;

        return `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 animate-fade-in">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full border-2 border-white shadow-md bg-cover bg-center" style="background-image: url('${p.profiles.avatar_url}')"></div>
                    <div>
                        <h3 class="font-black text-sm text-feira-marinho tracking-tight">${p.profiles.username}</h3>
                        <p class="text-[10px] text-gray-400 uppercase font-bold tracking-widest">${p.bairro || 'Geral'}</p>
                    </div>
                </div>
                ${session && p.user_id === session.user.id ? `<button onclick="deletarConteudo('posts', ${p.id})" class="p-2 text-gray-200 hover:text-red-500">🗑️</button>` : ''}
            </div>

            <p class="text-gray-700 leading-relaxed mb-6 font-medium">${p.content}</p>

            <div class="flex gap-2 mb-6 overflow-x-auto no-scrollbar py-2">
                ${EMOJIS.map(e => `
                    <button onclick="reagir(${p.id}, '${e}')" class="px-4 py-2 rounded-full border border-gray-50 bg-gray-50 text-sm hover:bg-white hover:shadow-md transition-all ${minhaReacao?.emoji_type === e ? 'bg-white shadow-md border-feira-yellow scale-110' : ''}">
                        ${e} <span class="text-[10px] font-black ml-1">${p.reactions.filter(r => r.emoji_type === e).length || ''}</span>
                    </button>
                `).join('')}
            </div>

            <div class="border-t border-gray-50 pt-4">
                <button onclick="abrirThreads(${p.id})" class="text-[10px] font-black uppercase text-gray-400 tracking-widest hover:text-feira-marinho transition-colors">
                    💬 ${p.comments.length} Comentários
                </button>
                
                <div id="thread-${p.id}" class="${threadAberta ? '' : 'hidden'} mt-4 space-y-4 animate-fade-in">
                    ${p.comments.map(c => `
                        <div class="bg-gray-50 p-4 rounded-2xl relative">
                            <div class="flex justify-between items-start">
                                <div class="flex items-center gap-2 mb-2">
                                    <img src="${c.profiles.avatar_url}" class="w-6 h-6 rounded-full">
                                    <span class="font-black text-[10px] text-feira-marinho">${c.profiles.username}</span>
                                </div>
                                ${session && c.user_id === session.user.id ? `<button onclick="deletarConteudo('comments', ${c.id})" class="text-[10px] text-gray-300">Apagar</button>` : ''}
                            </div>
                            <p class="text-xs text-gray-600 font-medium">${c.content}</p>
                            
                            <div class="flex gap-1 mt-3">
                                ${EMOJIS.map(e => `
                                    <button onclick="reagirComentario(${c.id}, '${e}', ${p.id})" class="text-[10px] p-1 filter grayscale hover:grayscale-0 ${c.comment_reactions?.find(cr => cr.user_id === session?.user?.id && cr.emoji_type === e) ? 'grayscale-0' : ''}">
                                        ${e} ${c.comment_reactions?.filter(cr => cr.emoji_type === e).length || ''}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                    <div class="flex gap-2 mt-4">
                        <input id="in-${p.id}" placeholder="Escrever comentário..." class="flex-1 bg-gray-100 border-none rounded-xl p-3 text-xs font-bold">
                        <button onclick="comentar(${p.id})" class="bg-feira-marinho text-white px-4 rounded-xl font-black uppercase text-[10px]">OK</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.criarPostagem = async () => {
    const content = document.getElementById('post-content').value;
    const bairro = document.getElementById('post-bairro').value;
    const { data: { session } } = await _supabase.auth.getSession();

    if (content.trim()) {
        await _supabase.from('posts').insert({ content, user_id: session.user.id, bairro });
        document.getElementById('post-content').value = '';
        irParaHome();
        carregarFeed();
    }
};

// --- FUNÇÕES DE REAÇÃO (PRESERVADAS) ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const { data: existente } = await _supabase.from('reactions').select('*').eq('post_id', postId).eq('user_id', session.user.id).eq('emoji_type', emoji).single();

    if (existente) {
        await _supabase.from('reactions').delete().eq('id', existente.id);
    } else {
        await _supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', session.user.id);
        await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    }
    carregarFeed();
};

window.reagirComentario = async (commentId, emoji, postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    await _supabase.from('comment_reactions').upsert({ comment_id: commentId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'comment_id, user_id, emoji_type' });
    localStorage.setItem('thread_aberta', postId);
    carregarFeed();
};

// --- PERFIL E FOTO ---
window.processarFoto = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('preview-avatar');
        preview.style.backgroundImage = `url(${reader.result})`;
        preview.dataset.base64 = reader.result;
    };
    reader.readAsDataURL(file);
};

window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();

    document.getElementById('edit-username').value = profile.username;
    document.getElementById('edit-bairro').innerHTML = BAIRROS_FSA.map(b => `<option value="${b}" ${profile.bairro === b ? 'selected' : ''}>${b}</option>`).join('');
    
    const preview = document.getElementById('preview-avatar');
    preview.style.backgroundImage = `url('${profile.avatar_url}')`;
    
    mostrarTela('edit-profile-screen');
};

window.salvarPerfilCompleto = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const fotoBase64 = document.getElementById('preview-avatar').dataset.base64;
    
    const updates = {
        username: document.getElementById('edit-username').value,
        bairro: document.getElementById('edit-bairro').value,
    };

    if (fotoBase64) updates.avatar_url = fotoBase64;

    const { error } = await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (!error) {
        alert("Perfil atualizado!");
        irParaHome();
    }
};

// --- AUXILIARES E NAVEGAÇÃO ---
window.mostrarTela = (id) => {
    ['auth-screen', 'feed-container', 'form-post', 'edit-profile-screen'].forEach(s => document.getElementById(s)?.classList.add('hidden'));
    document.getElementById('feed-tabs')?.classList.add('hidden');
    document.getElementById(id)?.classList.remove('hidden');
    if (id === 'feed-container') document.getElementById('feed-tabs')?.classList.remove('hidden');
};

window.irParaHome = () => {
    localStorage.removeItem('thread_aberta');
    mostrarTela('feed-container');
    carregarFeed('Geral');
};

window.abrirPostagem = () => {
    const select = document.getElementById('post-bairro');
    select.innerHTML = '<option value="Geral">📍 Feira Toda (Geral)</option>' + BAIRROS_FSA.map(b => `<option value="${b}">${b}</option>`).join('');
    mostrarTela('form-post');
};

window.deletarConteudo = async (tabela, id) => {
    if (confirm("Deseja apagar permanentemente?")) {
        await _supabase.from(tabela).delete().eq('id', id);
        carregarFeed();
    }
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (input.value.trim()) {
        await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
        input.value = '';
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

window.fazerLogout = async () => { if(confirm("Sair do Gente da Feira?")) { await _supabase.auth.signOut(); location.reload(); }};
