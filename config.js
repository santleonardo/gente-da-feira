// CONFIGURAÇÃO DO MOTOR (SUPABASE)
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// FUNÇÃO DE LOGIN (SEGURANÇA SIMPLIFICADA)
async function login() {
    // Para o MVP, usaremos o Login por E-mail (Mágico) ou Senha.
    // O Supabase cuida da criptografia pesada.
    const email = prompt("Digite seu e-mail:");
    if (!email) return;

    const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            emailRedirectTo: window.location.href,
        },
    });

    if (error) {
        alert("Erro ao enviar link de acesso: " + error.message);
    } else {
        alert("Verifique seu e-mail! Enviamos um link de acesso.");
    }
}

// FUNÇÃO DE LOGOUT
async function logout() {
    const { error } = await supabase.auth.signOut();
    location.reload();
}

// VERIFICAR ESTADO DO USUÁRIO
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    const statusDiv = document.getElementById('auth-status');
    const btnPerfil = document.getElementById('btn-perfil');

    if (user) {
        statusDiv.innerHTML = `<button onclick="logout()" class="text-[10px] font-bold border border-amarelo px-2 py-1 rounded">SAIR</button>`;
        btnPerfil.innerText = "MEU PERFIL";
    } else {
        statusDiv.innerHTML = `<button onclick="login()" class="bg-amarelo text-marinho px-3 py-1 rounded-md text-xs font-bold uppercase tracking-widest">Entrar</button>`;
        btnPerfil.innerText = "ENTRAR";
    }
}
// FUNÇÃO PARA PUBLICAR UM AVISO
const formPost = document.getElementById('form-post');

if (formPost) {
    formPost.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Verificar se o utilizador está logado
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            alert("Precisas de entrar para publicar!");
            return;
        }

        // 2. Capturar os dados
        const titulo = document.getElementById('post-titulo').value;
        const bairro = document.getElementById('post-bairro').value;
        const conteudo = document.getElementById('post-conteudo').value;

        // 3. Enviar para o banco de dados (Segurança via RLS)
        const { error } = await supabase.from('avisos').insert([
            { 
                titulo: titulo, 
                conteudo: conteudo, 
                bairro_alvo: bairro, 
                autor_id: user.id,
                categoria: 'Aviso' // Pode ser expandido depois
            }
        ]);

        if (error) {
            alert("Erro ao publicar: " + error.message);
        } else {
            alert("Publicado com sucesso em Feira!");
            document.getElementById('modal-post').close();
            formPost.reset();
            // Aqui poderíamos chamar uma função para recarregar o feed
        }
    });
}

// Iniciar verificação assim que a página carregar
window.onload = checkUser;
