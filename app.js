console.log("Sistema Gente da Feira - Versão Realtime Estabilizada");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;

// --- 2. INICIALIZAÇÃO COM REALTIME ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado com sucesso!");
        
        _supabase
            .channel('fluxo-avisos-feira')
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'posts' }, // Escuta INSERT e DELETE
                (payload) => {
                    console.log('Mudança detectada no feed!', payload);
                    carregarFeed(); 
                }
            )
            .subscribe();

        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 3. NAVEGAÇÃO E UI ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
}
window.mostrarTela = mostrarTela;

function escaparHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- 4. LÓGICA DO FEED ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    container.innerHTML = '<p class="text-center p-10 text-gray-400 animate-pulse font-medium">Buscando avisos em Feira de Santana...</p>';

    // Obtém sessão atual para validar quem pode apagar posts
    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase
        .from('posts')
        .select(`*, profiles:user_id(username, bairro, avatar_url)`)
        .order('created_at', { ascending: false });

    if (apenasZona && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts, error } = await query;
    
    if (error) {
        return container.innerHTML = `<div class="text-center p-10"><p class="text-red-500 font-bold">Erro ao carregar o feed.</p></div>`;
    }

    container.innerHTML = "";
    
    if (posts.length === 0) {
        container.innerHTML = "<p class='text-center p-10 text-gray-500'>Nenhum aviso encontrado.</p>";
        return;
    }

    for (const post of posts) {
        const [reactsRes, commentsRes] = await Promise.all([
            _supabase.from('reactions').select('emoji_type').eq('post_id', post.id),
            _supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true })
        ]);

        const reacts = reactsRes.data || [];
        const comments = commentsRes.data || [];
        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-[#8B6D45] mb-4 transition-all hover:shadow-md";
        
        const nomeUsuario = post.profiles?.username || "Morador de Feira";
        const bairroExibicao = post.zona || post.profiles?.bairro || "Geral";
        const avatarUrl = post.profiles?.avatar_url;
        
        // Verifica se o usuário logado é o dono deste post
        const eDono = session?.user.id === post.user_id;

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` : '<span class="text-gray-400 text-xl">👤</span>'}
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-gray-800">${escaparHTML(nomeUsuario)}</h3>
                        <p class="text-[10px] text-[#8B6D45] font-black uppercase tracking-tighter">${escaparHTML(bairroExibicao)}</p>
                    </div>
                </div>
                ${eDono ? `
                    <button onclick="excluirPost(${post.id})" class="text-gray-300 hover:text-red-500 transition-colors p-2">
                        <span class="text-lg">🗑️</span>
                    </button>
                ` : ''}
            </div>
            <p class="text-gray-700 text-sm leading-relaxed mb-4 whitespace-pre-wrap">${escaparHTML(post.content)}</p>
            
            <div class="flex gap-6 border-t border-b py-2 mb-3">
                <button onclick="reagir(${post.id}, '❤️')" class="reaction-btn text-sm flex items-center gap-1.5 grayscale hover:grayscale-0">
                    ❤️ <span class="font-bold text-gray-600">${reacts.filter(r => r.emoji_type === '❤️').length}</span>
                </button>
                <button onclick="reagir(${post.id}, '👍')" class="reaction-btn text-sm flex items-center gap-1.5 grayscale hover:grayscale-0">
                    👍 <span class="font-bold text-gray-600">${reacts.filter(r => r.emoji_type === '👍').length}</span>
                </button>
            </div>

            <div class="space-y-2 mb-3">
                ${comments.map(c => `
                    <div class="bg-gray-50 p-2.5 rounded-lg border-l-2 border-[#8B6D45]/30 text-[13px]">
                        <span class="font-bold text-[#1e3a5f]">Resposta:</span> ${escaparHTML(c.content)}
                    </div>
                `).join('')}
            </div>

            <div class="flex gap-2">
                <input type="text" id="comment-input-${post.id}" placeholder="Responder..." 
                       class="flex-1 text-xs p-2.5 border border-gray-200 rounded-xl outline-none">
                <button onclick="comentar(${post.id})" 
                        class="bg-[#8B6D45] text-white px-4 py-2 rounded-xl text-xs font-bold active:scale-95 hover:bg-[#6f5637]">Enviar</button>
            </div>
        `;
        container.appendChild(div);
    }
}

