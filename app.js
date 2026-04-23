// 1. Configurações do Supabase
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Controle de Telas (Navegação sem mudar de página)
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
}

// 3. Autenticação Social (GitHub)
async function loginGitHub() {
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { 
            redirectTo: window.location.origin + '/gente-da-feira/' 
        }
    });
    if (error) alert("Erro ao conectar com GitHub: " + error.message);
}

// 4. Login e Cadastro Manual (E-mail/Senha)
async function fazerCadastro() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert("Erro: " + error.message);
    else alert("Cadastro realizado! Verifique seu e-mail.");
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

// 5. Gestão do Perfil e Dashboard
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        mostrarTela('auth-screen');
    } else {
        const { data: perfil } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (perfil) {
            // Preenche o Dashboard com dados reais do banco
            document.getElementById('dash-nome').innerText = perfil.username;
            document.getElementById('dash-bairro').innerText = "Morador de " + perfil.bairro;
            document.getElementById('dash-bio').innerText = perfil.bio;
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

    if (!username || !bairro) return alert("Nome e Bairro são obrigatórios!");

    // Upsert: Insere ou atualiza se já existir
    const { error } = await _supabase.from('profiles').upsert({
        id: session.user.id,
        username: username,
        bairro: bairro,
        bio: bio
    });

    if (error) alert("Erro ao salvar: " + error.message);
    else location.reload();
}

// 6. Postagens (Protegidas por Login)
async function abrirPostagem() {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        alert("Leonardo, você precisa entrar na sua conta para publicar um aviso!");
        mostrarTela('auth-screen');
    } else {
        const { data: perfil } = await _supabase.from('profiles').select('username, bairro').eq('id', session.user.id).single();
        
        if (!perfil) {
            alert("Crie seu perfil primeiro!");
            mostrarTela('form-perfil');
        } else {
            document.getElementById('post-author').value = perfil.username;
            document.getElementById('post-zona').value = perfil.bairro;
            mostrarTela('form-post');
        }
    }
}

async function enviarPost() {
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;
    const content = document.getElementById('post-content').value;

    if (!content) return alert("Escreva o conteúdo do aviso!");

    const { error } = await _supabase.from('posts').insert([{ 
        author_name: author, 
        zona: zona, 
        content: content 
    }]);

    if (error) alert(error.message);
    else {
        document.getElementById('post-content').value = '';
        mostrarTela('feed-container');
        carregarFeed();
    }
}

// 7. Feed e Filtros
async function carregarFeed(tipo = 'global') {
    const container = document.getElementById('feed-container');
    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: perfil } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (perfil) query = query.eq('zona', perfil.bairro);
        } else {
            container.innerHTML = `<p class="text-center text-gray-500">Faça login para ver avisos da sua zona.</p>`;
            return;
        }
    }

    const { data } = await query;
    container.innerHTML = data && data.length > 0 ? data.map(post => `
        <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-700 mb-4">
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-gray-800">${post.author_name}</span>
                <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">${post.zona}</span>
            </div>
            <p class="text-gray-700">${post.content}</p>
        </div>
    `).join('') : '<p class="text-center text-gray-400">Nenhum aviso encontrado.</p>';
}

function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
}

function toggleForm() { mostrarTela('feed-container'); }

// Inicialização
document.addEventListener('DOMContentLoaded', () => carregarFeed());
