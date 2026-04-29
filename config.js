// 1. DEFINIÇÃO DAS CHAVES
const SUPABASE_URL = "https://slifhevopqytdlhvvtsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok"; 

// 2. INICIALIZAÇÃO SEGURA
let _supabase;

function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error("Supabase não carregado ainda. Aguardando...");
        setTimeout(initSupabase, 100);
        return;
    }
    
    try {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        console.log("✅ Motor Supabase sintonizado.");
    } catch (e) {
        console.error("❌ Erro na ignição do Supabase:", e);
    }
}

// Inicializar assim que o script carregar
initSupabase();

// --- FUNÇÕES TÉCNICAS E MÁSCARAS ---

window.aplicarMascaraWhatsapp = function(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    if (value.length > 7) {
        value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
        value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    }
    input.value = value;
};

// Função para sanitizar HTML e prevenir XSS
window.sanitizeHTML = function(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// --- NAVEGAÇÃO E MODAIS ---

window.abrirModalPost = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (!session) {
        const email = prompt("Você precisa estar logado para publicar. Digite seu e-mail:");
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert("Por favor, digite um e-mail válido.");
                return;
            }
            window.login(email);
        }
        return;
    }
    
    const modal = document.getElementById('modal-post');
    if (modal) modal.showModal();
};

window.abrirPerfil = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        const email = prompt("Digite seu e-mail para entrar:");
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert("Por favor, digite um e-mail válido.");
                return;
            }
            window.login(email);
        }
    } else {
        const modal = document.getElementById('modal-perfil');
        if (modal) {
            modal.showModal();
            window.carregarDadosPerfil();
        }
    }
};

window.toggleEditMode = function() {
    document.getElementById('view-perfil-mode').classList.toggle('hidden');
    document.getElementById('form-perfil').classList.toggle('hidden');
};

// --- AUTENTICAÇÃO ---

window.login = async function(email) {
    // Detectar automaticamente a URL base do site
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
    
    const { error } = await _supabase.auth.signInWithOtp({ 
        email,
        options: {
            emailRedirectTo: baseUrl
        }
    });
    
    if (error) alert("Erro: " + error.message);
    else {
        alert("Verifique seu e-mail para o link de acesso!");
        // Atualizar status quando usuário voltar do email
        _supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                window.atualizarStatusAuth();
                window.carregarFeed();
            }
        });
    }
};

window.logout = async function() {
    await _supabase.auth.signOut();
    location.reload();
};

// Atualizar status de autenticação no header
window.atualizarStatusAuth = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    const statusEl = document.getElementById('auth-status');
    const btnPerfil = document.getElementById('btn-perfil');
    
    if (!statusEl || !btnPerfil) return;
    
    if (session) {
        const { data: perfil } = await _supabase.from('perfis')
            .select('nome')
            .eq('id', session.user.id)
            .single();
        
        statusEl.innerHTML = `<span class="text-xs font-bold">Olá, ${window.sanitizeHTML(perfil?.nome || 'Usuário')}!</span>`;
        btnPerfil.querySelector('span').innerText = 'Perfil';
        btnPerfil.classList.remove('opacity-60');
    } else {
        statusEl.innerHTML = '';
        btnPerfil.querySelector('span').innerText = 'Entrar';
        btnPerfil.classList.add('opacity-60');
    }
};

// --- GESTÃO DO FEED ---

