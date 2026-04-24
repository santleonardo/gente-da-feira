console.log("Sistema Gente da Feira - Versão 2.0");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY29nZ2VneGxvcnRmY3NuYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc1MDM1OTUsImV4cCI6MjA1MzA3OTU5NX0.D9-b05xtFzJB0lRD0rrmfbM69fWJQsJyvqWREgCaCf0';

let _supabase;

// --- ESTADO GLOBAL DE NAVEGAÇÃO ---
const estado = {
    feedTipo: 'global',      // tipo de feed ativo
    feedScroll: 0,           // posição do scroll ao sair do feed
    ultimoPost: null,        // ID do último post publicado
};

// --- BAIRROS DE FEIRA DE SANTANA ---
const BAIRROS = [
    "Aeroporto", "Asa Branca", "Aviário", "Baraúnas", "Brasília",
    "Campo Limpo", "Capuchinhos", "Centro", "Cidade Nova", "Conceição",
    "Construção", "Corpo Santo", "Feira VI", "Feira VII", "Feira VIII",
    "Feira IX", "Feira X", "Feira XI", "Feira XII", "George Américo",
    "Governador João Durval", "Gravatá", "Humildes", "Invasão do Papagaio",
    "Jardim Acácia", "Jardim Cruzeiro", "Jardim Esperança", "Jardim Imburana",
    "João Durval Carneiro", "Limoeiro", "Mangabeira", "Muchila", "Novo Horizonte",
    "Olhos d'Água", "Pampalona", "Papagaio", "Parque Ipê", "Parque Oeste",
    "Ponto Central", "Queimadinha", "Renato Gonçalves", "Rua Nova",
    "Santa Mônica", "Santo Antônio dos Prazeres", "São Benedito",
    "São João", "Serraria Brasil", "SIM", "Sobradinho", "Subaé",
    "Tomba", "Tomba II", "Zona Rural"
].sort();

// --- 1. INICIALIZAÇÃO ---
function inicializarSupabase() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase conectado!");
        popularSelectsBairro();
        verificarHashURL();
        carregarFeed(estado.feedTipo);
    } else {
        setTimeout(inicializarSupabase, 500);
    }
}
document.addEventListener('DOMContentLoaded', inicializarSupabase);

// Popula todos os <select> de bairro dinamicamente
function popularSelectsBairro() {
    const selects = ['perfil-bairro', 'post-zona'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = BAIRROS.map(b => `<option value="${b}">${b}</option>`).join('');
    });
}

// --- 2. NAVEGAÇÃO POR ESTADO (sem location.reload) ---
function mostrarTela(telaAtiva) {
    // Salva scroll antes de sair do feed
    if (document.getElementById('feed-container') &&
        !document.getElementById('feed-container').classList.contains('hidden')) {
        estado.feedScroll = window.scrollY;
    }
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaAtiva);
    if (ativa) ativa.classList.remove('hidden');

    // Restaura scroll ao voltar para o feed
    if (telaAtiva === 'feed-container') {
        setTimeout(() => window.scrollTo(0, estado.feedScroll), 50);
    }
}

function voltarParaFeed() {
    mostrarTela('feed-container');
}

// SEGURANÇA: Escapa HTML para evitar XSS
function escaparHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// Timestamp inteligente
function tempoRelativo(dateStr) {
    const agora = new Date();
    const data = new Date(dateStr);
    const diff = Math.floor((agora - data) / 1000); // segundos

    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'ontem';
    if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
    return data.toLocaleDateString('pt-BR');
}

// Loading em botão
function setBotaoLoading(id, loading, textoOriginal, textoLoading = 'Aguarde...') {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerText = loading ? textoLoading : textoOriginal;
    btn.style.opacity = loading ? '0.6' : '1';
}

// Contador de caracteres
function atualizarContador() {
    const el = document.getElementById('post-content');
    const contador = document.getElementById('contador-caracteres');
    if (el && contador) {
        contador.innerText = `${el.value.length}/500`;
    }
}

