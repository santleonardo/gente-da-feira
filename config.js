// 1. DEFINIÇÃO DAS CHAVES
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok"; 

// 2. INICIALIZAÇÃO SEGURA
// Usamos uma variável global para garantir acesso em todo o código
let _supabase;

try {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Motor Supabase inicializado com sucesso.");
} catch (e) {
    console.error("Falha ao iniciar Supabase. Verifique a ordem dos scripts no HTML.");
}

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
    // BUSCAR E EXIBIR AVISOS
async function carregarFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    // 1. Puxar dados do Supabase
    const { data: avisos, error } = await _supabase
        .from('avisos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erro ao carregar feed:", error);
        return;
    }

    // 2. Limpar o esqueleto de carregamento
    feedContainer.innerHTML = '';

    // 3. Gerar os cards
    avisos.forEach(aviso => {
        const dataStr = new Date(aviso.created_at).toLocaleDateString('pt-BR');
        feedContainer.innerHTML += `
            <div class="p-5 bg-white rounded-xl border-b-4 border-amarelo shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-widest bg-marinho text-white px-2 py-0.5 rounded">${aviso.bairro_alvo}</span>
                    <span class="text-[10px] text-gray-400 font-bold">${dataStr}</span>
                </div>
                <h3 class="font-bold text-lg leading-tight mb-1 text-marinho">${aviso.titulo}</h3>
                <p class="text-sm text-escuro/80 mb-4">${aviso.conteudo}</p>
                <button class="w-full bg-creme border border-marinho text-marinho py-2 rounded-lg text-sm font-bold active:bg-amarelo transition-colors">Ver detalhes</button>
            </div>
        `;
    });
}

// Chamar o feed assim que o app carregar
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    carregarFeed();
});
});
