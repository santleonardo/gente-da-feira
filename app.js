/**
 * GENTE DA FEIRA - O HUB DE FEIRA DE SANTANA 2026
 * Versão: 4.8.0 (Unificação Total: Identidade, Storage & Social)
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

// --- NAVEGAÇÃO ---
function mostrarTela(id) {
    const telas = ['feed-container', 'auth-screen', 'user-dashboard', 'form-post', 'edit-profile-screen'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if(el) el.classList.add('hidden');
    });
    
    const ativa = document.getElementById(id);
    if (ativa) {
        ativa.classList.remove('hidden');
        ativa.classList.add('animate-fade-in');
        if (id !== 'auth-screen') document.getElementById('main-nav')?.classList.remove('hidden');
    }
}

function popularMenusBairros() {
    const selects = [document.getElementById('post-zona'), document.getElementById('edit-bairro')];
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = select.id === 'post-zona' ? '<option value="Geral">📍 Toda a Cidade</option>' : '';
        BAIRROS_FSA.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b; opt.textContent = b;
            select.appendChild(opt);
        });
    });
}

// --- SISTEMA DE IDENTIDADE (STORAGE & PROFILE) ---

window.abrirEdicaoPerfil = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    if(p) {
        document.getElementById('edit-username').value = p.username || "";
        document.getElementById('edit-bio').value = p.bio || "";
        document.getElementById('edit-bairro').value = p.bairro || "Centro";
        mostrarTela('edit-profile-screen');
    }
};

window.salvarPerfilCompleto = async () => {
    const btn = document.getElementById('btn-save-profile');
    const fileInput = document.getElementById('input-file');
    const username = document.getElementById('edit-username').value;
    const bio = document.getElementById('edit-bio').value;
    const bairro = document.getElementById('edit-bairro').value;

    btn.disabled = true;
    btn.innerText = "Sincronizando...";

    const { data: { session } } = await _supabase.auth.getSession();
    let avatar_url = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await _supabase.storage
            .from('avatars')
            .upload(fileName, file);

        if (!uploadError) {
            const { data: { publicUrl } } = _supabase.storage.from('avatars').getPublicUrl(fileName);
            avatar_url = publicUrl;
        }
    }

    const updates = {
        id: session.user.id,
        username,
        bio,
        bairro,
        updated_at: new Date()
    };
    if(avatar_url) updates.avatar_url = avatar_url;

    const { error } = await _supabase.from('profiles').upsert(updates);

    if (error) {
        alert("Erro: " + error.message);
        btn.disabled = false;
        btn.innerText = "Guardar Alterações";
    } else {
        location.reload();
    }
};

window.verPerfilPublico = async (uid) => {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    const { data: posts } = await _supabase.from('posts').select('id').eq('user_id', uid);

    if (p) {
        document.getElementById('dash-nome').innerText = p.username || "Morador";
        document.getElementById('dash-bairro').innerText = p.bairro || "Feira de Santana";
        document.getElementById('dash-bio').innerText = p.bio || "Olá, sou de Feira!";
        document.getElementById('dash-count').innerText = posts?.length || 0;
        
        const img = document.getElementById('img-perfil');
        const fallback = document.getElementById('avatar-fallback');
        
        if(p.avatar_url) {
            img.src = p.avatar_url;
            img.classList.remove('hidden');
            fallback.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
        }

        const { data: { session } } = await _supabase.auth.getSession();
        const editArea = document.getElementById('edit-button-area');
        if(editArea) {
            editArea.innerHTML = (session && session.user.id === uid) 
                ? `<button onclick="abrirEdicaoPerfil()" class="mt-4 bg-feira-yellow text-feira-marinho px-6 py-2 rounded-xl font-black text-[10px] uppercase shadow-md">Editar Perfil</button>`
                : '';
        }

        mostrarTela('user-dashboard');
    }
};

// --- FEED ENGINE ---
async function carregarFeed() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="text-center p-10 opacity-30 font-black text-xs uppercase tracking-widest">Buscando em Feira...</div>';

    const { data: posts, error } = await _supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, bairro, avatar_url),
            reactions (emoji_type, user_id),
            comments (*, profiles:user_id (username))
        `)
        .order('created_at', { ascending: false });

    if (!error) renderizarFeed(posts || [], container);
}

function renderizarFeed(posts, container) {
    container.innerHTML = "";
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 mb-6 animate-fade-in";
        
        const avatar = post.profiles?.avatar_url 
            ? `<img src="${post.profiles.avatar_url}" class="w-full h-full object-cover">`
            : `<span class="font-black text-feira-marinho">${(post.profiles?.username || 'M')[0].toUpperCase()}</span>`;

        const reacoesHtml = EMOJIS.map(emoji => {
            const count = post.reactions?.filter(r => r.emoji_type === emoji).length || 0;
            return `<button onclick="reagir('${post.id}', '${emoji}')" class="flex items-center gap-1 active:scale-125 transition-transform">
                <span class="text-sm">${emoji}</span>
                <span class="text-[10px] font-black text-gray-400">${count || ''}</span>
            </button>`;
        }).join('');

        postEl.innerHTML = `
            <div class="flex items-center gap-4 mb-5">
                <div onclick="verPerfilPublico('${post.user_id}')" class="w-12 h-12 rounded-2xl bg-feira-yellow flex items-center justify-center shadow-md cursor-pointer overflow-hidden border-2 border-white">
                    ${avatar}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <h4 class="font-black text-feira-marinho text-sm">${post.profiles?.username || 'Morador'}</h4>
                        <span class="text-[9px] font-black bg-gray-50 px-2 py-1 rounded-lg text-gray-400 uppercase tracking-tighter">${post.zona}</span>
                    </div>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-6 leading-relaxed">${post.content}</p>
            <div class="flex items-center justify-between pt-5 border-t border-gray-50">
                <div class="flex gap-4">${reacoesHtml}</div>
                <button onclick="abrirThreads('${post.id}')" class="text-[10px] font-black uppercase text-feira-marinho bg-feira-yellow/20 px-4 py-2 rounded-xl">Conversa (${post.comments?.length || 0})</button>
            </div>
            <div id="thread-${post.id}" class="hidden mt-4 space-y-2 pt-4 border-t border-dashed border-gray-100">
                ${post.comments?.map(c => `<div class="text-xs bg-gray-50 p-3 rounded-2xl"><b>${c.profiles?.username || 'User'}:</b> ${c.content}</div>`).join('')}
                <div class="flex gap-2 pt-2">
                    <input id="in-${post.id}" type="text" placeholder="Responder..." class="flex-1 text-xs bg-gray-50 border-none rounded-xl p-3 outline-none">
                    <button onclick="comentar('${post.id}')" class="bg-feira-marinho text-white text-[9px] px-4 rounded-xl font-bold uppercase">OK</button>
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
    if (!input.value || !session) return;
    await _supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: input.value });
    input.value = "";
    carregarFeed();
};

window.enviarPost = async () => {
    const content = document.getElementById('post-content').value;
    const zona = document.getElementById('post-zona').value;
    const { data: { session } } = await _supabase.auth.getSession();
    if(!content || !session) return;
    await _supabase.from('posts').insert({ content, zona, user_id: session.user.id });
    document.getElementById('post-content').value = "";
    mostrarTela('feed-container');
    carregarFeed();
};

window.abrirThreads = (id) => document.getElementById(`thread-${id}`).classList.toggle('hidden');
window.mudarFeed = (tipo) => { mostrarTela('feed-container'); carregarFeed(); };
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

window.previewImagem = (event) => {
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.querySelector('#edit-profile-screen .w-24.h-24');
        preview.style.backgroundImage = `url(${reader.result})`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    };
    reader.readAsDataURL(event.target.files[0]);
};