// --- 3. FEED ---
async function carregarFeed(tipo = 'global') {
    estado.feedTipo = tipo;
    mostrarTela('feed-container');
    const container = document.getElementById('feed-container');
    container.innerHTML = "<p class='text-center text-gray-400 py-10 italic'>Buscando novidades...</p>";

    // Atualiza abas
    document.getElementById('tab-global')?.classList.toggle('active-tab', tipo === 'global');
    document.getElementById('tab-zona')?.classList.toggle('active-tab', tipo === 'zona');

    let query = _supabase
        .from('posts')
        .select(`
            id, content, zona, author_name, user_id, created_at,
            profiles!posts_user_id_fkey(avatar_url),
            reactions(emoji_type),
            comments(id, author_name, content, created_at)
        `)
        .order('created_at', { ascending: false });

    if (tipo === 'zona') {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
            if (p?.bairro) query = query.eq('zona', p.bairro);
        } else {
            alert("Logue para ver seu bairro!");
            return carregarFeed('global');
        }
    }

    const { data: posts, error } = await query;
    if (error || !posts) return container.innerHTML = "<p class='text-center text-gray-400 py-10'>Erro ao carregar o feed.</p>";

    container.innerHTML = "";
    for (const post of posts) {
        container.innerHTML += renderizarCard(post);
    }

    // Rolar para post específico se vier de URL com hash
    if (estado.ultimoPost) {
        const el = document.getElementById(`post-${estado.ultimoPost}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); estado.ultimoPost = null; }
    }
}

// Renderiza um card de post
function renderizarCard(post) {
    const fotoHTML = post.profiles?.avatar_url
        ? `<img src="${escaparHTML(post.profiles.avatar_url)}" class="w-8 h-8 rounded-full border-2 border-indigo-500 object-cover">`
        : `<div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-bold">👤</div>`;

    const counts = { '💙': 0, '😊': 0, '👏': 0, '💡': 0 };
    post.reactions?.forEach(r => { if (counts[r.emoji_type] !== undefined) counts[r.emoji_type]++; });

    const comentariosHTML = post.comments?.length
        ? post.comments.map(c => `
            <div class="bg-indigo-50 p-2 rounded text-[10px] mb-1">
                <span class="font-bold text-indigo-700">${escaparHTML(c.author_name)}:</span>
                ${escaparHTML(c.content)}
            </div>`).join('')
        : '';

    const shareURL = `${location.origin}${location.pathname}#post-${post.id}`;

    return `
        <div id="post-${escaparHTML(post.id)}" class="bg-white p-4 rounded-lg shadow-sm mb-4 border-l-4 border-indigo-400">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2 cursor-pointer" onclick="verPerfilPublico('${escaparHTML(post.user_id)}')">
                    ${fotoHTML}
                    <div>
                        <p class="font-bold text-indigo-700 text-xs">${escaparHTML(post.author_name)}</p>
                        <p class="text-[9px] text-gray-400 uppercase font-medium">${escaparHTML(post.zona)}</p>
                    </div>
                </div>
                <span class="text-[9px] text-gray-400">${tempoRelativo(post.created_at)}</span>
            </div>
            <p class="text-gray-700 text-sm mb-4 leading-relaxed">${escaparHTML(post.content)}</p>
            <div class="flex justify-around border-t border-b py-2 mb-3 bg-gray-50 rounded">
                <button onclick="reagir('${post.id}', '💙')" class="text-sm hover:scale-110 transition-transform">💙 ${counts['💙']}</button>
                <button onclick="reagir('${post.id}', '😊')" class="text-sm hover:scale-110 transition-transform">😊 ${counts['😊']}</button>
                <button onclick="reagir('${post.id}', '👏')" class="text-sm hover:scale-110 transition-transform">👏 ${counts['👏']}</button>
                <button onclick="reagir('${post.id}', '💡')" class="text-sm hover:scale-110 transition-transform">💡 ${counts['💡']}</button>
                <button onclick="compartilhar('${escaparHTML(shareURL)}', '${escaparHTML(post.author_name)}')" class="text-sm hover:scale-110 transition-transform">🔗</button>
            </div>
            <div id="comentarios-${post.id}" class="mb-3">${comentariosHTML}</div>
            <div class="flex gap-2">
                <input type="text" id="in-coment-${post.id}" placeholder="Comentar..."
                    class="flex-1 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs outline-none focus:border-indigo-300"
                    maxlength="300">
                <button onclick="comentar('${post.id}')" class="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs hover:bg-indigo-700 transition-colors">OK</button>
            </div>
        </div>`;
}

// Atualiza só o card afetado (sem recarregar o feed inteiro)
async function atualizarCard(postId) {
    const { data: post, error } = await _supabase
        .from('posts')
        .select(`
            id, content, zona, author_name, user_id, created_at,
            profiles!posts_user_id_fkey(avatar_url),
            reactions(emoji_type),
            comments(id, author_name, content, created_at)
        `)
        .eq('id', postId)
        .single();

    if (error || !post) return;
    const cardEl = document.getElementById(`post-${postId}`);
    if (cardEl) cardEl.outerHTML = renderizarCard(post);
}

// --- 4. INTERAÇÕES ---
async function reagir(postId, emoji) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Logue para reagir!");
    await _supabase.from('reactions').upsert({
        post_id: postId, user_id: session.user.id, emoji_type: emoji
    });
    atualizarCard(postId); // só o card, não o feed inteiro
}

