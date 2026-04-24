console.log("Sistema Gente da Feira - Versão 1.5 (Threads + Upload + Realtime)");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;

// --- 2. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // Escuta Realtime para posts, comentários e reações
        _supabase
            .channel('fluxo-avisos-feira')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => carregarFeed())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => carregarFeed())
            .subscribe();

        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 3. UI E NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
    window.scrollTo(0,0);
}
window.mostrarTela = mostrarTela;

function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// --- 4. LÓGICA DE THREADS (CONTROLES) ---
window.prepararResposta = (postId, commentId, username) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    const nameSpan = document.getElementById(`reply-to-name-${postId}`);
    
    input.setAttribute('data-parent-id', commentId);
    input.placeholder = `Respondendo a ${username}...`;
    input.focus();
    
    if(nameSpan) nameSpan.innerText = username;
    if(indicator) indicator.classList.remove('hidden');
};

window.cancelarResposta = (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const indicator = document.getElementById(`reply-indicator-${postId}`);
    
    input.setAttribute('data-parent-id', "");
    input.placeholder = "Responder...";
    if(indicator) indicator.classList.add('hidden');
};

// --- 5. LÓGICA DO FEED ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    const { data: { session } } = await _supabase.auth.getSession();

    let query = _supabase
        .from('posts')
        .select(`*, profiles:user_id(username, bairro, avatar_url)`)
        .order('created_at', { ascending: false });

    if (apenasZona && session) {
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        if (p?.bairro) query = query.eq('zona', p.bairro);
    }

    const { data: posts, error: postErr } = await query;
    if (postErr) return console.error("Erro ao carregar posts:", postErr);

    const { data: allComments } = await _supabase.from('comments').select(`*, profiles:user_id(username)`).order('created_at', { ascending: true });
    const { data: allReacts } = await _supabase.from('reactions').select('*');

    container.innerHTML = "";

    posts.forEach(post => {
        const postComments = (allComments || []).filter(c => c.post_id === post.id);
        const postReacts = (allReacts || []).filter(r => r.post_id === post.id);
        const mainComments = postComments.filter(c => !c.parent_id);

        const renderReplies = (parentId) => {
            return postComments.filter(c => c.parent_id === parentId).map(r => `
                <div class="ml-6 mt-2 border-l-2 border-gray-200 pl-3 py-1">
                    <p class="text-[11px] text-gray-700">
                        <b class="text-feira-marinho">${escaparHTML(r.profiles?.username || "Morador")}:</b> ${escaparHTML(r.content)}
                    </p>
                    <button onclick="prepararResposta('${post.id}', '${r.id}', '${r.profiles?.username}')" 
                            class="text-[9px] font-black uppercase text-gray-400 hover:text-black">Responder</button>
                    ${renderReplies(r.id)}
                </div>`).join('');
        };

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-[#FFD700] mb-4 animate-fade-in";
        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">
                        ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-gray-800">${escaparHTML(post.profiles?.username || "Morador")}</h3>
                        <p class="text-[10px] text-black font-black uppercase bg-[#FFD700] px-1 rounded w-fit">${escaparHTML(post.zona || "Geral")}</p>
                    </div>
                </div>
                ${session?.user.id === post.user_id ? `<button onclick="excluirPost(${post.id})" class="text-gray-300 hover:text-red-500">🗑️</button>` : ''}
            </div>
            <p class="text-gray-700 text-sm mb-4 whitespace-pre-wrap">${escaparHTML(post.content)}</p>
            
            <div class="flex gap-6 border-t border-b py-2 mb-3">
                <button onclick="reagir(${post.id}, '❤️')" class="text-xs">❤️ ${postReacts.filter(r => r.emoji_type === '❤️').length}</button>
                <button onclick="reagir(${post.id}, '👍')" class="text-xs">👍 ${postReacts.filter(r => r.emoji_type === '👍').length}</button>
            </div>

            <div class="space-y-2 mb-3">
                ${mainComments.map(c => `
                    <div class="bg-gray-50 p-2 rounded-lg text-xs">
                        <b class="text-feira-marinho">${escaparHTML(c.profiles?.username || "Morador")}:</b> ${escaparHTML(c.content)}
                        <br>
                        <button onclick="prepararResposta('${post.id}', '${c.id}', '${c.profiles?.username}')" 
                                class="text-[9px] font-black uppercase text-gray-400 mt-1">Responder</button>
                        ${renderReplies(c.id)}
                    </div>`).join('')}
            </div>

            <div class="flex flex-col gap-1">
                <div id="reply-indicator-${post.id}" class="hidden text-[10px] font-black text-white bg-black px-2 py-1 rounded-t-lg w-fit">
                    Respondendo a <span id="reply-to-name-${post.id}"></span>
                    <button onclick="cancelarResposta('${post.id}')" class="ml-2 text-feira-amarelo">✕</button>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="comment-input-${post.id}" data-parent-id="" placeholder="Responder..." 
                           class="flex-1 text-xs p-2.5 border rounded-xl outline-none">
                    <button onclick="comentar(${post.id})" class="bg-black text-[#FFD700] px-4 py-2 rounded-xl text-xs font-black">ENVIAR</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 6. INTERAÇÕES ---
window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const input = document.getElementById(`comment-input-${postId}`);
    const parentId = input.getAttribute('data-parent-id');
    const content = input.value.trim();
    if (!content) return;

    await _supabase.from('comments').insert([{ 
        post_id: postId, 
        user_id: session.user.id, 
        content: content,
        parent_id: (parentId && parentId !== "") ? parentId : null
    }]);

    input.value = "";
    cancelarResposta(postId);
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value.trim();
    const zona = document.getElementById('post-zona').value;
    if (!content) return;

    await _supabase.from('posts').insert([{ content, user_id: session.user.id, zona }]);
    document.getElementById('post-content').value = ""; 
    mostrarTela('feed-container');
};

window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'post_id,user_id' });
};

