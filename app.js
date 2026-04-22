// 1. Configurações do Supabase
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

// 2. Inicializa o cliente (Corrigido para evitar erro de referência)
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. Função para carregar o Feed REAL do banco de dados
async function carregarFeed(tipo = 'global') {
    const container = document.getElementById('feed-container');
    
    // Busca os posts na tabela 'posts' criada no Supabase
    const { data, error } = await _supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erro Supabase:", error);
        container.innerHTML = `<p class="text-center text-red-500">Erro ao carregar avisos.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Nenhum aviso em Feira no momento.</p>`;
        return;
    }

    // Renderiza os posts dinamicamente
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

// 4. Função para mostrar/esconder o formulário
function toggleForm() {
    const form = document.getElementById('form-post');
    if (form) form.classList.toggle('hidden');
}

// 5. Função para enviar o post (Corrigida a variável _supabase)
async function enviarPost() {
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;
    const content = document.getElementById('post-content').value;

    if (!author || !content) {
        alert("Leonardo, preencha o nome e o aviso!");
        return;
    }

    const { data, error } = await _supabase
        .from('posts')
        .insert([{ author_name: author, zona: zona, content: content }]);

    if (error) {
        alert("Erro ao publicar em Feira: " + error.message);
    } else {
        alert("Aviso publicado com sucesso!");
        document.getElementById('post-content').value = ''; 
        toggleForm(); 
        carregarFeed(); // Atualiza para o novo post aparecer na hora
    }
}

// 6. Função para alternar abas (Necessário para o index.html)
function mudarFeed(tipo) {
    document.getElementById('tab-global').classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona').classList.toggle('active-tab', tipo === 'zona');
    carregarFeed(tipo);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    carregarFeed();
});
