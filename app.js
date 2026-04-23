// Adicione isto no topo para testar se o arquivo está lendo
console.log("Sistema Gente da Feira Iniciado...");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

let _supabase;

// Função para garantir que o Supabase existe antes de criar o cliente
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado com sucesso!");
        carregarFeed();
    } else {
        console.error("Erro: Biblioteca Supabase não encontrada. Tentando novamente...");
        setTimeout(inicializarSupabase, 500);
    }
}

document.addEventListener('DOMContentLoaded', inicializarSupabase);// ... (mantenha as seções 1 a 5 iguais)

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

    // PEGA A SESSÃO PARA OBTER O USER_ID
    const { data: { session } } = await _supabase.auth.getSession();

    if (!content) return alert("Escreva o conteúdo do aviso!");
    if (!session) return alert("Sessão expirada. Faça login novamente.");

    // INSERE INCLUINDO O USER_ID
    const { error } = await _supabase.from('posts').insert([{ 
        author_name: author, 
        zona: zona, 
        content: content,
        user_id: session.user.id // <-- Crucial para o vínculo técnico
    }]);

    if (error) {
        alert("Erro ao publicar: " + error.message);
    } else {
        alert("Aviso publicado com sucesso!");
        document.getElementById('post-content').value = '';
        mostrarTela('feed-container');
        carregarFeed();
    }
}

// ... (mantenha o restante igual)
