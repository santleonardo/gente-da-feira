console.log("Gente da Feira - Sistema Completo Restaurado");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb'; // Substituir pela chave eyJ...

let _supabase;

// --- 1. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        verificarSessao();
        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    return session;
}

// --- 2. NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(telaAtiva)?.classList.remove('hidden');
}

function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
}

// --- 3. FEED E INTERAÇÕES ---
window.carregarFeed = async (apenasZona = false) => {
    const container = document.getElementById('feed-container');
    if (!container) return;
    
    container.innerHTML = '<p class="text-center p-10 text-gray-400 animate-pulse">Carregando avisos de Feira...</p>';

    let query = _supabase.from('posts').select(`*, profiles(username, bairro, avatar_url)`).order('created_at', { ascending: false });

    if (apenasZona) {
        const session = await verificarSessao();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p?.bairro) query = query.eq('zona', p.bairro);
        }
    }

    const { data: posts, error } = await query;
    if (error) return container.innerHTML = "Erro ao carregar o feed.";

    container.innerHTML = "";
    for (const post of posts) {
        const { data: reacts } = await _supabase.from('reactions').select('emoji_type').eq('post_id', post.id);
        const { data: comments } = await _supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true });

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-red-700 mb-4";
        div.innerHTML = `
            <div class="flex items-center gap-3 mb-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                    ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                </div>
                <div>
                    <h3 class="font-bold text-sm text-gray-800">${escaparHTML(post.profiles?.username || 'Morador')}</h3>
                    <p class="text-[10px] text-red-600 font-black uppercase">${escaparHTML(post.zona || 'Feira')}</p>
                </div>
            </div>
            <p class="text-gray-700 text-sm mb-4">${escaparHTML(post.content)}</p>
            <div class="flex gap-4 border-t border-b py-2 mb-3">
                <button onclick="reagir(${post.id}, '❤️')" class="text-sm">❤️ ${reacts?.filter(r=>r.emoji_type==='❤️').length || 0}</button>
                <button onclick="reagir(${post.id}, '👍')" class="text-sm">👍 ${reacts?.filter(r=>r.emoji_type==='👍').length || 0}</button>
            </div>
            <div class="space-y-2 mb-3 text-xs">
                ${comments?.map(c => `<div class="bg-gray-50 p-2 rounded"><span class="font-bold text-red-700">Vizinho:</span> ${escaparHTML(c.content)}</div>`).join('')}
            </div>
            <div class="flex gap-2">
                <input type="text" id="comment-input-${post.id}" placeholder="Responder..." class="flex-1 text-xs p-2 border rounded-lg">
                <button onclick="comentar(${post.id})" class="bg-gray-100 px-3 py-1 rounded-lg text-xs font-bold">Enviar</button>
            </div>
        `;
        container.appendChild(div);
    }
};

window.mudarFeed = (tipo) => {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo === 'zona');
};

// --- 4. PERFIL E DASHBOARD ---
window.verPerfilPublico = async (userId) => {
    mostrarTela('user-dashboard');
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (!perfil) return;

    document.getElementById('dash-nome').innerText = perfil.username || "Sem nome";
    document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
    document.getElementById('dash-bio').innerText = perfil.bio || "";
    
    const img = document.getElementById('img-perfil');
    const emo = document.getElementById('emoji-perfil');
    if (perfil.avatar_url) { img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden'); }
    else { img.classList.add('hidden'); emo.classList.remove('hidden'); }

    const session = await verificarSessao();
    document.getElementById('dash-acoes').classList.toggle('hidden', session?.user.id !== userId);

    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId);
    document.getElementById('dash-count').innerText = posts?.length || 0;
};

window.salvarPerfil = async () => {
    const session = await verificarSessao();
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
        const path = `${session.user.id}/${Date.now()}`;
        const { data: up } = await _supabase.storage.from('avatars').upload(path, file);
        if (up) updates.avatar_url = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    if (error) alert(error.message); else verPerfilPublico(session.user.id);
};

// --- 5. AÇÕES DE POSTAGEM E LOGIN ---
window.enviarPost = async () => {
    const session = await verificarSessao();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;
    if (!content.trim()) return alert("Escreva algo!");

    const { error } = await _supabase.from('posts').insert([{ content, user_id: session.user.id, zona }]);
    if (error) alert(error.message); else { document.getElementById('post-content').value = ""; mostrarTela('feed-container'); carregarFeed(); }
};

window.reagir = async (postId, emoji) => {
    const session = await verificarSessao();
    if (!session) return alert("Faça login!");
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'post_id,user_id' });
    carregarFeed();
};

window.comentar = async (postId) => {
    const session = await verificarSessao();
    const input = document.getElementById(`comment-input-${postId}`);
    if (!session) return alert("Faça login!");
    await _supabase.from('comments').insert([{ post_id: postId, user_id: session.user.id, content: input.value }]);
    carregarFeed();
};

window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message); else location.reload();
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };
window.gerenciarBotaoPerfil = async () => { const s = await verificarSessao(); s ? verPerfilPublico(s.user.id) : mostrarTela('auth-screen'); };
window.abrirPostagem = () => mostrarTela('form-post');
window.abrirEdicaoPerfil = () => mostrarTela('form-perfil');
window.toggleForm = () => mostrarTela('feed-container');
