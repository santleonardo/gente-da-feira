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

// --- 4. GESTÃO DE PERFIL (COM FOTO E BIO) ---
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const { data: perfis } = await _supabase.from('profiles').select('*').eq('id', session.user.id);

    if (perfis && perfis.length > 0) {
        const p = perfis[0];
        document.getElementById('dash-nome').innerText = p.username;
        document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
        document.getElementById('dash-bio').innerText = p.bio || "Sem bio definida.";
        
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
        mostrarTela('user-dashboard');
    } else {
        mostrarTela('form-perfil');
    }
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
    if (!session) return alert("Sessão expirada. Faça login novamente.");

    const username = document.getElementById('perfil-nome').value;
    const bairro = document.getElementById('perfil-bairro').value;
    const bio = document.getElementById('perfil-bio').value;
    const fileInput = document.getElementById('perfil-upload');

    if (!username || !bairro) return alert("Nome e bairro são obrigatórios!");

    let avatar_url = null;

    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;

        console.log("Tentando upload de:", fileName);

        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('avatars')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type 
            });

        if (uploadError) {
            console.error("Erro no Storage:", uploadError);
            return alert("Erro no upload: " + uploadError.message);
        }

        const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        avatar_url = urlData.publicUrl;
        console.log("URL gerada com sucesso:", avatar_url);
    }

    const dadosUpdate = { 
        id: session.user.id, 
        username, 
        bairro, 
        bio,
        updated_at: new Date()
    };

    if (avatar_url) dadosUpdate.avatar_url = avatar_url;

    const { error: dbError } = await _supabase.from('profiles').upsert(dadosUpdate);

    if (dbError) {
        console.error("Erro no Banco:", dbError);
        alert("Erro ao salvar dados: " + dbError.message);
    } else {
        alert("Perfil atualizado!");
        location.reload();
    }
}

// --- 5. POSTAGENS ---
async function abrirPostagem() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        alert("Faça login para postar!");
        return mostrarTela('auth-screen');
    }
    
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (!p) {
        alert("Crie seu perfil primeiro!");
        return mostrarTela('form-perfil');
    }

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

    const { error } = await _supabase.from('posts').insert([{ 
        author_name: author, zona, content, user_id: session.user.id 
    }]);

    if (error) alert(error.message);
    else {
        document.getElementById('post-content').value = '';
        carregarFeed();
    }
}

// --- 6. FEED ---
async function carregarFeed(tipo = 'global') {
    mostrarTela('feed-container');
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
    
    if (data && data.length > 0) {
        container.innerHTML = data.map(post => `
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-700 mb-4">
                <div class="flex justify-between items-center mb-2 text-sm text-gray-500">
                    <span class="font-bold text-gray-800">${post.author_name}</span>
                    <span class="bg-gray-100 px-2 py-1 rounded">${post.zona}</span>
                </div>
                <p class="text-gray-700">${post.content}</p>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">Nenhum aviso no momento.</p>';
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
