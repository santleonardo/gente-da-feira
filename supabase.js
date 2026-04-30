// ============================================================
// supabase.js — Cliente Supabase para Gente da Feira
// Importado em todas as páginas que precisam de dados
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ⚠️ SUBSTITUA pelos valores do seu projeto Supabase:
// Painel Supabase → Settings → API → Project URL e anon public key
const SUPABASE_URL = 'https://slifhevopqytdlhvvtsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaWZoZXZvcHF5dGRsaHZ2dHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzk5MzAsImV4cCI6MjA5MjkxNTkzMH0.eYssLQsdushsZZ15qtZD-Dj8RaqrtE1J_Cc_u9UP-ok';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================

/** Retorna o usuário logado atualmente (ou null) */
export async function getUsuarioAtual() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Faz login com email + senha */
export async function loginEmail(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

/** Cadastra novo usuário */
export async function cadastrar(email, senha, nome) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } }
  });
  if (error) throw error;
  return data;
}

/** Desloga o usuário */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============================================================
// BAIRROS
// ============================================================

/** Lista todos os bairros ativos (agora com coordenadas) */
export async function listarBairros() {
  const { data, error } = await supabase
    .from('bairros')
    .select('*')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return data;
}

// ============================================================
// POSTS / FEED
// ============================================================

/**
 * Busca posts do feed com filtros opcionais
 * @param {object} opcoes
 * @param {string} opcoes.bairroSlug - ex: 'mangabeira'
 * @param {string} opcoes.categoriaSlug - ex: 'vagas', 'servicos', 'todos'
 * @param {string} opcoes.busca - texto de busca livre
 * @param {number} opcoes.limite - máx de resultados (padrão: 10)
 * @param {number} opcoes.pagina - para paginação (padrão: 0)
 */
