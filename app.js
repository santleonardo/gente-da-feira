console.log("Sistema Gente da Feira - Versão Estabilizada");

const SUPABASE_URL = 'https://oecoggegxlortfcsnagd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bAMTltQrNtH5oFtdgI2tZA_7TNIpXEb';

let _supabase;

// --- 1. INICIALIZAÇÃO ---
async function inicializar() {
    if (typeof supabase !== 'undefined') {
        try {
            _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("Supabase Conectado!");
            await carregarFeed();
        } catch (e) {
            console.error("Erro ao conectar Supabase:", e);
        }
    } else {
        setTimeout(inicializar, 500);
    }
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', inicializar);

// --- 2. NAVEGAÇÃO ---
function mostrarTela(telaId) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-perfil', 'form-post'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const ativa = document.getElementById(telaId);
    if (ativa) ativa.classList.remove('hidden');
}

// --- 3. FEED ---
async function carregarFeed(tipo = 'global') {
    const container = document.getElementById('feed-container');
    if (!container) return;
    
    mostrarTela('feed-container');
    container.innerHTML = "<p class='text-center py-10 text-gray-400 italic'>Buscando novidades em Feira...</p>";

    try {
        let { data: posts, error } = await _supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (tipo === 'zona') {
            const { data: { session } } = await _supabase.auth.getSession();
            if (session) {
                const { data: p } = await _supabase.from('profiles').select('bairro').eq('id', session.user.id).single();
                if (p) posts = posts.filter(item => item.zona === p.bairro);
            } else {
                alert("Faça login para ver seu bairro!");
                return mudarFeed('global');
            }
        }

        if (!posts || posts.length === 0) {
            container.innerHTML = "<p class='text-center py-10 text-gray-400'>Nenhum aviso no momento.</p>";
            return;
        }

        container.innerHTML = posts.map(post => `
            <div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-red-700">
                <div class="flex items-center gap-3 mb-2 cursor-pointer" onclick="verPerfilPublico('${post.user_id}')">
                    <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-xs">👤</div>
                    <div>
                        <p class="font-bold text-red-700 text-sm leading-none">${post.author_name}</p>
                        <p class="text-[9px] text-gray-400 uppercase mt-1 font-bold">${post.zona}</p>
                    </div>
                </div>
                <p class="text-gray-700 text-sm">${post.content}</p>
            </div>
        `).join('');

    } catch (err) {
        console.error("Erro no feed:", err);
        container.innerHTML = "<p class='text-center py-10 text-red-500'>Erro ao carregar o feed.</p>";
    }
}

// --- 4. FUNÇÕES GLOBAIS (Para o HTML encontrar) ---
window.mudarFeed = function(t) {
    const tg = document.getElementById('tab-global');
    const tz = document.getElementById('tab-zona');
    if(tg) tg.classList.toggle('active-tab', t === 'global');
    if(tz) tz.classList.toggle('active-tab', t === 'zona');
    carregarFeed(t);
};

window.abrirPostagem = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    mostrarTela('form-post');
};

window.gerenciarBotaoPerfil = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return mostrarTela('auth-screen');
    verPerfilPublico(session.user.id);
};

window.verPerfilPublico = async function(userId) {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (!p) return alert("Perfil não encontrado.");
    
    if (document.getElementById('dash-nome')) document.getElementById('dash-nome').innerText = p.username;
    if (document.getElementById('dash-bairro')) document.getElementById('dash-bairro').innerText = "Morador de " + p.bairro;
    if (document.getElementById('dash-bio')) document.getElementById('dash-bio').innerText = p.bio || "";
    
    mostrarTela('user-dashboard');
};

window.toggleForm = () => mostrarTela('feed-container');

// --- 5. AUTH (Básico) ---
window.fazerLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else location.reload();
};

window.loginGitHub = async () => {
    await _supabase.auth.signInWithOAuth({ provider: 'github' });
};
