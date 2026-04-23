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

// --- 3. FEED COM COMENTÁRIOS E REAÇÕES ---
async function carregarFeed(tipo = 'global') {
    mostrarTela('feed-container');
    const container = document.getElementById('feed-container');
    container.innerHTML = "<p class='text-center text-gray-400 py-10 italic'>Buscando novidades...</p>";

    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p) query = query.eq('zona', p.bairro);
        } else {
            alert("Logue para ver seu bairro!");
            return mudarFeed('global');
        }
    }

    const { data: posts } = await query;
    if (!posts) return container.innerHTML = "Erro ao carregar.";

    container.innerHTML = "";
    for (const post of posts) {
        const [autor, reacoes, comentarios] = await Promise.all([
            _supabase.from('profiles').select('avatar_url').eq('id', post.user_id).single(),
            _supabase.from('reactions').select('emoji_type').eq('post_id', post.id),
            _supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true })
        ]);

        const fotoHTML = autor.data?.avatar_url 
            ? `<img src="${autor.data.avatar_url}" class="w-8 h-8 rounded-full border-2 border-red-700 object-cover">`
            : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">👤</div>`;

        const counts = { '❤️': 0, '😂': 0, '👎': 0, '👍': 0 };
        reacoes.data?.forEach(r => { if(counts[r.emoji_type] !== undefined) counts[r.emoji_type]++; });

        const comentariosHTML = comentarios.data?.map(c => `
            <div class="bg-gray-50 p-2 rounded text-[10px] mb-1">
                <span class="font-bold text-red-700">${c.author_name}:</span> ${c.content}
            </div>
        `).join('') || "";

        container.innerHTML += `
            <div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-red-700">
                <div class="flex items-center gap-2 mb-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    ${fotoHTML}
                    <div>
                        <p class="font-bold text-red-700 text-xs">${post.author_name}</p>
                        <p class="text-[9px] text-gray-400 uppercase font-bold">${post.zona}</p>
                    </div>
                </div>
                <p class="text-gray-700 text-sm mb-4">${post.content}</p>
                <div class="flex justify-around border-t border-b py-2 mb-3 bg-gray-50 rounded">
                    <button onclick="reagir('${post.id}', '❤️')" class="text-sm">❤️ ${counts['❤️']}</button>
                    <button onclick="reagir('${post.id}', '😂')" class="text-sm">😂 ${counts['😂']}</button>
                    <button onclick="reagir('${post.id}', '👍')" class="text-sm">👍 ${counts['👍']}</button>
                    <button onclick="reagir('${post.id}', '👎')" class="text-sm">👎 ${counts['👎']}</button>
                </div>
                <div class="mb-3">${comentariosHTML}</div>
                <div class="flex gap-2">
                    <input type="text" id="in-coment-${post.id}" placeholder="Comentar..." class="flex-1 bg-gray-50 border rounded-full px-3 py-1 text-xs outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-red-700 text-white px-3 py-1 rounded-full text-xs">OK</button>
                </div>
            </div>`;
    }
}

// --- 4. INTERAÇÕES ---
async function reagir(postId, emoji) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Logue para reagir!");
    await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    carregarFeed(); 
}

async function comentar(postId) {
    const { data: { session } } = await _supabase.auth.getSession();
    const input = document.getElementById(`in-coment-${postId}`);
    if (!session || !input.value) return alert("Escreva algo!");
    
    const { data: p } = await _supabase.from('profiles').select('username').eq('id', session.user.id).single();
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, author_name: p.username, content: input.value });
    input.value = "";
    carregarFeed();
}

// --- 5. PERFIL & HISTÓRICO ---
async function verPerfilPublico(userId) {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (!p) return alert("Perfil não encontrado.");

    document.getElementById('dash-nome').innerText = p.username;
    document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
    document.getElementById('dash-bio').innerText = p.bio || "Sem bio.";
    document.getElementById('dash-count').innerText = posts ? posts.length : 0;

    const imgEl = document.getElementById('img-perfil');
    const emojiEl = document.getElementById('emoji-perfil');
    if (p.avatar_url) { imgEl.src = p.avatar_url; imgEl.classList.remove('hidden'); emojiEl.classList.add('hidden'); }
    else { imgEl.classList.add('hidden'); emojiEl.classList.remove('hidden'); }

    const histEl = document.getElementById('historico-posts');
    histEl.innerHTML = posts?.map(pt => `
        <div class="bg-gray-50 p-3 rounded border-l-2 border-red-700 mb-2 text-xs">
            ${pt.content}
        </div>`).join('') || "Sem postagens.";

    // --- LOGICA DE PRIVACIDADE CORRIGIDA ---
    const { data: { session } } = await _supabase.auth.getSession();
    const acoesEl = document.getElementById('dash-acoes');
    const logoutBtn = document.getElementById('btn-logout-global'); // Procure por um ID de logout global

    if (acoesEl) {
        // Apenas o botão "Editar" deve sumir se não for o dono
        if (session && session.user.id === userId) {
            acoesEl.classList.remove('hidden');
        } else {
            acoesEl.classList.add('hidden');
        }
    }

    mostrarTela('user-dashboard');
}

// --- 6. AUTH & GESTÃO ---
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
}

async function abrirEdicaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (p) {
        document.getElementById('perfil-nome').value = p.username;
        document.getElementById('perfil-bairro').value = p.bairro;
        document.getElementById('perfil-bio').value = p.bio || "";
    }
    mostrarTela('form-perfil');
}

async function salvarPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    
    // Força o ID da sessão para garantir segurança
    const { error } = await _supabase.from('profiles').upsert({
        id: session.user.id, 
        username: document.getElementById('perfil-nome').value,
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value,
        updated_at: new Date()
    });
    if (error) alert(error.message); else location.reload();
}

async function fazerLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

// --- 7. EXPOSIÇÃO GLOBAL ---
window.mudarFeed = (tipo) => {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
};
window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    mostrarTela('form-post');
};
window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const content = document.getElementById('post-content').value;
    await _supabase.from('posts').insert([{ content, user_id: session.user.id, author_name: document.getElementById('post-author').value, zona: document.getElementById('post-zona').value }]);
    document.getElementById('post-content').value = "";
    carregarFeed();
};
window.gerenciarBotaoPerfil = gerenciarBotaoPerfil;
window.verPerfilPublico = verPerfilPublico;
window.abrirEdicaoPerfil = abrirEdicaoPerfil;
window.salvarPerfil = salvarPerfil;
window.reagir = reagir;
window.comentar = comentar;
window.fazerLogout = fazerLogout; // Garante que a função está disponível
window.fazerLogin = async () => {
    const { error } = await _supabase.auth.signInWithPassword({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
    if (error) alert(error.message); else location.reload();
};
window.fazerCadastro = async () => {
    const { error } = await _supabase.auth.signUp({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
    if (error) alert(error.message); else alert("Confirme seu e-mail!");
};
window.toggleForm = () => mostrarTela('feed-container');
window.loginGitHub = async () => { await _supabase.auth.signInWithOAuth({ provider: 'github' }); };
