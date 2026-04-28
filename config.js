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

// --- FUNÇÕES DE NÚCLEO (Autenticação e UI) ---

async function login() {
    const email = prompt("Digite seu e-mail para receber o link de acesso:");
    if (!email) return;
    try {
        const { error } = await _supabase.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: window.location.href }
        });
        if (error) throw error;
        alert("Link enviado! Confira seu e-mail (e a pasta de spam).");
    } catch (e) {
        alert("Erro no login: " + e.message);
    }
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

// Essa função faz o modal trocar entre "Ver Perfil" e "Editar Perfil"
function toggleEditMode() {
    const viewMode = document.getElementById('view-perfil-mode');
    const editForm = document.getElementById('form-perfil');
    
    if (viewMode && editForm) {
        viewMode.classList.add('hidden');
        editForm.classList.remove('hidden');
    }
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

    // 1. Feedback visual imediato (UX Senior)
    feedContainer.innerHTML = '<p class="text-center py-10 opacity-50 font-bold uppercase text-[10px] animate-pulse text-marinho">Sintonizando Feira...</p>';

    try {
        const { data: { user } } = await _supabase.auth.getUser();

        // 2. Query com JOIN Relacional
        let query = _supabase
            .from('avisos')
            .select(`
                *,
                perfis:autor_id (nome, whatsapp)
            `) 
            .order('created_at', { ascending: false });

        if (bairroFiltro !== 'Feira Toda') {
            query = query.eq('bairro_alvo', bairroFiltro);
        }

        const { data: avisos, error } = await query;
        if (error) throw error;

        // 3. Tratamento de Feed Vazio
        if (!avisos || avisos.length === 0) {
            feedContainer.innerHTML = '<p class="text-center py-10 opacity-50 font-bold uppercase text-[10px]">Nenhum aviso em ' + bairroFiltro + ' ainda.</p>';
            return;
        }

        feedContainer.innerHTML = '';

        // 4. Mapeamento de Estilos (Cores Neutras e Terrosas)
        // Isso evita IFs aninhados e mantém o código limpo
        const estilosPorCategoria = {
            'Vaga': 'border-stone-400 bg-stone-50',     // Neutro elegante
            'Alerta': 'border-orange-200 bg-orange-50',  // Atenção suave
            'Serviço': 'border-amarelo bg-creme',       // Destaque profissional
            'Evento': 'border-marinho bg-white',        // Formal e sofisticado
            'Aviso': 'border-cinza bg-white'            // Padrão
        };

      // 5. Renderização do Loop
        avisos.forEach(async (aviso) => {
            // 1. Buscamos o total de apoios para este aviso específico
            const { count: totalApoios } = await _supabase
                .from('reacoes')
                .select('*', { count: 'exact', head: true })
                .eq('aviso_id', aviso.id);

            const nomeAutor = aviso.perfis?.nome || "Vizinho";
            const linkWhats = aviso.perfis?.whatsapp ? `https://wa.me/55${aviso.perfis.whatsapp.replace(/\D/g, '')}` : null;
            
            // Formata a data de forma elegante
            const dataPost = new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

            feedContainer.innerHTML += `
                <div class="p-6 rounded-2xl border-l-8 border-cinza bg-white shadow-sm space-y-3 relative mb-4">
                    <div class="flex justify-between items-start">
                        <div class="flex gap-2 items-center">
                            <span class="text-[9px] font-black uppercase tracking-widest bg-marinho text-creme px-2 py-0.5 rounded">${aviso.categoria}</span>
                            <span class="text-[9px] font-bold uppercase text-marinho/50">${aviso.bairro_alvo}</span>
                        </div>
                        <span class="text-[10px] text-gray-400 font-bold uppercase">${dataPost}</span>
                    </div>
                    
                    <h3 class="font-bold text-lg leading-tight text-marinho">${aviso.titulo}</h3>
                    <p class="text-sm text-escuro/80 leading-relaxed">${aviso.conteudo}</p>
                    
                    <div class="flex items-center justify-between pt-4 border-t border-cinza/30">
                        <div class="flex gap-2">
                            ${linkWhats ? 
                                `<a href="${linkWhats}" target="_blank" class="bg-marinho text-creme px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform">WhatsApp</a>` 
                                : ''
                            }
                            <button onclick="toggleApoio(${aviso.id})" class="flex items-center gap-2 px-4 py-2 bg-creme border border-cinza rounded-lg text-[10px] font-black text-marinho active:bg-amarelo transition-colors">
                                🙌 <span class="opacity-60">APOIAR</span> <span>${totalApoios || 0}</span>
                            </button>
                        </div>
                    </div>
                </div>`;
        }); // Fim do forEach

    } catch (err) {
        console.error("Erro Crítico no Feed:", err.message);
        feedContainer.innerHTML = '<p class="text-center py-10 text-red-500 font-bold text-[10px]">ERRO AO SINCRONIZAR. VERIFIQUE SUA CONEXÃO.</p>';
    }
}
async function apagarAviso(id) {
    if (!confirm("Deseja realmente remover este aviso do bairro?")) return;

    // Bloqueio de UI imediato para feedback
    console.log("Iniciando remoção do aviso:", id);

    const { error } = await _supabase
        .from('avisos')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Erro ao apagar: " + error.message);
    } else {
        alert("Aviso removido com sucesso!");
        carregarFeed(); // Recarrega o feed para mostrar a lista atualizada
    }
}