window.carregarFeed = async function(bairro = 'Feira Toda') {
    const feed = document.getElementById('feed');
    if (!feed) return;
    
    feed.innerHTML = '<p class="text-center py-10 opacity-50 font-bold uppercase text-[10px] animate-pulse">Sintonizando Feira...</p>';

    let query = _supabase.from('avisos').select('*, perfis(nome, avatar_url), reacoes(id, user_id)').order('created_at', { ascending: false });
    if (bairro !== 'Feira Toda') query = query.eq('bairro_alvo', bairro);

    const { data: avisos, error } = await query;
    if (error) {
        console.error("Erro no feed:", error);
        feed.innerHTML = '<p class="text-center py-10 text-red-500 font-bold">Erro ao carregar avisos.</p>';
        return;
    }

    feed.innerHTML = '';
    const { data: { session } } = await _supabase.auth.getSession();

    avisos.forEach(aviso => {
        const totalApoios = aviso.reacoes ? aviso.reacoes.length : 0;
        const jaApoiou = session && aviso.reacoes?.some(r => r.user_id === session.user.id);
        const ehDono = session && aviso.autor_id === session.user.id;

        feed.innerHTML += `
            <div class="p-6 rounded-2xl bg-white shadow-sm border-l-4 border-cinza mb-4">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-[9px] font-black bg-marinho text-white px-2 py-0.5 rounded uppercase">${window.sanitizeHTML(aviso.categoria)}</span>
                    <div class="flex gap-2">
                        <span class="text-[9px] font-bold text-gray-300 uppercase">${window.sanitizeHTML(aviso.bairro_alvo)}</span>
                        ${ehDono ? `<button onclick="window.apagarAviso(${aviso.id})" class="text-[9px] font-black text-red-400 uppercase tracking-tighter">Apagar</button>` : ''}
                    </div>
                </div>
                <h3 class="font-bold text-marinho leading-tight mb-2">${window.sanitizeHTML(aviso.titulo)}</h3>
                <p class="text-sm text-gray-600 mb-4">${window.sanitizeHTML(aviso.conteudo)}</p>
                <div class="flex justify-between items-center pt-3 border-t border-gray-50">
                    <div class="flex items-center gap-2">
                        <img src="${aviso.perfis?.avatar_url || 'https://via.placeholder.com/30'}" class="w-5 h-5 rounded-full object-cover" onerror="this.src='https://via.placeholder.com/30'">
                        <span class="text-[9px] font-bold text-marinho/60 uppercase">${window.sanitizeHTML(aviso.perfis?.nome || 'Anônimo')}</span>
                    </div>
                    <button onclick="window.toggleApoio(${aviso.id})" class="text-[10px] font-black uppercase ${jaApoiou ? 'text-amarelo' : 'text-marinho'}">
                        ${jaApoiou ? '🙌 Apoiado' : '🙌 Apoiar'} (${totalApoios})
                    </button>
                </div>
            </div>`;
    });
};

window.filtrar = function(bairro) {
    const botoes = document.querySelectorAll('.btn-bairro');
    botoes.forEach(btn => {
        btn.classList.remove('bg-marinho', 'text-white');
        btn.classList.add('bg-white', 'text-marinho', 'border-cinza');
    });
    const ativo = [...botoes].find(btn => btn.innerText === bairro);
    if (ativo) {
        ativo.classList.remove('bg-white', 'text-marinho');
        ativo.classList.add('bg-marinho', 'text-white');
    }
    window.carregarFeed(bairro);
};

window.apagarAviso = async function(id) {
    if (!confirm("Deseja mesmo remover este aviso?")) return;
    const { error } = await _supabase.from('avisos').delete().eq('id', id);
    if (error) alert("Erro ao apagar: " + error.message);
    else window.carregarFeed();
};

window.toggleApoio = async function(avisoId) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return alert("Entre para apoiar!");

    const { data: existe } = await _supabase.from('reacoes').select('id').eq('aviso_id', avisoId).eq('user_id', session.user.id).single();

    if (existe) await _supabase.from('reacoes').delete().eq('id', existe.id);
    else await _supabase.from('reacoes').insert([{ aviso_id: avisoId, user_id: session.user.id }]);
    
    window.carregarFeed();
};

// --- GESTÃO DE PERFIL ---

