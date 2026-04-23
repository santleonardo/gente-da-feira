console.log("Sistema Gente da Feira - Versão Estabilizada (Sem GitHub)");

// --- 1. CONFIGURAÇÃO (Lembre-se de usar a chave que começa com eyJ) ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb'; // <--- ATUALIZE ESTA CHAVE

let _supabase;

// --- 2. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado!");
        carregarFeed();
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// --- 3. NAVEGAÇÃO ---
function mostrarTela(telaAtiva) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');
}

// SEGURANÇA: Escapa HTML para evitar ataques XSS
function escaparHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/\'/g, '&#039;');
}

// --- 4. AUTENTICAÇÃO (E-mail e Senha) ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro: " + error.message); else location.reload();
};

window.fazerCadastro = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) alert("Erro: " + error.message); else alert("Verifique o seu e-mail para confirmar o cadastro!");
};

window.fazerLogout = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// --- 5. POSTAGENS E FEED ---
window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;

    if (!content.trim()) return alert("O aviso não pode estar vazio.");

    const { error } = await _supabase.from('posts').insert([{
        content: content,
        user_id: session.user.id,
        zona: zona
    }]);

    if (error) {
        alert("Erro ao publicar: " + error.message);
    } else {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
        carregarFeed();
    }
};

// Funções globais de navegação
window.abrirPostagem = () => mostrarTela('form-post');
window.toggleForm = () => mostrarTela('feed-container');
window.mudarFeed = (tipo) => {
    // Lógica para alternar entre feed global e local
    console.log("Alternando feed para:", tipo);
};
