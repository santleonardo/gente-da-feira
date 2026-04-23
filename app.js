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

// --- 3. AUTENTICAÇÃO (SOCIAL E MANUAL) ---
async function loginGitHub() {
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) alert("Erro GitHub: " + error.message);
}

async function fazerCadastro() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Preencha e-mail e senha!");

    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert("Erro no cadastro: " + error.message);
    else alert("Cadastro solicitado! Verifique seu e-mail ou faça login se já confirmou.");
}

async function fazerLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Preencha e-mail e senha!");

    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro no login: " + error.message);
    else location.reload();
}

async function fazerLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

// --- 4. GESTÃO DE PERFIL ---
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        mostrarTela('auth-screen');
    } else {
        const { data: perfis } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id);

        if (perfis && perfis.length > 0) {
            const p = perfis[0];
            document.getElementById('dash-nome').innerText = p.username;
            document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
            document.getElementById('dash-bio').innerText = p.bio;
            mostrarTela('user-dashboard');
        } else {
            mostrarTela('form-perfil');
        }
    }
}

async function salvarPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    const username = document.getElementById('perfil-nome').value;
    const bairro = document.getElementById('perfil-bairro').value;
    const bio = document.getElementById('perfil-bio').value;

    if (!username || !bairro) return alert("Preencha nome e bairro!");

    const { error } = await _supabase.from('profiles').upsert({
        id: session.user.id,
        username,
        bairro,
        bio
    });

    if (error) alert("Erro ao salvar: " + error.message);
    else {
        alert("Perfil atualizado!");
        location.reload();
    }
}

// --- 5. POSTAGENS ---
async function abrirPostagem() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        alert("Leonardo, você precisa entrar para publicar!");
        mostrarTela('auth-screen');
    } else {
        const { data: perfis } = await _supabase.from('profiles').select('*').eq('id', session.user.id);
        if (!perfis || perfis.length === 0) {
            alert("Crie seu perfil primeiro!");
            mostrarTela('form-perfil');
        } else {
            document.getElementById('post-author').value = perfis[0].username;
            document.getElementById('post-zona').value = perfis[0].bairro;
            mostrarTela('form-post');
        }
    }
}

async function enviarPost() {
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;
    const content = document.getElementById('post-content').value;
    const { data: { session } } = await _supabase.auth.getSession();

    if (!content) return alert("O que quer avisar à Feira?");

    const { error } = await _supabase.from('posts').insert([{ 
        author_name: author, 
        zona, 
        content,
        user_id: session.user.id 
    }]);

    if (error) alert("Erro ao postar: " + error.message);
    else {
        document.getElementById('post-content').value = '';
        mostrarTela('feed-container');
        carregarFeed();
    }
}

// --- 6. FEED ---
async function carregarFeed(tipo = 'global') {
    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p) query = query.eq('zona', p.bairro);
        }
    }

    const { data } = await query;
    const container = document.getElementById('feed-container');
    container.innerHTML = data && data.length > 0 ? data.map(post => `
        <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-700 mb-4">
            <div class="flex justify-between items-center mb-2 text-sm text-gray-500">
                <span class="font-bold text-gray-800">${post.author_name}</span>
                <span class="bg-gray-100 px-2 py-1 rounded">${post.zona}</span>
            </div>
            <p class="text-gray-700">${post.content}</p>
        </div>
    `).join('') : '<p class="text-center text-gray-400">Nenhum aviso no momento.</p>';
}

function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
}

function toggleForm() { mostrarTela('feed-container'); }
