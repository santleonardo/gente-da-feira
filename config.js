// 1. DEFINIÇÃO DAS CHAVES (Sempre no topo)
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "SUA_CHAVE_ANON_AQUI"; // Certifique-se de que é a 'anon public'

// 2. INICIALIZAÇÃO IMEDIATA DO MOTOR
// Usamos 'var' ou definimos direto na 'window' para garantir que as funções vejam o objeto
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. FUNÇÕES DE AUTENTICAÇÃO
async function login() {
    const email = prompt("Digite seu e-mail para receber o link de acesso:");
    if (!email) return;

    console.log("Iniciando processo de login para:", email);

    try {
        const { data, error } = await _supabase.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: window.location.href,
            },
        });

        if (error) throw error;
        alert("Sucesso! Verifique sua caixa de entrada e a pasta de SPAM: " + email);
    } catch (err) {
        console.error("Erro no login:", err.message);
        alert("Erro ao entrar: " + err.message);
    }
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

// 4. VERIFICAÇÃO DE ESTADO E INTERFACE
async function checkUser() {
    const { data: { user } } = await _supabase.auth.getUser();
    const statusDiv = document.getElementById('auth-status');
    const btnPerfil = document.getElementById('btn-perfil');

    if (user) {
        if (statusDiv) {
            statusDiv.innerHTML = `<button onclick="logout()" class="text-[10px] font-bold border border-amarelo px-2 py-1 rounded">SAIR</button>`;
        }
        if (btnPerfil) {
            btnPerfil.innerText = "MEU PERFIL";
        }
    }
}

// 5. INICIALIZAÇÃO DOS EVENTOS (Garante que o HTML carregou antes de agir)
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    
    const formPost = document.getElementById('form-post');
    if (formPost) {
        formPost.addEventListener('submit', async (e) => {
            e.preventDefault();

            const { data: { user } } = await _supabase.auth.getUser();
            
            if (!user) {
                alert("Você precisa estar logado para publicar!");
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
                document.getElementById('modal-post').close();
                formPost.reset();
            }
        });
    }
});
