/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.4.0 (Global Auth Sync)
 */

console.log("🚀 Iniciando Gente da Feira v4.4.0...");

// --- 1. CONFIGURAÇÕES GLOBAIS E CONSTANTES ---
const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

// SINCRONIZAÇÃO GLOBAL: Usa a instância criada no index.html ou cria uma nova se necessário
if (!window._supabase) {
    window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}
const _supabase = window._supabase;

const EMOJIS = ['👍', '❤️', '🔥', '👏', '🙌', '😮', '📍', '💡'];
const BAIRROS_FSA = [
    'Geral', 'Centro', 'Tomba', 'SIM', 'Cidade Nova', 'Campo Limpo', 
    'Humildes', 'Mangabeira', 'Santa Mônica', 'Papagaio', 'Kalilândia'
];

// --- 2. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    verificarSessao();
    configurarDeepLinks();
});

// --- 3. GESTÃO DE SESSÃO E AUTH ---
async function verificarSessao() {
    const { data: { session }, error } = await _supabase.auth.getSession();
    
    if (session) {
        console.log("✅ Sessão ativa para:", session.user.email);
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-nav').classList.remove('hidden');
        document.getElementById('feed-container').classList.remove('hidden');
        carregarFeed();
    } else {
        console.log("🚪 Nenhuma sessão encontrada.");
        mostrarTela('auth-screen');
    }
}

// --- 4. CORE DO FEED ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="text-center p-10 animate-pulse">Carregando novidades de Feira...</div>';

    let query = _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, avatar_url, bairro)
        `)
        .order('created_at', { ascending: false });

    if (filtro !== 'Geral') {
        query = query.eq('zona', filtro);
    }

    const { data: posts, error } = await query;

    if (error) {
        container.innerHTML = `<div class="bg-red-100 p-4 text-red-700 rounded-xl">Erro ao carregar o feed: ${error.message}</div>`;
        return;
    }

    renderizarFeed(posts, filtro);
}

function renderizarFeed(posts, filtroAtivo) {
    const container = document.getElementById('feed-container');
    
    let html = `
        <div class="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
            ${BAIRROS_FSA.map(b => `
                <button onclick="mudarFeed('${b}')" 
                    class="px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-all ${filtroAtivo === b ? 'bg-feira-yellow text-feira-marinho' : 'bg-white text-gray-400 border border-gray-100'}">
                    ${b}
                </button>
            `).join('')}
        </div>
    `;

    if (posts.length === 0) {
        html += `<div class="text-center p-20 text-gray-400">Nenhum aviso em <b>${filtroAtivo}</b> ainda.</div>`;
    } else {
        posts.forEach(post => {
            html += `
                <article class="bg-white p-5 rounded-3xl shadow-sm border border-gray-50 mb-4" data-post-id="${post.id}">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-feira-yellow flex items-center justify-center font-black text-feira-marinho">
                            ${post.profiles?.username?.[0].toUpperCase() || '?'}
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-feira-marinho">${post.profiles?.username || 'Usuário'}</h4>
                            <p class="text-[10px] text-gray-400 uppercase tracking-widest">${post.zona} • ${new Date(post.created_at).toLocaleTimeString()}</p>
                        </div>
                    </div>
                    <p class="text-gray-700 leading-relaxed mb-4">${post.content}</p>
                    <div class="flex gap-4 border-t border-gray-50 pt-4">
                        <button class="text-xs font-bold text-gray-400 hover:text-feira-marinho">Reagir</button>
                        <button class="text-xs font-bold text-gray-400 hover:text-feira-marinho">Comentar</button>
                    </div>
                </article>
            `;
        });
    }

    container.innerHTML = html;
}

// --- 5. UTILITÁRIOS DE TELA ---
window.mostrarTela = (id) => {
    const telas = ['auth-screen', 'feed-container', 'main-nav'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        if (id === 'feed-container') {
            document.getElementById('main-nav').classList.remove('hidden');
        }
    }
};

window.mudarFeed = (tipo) => carregarFeed(tipo);

window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        if(confirm("Deseja sair da conta?")) {
            await _supabase.auth.signOut();
            window.location.reload();
        }
    } else {
        mostrarTela('auth-screen');
    }
};

function configurarDeepLinks() {
    const hash = window.location.hash;
    if (hash.includes('post-')) {
        const id = hash.split('-')[1];
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 1000);
    }
}
