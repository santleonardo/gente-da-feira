// Configurações do Supabase (Substitua pelos seus dados depois)
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

// Inicializa o cliente Supabase
// Nota: Para o MVP, usaremos a biblioteca via CDN no index.html
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Função para carregar o Feed
async function carregarFeed(tipo = 'global') {
    const container = document.getElementById('feed-container');
    
    // Simulação de busca enquanto não conectamos as chaves
    container.innerHTML = `<div class="bg-white p-4 rounded-lg shadow text-center">
        <p class="text-gray-600">Olá Leonardo! A interface está pronta.</p>
        <p class="text-sm text-red-500 font-bold mt-2">Conecte o Supabase para ver os posts de Feira.</p>
    </div>`;
}

// Executa ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    carregarFeed();
});

// Função para mostrar/esconder o formulário
function toggleForm() {
    const form = document.getElementById('form-post');
    form.classList.toggle('hidden');
}

// Função para enviar o post para o Supabase
async function enviarPost() {
    const author = document.getElementById('post-author').value;
    const zona = document.getElementById('post-zona').value;
    const content = document.getElementById('post-content').value;

    if (!author || !content) {
        alert("Por favor, preencha seu nome e o aviso!");
        return;
    }

    const { data, error } = await _supabase
        .from('posts')
        .insert([{ author_name: author, zona: zona, content: content }]);

    if (error) {
        alert("Erro ao publicar: " + error.message);
    } else {
        alert("Publicado com sucesso em Feira!");
        document.getElementById('post-content').value = ''; // Limpa o campo
        toggleForm(); // Fecha o form
        carregarFeed(); // Atualiza o feed
    }
}