window.excluirPost = async (id) => {
    if (confirm("Apagar aviso?")) { 
        await _supabase.from('posts').delete().eq('id', id);
        carregarFeed();
    }
};

// --- 7. PERFIL E DASHBOARD ---
window.verPerfilPublico = async function(userId) {
    mostrarTela('user-dashboard');
    
    const [{ data: perfil }, { data: posts }] = await Promise.all([
        _supabase.from('profiles').select('*').eq('id', userId).single(),
        _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Morador";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem bio.";
        const img = document.getElementById('img-perfil'), emo = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) { img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden'); }
        else { img.classList.add('hidden'); emo.classList.remove('hidden'); }
    }

    document.getElementById('dash-count').innerText = posts ? posts.length : 0;
    const historico = document.getElementById('historico-posts');
    historico.innerHTML = posts?.length ? posts.map(p => `
        <div class="bg-gray-50 p-3 rounded-xl border mb-2 text-sm">
            <p class="text-gray-700">${escaparHTML(p.content)}</p>
        </div>`).join('') : "<p class='text-center text-gray-400 text-xs py-4'>Nenhum aviso ainda.</p>";

    const { data: { session } } = await _supabase.auth.getSession();
    document.getElementById('dash-acoes').classList.toggle('hidden', session?.user.id !== userId);
};

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

    const fileInput = document.getElementById('perfil-upload');
    if (fileInput?.files[0]) {
        const file = fileInput.files[0];
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { data: up } = await _supabase.storage.from('avatars').upload(path, file);
        if (up) updates.avatar_url = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    if (error) alert(error.message); else verPerfilPublico(session.user.id);
};

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (p) {
        document.getElementById('perfil-nome').value = p.username || "";
        document.getElementById('perfil-bairro').value = p.bairro || "";
        document.getElementById('perfil-bio').value = p.bio || "";
    }
    mostrarTela('form-perfil');
};

// --- 8. AUTH ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else location.reload();
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert(error.message); 
    else alert("Conta criada! Verifique seu e-mail ou faça login.");
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };

// --- 9. CONTROLES GLOBAIS ---
window.mudarFeed = (tipo) => {
    const isGlobal = tipo === 'global';
    document.getElementById('tab-global').className = isGlobal ? 'flex-1 py-3 active-tab text-black font-black' : 'flex-1 py-3 text-gray-400 font-bold';
    document.getElementById('tab-zona').className = !isGlobal ? 'flex-1 py-3 active-tab text-black font-black' : 'flex-1 py-3 text-gray-400 font-bold';
    carregarFeed(!isGlobal);
};

window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) mostrarTela('auth-screen'); else mostrarTela('form-post');
};

window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};
