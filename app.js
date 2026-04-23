console.log("Sistema Gente da Feira Iniciado...");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

let _supabase;

// --- 1. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado com sucesso!");
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

// --- 3. AUTENTICAÇÃO ---
async function loginGitHub() {
    await _supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
}

async function fazerCadastro() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Preencha e-mail e senha!");
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert("Erro: " + error.message);
    else alert("Verifique seu e-mail para confirmar o cadastro.");
}

async function fazerLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro: " + error.message);
    else location.reload();
}

async function fazerLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

// --- 4. GESTÃO DE PERFIL & HISTÓRICO ---

async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
}

async function verPerfilPublico(userId) {
    // Busca Perfil + Posts do usuário (Histórico)
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (!p) return alert("Perfil não encontrado.");

    // Preenche Dados Básicos
    document.getElementById('dash-nome').innerText = p.username;
    document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
    document.getElementById('dash-bio').innerText = p.bio || "Sem bio definida.";
    
    // Contador de Avisos
    const countEl = document.getElementById('dash-count');
    if (countEl) countEl.innerText = posts ? posts.length : 0;

    // Foto de Perfil
    const imgEl = document.getElementById('img-perfil');
    const emojiEl = document.getElementById('emoji-perfil');
    if (p.avatar_url) {
        imgEl.src = p.avatar_url;
        imgEl.classList.remove('hidden');
        emojiEl.classList.add('hidden');
    } else {
        imgEl.classList.add('hidden');
        emojiEl.classList.remove('hidden');
    }

    // Histórico de Postagens
    const histEl = document.getElementById('historico-posts');
    if (histEl) {
        histEl.innerHTML = posts && posts.length > 0 
            ? posts.map(pt => `
                <div class="bg-gray-50 p-3 rounded border-l-2 border-red-700 mb-2">
                    <p class="text-xs text-gray-700">${pt.content}</p>
                    <p class="text-[9px] text-gray-400 uppercase mt-1">${new Date(pt.created_at).toLocaleDateString('pt-BR')}</p>
                </div>`).join('') 
            : "<p class='text-center text-gray-400 text-xs'>Ainda não fez postagens.</p>";
    }

    // Mostrar botões de ação apenas para o dono
    const { data: { session } } = await _supabase.auth.getSession();
    const acoesEl = document.getElementById('dash-acoes');
    if (acoesEl) {
        session && session.user.id === userId ? acoesEl.classList.remove('hidden') : acoesEl.classList.add('hidden');
    }

    mostrarTela('user-dashboard');
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

    const username = document.getElementById('perfil-nome').value;
    const bairro = document.getElementById('perfil-bairro').value;
    const bio = document.getElementById('perfil-bio').value;
    const fileInput = document.getElementById('perfil-upload');

    let avatar_url = null;
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = `${session.user.id}-${Date.now()}`;
        const { error: uploadError } = await _supabase.storage.from('avatars').upload(fileName, file);
        if (!uploadError) {
            const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(fileName);
            avatar_url = urlData.publicUrl;
        }
    }

    const { error } = await _supabase.from('profiles').upsert({
        id: session.user.id, username, bairro, bio, avatar_url, updated_at: new Date()
    });

    if (error) alert(error.message); else location.reload();
}

// --- 5. POSTAGENS ---
async function abrirPostagem() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (!p) return mostrarTela('form-perfil');

    document.getElementById('post-author').value = p.username;
    document.getElementById('post-zona').value = p.bairro;
    mostrarTela('form-post');
}

async function enviarPost() {
    const content = document.getElementById('post-content').value;
    const { data: { session } } = await _supabase.auth.getSession();
    if (!content) return alert("Escreva algo!");

    const { error } = await _supabase.from('posts').insert([{
        author_name: document.getElementById('post-author').value,
        zona: document.getElementById('post-zona').value,
        content,
        user_id: session.user.id
    }]);

    if (error) alert(error.message); else {
        document.getElementById('post-content').value = '';
        carregarFeed();
    }
}

// --- 6. FEED COM INTERAÇÕES (REAÇÕES E COMENTÁRIOS) ---
async function carregarFeed(tipo = 'global') {
    mostrarTela('feed-container');
    const container = document.getElementById('feed-container');
    container.innerHTML = "<p class='text-center text-gray-400 py-10'>Carregando...</p>";

    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p) query = query.eq('zona', p.bairro);
        } else {
            return mudarFeed('global');
        }
    }

    const { data: posts } = await query;
    if (!posts) return container.innerHTML = "Erro ao carregar.";

    container.innerHTML = "";
    for (const post of posts) {
        // Busca miniatura do autor
        const { data: autor } = await _supabase.from('profiles').select('avatar_url').eq('id', post.user_id).single();
        const fotoHTML = autor?.avatar_url 
            ? `<img src="${autor.avatar_url}" class="w-8 h-8 rounded-full border-2 border-red-700 object-cover">`
            : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">👤</div>`;

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
                
                <div class="flex justify-between border-t border-b py-2 mb-3 text-lg">
                    <button onclick="reagir('${post.id}', '❤️')" class="hover:scale-125 transition">❤️</button>
                    <button onclick="reagir('${post.id}', '😂')" class="hover:scale-125 transition">😂</button>
                    <button onclick="reagir('${post.id}', '👎')" class="hover:scale-125 transition">👎</button>
                    <button onclick="reagir('${post.id}', '👍')" class="hover:scale-125 transition">👍</button>
                </div>

                <div class="flex gap-2">
                    <input type="text" id="in-coment-${post.id}" placeholder="Comentar..." class="flex-1 bg-gray-50 border rounded-full px-3 py-1 text-xs outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-red-700 text-white px-3 py-1 rounded-full text-xs">OK</button>
                </div>
            </div>`;
    }
}

async function reagir(postId, emoji) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Logue para reagir!");
    const { error } = await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (!error) alert("Reação enviada!");
}

async function comentar(postId) {
    const { data: { session } } = await _supabase.auth.getSession();
    const input = document.getElementById(`in-coment-${postId}`);
    if (!session || !input.value) return alert("Escreva um comentário!");
    
    const { data: p } = await _supabase.from('profiles').select('username').eq('id', session.user.id).single();
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, author_name: p.username, content: input.value });
    input.value = "";
    alert("Comentário publicado!");
}

function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
}

function toggleForm() { mostrarTela('feed-container'); }

// --- VINCULAR AO WINDOW (Para o HTML encontrar) ---
window.mudarFeed = mudarFeed;
window.gerenciarBotaoPerfil = gerenciarBotaoPerfil;
window.abrirPostagem = abrirPostagem;
window.verPerfilPublico = verPerfilPublico;
window.abrirEdicaoPerfil = abrirEdicaoPerfil;
window.salvarPerfil = salvarPerfil;
window.enviarPost = enviarPost;
window.reagir = reagir;
window.comentar = comentar;
window.toggleForm = toggleForm;
window.loginGitHub = loginGitHub;
window.fazerLogin = fazerLogin;
window.fazerLogout = fazerLogout;
window.fazerCadastro = fazerCadastro;
