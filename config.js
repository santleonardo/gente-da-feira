// CONFIGURAÇÃO DO MOTOR (SUPABASE)
const SUPABASE_URL = "SUA_URL_AQUI";
const SUPABASE_KEY = "SUA_CHAVE_ANON_AQUI";

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

// Iniciar verificação assim que a página carregar
window.onload = checkUser;