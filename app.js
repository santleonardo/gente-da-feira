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
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (!p) return alert("Perfil não encontrado.");

    // Elementos do Dashboard
    const nomeEl = document.getElementById('dash-nome');
    const bairroEl = document.getElementById('dash-bairro');
    const bioEl = document.getElementById('dash-bio');
    const countEl = document.getElementById('dash-count');
    const histEl = document.getElementById('historico-posts');

    if (nomeEl) nomeEl.innerText = p.username;
    if (bairroEl) bairroEl.innerText = "Morador de " + p.bairro;
    if (bioEl) bioEl.innerText = p.bio || "Sem bio definida.";
    if (countEl) countEl.innerText = posts ? posts.length : 0;
    
    // Foto
    const imgEl = document.getElementById('img-perfil');
    const emojiEl = document.getElementById('emoji-perfil');
    if (imgEl && emojiEl) {
        if (p.avatar_url) {
            imgEl.src = p.avatar_url;
            imgEl.classList.remove('hidden');
            emojiEl.classList.add('hidden');
        } else {
            imgEl.classList.add('hidden');
            emojiEl.classList.remove('hidden');
        }
    }

    // Histórico
    if (histEl) {
        histEl.innerHTML = posts && posts.length > 0 
            ? posts.map(pt => `
                <div class="bg-gray-50 p-3 rounded-lg border-l-2 border-red-700">
                    <p class="text-xs text-gray-700">${pt.content}</p>
                    <p class="text-[9px] text-gray-400 mt-1 uppercase">${new Date(pt.created_at).toLocaleDateString('pt-BR')}</p>
                </div>`).join('') 
            : "<p class='text-center text-gray-400 text-xs'>Nenhum aviso ainda.</p>";
    }

    const { data: { session } } = await _supabase.auth.getSession();
    const acoesEl = document.getElementById('dash-acoes');
    if (acoesEl) acoesEl.classList.toggle('hidden', !session || session.user.id !== userId);

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
    if (!content) return alert("Escreva seu aviso!");

    const { error } = await _supabase.from('posts').insert([{
        author_name: document.getElementById('post-author').value,
        zona: document.getElementById('post-zona').value,
        content,
        user_id: session.user.id
    }]);

    if (error) alert(error.message);
    else {
        document.getElementById('post-content').value = '';
        carregarFeed();
    }
}

// --- 6. FEED E INTERAÇÕES ---
async function carregarFeed(tipo = 'global') {
    mostrarTela('feed-container');
    const container = document.getElementById('feed-container');
    container.innerHTML = "<p class='text-center text-gray-400 py-10 italic'>Buscando novidades em Feira...</p>";

    const { data: posts, error } = await _supabase.from('posts').select('*').order('created_at', { ascending: false });
    
    if (error) {
        container.innerHTML = "<p class='text-center text-red-500 py-10'>Erro ao carregar o feed.</p>";
        return;
    }

    let postsFiltrados = posts;
    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            postsFiltrados = posts.filter(post => post.zona === p.bairro);
        }
    }

    container.innerHTML = "";
    for (const post of postsFiltrados) {
        // Tentativa de buscar avatar, se falhar usa emoji
        const { data: autor } = await _supabase.from('profiles').select('avatar_url').eq('id', post.user_id).single();
        const foto = autor?.avatar_url ? `<img src="${autor.avatar_url}" class="w-10 h-10 rounded-full object-cover border-2 border-red-700">` : `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">👤</div>`;

        container.innerHTML += `
            <div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-red-700">
                <div class="flex items-center gap-3 mb-3 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    ${foto}
                    <div>
                        <p class="font-bold text-red-700 text-sm leading-none">${post.author_name}</p>
                        <p class="text-[10px] text-gray-400 uppercase mt-1 font-bold">${post.zona}</p>
                    </div>
                </div>
                <p class="text-gray-700 mb-4 text-sm">${post.content}</p>
                <div class="flex justify-around border-t border-b py-2 mb-3 grayscale hover:grayscale-0 transition">
                    <button onclick="reagir('${post.