async function comentar(postId) {
    const { data: { session } } = await _supabase.auth.getSession();
    const input = document.getElementById(`in-coment-${postId}`);
    if (!session) return alert("Logue para comentar!");
    if (!input?.value.trim()) return alert("Escreva algo!");

    const { data: p } = await _supabase.from('profiles').select('username').eq('id', session.user.id).single();
    await _supabase.from('comments').insert({
        post_id: postId,
        user_id: session.user.id,
        author_name: p?.username || session.user.email,
        content: input.value.trim()
    });
    input.value = "";
    atualizarCard(postId); // só o card
}

// Compartilhar via Web Share API ou copiar link
function compartilhar(url, autor) {
    if (navigator.share) {
        navigator.share({ title: `Aviso de ${autor} — Gente da Feira`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert("Link copiado!"));
    }
}

// Verifica se a URL tem hash de post ao carregar
function verificarHashURL() {
    const hash = location.hash;
    if (hash && hash.startsWith('#post-')) {
        estado.ultimoPost = hash.replace('#post-', '');
    }
}

// --- 5. PERFIL ---
async function verPerfilPublico(userId) {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: posts } = await _supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (!p) return alert("Perfil não encontrado.");

    document.getElementById('dash-nome').innerText = p.username || 'Sem nome';
    document.getElementById('dash-bairro').innerText = p.bairro ? "Morador de " + p.bairro : '';
    document.getElementById('dash-bio').innerText = p.bio || "Sem bio.";
    document.getElementById('dash-count').innerText = posts ? posts.length : 0;

    const imgEl = document.getElementById('img-perfil');
    const emojiEl = document.getElementById('emoji-perfil');
    if (p.avatar_url) {
        imgEl.src = p.avatar_url;
        imgEl.classList.remove('hidden');
        emojiEl.classList.add('hidden');
    } else {
        imgEl.classList.add('hidden');
        emojiEl.classList.remove('hidden');
    }

    const histEl = document.getElementById('historico-posts');
    histEl.innerHTML = posts?.map(pt => `
        <div class="bg-indigo-50 p-3 rounded border-l-2 border-indigo-400 mb-2 text-xs">
            <span class="text-gray-400 text-[9px]">${tempoRelativo(pt.created_at)}</span>
            <p class="mt-1 text-gray-700">${escaparHTML(pt.content)}</p>
        </div>`).join('') || "Sem postagens.";

    const { data: { session } } = await _supabase.auth.getSession();
    const acoesEl = document.getElementById('dash-acoes');
    if (acoesEl) {
        acoesEl.classList.toggle('hidden', !(session && session.user.id === userId));
    }

    mostrarTela('user-dashboard');
}

// --- 6. AUTH & GESTÃO ---
async function gerenciarBotaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
}

async function abrirEdicaoPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (p) {
        document.getElementById('perfil-nome').value = p.username || '';
        document.getElementById('perfil-bairro').value = p.bairro || '';
        document.getElementById('perfil-bio').value = p.bio || '';
    }
    mostrarTela('form-perfil');
}

async function salvarPerfil() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const btn = document.getElementById('btn-salvar-perfil');
    if (btn) { btn.disabled = true; btn.innerText = 'Salvando...'; btn.style.opacity = '0.6'; }

    const { error } = await _supabase.from('profiles').upsert({
        id: session.user.id,
        username: document.getElementById('perfil-nome').value.trim(),
        bairro: document.getElementById('perfil-bairro').value,
        bio: document.getElementById('perfil-bio').value.trim(),
        updated_at: new Date()
    });

    if (btn) { btn.disabled = false; btn.innerText = 'Salvar'; btn.style.opacity = '1'; }

    if (error) alert(error.message);
    else { voltarParaFeed(); carregarFeed(estado.feedTipo); }
}