window.carregarDadosPerfil = async function() {
    const { data: { session } } = await _supabase.auth.getSession();
    const { data: perfil, error } = await _supabase.from('perfis').select('*').eq('id', session.user.id).single();
    
    if (error) {
        console.error("Erro ao carregar perfil:", error);
        if (error.code === 'PGRST116') {
            document.getElementById('perfil-nome').innerText = "Novo Integrante";
            document.getElementById('perfil-bairro').innerText = "Feira de Santana";
            document.getElementById('perfil-bio').innerText = "Complete seu perfil!";
        }
        return;
    }
    
    if (perfil) {
        document.getElementById('perfil-nome').innerText = perfil.nome || "Novo Integrante";
        document.getElementById('perfil-bairro').innerText = perfil.bairro || "Feira de Santana";
        document.getElementById('perfil-bio').innerText = perfil.bio || "Olá!";
        if (perfil.avatar_url) {
            document.getElementById('perfil-avatar').innerHTML = `<img src="${perfil.avatar_url}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span class=\\'text-gray-300 text-3xl\\'>👤</span>'">`;
        }
        
        document.getElementById('edit-nome').value = perfil.nome || "";
        document.getElementById('edit-whatsapp').value = perfil.whatsapp || "";
        document.getElementById('edit-bio').value = perfil.bio || "";
        document.getElementById('edit-bairro').value = perfil.bairro || "Tomba";
    }
};

window.salvarPerfil = async function(e) {
    e.preventDefault();
    const { data: { session } } = await _supabase.auth.getSession();
    const fileInput = document.getElementById('edit-avatar-file');
    let avatarUrl = document.getElementById('perfil-avatar').querySelector('img')?.src;

    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        
        // Validar tamanho (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("A imagem deve ter no máximo 5MB");
            return;
        }
        
        // Validar tipo
        const tiposPermitidos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!tiposPermitidos.includes(file.type)) {
            alert("Formato inválido. Use JPG, PNG ou WEBP");
            return;
        }
        
        const fileName = `${session.user.id}/${Date.now()}.${file.name.split('.').pop()}`;
        const { error: upError } = await _supabase.storage.from('avatars').upload(fileName, file);
        
        if (upError) {
            console.error("Erro no upload:", upError);
            alert("Erro ao fazer upload da imagem: " + upError.message);
            return;
        }
        
        const { data } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
    }

    const { error } = await _supabase.from('perfis').upsert({
        id: session.user.id,
        nome: document.getElementById('edit-nome').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
        bio: document.getElementById('edit-bio').value,
        bairro: document.getElementById('edit-bairro').value,
        avatar_url: avatarUrl,
        updated_at: new Date()
    });

    if (error) alert(error.message);
    else { 
        alert("Perfil Salvo!"); 
        window.toggleEditMode(); 
        window.carregarDadosPerfil();
        window.atualizarStatusAuth();
    }
};

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Inicializando Gente da Feira...");
    
    window.atualizarStatusAuth();
    window.carregarFeed();
    
    // Escuta Mascara Zap
    const zapInput = document.getElementById('edit-whatsapp');
    if (zapInput) zapInput.addEventListener('input', (e) => window.aplicarMascaraWhatsapp(e.target));

    // Escuta Form Post
    const formPost = document.getElementById('form-post');
    if (formPost) formPost.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = formPost.querySelector('button[type="submit"]');
        const textoOriginal = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'PUBLICANDO...';
        
        try {
            const { data: { session } } = await _supabase.auth.getSession();
            const formData = new FormData(formPost);
            const { error } = await _supabase.from('avisos').insert([{
                titulo: formData.get('titulo'),
                conteudo: formData.get('conteudo'),
                categoria: formData.get('categoria'),
                bairro_alvo: formData.get('bairro_alvo'),
                autor_id: session.user.id
            }]);
            
            if (error) throw error;
            
            formPost.reset(); 
            document.getElementById('modal-post').close(); 
            window.carregarFeed();
        } catch (error) {
            alert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = textoOriginal;
        }
    });

    // Escuta Form Perfil
    const formPerfil = document.getElementById('form-perfil');
    if (formPerfil) formPerfil.addEventListener('submit', window.salvarPerfil);
    
    console.log("✅ Gente da Feira pronta!");
});
