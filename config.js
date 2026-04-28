// 1. DEFINIÇÃO DAS CHAVES
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok"; 

// 2. INICIALIZAÇÃO SEGURA
let _supabase;
try {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Motor Supabase inicializado com sucesso.");
} catch (e) {
    console.error("Falha ao iniciar Supabase.");
}

// 3. FUNÇÕES DE AUTENTICAÇÃO (Globais para o HTML encontrar)
async function login() {
    const email = prompt("Digite seu e-mail para receber o link de acesso:");
    if (!email) return;
    try {
        const { error } = await _supabase.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: window.location.href }
        });
        if (error) throw error;
        alert("Sucesso! Verifique sua caixa de entrada e SPAM.");
    } catch (err) {
        alert("Erro ao entrar: " + err.message);
    }
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

// 4. FUNÇÕES DO FEED E INTERFACE
async function checkUser() {
    const { data: { user } } = await _supabase.auth.getUser();
    const statusDiv = document.getElementById('auth-status');
    const btnPerfil = document.getElementById('btn-perfil');

    if (user) {
        if (statusDiv) statusDiv.innerHTML = `<button onclick="logout()" class="text-[10px] font-bold border border-amarelo px-2 py-1 rounded">SAIR</button>`;
        if (btnPerfil) btnPerfil.innerText = "MEU PERFIL";
    }
}

async function carregarFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const { data: avisos, error } = await _supabase
        .from('avisos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erro ao carregar feed:", error);
        return;
    }

    feedContainer.innerHTML = '';

    if (avisos.length === 0) {
        feedContainer.innerHTML = '<p class="text-center py-10 opacity-50">Nenhum aviso por enquanto.</p>';
        return;
    }

    avisos.forEach(aviso => {
        const dataStr = new Date(aviso.created_at).toLocaleDateString('pt-BR');
        feedContainer.innerHTML += `
            <div class="p-5 bg-white rounded-xl border-b-4 border-amarelo shadow-sm space-y-2">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] font-bold uppercase tracking-widest bg-marinho text-white px-2 py-0.5 rounded">${aviso.bairro_alvo}</span>
                    <span class="text-[10px] text-gray-400 font-bold">${dataStr}</span>
                </div>
                <h3 class="font-bold text-lg leading-tight text-marinho">${aviso.titulo}</h3>
                <p class="text-sm text-escuro/80">${aviso.conteudo}</p>
                <button class="w-full bg-creme border border-marinho text-marinho py-2 rounded-lg text-sm font-bold active:bg-amarelo">Ver detalhes</button>
            </div>
        `;
    });
}

// 5. INICIALIZAÇÃO (Quando o HTML termina de carregar)
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    carregarFeed();
    
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
                { titulo, conteudo, bairro_alvo: bairro, autor_id: user.id, categoria: 'Aviso' }
            ]);

            if (error) {
                alert("Erro: " + error.message);
            } else {
                alert("Publicado com sucesso!");
                document.getElementById('modal-post').close();
                formPost.reset();
                carregarFeed(); // Recarrega o feed na hora!
            }
        });
    }
    // --- FUNÇÃO PARA PEGAR OS DADOS DO BANCO ---
async function carregarDadosPerfil() {
    const { data: { user } } = await _supabase.auth.getUser();
    
    if (user) {
        // 1. Preenche o e-mail (que já vem na conta)
        document.getElementById('perfil-email').innerText = user.email;
        // 2. Coloca a inicial do e-mail no círculo amarelo
        document.getElementById('perfil-inicial').innerText = user.email.charAt(0).toUpperCase();
        
        // 3. Busca nome e bairro na sua tabela 'perfis'
        const { data: perfil } = await _supabase
            .from('perfis')
            .select('*')
            .eq('id', user.id)
            .single();

        if (perfil) {
            document.getElementById('perfil-nome').innerText = perfil.nome || "Morador de Feira";
            document.getElementById('perfil-bairro').innerText = perfil.bairro || "Bairro não informado";
        } else {
            document.getElementById('perfil-nome').innerText = "Novo Vizinho";
            document.getElementById('perfil-bairro').innerText = "Feira Toda";
        }
    }
}
});