export async function buscarPosts({ bairroSlug, categoriaSlug, busca, limite = 10, pagina = 0 } = {}) {
  let query = supabase
    .from('posts')
    .select(`
      id,
      titulo,
      descricao,
      imagem_url,
      preco_a_partir,
      contato_whatsapp,
      tags,
      destaque,
      visualizacoes,
      latitude,
      longitude,
      criado_em,
      autor:perfis(id, nome, avatar_url, whatsapp, is_profissional),
      bairro:bairros(id, nome, slug, latitude, longitude),
      categoria:categorias(id, nome, slug, icone, cor)
    `)
    .eq('ativo', true)
    .gte('expira_em', new Date().toISOString())
    // Filtra posts de usuarios banidos (shadowban handled by view posts_publicos)
    .not('autor.status', 'eq', 'banido')
    .order('destaque', { ascending: false })
    .order('criado_em', { ascending: false })
    .range(pagina * limite, (pagina + 1) * limite - 1);

  // Filtro por bairro
  if (bairroSlug && bairroSlug !== 'todos') {
    const { data: bairro } = await supabase
      .from('bairros')
      .select('id')
      .eq('slug', bairroSlug)
      .single();
    if (bairro) query = query.eq('bairro_id', bairro.id);
  }

  // Filtro por categoria
  if (categoriaSlug && categoriaSlug !== 'todos') {
    const { data: cat } = await supabase
      .from('categorias')
      .select('id')
      .eq('slug', categoriaSlug)
      .single();
    if (cat) query = query.eq('categoria_id', cat.id);
  }

  // Busca por texto (título ou descrição)
  // Sanitizar input para prevenir injeção de padrões ilike (% e _)
  if (busca && busca.trim().length >= 2) {
    const buscaSanitizada = busca.trim()
      .replace(/\\/g, '\\\\')  // Escapa barra invertida
      .replace(/%/g, '\\%')    // Escapa curinga %
      .replace(/_/g, '\\_');   // Escapa curinga _
    query = query.or(`titulo.ilike.%${buscaSanitizada}%,descricao.ilike.%${buscaSanitizada}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Busca um único post pelo ID (para página de detalhe)
 * @param {string} postId - UUID do post
 */
export async function buscarPostPorId(postId) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      titulo,
      descricao,
      imagem_url,
      preco_a_partir,
      contato_whatsapp,
      tags,
      destaque,
      visualizacoes,
      latitude,
      longitude,
      ativo,
      criado_em,
      expira_em,
      autor_id,
      autor:perfis(id, nome, avatar_url, whatsapp, is_profissional, bio),
      bairro:bairros(id, nome, slug, latitude, longitude),
      categoria:categorias(id, nome, slug, icone, cor)
    `)
    .eq('id', postId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Cria um novo post
 * @param {object} post - dados do post
 */
export async function criarPost({ titulo, descricao, categoriaId, bairroId, precoAPartir, contatoWhatsapp, tags, imagemUrl, latitude, longitude }) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Você precisa estar logado para publicar');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      titulo,
      descricao,
      categoria_id: categoriaId,
      bairro_id: bairroId,
      autor_id: user.id,
      preco_a_partir: precoAPartir || null,
      contato_whatsapp: contatoWhatsapp || null,
      tags: tags || [],
      imagem_url: imagemUrl || null,
      latitude: latitude || null,
      longitude: longitude || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Atualiza um post existente (só o autor pode)
 * @param {string} postId - UUID do post
 * @param {object} dados - campos a atualizar
 */
export async function atualizarPost(postId, dados) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('posts')
    .update(dados)
    .eq('id', postId)
    .eq('autor_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Exclui um post (só o autor pode)
 * @param {string} postId - UUID do post
 */
export async function excluirPost(postId) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('autor_id', user.id);

  if (error) throw error;
}

/**
 * Incrementa visualizações de um post
 * @param {string} postId - UUID do post
 */
export async function registrarVisualizacao(postId) {
  await supabase.rpc('incrementar_visualizacoes', { post_id: postId });
}

// ============================================================
// UPLOAD DE IMAGEM (Supabase Storage)
// ============================================================

/**
 * Comprime uma imagem antes do upload.
 * Redimensiona para max 1200px e comprime para JPEG qualidade 0.8.
 * @param {File} arquivo - O arquivo de imagem original
 * @returns {Promise<Blob>} Blob da imagem comprimida
 */
async function comprimirImagem(arquivo) {
  const LARGURA_MAX = 1200;
  const QUALIDADE = 0.8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Se a imagem já é pequena o suficiente, retornar como está
      if (img.width <= LARGURA_MAX && arquivo.size <= 1 * 1024 * 1024) {
        resolve(arquivo);
        return;
      }

      const canvas = document.createElement('canvas');
      let largura = img.width;
      let altura = img.height;

      // Redimensionar mantendo proporção
      if (largura > LARGURA_MAX) {
        altura = Math.round((altura * LARGURA_MAX) / largura);
        largura = LARGURA_MAX;
      }

      canvas.width = largura;
      canvas.height = altura;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, largura, altura);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Falha ao comprimir imagem'));
          }
        },
        'image/jpeg',
        QUALIDADE
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para compressão'));
    };

    img.src = url;
  });
}

/**
 * Faz upload de uma imagem para o bucket "post-imagens"
 * Comprime automaticamente antes de enviar.
 * @param {File} arquivo - O arquivo de imagem
 * @returns {string} URL pública da imagem
 */
export async function uploadImagemPost(arquivo) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  // Validação de tipo MIME — aceitar apenas imagens
  const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!TIPOS_PERMITIDOS.includes(arquivo.type)) {
    throw new Error('Tipo de arquivo não permitido. Envie apenas imagens (JPG, PNG, WebP ou GIF).');
  }

  // Validação de tamanho original — máximo 10MB (será comprimida)
  const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB original
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error('Imagem muito grande. O tamanho máximo é 10MB.');
  }

  // Comprimir imagem antes do upload
  const imagemComprimida = await comprimirImagem(arquivo);

  // Gerar nome único para o arquivo (sempre salvar como .jpg após compressão)
  const nomeArquivo = `${user.id}/${Date.now()}.jpg`;

  const { data, error } = await supabase.storage
    .from('post-imagens')
    .upload(nomeArquivo, imagemComprimida, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/jpeg',
    });

  if (error) throw error;

  // Retornar URL pública
  const { data: urlData } = supabase.storage
    .from('post-imagens')
    .getPublicUrl(nomeArquivo);

  return urlData.publicUrl;
}