async function fazerLogout() {
    await _supabase.auth.signOut();
    estado.feedTipo = 'global';
    carregarFeed('global');
    mostrarTela('feed-container');
}

// --- 7. EXPOSIÇÃO GLOBAL ---
window.mudarFeed = (tipo) => carregarFeed(tipo);
window.atualizarContador = atualizarContador;

window.abrirPostagem = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    const { data: perfil } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
    if (perfil?.bairro) {
        const sel = document.getElementById('post-zona');
        if (sel) sel.value = perfil.bairro;
    }
    // Resetar contador de caracteres
    const contador = document.getElementById('contador-caracteres');
    if (contador) contador.innerText = '0/500';
    const textarea = document.getElementById('post-content');
    if (textarea) textarea.value = '';
    mostrarTela('form-post');
};

window.enviarPost = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');

    const contentEl = document.getElementById('post-content');
    const content = contentEl.value.trim();

    if (content.length < 10) return alert("O aviso precisa ter pelo menos 10 caracteres.");
    if (content.length > 500) return alert("O aviso não pode ter mais de 500 caracteres.");

    const btn = document.getElementById('btn-publicar');
    if (btn) { btn.disabled = true; btn.innerText = 'Publicando...'; btn.style.opacity = '0.6'; }

    const { data: perfil } = await _supabase.from('profiles').select('username').eq('id', session.user.id).single();
    const authorName = perfil?.username || session.user.email;

    const { data: novoPost, error } = await _supabase.from('posts').insert([{
        content,
        user_id: session.user.id,
        author_name: authorName,
        zona: document.getElementById('post-zona').value
    }]).select().single();

    if (error) {
        alert("Erro ao publicar: " + error.message);
        if (btn) { btn.disabled = false; btn.innerText = 'Publicar'; btn.style.opacity = '1'; }
        return;
    }

    contentEl.value = "";
    voltarParaFeed();
    await carregarFeed(estado.feedTipo);

    // Anti-flood: botão bloqueado por 30s após publicar
    if (btn) {
        let segundos = 30;
        const intervalo = setInterval(() => {
            segundos--;
            btn.innerText = `Aguarde ${segundos}s`;
            if (segundos <= 0) {
                clearInterval(intervalo);
                btn.disabled = false;
                btn.innerText = 'Publicar';
                btn.style.opacity = '1';
            }
        }, 1000);
    }

    // Rolar até o novo post
    if (novoPost) {
        setTimeout(() => {
            const el = document.getElementById(`post-${novoPost.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }
};

window.compartilhar = compartilhar;
window.gerenciarBotaoPerfil = gerenciarBotaoPerfil;
window.verPerfilPublico = verPerfilPublico;
window.abrirEdicaoPerfil = abrirEdicaoPerfil;
window.salvarPerfil = salvarPerfil;
window.reagir = reagir;
window.comentar = comentar;
window.fazerLogout = fazerLogout;
window.voltarParaFeed = voltarParaFeed;

window.fazerLogin = async () => {
    const btn = document.getElementById('btn-entrar');
    if (btn) { btn.disabled = true; btn.innerText = 'Entrando...'; btn.style.opacity = '0.6'; }

    const { error } = await _supabase.auth.signInWithPassword({
        email: document.getElementById('auth-email').value,
        password: document.getElementById('auth-password').value
    });

    if (btn) { btn.disabled = false; btn.innerText = 'Entrar'; btn.style.opacity = '1'; }

    if (error) alert(error.message);
    else { gerenciarBotaoPerfil(); }
};

window.fazerCadastro = async () => {
    const btn = document.getElementById('btn-cadastrar');
    if (btn) { btn.disabled = true; btn.innerText = 'Cadastrando...'; btn.style.opacity = '0.6'; }

    const { error } = await _supabase.auth.signUp({
        email: document.getElementById('auth-email').value,
        password: document.getElementById('auth-password').value
    });

    if (btn) { btn.disabled = false; btn.innerText = 'Cadastrar'; btn.style.opacity = '1'; }

    if (error) alert(error.message);
    else alert("Confirme seu e-mail para ativar a conta!");
};

window.toggleForm = () => voltarParaFeed();
window.loginGitHub = async () => { await _supabase.auth.signInWithOAuth({ provider: 'github' }); };
