// Configurações do Supabase (Substitua pelos seus dados depois)
const SUPABASE_URL = 'SUA_URL_AQUI';
const SUPABASE_KEY = 'SUA_CHAVE_ANON_AQUI';

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