// --- 5. DASHBOARD E PERFIL ---
window.verPerfilPublico = async function(userId) {
    mostrarTela('user-dashboard');
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    
    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Morador";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem bio definida.";
        
        const img = document.getElementById('img-perfil');
        const emo = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) {
            img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden');
        } else {
            img.classList.add('hidden'); emo.classList.remove('hidden');
        }
    }

    const { data: { session } } = await _supabase.auth.getSession();
    const isDono = session?.user.id === userId;
    document.getElementById('dash-acoes').classList.toggle('hidden', !isDono);

    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    document.getElementById('dash-count').innerText = posts?.length || 0;
    
    const hist = document.getElementById('historico-posts');
    if (hist) {
        hist.innerHTML = posts?.length ? posts.map(p => `
            <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-sm mb-3">
                <div class="flex justify-between items-start">
                    <p class="text-gray-700 flex-1">${escaparHTML(p.content)}</p>
                    ${isDono ? `
                        <button onclick="excluirPost(${p.id})" class="ml-2 text-gray-300 hover:text-red-500">🗑️</button>
                    ` : ''}
                </div>
                <div class="flex justify-between mt-2 text-[9px] font-bold text-gray-400 uppercase">
                    <span class="text-[#8B6D45]">${p.zona}</span>
                    <span>${new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
            </div>
        `).join('') : "<p class='text-center text-gray-400 text-xs py-4'>Nenhum aviso publicado.</p>";
    }
};

// --- 6. INTERAÇÕES ---

// NOVA FUNÇÃO: Excluir Post
window.excluirPost = async (postId) => {
    if (!confirm("Tem certeza que deseja apagar este aviso em Feira?")) return;

    const { error } = await _supabase
        .from('posts')
        .delete()
        .eq('id', postId);

    if (error) {
        alert("Erro ao excluir: " + error.message);
    } else {
        // Se estiver no dashboard do próprio usuário, atualiza o perfil dele também
        const { data: { session } } = await _supabase.auth.getSession();
        const estaNoDashboard = !document.getElementById('user-dashboard').classList.contains('hidden');
        
        if (estaNoDashboard && session) {
            verPerfilPublico(session.user.id);
        }
        carregarFeed();
    }
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;

    if (!content.trim()) return alert("Descreva o aviso.");

    const { error } = await _supabase.from('posts').insert([{
        content: content,
        user_id: session.user.id,
        zona: zona
    }]);

    if (error) alert("Erro: " + error.message);
    else {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
    }
};

window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    await _supabase.from('reactions').upsert({
        post_id: postId, user_id: session.user.id, emoji_type: emoji
    }, { onConflict: 'post_id,user_id' });
    
    carregarFeed();
};

window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const input = document.getElementById(`comment-input-${postId}`);
    if (!input.value.trim()) return;

    await _supabase.from('comments').insert([{
        post_id: postId, user_id: session.user.id, content: input.value
    }]);

    input.value = "";
    carregarFeed();
};

// --- 7. AUTENTICAÇÃO ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro: " + error.message); else location.reload();
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert("Erro: " + error.message); else alert("Verifique seu e-mail.");
};

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// --- 8. GESTÃO DE PERFIL ---
window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value,
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value,
        updated_at: new Date()
    };

    const file = document.getElementById('perfil-upload').files[0];
    if (file) {
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { data: up } = await _supabase.storage.from('avatars').upload(path, file);
        if (up) {
            updates.avatar_url = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    if (error) alert("Erro ao salvar: " + error.message); else verPerfilPublico(session.user.id);
};

// --- 9. CONTROLES GLOBAIS ---
window.mudarFeed = (tipo) => {
    const isGlobal = tipo === 'global';
    const tabGlobal = document.getElementById('tab-global');
    const tabZona = document.getElementById('tab-zona');
    
    if (tabGlobal) tabGlobal.className = isGlobal ? 'flex-1 py-3 active-tab text-[#8B6D45] font-bold' : 'flex-1 py-3 text-gray-500';
    if (tabZona) tabZona.className = !isGlobal ? 'flex-1 py-3 active-tab text-[#8B6D45] font-bold' : 'flex-1 py-3 text-gray-500';
    
    carregarFeed(!isGlobal);
};

window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    mostrarTela('form-post');
};

window.abrirEdicaoPerfil = () => {
    _supabase.auth.getSession().then(({data: {session}}) => {
        if (session) {
            _supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({data: p}) => {
                if (p) {
                    document.getElementById('perfil-nome').value = p.username || "";
                    document.getElementById('perfil-bairro').value = p.bairro || "";
                    document.getElementById('perfil-bio').value = p.bio || "";
                }
                mostrarTela('form-perfil');
            });
        }
    });
};

window.toggleForm = () => mostrarTela('feed-container');

window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};
