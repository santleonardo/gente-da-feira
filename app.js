console.log("Sistema Gente da Feira - Versão Estabilizada e Funcional");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb'; // Lembre-se de trocar pela chave correta (eyJ...)

let _supabase;

// --- 1. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 2. NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(telaAtiva)?.classList.remove('hidden');
}

function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
}

// --- 3. A LÓGICA QUE TINHA SUMIDO: CARREGAR FEED ---
async function carregarFeed() {
    const container = document.getElementById('feed-container');
    if (!container) return;

    // Busca posts e os dados dos perfis (username/bairro) ao mesmo tempo
    const { data: posts, error } = await _supabase
        .from('posts')
        .select(`*, profiles(username, bairro, avatar_url)`)
        .order('created_at', { ascending: false });

    if (error) return console.error("Erro ao carregar feed:", error.message);

    container.innerHTML = posts.map(post => `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div class="flex items-center mb-3">
                <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-lg mr-3 overflow-hidden">
                    ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">` : '👤'}
                </div>
                <div>
                    <h4 class="font-bold text-gray-800">${escaparHTML(post.profiles?.username || 'Morador de Feira')}</h4>
                    <span class="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">${escaparHTML(post.zona || 'FSA')}</span>
                </div>
            </div>
            <p class="text-gray-700 text-sm leading-relaxed">${escaparHTML(post.content)}</p>
            <div class="mt-4 pt-3 border-t flex justify-between text-gray-400 text-xs">
                <span>${new Date(post.created_at).toLocaleDateString('pt-BR')}</span>
                <div class="flex space-x-4">
                    <button onclick="reagir(${post.id}, '👍')" class="hover:text-red-700">👍</button>
                    <button class="hover:text-red-700">💬 Comentar</button>
                </div>
            </div>
        </div>
    `).join('');
}

// --- 4. AÇÕES (LOGIN, POSTAR, PERFIL) ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro: " + error.message); else location.reload();
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;

    const { error } = await _supabase.from('posts').insert([{ content, user_id: session.user.id, zona }]);

    if (error) alert(error.message);
    else {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
        carregarFeed();
    }
};

// Funções de interface
window.abrirPostagem = () => mostrarTela('form-post');
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    session ? mostrarTela('user-dashboard') : mostrarTela('auth-screen');
};
