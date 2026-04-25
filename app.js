/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 7.0 (Correções de Exclusão, Perfil e Bairros)
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
        const queryAtiva = document.getElementById('tab-local')?.classList.contains('bg-feira-marinho') ? 'Local' : 'Geral';
        carregarFeed(queryAtiva);
    }).subscribe();
};

// --- FEED E POSTAGENS ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    const { data: { session } } = await _supabase.auth.getSession();
    
    let query = _supabase.from('posts').select('*, profiles(*), reactions(*), comments(*, profiles(*))').order('created_at', { ascending: false });

    if (filtro === 'Local' && session) {
        const { data: profile } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (profile?.bairro) query = query.eq('bairro', profile.bairro);
    }

    const { data: posts, error } = await query;
    
    if (error || !posts || posts.length === 0) {
        container.innerHTML = '<p class="text-center p-20 text-gray-400 font-bold uppercase text-[10px]">Nenhum aviso por aqui ainda.</p>';
        return;
    }

    container.innerHTML = posts.map(p => {
        const minhaReacao = p.reactions.find(r => r.user_id === session?.user?.id);
        const threadAberta = localStorage.getItem('thread_aberta') == p.id;

        return `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 animate-fade-in">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-cover bg-center border border-gray-100" style="background-image: url('${p.profiles.avatar_url}')"></div>
                    <div>
                        <h3 class="font-black text-sm text-feira-marinho">${p.profiles.username}</h3>
                        <p class="text-[10px] text-gray-400 uppercase font-bold tracking-widest">${p.bairro || 'Geral'}</p>
                    </div>
                </div>
                ${session && p.user_id === session.user.id ? `<button onclick="deletarItem('posts', ${p.id})" class="text-gray-200 hover:text-red-500 transition-colors">🗑️</button>` : ''}
            </div>
            <p class="text-gray-700 mb-6 font-medium leading-relaxed">${p.content}</p>
            
            <div class="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                ${EMOJIS.map(e => `
                    <button onclick="reagir(${p.id}, '${e}')" class="px-4 py-2 rounded-full border text-xs transition-all ${minhaReacao?.emoji_type === e ? 'bg-feira-yellow border-feira-yellow text-feira-marinho font-black' : 'bg-gray-50 border-gray-50 text-gray-400'}">
                        ${e} ${p.reactions.filter(r => r.emoji_type === e).length || ''}
                    </button>
                `).join('')}
            </div>

            <div class="border-t border-gray-50 pt-4">
                <button onclick="abrirThreads(${p.id})" class="text-[10px] font-black uppercase text-gray-400 tracking-widest hover:text-feira-marinho transition-colors">
                    💬 ${p.comments.length} Comentários
                </button>
                <div id="thread-${p.id}" class="${threadAberta ? '' : 'hidden'} mt-4 space-y-3">
                    ${p.comments.map(c => `
                        <div class="bg-gray-50 p-3 rounded-2xl relative">
                            <div class="flex justify-between mb-1">
                                <span class="font-black text-[10px] text-feira-marinho uppercase">${c.profiles?.username || 'Usuário'}</span>
                                ${session && c.user_id === session.user.id ? `<button onclick="deletarItem('comments', ${c.id})" class="text-[9px] font-bold text-red-300 uppercase">Apagar</button>` : ''}
                            </div>
                            <p class="text-xs text-gray-600">${c.content}</p>
                        </div>
                    `).join('')}
                    <div class="flex gap-2 pt-2">
                        <input id="in-${p.id}" placeholder="Escrever resposta..." class="flex-1 bg-white border border-gray-100 rounded-xl p-3 text-xs focus:ring-1 focus:ring-feira-yellow outline-none">
                        <button onclick="comentar(${p.id})" class="bg-feira-marinho text-white px-4 rounded-xl font-black text-[10px] uppercase">Enviar</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- FUNÇÕES DE INTERAÇÃO ---
window.deletarItem = async (tabela, id) => {
    if (confirm("Deseja apagar permanentemente?")) {
        const { error } = await _supabase.from(tabela).delete().eq('id', id);
        if (error) alert("Erro ao deletar: " + error.message);
        carregarFeed();
    }
};

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

// --- NAVEGAÇÃO E TELAS ---
window.irParaHome = () => {
    localStorage.removeItem('thread_aberta');
    mostrarTela('feed-container');
    carregarFeed();
};

window.abrirPostagem = () => {
    mostrarTela('form-post');
    const seletor = document.getElementById('post-bairro');
    if (seletor) {
        seletor.innerHTML = '<option value="Geral">📍 Feira Toda (Geral)</option>' + 
        BAIRROS_FSA.map(b => `<option value="${b}">${b}</option>`).join('');
    }
};

window.criarPostagem = async () => {
    const content = document.getElementById('post-content').value;
    const bairro = document.getElementById('post-bairro').value;
    const { data: { session } } = await _supabase.auth.getSession();
    if (content.trim()) {
        await _supabase.from('posts').insert({ content, user_id: session.user.id, bairro });
        document.getElementById('post-content').value = '';
        irParaHome();
    }
};

window.mostrarPerfilProprio = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    document.getElementById('edit-username').value = profile.username || "";
    document.getElementById('edit-bairro').innerHTML = BAIRROS_FSA.map(b => `<option value="${b}" ${profile.bairro === b ? 'selected' : ''}>${b}</option>`).join('');
    
    const preview = document.getElementById('preview-avatar');
    if (preview) preview.style.backgroundImage = `url('${profile.avatar_url || ''}')`;
    
    mostrarTela('edit-profile-screen');
};

window.previewImagem = (event) => {
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('preview-avatar');
        preview.style.backgroundImage = `url(${reader.result})`;
        preview.dataset.base64 = reader.result;
    };
    reader.readAsDataURL(event.target.files[0]);
};

window.salvarPerfilCompleto = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const fotoNova = document.getElementById('preview-avatar').dataset.base64;
    
    const updates = {
        username: document.getElementById('edit-username').value,
        bairro: document.getElementById('edit-bairro').value
    };

    if (fotoNova) updates.avatar_url = fotoNova;

    const { error } = await _supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (!error) irParaHome();
    else alert("Erro ao salvar: " + error.message);
};

// --- AUTH ---
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
    if (error) alert(error.message); else alert("Verifique seu e-mail para confirmar!");
};

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// --- AUXILIARES ---
window.mostrarTela = (id) => {
    ['auth-screen', 'feed-container', 'form-post', 'edit-profile-screen'].forEach(s => {
        document.getElementById(s)?.classList.add('hidden');
    });
    document.getElementById('feed-tabs')?.classList.add('hidden');
    document.getElementById(id)?.classList.remove('hidden');
    if (id === 'feed-container') document.getElementById('feed-tabs')?.classList.remove('hidden');
};

window.mudarFeed = (tipo) => {
    const isGeral = tipo === 'Geral';
    document.getElementById('tab-geral').className = isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-local').className = !isGeral ? 'flex-1 py-3 rounded-2xl font-black uppercase text-[10px] bg-feira-marinho text-white shadow-md' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(tipo);
};

window.abrirThreads = (id) => {
    const el = document.getElementById(`thread-${id}`);
    const isHidden = el.classList.toggle('hidden');
    if (!isHidden) localStorage.setItem('thread_aberta', id); else localStorage.removeItem('thread_aberta');
};
