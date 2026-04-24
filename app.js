/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.7.0 (Threads, Reações & Perfil)
 */

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzIwMDYsImV4cCI6MjA5MjQ0ODAwNn0.ccE4T_tdNeA2FogKBQOWQM9snOiHEnjGIUvhD4qEFm8'; 

let _supabase;
const EMOJIS = ["👍", "❤️", "🔥", "🙌"];
const BAIRROS_FSA = ["Aviário", "Baraúnas", "Brasília", "Campo Limpo", "Capuchinhos", "Caseb", "Centro", "Cidade Nova", "Conceição", "Feira IX", "Feira X", "George Américo", "Humildes", "Jardim Cruzeiro", "Limoeiro", "Mangabeira", "Muchila", "Papagaio", "Queimadinha", "Rua Nova", "Santa Mônica", "SIM", "Sobradinho", "Tomba"].sort();

// --- INICIALIZAÇÃO ---
async function inicializarApp() {
    if (typeof supabase === 'undefined') return setTimeout(inicializarApp, 500);
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    popularMenusBairros();
    await verificarSessao();
}

document.addEventListener('DOMContentLoaded', inicializarApp);

// --- NAVEGAÇÃO & UI ---
function mostrarTela(id) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-post'];
    telas.forEach(t => document.getElementById(t)?.classList.add('hidden'));
    
    const ativa = document.getElementById(id);
    if (ativa) {
        ativa.classList.remove('hidden');
        ativa.classList.add('animate-fade-in');
        if (id !== 'auth-screen') document.getElementById('main-nav').classList.remove('hidden');
    }
}

function popularMenusBairros() {
    const select = document.getElementById('post-zona');
    if (!select) return;
    select.innerHTML = '<option value="Geral">📍 Toda a Cidade</option>';
    BAIRROS_FSA.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        select.appendChild(opt);
    });
}

// --- FEED & SOCIAL ENGINE ---
async function carregarFeed(filtro = 'Geral') {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="text-center p-10 opacity-30 font-black text-xs uppercase tracking-widest">Sincronizando Feira...</div>';

    const { data: posts, error } = await _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url),
            reactions (emoji_type, user_id),
            comments (*, profiles:user_id (username))
        `)
        .order('created_at', { ascending: false });

    if (error) return;
    renderizarFeed(posts || [], container);
}

function renderizarFeed(posts, container) {
    container.innerHTML = "";
    const currentUid = JSON.parse(localStorage.getItem('sb-oecoggegxlortfcsnagd-auth-token'))?.user?.id;

    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        const reacoesHtml = EMOJIS.map(emoji => {
            const count = post.reactions?.filter(r => r.emoji_type === emoji).length || 0;
            return `<button onclick="reagir('${post.id}', '${emoji}')" class="flex items-center gap-1">
                <span class="text-sm">${emoji}</span>
                <span class="text-[10px] font-black text-gray-400">${count || ''}</span>
            </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-5">
                <div onclick="verPerfilPublico('${post.user_id}')" class="w-12 h-12 rounded-2xl bg-feira-yellow flex items-center justify-center shadow-md cursor-pointer">
                    <span class="font-black text-feira-marinho">${(post.profiles?.username || 'M')[0].toUpperCase()}</span>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                        <span class="text-[9px] font-black bg-gray-50 px-2 py-1 rounded-lg text-gray-400 uppercase">${post.zona}</span>
                    </div>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-6 leading-relaxed">${post.content}</p>
            <div class="flex items-center justify-between pt-5 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[10px] font-black uppercase text-feira-marinho bg-feira-yellow/10 px-4 py-2 rounded-xl">Conversa (${post.comments?.length || 0})</button>
            </div>
            <div id="thread-${post.id}" class="hidden mt-4 space-y-2">
                ${post.comments?.map(c => `<div class="text-xs bg-gray-50 p-3 rounded-2xl"><b>${c.profiles?.username}:</b> ${c.content}</div>`).join('')}
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-white border-none rounded-xl p-2 outline-none shadow-inner">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-3 rounded-xl font-bold uppercase">Enviar</button>
                </div>
            </div>
        `;
        container.appendChild(postEl);
    });
}

// --- AÇÕES ---
window.reagir = async (postId, emoji) => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    await _supabase.from('reactions').insert({ post_id: postId, user_id: session.user.id, emoji_type: emoji });
    carregarFeed();
};

window.comentar = async (postId) => {
    const input = document.getElementById(`in-${postId}`);
    const { data: { session } } = await _supabase.auth.getSession();
    if (!input.value) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = "";
    carregarFeed();
};

window.enviarPost = async () => {
    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;
    const { data: { session } } = await _supabase.auth.getSession();
    await _supabase.from('posts').insert({ content, zona, user_id: session.user.id });
    document.getElementById('post-content').value = "";
    mostrarTela('feed-container');
    carregarFeed();
};

window.verPerfilPublico = async (uid) => {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    if (p) {
        document.getElementById('dash-nome').innerText = p.username || "Morador";
        document.getElementById('dash-bairro').innerText = p.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = p.bio || "Sem biografia.";
        mostrarTela('user-dashboard');
    }
};

window.abrirThreads = (id) => document.getElementById(`thread-${id}`).classList.toggle('hidden');
window.mudarFeed = (tipo) => carregarFeed(tipo);
window.abrirPostagem = () => mostrarTela('form-post');
window.gerenciarBotaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) verPerfilPublico(session.user.id); else mostrarTela('auth-screen');
};

async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) { mostrarTela('feed-container'); carregarFeed(); } else { mostrarTela('auth-screen'); }
}

window.tentarLogar = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else window.location.reload();
};

window.fazerLogout = async () => { if(confirm("Sair?")) { await _supabase.auth.signOut(); location.reload(); }};
