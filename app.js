// 1. Configurações do Supabase
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

// 2. Inicializa o cliente
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. Função para carregar o Feed
async function carregarFeed(tipo = 'global') {
    const container = document.getElementById('feed-container');
    
    let query = _supabase.from('posts').select('*').order('created_at', { ascending: false });

    // Lógica para o filtro "Minha Zona" (Lê o bairro salvo no perfil do usuário)
    if (tipo === 'zona') {
        const bairroSalvo = localStorage.getItem('usuario_bairro');
        if (bairroSalvo) {
            query = query.eq('zona', bairroSalvo);
        } else {
            container.innerHTML = `<p class="text-center text-gray-500">Crie um perfil para filtrar seu bairro!</p>`;
            return;
        }
    }

    const { data, error } = await query;

    if (error) {
        container.innerHTML = `<p class="text-center text-red-500">Erro ao carregar avisos.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Nenhum aviso encontrado.</p>`;
        return;
    }

    container.innerHTML = data.map(post => `
        <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-700 mb-4">
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-gray-800">${post.author_name}</span>
                <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">${post.zona}</span>
            </div>
            <p class="text-gray-700">${post.content}</p>
        </div>
    `).join('');
}

// 4. Funções de Interface (Toggle)
function toggleForm() {
    document.getElementById('form-post').classList.toggle('hidden');
}

function togglePerfil() {
    const perfil = document.getElementById('form-perfil');
    const feed = document.getElementById('feed-container');
    perfil.classList.toggle('hidden');
    feed.classList.toggle('hidden');
}

// 5. Função para enviar Post (Usa localStorage para preencher nome)
async function enviarPost() {
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;
    const content = document.getElementById('post-content').value;

    if (!author || !content) {
        alert("Preencha todos os campos!");
        return;
    }

    const { error } = await _supabase.from('posts').insert([{ author_name: author, zona: zona, content: content }]);

    if (error) {
        alert("Erro: " + error.message);
    } else {
        document.getElementById('post-content').value = '';
        toggleForm();
        carregarFeed();
    }
}

// 6. Função para salvar Perfil no Supabase e no localStorage do Usuário
async function salvarPerfil() {
    const nome = document.getElementById('perfil-nome').value;
    const bairro = document.getElementById('perfil-bairro').value;
    const bio = document.getElementById('perfil-bio').value;

    if (!nome || !bairro) {
        alert("Nome e bairro são obrigatórios!");
        return;
    }

    const { error } = await _supabase.from('profiles').insert([{ username: nome, bairro: bairro, bio: bio }]);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        // Salva no navegador do usuário para uso futuro
        localStorage.setItem('usuario_nome', nome);
        localStorage.setItem('usuario_bairro', bairro);
        
        alert("Perfil salvo!");
        location.reload(); // Recarrega para aplicar o nome nos campos
    }
}

// 7. Funções de inicialização e Abas
function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
}

document.addEventListener('DOMContentLoaded', () => {
    // Tenta recuperar nome salvo para facilitar a postagem
    const nomeSalvo = localStorage.getItem('usuario_nome');
    const bairroSalvo = localStorage.getItem('usuario_bairro');
    
    if (nomeSalvo) document.getElementById('post-author').value = nomeSalvo;
    if (bairroSalvo) document.getElementById('post-zona').value = bairroSalvo;

    carregarFeed();
});