// ============================================================
// UPLOAD DE AVATAR (Supabase Storage — bucket "avatars")
// ============================================================

/**
 * Faz upload de uma foto de avatar para o bucket "avatars".
 * Comprime automaticamente, sempre salva como avatar.jpg (sobrescreve).
 * Atualiza a coluna avatar_url no perfil automaticamente.
 * @param {File} arquivo - O arquivo de imagem
 * @returns {string} URL pública do avatar (com cache-buster)
 */
export async function uploadAvatar(arquivo) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!TIPOS_PERMITIDOS.includes(arquivo.type)) {
    throw new Error('Tipo de arquivo não permitido. Envie apenas imagens (JPG, PNG, WebP ou GIF).');
  }

  const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error('Imagem muito grande. O tamanho máximo é 5MB.');
  }

  const imagemComprimida = await comprimirImagem(arquivo);

  // Nome fixo: sempre avatar.jpg (sobrescreve o anterior via upsert)
  const nomeArquivo = `${user.id}/avatar.jpg`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(nomeArquivo, imagemComprimida, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/jpeg',
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(nomeArquivo);

  // Atualizar avatar_url no perfil
  await supabase
    .from('perfis')
    .update({ avatar_url: urlData.publicUrl, atualizado_em: new Date().toISOString() })
    .eq('id', user.id);

  // Retornar URL com cache-buster para forçar refresh no navegador
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

// ============================================================
// PERFIL DO USUÁRIO
// ============================================================

/**
 * Busca perfil completo de um usuário.
 * Se não existir, cria automaticamente a partir dos dados do auth.
 * @param {string} userId - UUID do usuário
 */
export async function buscarPerfil(userId) {
  const { data, error } = await supabase
    .from('perfis')
    .select(`*, bairro:bairros(id, nome, slug)`)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  // Se não existe perfil, criar um agora (fallback para o trigger)
  if (!data) {
    const { data: { user } } = await supabase.auth.getUser();
    const nome = user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Usuário';

    const { data: novoPerfil, error: erroInsert } = await supabase
      .from('perfis')
      .insert({ id: userId, nome })
      .select(`*, bairro:bairros(id, nome, slug)`)
      .single();

    if (erroInsert) throw erroInsert;
    return novoPerfil;
  }

  return data;
}

/**
 * Atualiza perfil do usuário logado
 * @param {object} dados - campos a atualizar
 */
export async function atualizarPerfil(dados) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('perfis')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================

/** Busca notificações do usuário logado */
export async function buscarNotificacoes() {
  const user = await getUsuarioAtual();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('usuario_id', user.id)
    .order('criado_em', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

/** Conta notificações não lidas */
export async function contarNaoLidas() {
  const user = await getUsuarioAtual();
  if (!user) return 0;

  const { count } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', user.id)
    .eq('lida', false);

  return count || 0;
}

/** Marca notificação como lida */
export async function marcarLida(notifId) {
  await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('id', notifId);
}

// ============================================================
// REALTIME (escuta por novos posts)
// ============================================================

/**
 * Escuta novos posts em tempo real no bairro selecionado
 * @param {string} bairroId - UUID do bairro
 * @param {function} callback - função chamada com o novo post
 * @returns {function} unsubscribe - chame para parar de escutar
 */
export function escutarNovosPosts(bairroId, callback) {
  const channel = supabase
    .channel('novos-posts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: `bairro_id=eq.${bairroId}`
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  // Retorna função para cancelar a escuta
  return () => supabase.removeChannel(channel);
}

// ============================================================
// CONVERSAS E MENSAGENS (Chat)
// ============================================================

/**
 * Busca ou cria uma conversa entre dois usuários
 * @param {string} outroUsuarioId - UUID do outro participante
 * @param {string} postId - UUID do post relacionado (opcional)
 * @returns {object} conversa
 */
export async function buscarOuCriarConversa(outroUsuarioId, postId = null) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  // Tentar buscar conversa existente
  const { data: existentes } = await supabase
    .from('conversas')
    .select('*')
    .or(`and(participante_1.eq.${user.id},participante_2.eq.${outroUsuarioId}),and(participante_1.eq.${outroUsuarioId},participante_2.eq.${user.id})`);

  if (existentes && existentes.length > 0) {
    return existentes[0];
  }

  // Criar nova conversa
  const { data, error } = await supabase
    .from('conversas')
    .insert({
      participante_1: user.id,
      participante_2: outroUsuarioId,
      post_id: postId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lista todas as conversas do usuario logado (sem N+1)
 * Usa RPC listar_conversas_com_resumo que retorna tudo em 1 query
 * @returns {Array} lista de conversas com ultima mensagem e dados dos participantes
 */
export async function listarConversas() {
  const user = await getUsuarioAtual();
  if (!user) return [];

  const { data, error } = await supabase.rpc('listar_conversas_com_resumo', {
    p_usuario_id: user.id
  });

  if (error) throw error;

  // Transformar resultado da RPC no formato esperado pelo frontend
  return (data || []).map(c => ({
    id: c.id,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
    outroPerfil: {
      id: c.outro_id,
      nome: c.outro_nome,
      avatar_url: c.outro_avatar_url,
    },
    post: c.post_id ? { id: c.post_id, titulo: c.post_titulo } : null,
    ultimaMensagem: c.ultima_mensagem_conteudo ? {
      conteudo: c.ultima_mensagem_conteudo,
      criado_em: c.ultima_mensagem_em,
    } : null,
    naoLidas: c.nao_lidas || 0,
  }));
}

/**
 * Busca mensagens de uma conversa
 * @param {string} conversaId - UUID da conversa
 * @param {number} limite - máx de mensagens
 */
export async function buscarMensagens(conversaId, limite = 50) {
  const { data, error } = await supabase
    .from('mensagens')
    .select(`
      id,
      conteudo,
      lida,
      criado_em,
      remetente_id,
      remetente:perfis!mensagens_remetente_id_fkey(id, nome, avatar_url)
    `)
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true })
    .limit(limite);

  if (error) throw error;
  return data || [];
}

/**
 * Envia uma mensagem em uma conversa
 * @param {string} conversaId - UUID da conversa
 * @param {string} conteudo - texto da mensagem
 */
export async function enviarMensagem(conversaId, conteudo) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      remetente_id: user.id,
      conteudo,
    })
    .select(`
      id,
      conteudo,
      lida,
      criado_em,
      remetente_id,
      remetente:perfis!mensagens_remetente_id_fkey(id, nome, avatar_url)
    `)
    .single();

  if (error) throw error;

  // Atualizar timestamp da conversa
  await supabase
    .from('conversas')
    .update({ atualizado_em: new Date().toISOString() })
    .eq('id', conversaId);

  // Notificar destinatário via RPC
  try {
    await supabase.rpc('notificar_nova_mensagem', {
      p_conversa_id: conversaId,
      p_remetente_id: user.id,
      p_conteudo: conteudo,
    });
  } catch (_) {
    // Silencioso — a notificação é bônus
  }

  return data;
}

/**
 * Marca mensagens de uma conversa como lidas
 * @param {string} conversaId - UUID da conversa
 */
export async function marcarMensagensLidas(conversaId) {
  const user = await getUsuarioAtual();
  if (!user) return;

  await supabase
    .from('mensagens')
    .update({ lida: true })
    .eq('conversa_id', conversaId)
    .neq('remetente_id', user.id)
    .eq('lida', false);
}

/**
 * Escuta novas mensagens em tempo real
 * @param {string} conversaId - UUID da conversa
 * @param {function} callback - função chamada com a nova mensagem
 * @returns {function} unsubscribe
 */
export function escutarNovasMensagens(conversaId, callback) {
  const channel = supabase
    .channel(`mensagens-${conversaId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `conversa_id=eq.${conversaId}`
      },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

/**
 * Salva a inscrição de push notification do usuário
 * @param {PushSubscription} subscription - objeto PushSubscription do navegador
 */
export async function salvarPushSubscription(subscription) {
  const user = await getUsuarioAtual();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      usuario_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
    }, { onConflict: 'endpoint' });

  if (error) throw error;
}

/**
 * Remove a inscrição de push notification
 * @param {string} endpoint - endpoint da subscription
 */
export async function removerPushSubscription(endpoint) {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) throw error;
}
