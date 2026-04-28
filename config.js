// CONFIGURAÇÃO DO MOTOR (SUPABASE)
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok"; // Certifique-se de usar a 'anon public'

// CORREÇÃO: Usamos o nome da biblioteca global para criar a instância
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// FUNÇÃO DE LOGIN
async function login() {
    const email = prompt("Digite seu e-mail para receber o link de acesso:");
    if (!email) return;

    console.log("Tentando enviar link para:", email);

    const { data, error } = await _supabase.auth.signInWithOtp({
        email: email,
        options: {
            emailRedirectTo: window.location.href,
        },
    });

    if (error) {
        console.error("Erro detalhado:", error);
        alert("Erro técnico: " + error.message);
    } else {
        alert("Sucesso! Verifique sua caixa de entrada e a pasta de SPAM: " + email);
    }
}

// FUNÇÃO DE LOGOUT
async function logout() {
    const { error } = await _supabase.auth.signOut();
    location.reload();
}

// VERIFICAR ESTADO DO USUÁRIO
async function checkUser() {
    const { data: { user } } = await _supabase.auth.getUser();
    const statusDiv = document.getElementById('auth-status');
    const btnPerfil = document.getElementById('btn-perfil');

    if (user) {
        if(statusDiv) statusDiv.innerHTML = `<button onclick="logout()" class="text-[10px] font-bold border border-amarelo px-2 py-1 rounded">SAIR</button>`;
        if(btnPerfil) btnPerfil.innerText = "MEU PERFIL";
    }
}

// LOGICA DE POSTAGEM
// Movido para dentro de um evento para garantir que o DOM está pronto
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    
    const formPost = document.getElementById('form-post');
    if (formPost) {
        formPost.addEventListener('submit', async (e) => {
            e.preventDefault();

            const { data: { user } } = await _supabase.auth.getUser();
            
            if (!user) {
                alert("Precisas de entrar para publicar!");
                return;
            }

            const titulo = document.getElementById('post-titulo').value;
            const bairro = document.getElementById('post-bairro').value;
            const conteudo = document.getElementById('post-conteudo').value;

            const { error } = await _supabase.from('avisos').insert([
                { 
                    titulo: titulo, 
                    conteudo: conteudo, 
                    bairro_alvo: bairro, 
                    autor_id: user.id,
                    categoria: 'Aviso'
                }
            ]);

            if (error) {
                alert("Erro ao publicar: " + error.message);
            } else {
                alert("Publicado com sucesso em Feira!");
                const modal = document.getElementById('modal-post');
                if(modal) modal.close();
                formPost.reset();
            }
        });
    }
});
