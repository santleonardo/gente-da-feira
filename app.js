console.log("Sistema Gente da Feira - Versão Restaurada e Corrigida");

// --- 1. CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb'; 

let _supabase;

// --- 2. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 3. NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
}

function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
}

// --- 4. FEED E INTERAÇÕES ---
async function carregarFeed(apenasZona = false) {
    const container = document.getElementById('feed-container');
    if (!container) return;

    container.innerHTML = '<p class="text-center p-10 text-gray-400">Carregando avisos de Feira...</p>';

    // Busca posts e tenta trazer os dados do perfil associado
    let query = _supabase
        .from('posts')
        .select(`*, profiles:user_id(username, bairro, avatar_url)`)
        .order('created_at', { ascending: false });

    if (apenasZona) {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p?.bairro) query = query.eq('zona', p.bairro);
        }
    }

    const { data: posts, error } = await query;
    
    if (error) {
        console.error("Erro na busca:", error);
        return container.innerHTML = "<p class='text-center text-red-500 p-10 font-bold'>Erro ao carregar o feed. Verifique se as tabelas estão conectadas.</p>";
    }

    container.innerHTML = "";
    for (const post of posts) {
        const { data: reacts } = await _supabase.from('reactions').select('emoji_type').eq('post_id', post.id);
        const { data: comments } = await _supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true });

        const div = document.createElement('div');
        div.className = "bg-white p-4 shadow-sm rounded-xl border-l-4 border-red-700 mb-4";
        
        // Se o perfil não existir, usamos um nome padrão
        const nomeUsuario = post.profiles?.username || "Morador de Feira";
        const avatarUsuario = post.profiles?.avatar_url;

        div.innerHTML = `
            <div class="flex items-center gap-3 mb-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                    ${avatarUsuario ? `<img src="${avatarUsuario}" class="w-full h-full object-cover">` : '👤'}
                </div>
                <div>
                    <h3 class="font-bold text-sm text-gray-800">${escaparHTML(nomeUsuario)}</h3>
                    <p class="text-[10px] text-red-600 font-black uppercase">${escaparHTML(post.zona || 'Geral')}</p>
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
}

// --- 5. PERFIL E HISTÓRICO ---
async function verPerfilPublico(userId) {
    mostrarTela('user-dashboard');
    const { data: perfil } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    
    if (perfil) {
        document.getElementById('dash-nome').innerText = perfil.username || "Sem nome";
        document.getElementById('dash-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = perfil.bio || "";
        
        const img = document.getElementById('img-perfil');
        const emo = document.getElementById('emoji-perfil');
        if (perfil.avatar_url) {
            img.src = perfil.avatar_url; img.classList.remove('hidden'); emo.classList.add('hidden');
        } else {
            img.classList.add('hidden'); emo.classList.remove('hidden');
        }
    }

    const { data: { session } } = await _supabase.auth.getSession();
    document.getElementById('dash-acoes').classList.toggle('hidden', session?.user.id !== userId);

    // RESTAURAÇÃO DO HISTÓRICO:
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    document.getElementById('dash-count').innerText = posts?.length || 0;
    
    const historicoDiv = document.getElementById('historico-posts');
    if (historicoDiv) {
        historicoDiv.innerHTML = posts?.map(p => `
            <div class="bg-gray-50 p-3 rounded-lg border-l-2 border-red-700 text-sm mb-2">
                <p>${escaparHTML(p.content)}</p>
                <span class="text-[9px] font-bold text-gray-400">${p.zona}</span>
            </div>
        `).join('') || "Nenhum aviso postado.";
    }
}

// --- 6. AÇÕES (CORREÇÃO DA PUBLICAÇÃO) ---
window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;

    if (!content.trim()) return alert("Escreva um aviso!");

    // CORREÇÃO: Não enviamos author_name pois ele não existe na tabela posts (vem do profile)
    const { error } = await _supabase.from('posts').insert([{
        content: content,
        user_id: session.user.id,
        zona: zona
    }]);

    if (error) {
        alert("Erro ao publicar: " + error.message);
    } else {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
        carregarFeed();
    }
};

// --- 7. AUTH (EMAIL APENAS) ---
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
    if (error) alert(error.message); else alert("Verifique seu e-mail!");
};

window.fazerLogout = async () => { await _supabase.auth.signOut(); location.reload(); };

// Outras funções de suporte
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login!");
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji }, { onConflict: 'post_id,user_id' });
    carregarFeed();
};

window.comentar = async (postId) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login!");
    const input = document.getElementById(`comment-input-${postId}`);
    await _supabase.from('comments').insert([{ post_id: postId, user_id: session.user.id, content: input.value }]);
    input.value = "";
    carregarFeed();
};

window.mudarFeed = (tipo) => {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo === 'zona');
};

window.abrirPostagem = () => mostrarTela('form-post');
window.abrirEdicaoPerfil = () => mostrarTela('form-perfil');
window.toggleForm = () => mostrarTela('feed-container');
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};
