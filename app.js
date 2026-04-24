/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.5.0 (Visual Avançado + Postagem)
 * Descrição: Foco em estética moderna e fluxo de postagem estável.
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8';

// Mantém a conexão única entre index e app
if (!window._supabase) {
    window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}
const _supabase = window._supabase;

const EMOJIS = ['👍', '❤️', '🔥', '👏', '🙌'];
const BAIRROS_FSA = ['Geral', 'Centro', 'Tomba', 'SIM', 'Cidade Nova', 'Campo Limpo', 'Mangabeira', 'Santa Mônica'];

document.addEventListener('DOMContentLoaded', () => verificarSessao());

// --- GESTÃO DE ACESSO ---
async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        mostrarTela('feed-container');
        carregarFeed();
    } else {
        mostrarTela('auth-screen');
    }
}

// --- LOGICA DO FEED ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="text-center p-10 animate-pulse text-gray-400 font-bold uppercase text-[10px] tracking-widest">Sintonizando Feira...</div>';

    let query = _supabase
        .from('posts')
        .select('*, profiles:user_id (username)')
        .order('created_at', { ascending: false });

    if (filtro !== 'Geral') query = query.eq('zona', filtro);

    const { data: posts, error } = await query;
    if (error) return container.innerHTML = "<p class='text-center text-red-400'>Erro ao carregar avisos.</p>";
    
    renderizarFeed(posts, filtro);
}

function renderizarFeed(posts, filtroAtivo) {
    const container = document.getElementById('feed-container');
    
    // Filtros por Bairro (Chips Estilizados)
    let html = `
        <div class="flex gap-2 overflow-x-auto pb-6 no-scrollbar -mx-4 px-4">
            ${BAIRROS_FSA.map(b => `
                <button onclick="mudarFeed('${b}')" 
                    class="px-5 py-2.5 rounded-2xl border-2 transition-all text-[10px] font-black uppercase tracking-tighter shadow-sm
                    ${filtroAtivo === b ? 'bg-feira-yellow border-feira-yellow text-feira-marinho scale-105' : 'bg-white border-gray-100 text-gray-400'}">
                    ${b}
                </button>
            `).join('')}
        </div>
    `;

    if (posts.length === 0) {
        html += '<div class="text-center p-20 opacity-20 font-black text-sm uppercase">Ninguém falou nada aqui ainda...</div>';
    } else {
        posts.forEach(post => {
            const inicial = post.profiles?.username?.[0].toUpperCase() || 'M';
            html += `
                <article class="bg-white p-6 rounded-[2.5rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] border border-gray-50 mb-6 transition-all active:scale-[0.98]">
                    <div class="flex items-center gap-4 mb-5">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-feira-yellow to-yellow-500 flex items-center justify-center shadow-md">
                            <span class="font-black text-feira-marinho text-lg">${inicial}</span>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between items-center">
                                <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                                <span class="bg-gray-50 text-[9px] font-black px-2 py-1 rounded-lg text-gray-400 uppercase tracking-widest">${post.zona}</span>
                            </div>
                            <p class="text-[10px] text-gray-300 font-bold uppercase tracking-widest">FSA • Agora Mesmo</p>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 leading-relaxed text-sm mb-6 font-medium">${post.content}</p>
                    
                    <div class="flex items-center justify-between pt-5 border-t border-gray-50">
                        <div class="flex -space-x-2">
                            ${EMOJIS.slice(0, 3).map(e => `
                                <button class="w-8 h-8 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center text-sm hover:scale-110 transition-transform">${e}</button>
                            `).join('')}
                        </div>
                        <button class="text-[10px] font-black uppercase text-feira-marinho bg-feira-yellow/10 px-4 py-2 rounded-xl active:bg-feira-yellow/20">Responder</button>
                    </div>
                </article>
            `;
        });
    }

    container.innerHTML = html;
}

// --- FUNÇÕES DE INTERAÇÃO ---
window.mostrarTela = (id) => {
    ['auth-screen', 'feed-container', 'main-nav', 'form-post'].forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        if (id === 'feed-container') document.getElementById('main-nav').classList.remove('hidden');
    }
};

window.mudarFeed = (tipo) => carregarFeed(tipo);
window.abrirPostagem = () => mostrarTela('form-post');

async function enviarPostagem() {
    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;
    const btn = document.getElementById('btn-postar');

    if (content.length < 3) return alert("Ei, escreva algo mais substancial!");

    btn.disabled = true;
    btn.innerText = "LANÇANDO...";

    const { data: { session } } = await _supabase.auth.getSession();
    
    const { error } = await _supabase.from('posts').insert([
        { user_id: session.user.id, content: content, zona: zona }
    ]);

    if (error) {
        alert("Erro: " + error.message);
    } else {
        document.getElementById('post-content').value = "";
        mostrarTela('feed-container');
        carregarFeed(zona);
    }
    btn.disabled = false;
    btn.innerText = "Publicar agora";
}

window.gerenciarBotaoPerfil = async () => {
    if(confirm("Deseja sair da sua conta em Feira?")) {
        await _supabase.auth.signOut();
        window.location.reload();
    }
};
