console.log("Sistema Gente da Feira - Versão Final Estabilizada");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

let _supabase;

// --- 1. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado!");
        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 2. NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
}

// SEGURANÇA: Escapa HTML para evitar XSS
function escaparHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- 3. FEED E POSTAGENS ---
window.mudarFeed = (tipo) => {
    const btnGlobal = document.getElementById('tab-global');
    const btnZona = document.getElementById('tab-zona');
    
    if (tipo === 'global') {
        btnGlobal.classList.add('active-tab');
        btnZona.classList.remove('active-tab');
        carregarFeed();
    } else {
        btnZona.classList.add('active-tab');
        btnGlobal.classList.remove('active-tab');
        carregarFeed(true);
    }
};

window.carregarFeed = async (apenasZona = false) => {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<p class="text-center p-10 text-gray-400 animate-pulse">Carregando avisos de Feira...</p>';

    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    if (apenasZona) {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: perfil } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (perfil?.bairro) query = query.eq('zona', perfil.bairro);
        }
    }

    const { data: posts, error } = await query;
    if (error) return container.innerHTML = "Erro ao carregar.";

    container.innerHTML = "";
    for (const post of posts) {
        // Busca dados do autor em tempo real (garante nome e foto atualizados)
        const { data: perfil } = await _supabase.from('profiles').select('username, avatar_url, bairro').eq('id', post.user_id).single();
        const { data: reactions } = await _supabase.from('reactions').select('emoji_type').eq('post_id', post.id);
        const { data: comments } = await _supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true });

        const nomeAutor = escaparHTML(perfil?.username || "Morador de Feira");
        const bairroPost = escaparHTML(perfil?.bairro || post.zona || "Feira");
        const fotoAutor = perfil?.avatar_url;

        const postEl = document.createElement('div');
        postEl.className = "bg-white p-4 shadow-md rounded-xl border-l-4 border-red-700";
        postEl.innerHTML = `
            <div class="flex items-center gap-3 mb-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center overflow-hidden border border-red-200">
                    ${fotoAutor ? `<img src="${fotoAutor}" class="w-full h-full object-cover">` : `<span class="text-xl">👤</span>`}
                </div>
                <div>
                    <h3 class="font-bold text-gray-800 text-sm">${nomeAutor}</h3>
                    <p class="text-[10px] text-red-600 font-black uppercase">${bairroPost}</p>
                </div>
            </div>
            <p class="text-gray-700 text-sm leading-relaxed mb-4">${escaparHTML(post.content)}</p>
            
            <div class="flex gap-4 border-t border-b py-2 mb-3">
                <button onclick="reagir(${post.id}, '❤️')" class="reaction-btn">❤️ <span class="text-xs text-gray-500">${reactions.filter(r => r.emoji_type === '❤️').length}</span></button>
                <button onclick="reagir(${post.id}, '👍')" class="reaction-btn">👍 <span class="text-xs text-gray-500">${reactions.filter(r => r.emoji_type === '👍').length}</span></button>
                <button onclick="reagir(${post.id}, '⚠️')" class="reaction-btn">⚠️ <span class="text-xs text-gray-500">${reactions.filter(r => r.emoji_type === '⚠️').length}</span></button>
            </div>

            <div class="space-y-2 mb-3">
                ${comments.map(c => `
                    <div class="text-xs bg-gray-50 p-2 rounded">
                        <span class="font-bold text-red-700">Morador:</span> ${escaparHTML(c.content)}
                    </div>
                `).join('')}
            </div>

            <div class="flex gap-2">
                <input type="text" id="comment-input-${post.id}" placeholder="Responder..." class="flex-1 text-xs p-2 border rounded-lg outline-none">
                <button onclick="comentar(${post.id})" class="bg-gray-100 px-3 rounded-lg text-xs font-bold text-gray-600">Enviar</button>
            </div>
        `;
        container.appendChild(postEl);
    }
};

window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    mostrarTela('form-post');
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login para publicar!");

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;

    if (!content.trim()) return alert("Escreva algo antes de publicar!");

    const { error } = await _supabase.from('posts').insert([{
        content,
        user_id: session.user.id,
        zona: zona
    }]);

    if (error) return alert("Erro ao publicar: " + error.message);
    
    document.getElementById('post-content').value = "";
    mostrarTela('feed-container');
    carregarFeed();
};

// --- 4. PERFIL E DASHBOARD ---
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
}

window.verPerfilPublico = async (userId) => {
    mostrarTela('user-dashboard');
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    
    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Sem nome";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "Sem bio disponível.";
        
        const imgPerfil = document.getElementById('img-perfil');
        const emojiPerfil = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) {
            imgPerfil.src = perfil.avatar_url;
            imgPerfil.classList.remove('hidden');
            emojiPerfil.classList.add('hidden');
        } else {
            imgPerfil.classList.add('hidden');
            emojiPerfil.classList.remove('hidden');
        }
    }

    // Só mostra botão de editar se for o próprio dono
    const divAcoes = document.getElementById('dash-acoes');
    if (session && session.user.id === userId) {
        divAcoes.classList.remove('hidden');
    } else {
        divAcoes.classList.add('hidden');
    }

    // Carregar histórico de avisos desse usuário
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    document.getElementById('dash-count').innerText = posts?.length || 0;
    
    const historico = document.getElementById('historico-posts');
    historico.innerHTML = posts?.length ? "" : '<p class="text-center text-gray-400 text-xs">Nenhum aviso ainda.</p>';
    
    posts?.forEach(p => {
        const item = document.createElement('div');
        item.className = "p-3 bg-gray-50 rounded text-xs border-l-2 border-red-700 mb-2";
        item.innerText = p.content;
        historico.appendChild(item);
    });
};

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (perfil) {
        document.getElementById('perfil-nome').value = perfil.username || "";
        document.getElementById('perfil-bairro').value = perfil.bairro || "Centro";
        document.getElementById('perfil-bio').value = perfil.bio || "";
    }
    mostrarTela('form-perfil');
};

window.salvarPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const updates = {
        id: session.user.id,
        username: document.getElementById('perfil-nome').value,
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value,
        updated_at: new Date()
    };

    const file = document.getElementById('perfil-upload').files[0];
    if (file) {
        const fileName = `${session.user.id}-${Date.now()}`;
        const { data: uploadData } = await _supabase.storage.from('avatars').upload(fileName, file);
        if (uploadData) {
            const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(fileName);
            updates.avatar_url = urlData.publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert(updates);
    if (error) alert(error.message); else verPerfilPublico(session.user.id);
};

// --- 5. INTERAÇÕES ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Acesse sua conta para reagir!");

    const { error } = await _supabase.from('reactions').upsert({
        post_id: postId,
        user_id: session.user.id,
        emoji_type: emoji
    });

    if (!error) carregarFeed();
};

window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login para comentar.");

    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value;
    if (!content.trim()) return;

    const { error } = await _supabase.from('comments').insert([{
        post_id: postId,
        user_id: session.user.id,
        content: content
    }]);

    if (!error) {
        input.value = "";
        carregarFeed();
    }
};

// --- 6. AUTH ---
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
    if (error) alert("Erro: " + error.message); else alert("Confirme seu e-mail!");
};

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

window.gerenciarBotaoPerfil = gerenciarBotaoPerfil;
window.toggleForm = () => mostrarTela('feed-container');