// Função para dar ou retirar apoio a um aviso
async function toggleApoio(avisoId) {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return login(); // Se não logado, chama o login

    // Verifica se já existe um apoio
    const { data: existente } = await _supabase
        .from('reacoes')
        .select('id')
        .eq('aviso_id', avisoId)
        .eq('usuario_id', user.id)
        .single();

    if (existente) {
        // Remove o apoio (Unlike)
        await _supabase.from('reacoes').delete().eq('id', existente.id);
    } else {
        // Adiciona o apoio (Like)
        await _supabase.from('reacoes').insert([{ aviso_id: avisoId, usuario_id: user.id }]);
    }
    
    // Recarrega o feed para mostrar o novo contador
    carregarFeed(document.querySelector('.btn-bairro.bg-marinho')?.innerText || 'Feira Toda');
}

function filtrar(bairro) {
    console.log("Filtrando por:", bairro);
    
    // 1. Chama o carregamento do banco com o filtro
    carregarFeed(bairro);

    // 2. UX: Atualiza o visual dos botões no topo
    const botoes = document.querySelectorAll('.btn-bairro');
    botoes.forEach(btn => {
        // Se o texto do botão for igual ao bairro clicado, destaca ele
        if (btn.innerText.trim() === bairro) {
            btn.classList.add('bg-marinho', 'text-white', 'scale-105');
            btn.classList.remove('bg-white', 'text-marinho');
        } else {
            btn.classList.remove('bg-marinho', 'text-white', 'scale-105');
            btn.classList.add('bg-white', 'text-marinho');
        }
    });
}
// Função para formatar o WhatsApp em tempo real (Padrão: (75) 99999-9999)
function aplicarMascaraWhatsapp(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 10) {
        input.value = `(${value.slice(0,2)}) ${value.slice(2,7)}-${value.slice(7)}`;
    } else if (value.length > 5) {
        input.value = `(${value.slice(0,2)}) ${value.slice(2,6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
        input.value = `(${value.slice(0,2)}) ${value.slice(2)}`;
    } else {
        input.value = value;
    }
}
// 6. INICIALIZAÇÃO (EVENT LISTENERS)
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    carregarFeed();

    // Ativa a máscara no campo de WhatsApp do perfil
    const inputWhats = document.getElementById('edit-whatsapp');
    if (inputWhats) {
        inputWhats.addEventListener('input', (e) => aplicarMascaraWhatsapp(e.target));
    }
    
    // Listener do Formulário de Postagem
    const formPost = document.getElementById('form-post');
    if (formPost) {
        formPost.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 1. Bloqueio Ultra Senior: Feedback visual e evita postagem duplicada
            const btnPublicar = e.target.querySelector('button[type="submit"]');
            const textoOriginal = btnPublicar.innerText;
            btnPublicar.disabled = true;
            btnPublicar.innerText = "ENVIANDO...";

            try {
                const { data: { user } } = await _supabase.auth.getUser();
                
                if (!user) {
                    alert("Você precisa entrar para publicar!");
                    login();
                    return; 
                }

                // 2. Executa a inserção no banco com a CATEGORIA dinâmica
                const { error } = await _supabase.from('avisos').insert([{ 
                    titulo: document.getElementById('post-titulo').value, 
                    conteudo: document.getElementById('post-conteudo').value, 
                    bairro_alvo: document.getElementById('post-bairro').value, 
                    autor_id: user.id, 
                    categoria: document.getElementById('post-categoria').value 
                }]);

                if (error) {
                    alert("Erro ao publicar: " + error.message);
                } else {
                    alert("Publicado com sucesso!");
                    document.getElementById('modal-post').close();
                    formPost.reset();
                    carregarFeed();
                }
            } catch (err) {
                console.error("Erro inesperado:", err);
                alert("Erro ao processar postagem.");
            } finally {
                // 3. Destrava o botão SEMPRE (sucesso ou erro)
                btnPublicar.disabled = false;
                btnPublicar.innerText = textoOriginal;
            }
        });
    }
    // --- NO config.js, DENTRO DO document.addEventListener('DOMContentLoaded', ... ) ---

    // 1. Escutar avisos em tempo real
    _supabase
        .channel('feed-geral')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, payload => {
            console.log('Novo aviso detectado:', payload.new);
            // Recarrega o feed se o novo aviso for do bairro filtrado ou se estiver em "Feira Toda"
            const bairroFiltro = document.querySelector('.btn-bairro.bg-marinho')?.innerText || 'Feira Toda';
            if (bairroFiltro === 'Feira Toda' || payload.new.bairro_alvo === bairroFiltro) {
                carregarFeed(bairroFiltro);
            }
        })
        .subscribe();

    // 2. Escutar reações (apoios) em tempo real
    _supabase
        .channel('reacoes-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reacoes' }, () => {
            // Sempre que houver um novo apoio ou remoção, atualizamos o feed para refletir os números
            const bairroFiltro = document.querySelector('.btn-bairro.bg-marinho')?.innerText || 'Feira Toda';
            carregarFeed(bairroFiltro);
        })
        .subscribe();

    // Listener do Formulário de Perfil
    const formPerfil = document.getElementById('form-perfil');
    if (formPerfil) {
        formPerfil.addEventListener('submit', salvarPerfil);
    }
});
