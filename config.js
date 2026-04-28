// 1. DEFINIÇÃO DAS CHAVES
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok"; 

// 2. INICIALIZAÇÃO SEGURA
let _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Carregar Perfil (Visualização Primeiro)
async function carregarDadosPerfil() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await _supabase.from('perfis').select('*').eq('id', user.id).single();

    if (perfil) {
        // Apenas exibe as informações nos labels
        document.getElementById('perfil-nome-display').innerText = perfil.nome || "Vizinho";
        document.getElementById('perfil-bairro-display').innerText = perfil.bairro || "Feira";
        
        // Preenche o formulário de edição (escondido inicialmente)
        document.getElementById('edit-nome').value = perfil.nome || "";
        document.getElementById('edit-bairro').value = perfil.bairro || "";
        document.getElementById('edit-whatsapp').value = perfil.whatsapp || "";
    }
}

// Carregar Feed com Filtro de Bairro
async function carregarFeed(bairroFiltro = 'Feira Toda') {
    const feedContainer = document.getElementById('feed');
    feedContainer.innerHTML = '<p class="text-center py-10 opacity-50 animate-pulse">Sintonizando Feira...</p>';

    let query = _supabase.from('avisos').select('*, perfis:autor_id(nome, whatsapp)').order('created_at', { ascending: false });
    if (bairroFiltro !== 'Feira Toda') query = query.eq('bairro_alvo', bairroFiltro);

    const { data: avisos, error } = await query;
    if (error) { feedContainer.innerHTML = 'Erro ao carregar avisos.'; return; }

    feedContainer.innerHTML = '';
    avisos.forEach(aviso => {
        const ehDono = false; // Lógica para verificar se o usuário logado é o autor
        feedContainer.innerHTML += `
            <div class="p-4 bg-white border border-cinza rounded-xl shadow-sm space-y-2">
                <div class="flex justify-between text-[10px] font-bold uppercase text-gray-400">
                    <span>${aviso.categoria}</span>
                    <span>${aviso.bairro_alvo}</span>
                </div>
                <h3 class="font-bold text-marinho">${aviso.titulo}</h3>
                <p class="text-sm text-escuro/80">${aviso.conteudo}</p>
                <div class="flex gap-2 pt-2">
                    ${aviso.perfis?.whatsapp ? `<a href="https://wa.me/55${aviso.perfis.whatsapp.replace(/\D/g, '')}" class="text-xs font-bold text-amarelo bg-marinho px-3 py-1 rounded">WhatsApp</a>` : ''}
                    ${ehDono ? `<button onclick="apagarAviso(${aviso.id})" class="text-red-500 text-[10px] uppercase font-bold">Apagar</button>` : ''}
                </div>
            </div>`;
    });
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

    // Listener do Formulário de Perfil
    const formPerfil = document.getElementById('form-perfil');
    if (formPerfil) {
        formPerfil.addEventListener('submit', salvarPerfil);
    }
});
