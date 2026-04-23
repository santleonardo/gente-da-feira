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

// --- 4. GESTÃO DE PERFIL ---

async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
}

async function verPerfilPublico(userId) {
    // Busca dados do perfil e os posts para o contador e histórico
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (!p) return alert("Perfil não encontrado.");

    // Preenche dados básicos
    document.getElementById('dash-nome').innerText = p.username;
    document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
    document.getElementById('dash-bio').innerText = p.bio || "Sem bio definida.";
    
    // Atualiza Contador
    document.getElementById('dash-count').innerText = posts ? posts.length : 0;
    
    // Foto de Perfil
    const imgEl = document.getElementById('img-perfil');
    const emojiEl = document.getElementById('emoji-perfil');
    if (p.avatar_url) {
        imgEl.src = p.avatar_url + "?t=" + new Date().getTime();
        imgEl.classList.remove('hidden');
        emojiEl.classList.add('hidden');
    } else {
        imgEl.classList.add('hidden');
        emojiEl.classList.remove('hidden');
    }

    // Renderiza Histórico
    const histContainer = document.getElementById('historico-posts');
    if (posts && posts.length > 0) {
        histContainer.innerHTML = posts.map(post => `
            <div class="bg-gray-50 p-3 rounded-lg border-l-2 border-red-700">
                <p class="text-xs text-gray-700">${post.content}</p>
                <p class="text-[9px] text-gray-400 mt-1 uppercase">${new Date(post.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
        `).join('');
    } else {
        histContainer.innerHTML = "<p class='text-center text-gray-400 text-xs'>Ainda não compartilhou avisos.</p>";
    }

    // Controle de Ações (Editar/Sair)
    const { data: { session } } = await _supabase.auth.getSession();
    const acoesEl = document.getElementById('dash-acoes');
    if (session && session.user.id === userId) acoesEl.classList.remove('hidden');
    else acoesEl.classList.add('hidden');

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
    if (!session) return alert("Sessão expirada.");

    const username = document.getElementById('perfil-nome').value;
    const bairro = document.getElementById('perfil-bairro').value;
    const bio = document.getElementById('perfil-bio').value;
    const fileInput = document.getElementById('perfil-upload');

    if (!username || !bairro) return alert("Preencha nome e bairro!");

    let avatar_url = null;
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = `${session.user.id}-${Date.now()}`;
        const { error: uploadError } = await _supabase.storage.from('avatars').upload(fileName, file);
        if (uploadError) return alert("Erro upload: " + uploadError.message);
        const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        avatar_url = urlData.publicUrl;
    }

    const dadosUpdate = { id: session.user.id, username, bairro, bio, updated_at: new Date() };
    if (avatar_url) dadosUpdate.avatar_url = avatar_url;

    const { error } = await _supabase.from('profiles').upsert(dadosUpdate);
    if (error) alert(error.message);
    else location.reload();
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
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;

    if (!content) return alert("Escreva seu aviso!");

    const { error } = await _supabase.from('posts').insert([{ author_name: author, zona, content, user_id: session.user.id }]);
    if (error) alert(error.message);
    else {
        document.getElementById('post-content').value = '';
        carregarFeed();
    }
}

// --- 6. FEED E INTERAÇÕES ---
async function carregarFeed(tipo = 'global') {
    mostrarTela('feed-container');
    const { data: posts } = await _supabase.from('posts').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('feed-container');
    
    let postsFiltrados = posts;
    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) return alert("Faça login!");
        const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
        postsFiltrados = posts.filter(post => post.zona === p.bairro);
    }

    container.innerHTML = "";
    for (const post of postsFiltrados) {
        // Busca avatar do autor para a miniatura
        const { data: autor } = await _supabase.from('profiles').select('avatar_url').eq('id', post.user_id).single();
        const miniatura = autor?.avatar_url ? `<img src="${autor.avatar_url}" class="w-10 h-10 rounded-full object-cover border-2 border-red-700">` : `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">👤</div>`;

        container.innerHTML += `
            <div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-red-700">
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                        ${miniatura}
                        <div>
                            <p class="font-bold text-red-700 text-sm leading-none">${post.author_name}</p>
                            <p class="text-[10px] text-gray-400 uppercase mt-1 font-bold">${post.zona}</p>
                        </div>
                    </div>
                </div>
                <p class="text-gray-700 mb-4 text-sm">${post.content}</p>
                
                <div class="flex justify-around border-t border-b py-2 mb-3 grayscale hover:grayscale-0 transition">
                    <button onclick="reagir('${post.id}', '❤️')" class="reaction-btn">❤️</button>
                    <button onclick="reagir('${post.id}', '😂')" class="reaction-btn">😂</button>
                    <button onclick="reagir('${post.id}', '👎')" class="reaction-btn">👎</button>
                    <button onclick="reagir('${post.id}', '👍')" class="reaction-btn">👍</button>
                </div>

                <div class="flex gap-2">
                    <input type="text" id="coment-${post.id}" placeholder="Responder..." class="flex-1 bg-gray-50 border-none rounded-full px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-red-700">
                    <button onclick="comentar('${post.id}')" class="bg-red-700 text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase">Enviar</button>
                </div>
            </div>
        `;
    }
}

async function reagir(postId, emoji) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login para reagir!");
    const { error } = await _supabase.from('reactions').upsert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    if (error) alert("Você já reagiu a este post!");
    else alert("Reação enviada!");
}

async function comentar(postId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Faça login para responder!");

    const input = document.getElementById(`coment-${postId}`);
    const content = input.value;
    if (!content) return;

    const { data: p } = await _supabase.from('profiles').select('username').eq('id', session.user.id).single();
    const { error } = await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, author_name: p.username, content });

    if (!error) {
        alert("Resposta enviada!");
        input.value = "";
    }
}

function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-global').classList.toggle('text-gray-500', tipo !== 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    document.getElementById('tab-zona').classList.toggle('text-gray-500', tipo !== 'zona');
    carregarFeed(tipo);
}

function toggleForm() { mostrarTela('feed-container'); }
