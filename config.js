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

// 3. FUNÇÕES DE AUTENTICAÇÃO
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

// 4. FUNÇÕES DE PERFIL (AS QUE VOCÊ ME MANDOU)
async function salvarPerfil(e) {
    e.preventDefault();
    const { data: { user } } = await _supabase.auth.getUser();
    
    if (!user) return alert("Sessão expirada. Entre novamente.");

    const dados = {
        id: user.id,
        nome: document.getElementById('edit-nome').value,
        bairro: document.getElementById('edit-bairro').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
    };

    const { error } = await _supabase
        .from('perfis')
        .upsert(dados);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Perfil atualizado em Feira!");
        carregarDadosPerfil(); // Atualiza a tela
        document.getElementById('modal-perfil').close();
    }
}

async function carregarDadosPerfil() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const elEmail = document.getElementById('perfil-email');
    const elInicial = document.getElementById('perfil-inicial');
    
    if (elEmail) elEmail.innerText = user.email;
    if (elInicial) elInicial.innerText = user.email.charAt(0).toUpperCase();

    const { data: perfil } = await _supabase
        .from('perfis')
        .select('*')
        .eq('id', user.id)
        .single();

    if (perfil) {
        const elNomeDisp = document.getElementById('perfil-nome-display');
        const elEditNome = document.getElementById('edit-nome');
        const elEditBairro = document.getElementById('edit-bairro');
        const elEditWhats = document.getElementById('edit-whatsapp');

        if (elNomeDisp) elNomeDisp.innerText = perfil.nome;
        if (elEditNome) elEditNome.value = perfil.nome;
        if (elEditBairro) elEditBairro.value = perfil.bairro;
        if (elEditWhats) elEditWhats.value = perfil.whatsapp || "";
    }
}

// 5. FUNÇÕES DO FEED
async function checkUser() {
    const { data: { user } } = await _supabase.auth.getUser();
    const statusDiv = document.getElementById('auth-status');
    const btnPerfilLabel = document.querySelector('#btn-perfil span');

    if (user) {
        if (statusDiv) statusDiv.innerHTML = `<button onclick="logout()" class="text-[10px] font-bold border border-amarelo px-2 py-1 rounded">SAIR</button>`;
        if (btnPerfilLabel) btnPerfilLabel.innerText = "PERFIL";
        carregarDadosPerfil(); // Carrega os dados assim que o usuário é detectado
    }
}

async function carregarFeed(bairroFiltro = 'Feira Toda') {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    // Início da query - Segurança: Selecionamos apenas o necessário
    let query = _supabase
        .from('avisos')
        .select(`
            *,
            perfis (nome, whatsapp)
        `) // Isso é um JOIN: traz os dados do autor automaticamente
        .order('created_at', { ascending: false });

    // PASSO 3: Filtro Dinâmico
    if (bairroFiltro !== 'Feira Toda') {
        query = query.eq('bairro_alvo', bairroFiltro);
    }

    const { data: avisos, error } = await query;

    if (error) {
        console.error("Erro na Auditoria de Feed:", error.message);
        return;
    }

    feedContainer.innerHTML = '';

    avisos.forEach(aviso => {
        const dataStr = new Date(aviso.created_at).toLocaleDateString('pt-BR');
        const nomeAutor = aviso.perfis?.nome || "Vizinho de Feira";
        const linkWhats = aviso.perfis?.whatsapp 
            ? `https://wa.me/55${aviso.perfis.whatsapp.replace(/\D/g, '')}?text=Olá%20${nomeAutor},%20vi%20seu%20aviso%20no%20Gente%20da%20Feira`
            : null;

        feedContainer.innerHTML += `
            <div class="p-5 bg-white rounded-xl border-b-4 border-amarelo shadow-sm space-y-2">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] font-bold uppercase tracking-widest bg-marinho text-white px-2 py-0.5 rounded">${aviso.bairro_alvo}</span>
                    <span class="text-[10px] text-gray-400 font-bold">${dataStr}</span>
                </div>
                <h3 class="font-bold text-lg leading-tight text-marinho">${aviso.titulo}</h3>
                <p class="text-xs text-gray-500">Postado por: <span class="font-bold text-marinho">${nomeAutor}</span></p>
                <p class="text-sm text-escuro/80">${aviso.conteudo}</p>
                
                ${linkWhats ? 
                    `<a href="${linkWhats}" target="_blank" class="block w-full bg-creme border border-marinho text-marinho py-2 rounded-lg text-sm text-center font-bold active:bg-amarelo transition-colors">Falar com anunciante</a>` 
                    : `<button disabled class="w-full bg-gray-100 text-gray-400 py-2 rounded-lg text-sm font-bold cursor-not-allowed">Contato não disponível</button>`
                }
            </div>
        `;
    });
}

// 6. INICIALIZAÇÃO (EVENT LISTENERS)
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    carregarFeed();
    
    // Listener do Formulário de Postagem
    const formPost = document.getElementById('form-post');
    if (formPost) {
        formPost.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { data: { user } } = await _supabase.auth.getUser();
            
            if (!user) {
                alert("Você precisa entrar para publicar!");
                login();
                return;
            }

            const { error } = await _supabase.from('avisos').insert([{ 
                titulo: document.getElementById('post-titulo').value, 
                conteudo: document.getElementById('post-conteudo').value, 
                bairro_alvo: document.getElementById('post-bairro').value, 
                autor_id: user.id, 
                categoria: 'Aviso' 
            }]);

            if (error) {
                alert("Erro: " + error.message);
            } else {
                alert("Publicado com sucesso!");
                document.getElementById('modal-post').close();
                formPost.reset();
                carregarFeed();
            }
        });
    }

    // Listener do NOVO Formulário de Perfil
    const formPerfil = document.getElementById('form-perfil');
    if (formPerfil) {
        formPerfil.addEventListener('submit', salvarPerfil);
    }
});
