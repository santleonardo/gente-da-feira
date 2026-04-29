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

/** Lista todos os bairros ativos */
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
      preco_a_partir,
      contato_whatsapp,
      tags,
      destaque,
      visualizacoes,
      criado_em,
      autor:perfis(id, nome, avatar_url, whatsapp, is_profissional),
      bairro:bairros(id, nome, slug),
      categoria:categorias(id, nome, slug, icone, cor)
    `)
    .eq('ativo', true)
    .lte('expira_em', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()) // não expirado
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
  if (busca && busca.trim().length >= 2) {
    query = query.or(`titulo.ilike.%${busca}%,descricao.ilike.%${busca}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Conta posts por categoria em um bairro (para os badges do grid)
 * @param {string} bairroId - UUID do bairro
 */
export async function contarPostsPorCategoria(bairroId) {
  const { data, error } = await supabase
    .rpc('contar_posts_por_categoria', { p_bairro_id: bairroId })
    .select('*');

  // Fallback: query manual se RPC não existir
  if (error) {
    const { data: cats } = await supabase
      .from('categorias')
      .select('id, slug');
    
    const contagens = {};
    for (const cat of (cats || [])) {
      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('ativo', true)
        .eq('categoria_id', cat.id)
        .eq('bairro_id', bairroId);
      contagens[cat.slug] = count || 0;
    }
    return contagens;
  }
  return data;
}

/**
 * Cria um novo post
 * @param {object} post - dados do post
 */
export async function criarPost({ titulo, descricao, categoriaId, bairroId, precoAPartir, contatoWhatsapp, tags }) {
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
      tags: tags || []
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Incrementa visualizações de um post
 * @param {string} postId - UUID do post
 */
export async function registrarVisualizacao(postId) {
  await supabase.rpc('incrementar_visualizacoes', { post_id: postId });
}

// ============================================================
// PERFIL DO USUÁRIO
// ============================================================

/**
 * Busca perfil completo de um usuário
 * @param {string} userId - UUID do usuário
 */
export async function buscarPerfil(userId) {
  const { data, error } = await supabase
    .from('perfis')
    .select(`*, bairro:bairros(id, nome, slug)`)
    .eq('id', userId)
    .single();
  if (error) throw error;
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
