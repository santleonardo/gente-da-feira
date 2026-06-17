/**
 * SEC-002: Helper de verificação de filiação em salas.
 *
 * Centraliza TODAS as verificações de autorização relacionadas a salas.
 * Deve ser usado por TODOS os endpoints /api/rooms/[id]/* antes de
 * qualquer operação de leitura ou escrita.
 *
 * Defesa em profundidade:
 *   - Este helper valida no nível da API Route (camada de aplicação)
 *   - As RLS policies (ver supabase/sql/) validam no nível do banco
 *   - Mesmo que uma API futura esqueça de chamar o helper, o banco bloqueia
 *
 * Nunca use createAdminClient() com dados de salas — sempre o createClient()
 * autenticado do usuário, para que o RLS seja aplicado.
 */

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RoomRole = "creator" | "moderator" | "member" | null;

export interface RoomMembership {
  /** true se o usuário é membro ativo (não banido) */
  isMember: boolean;
  /** true se o usuário está banido desta sala */
  isBanned: boolean;
  /** Role do usuário na sala (creator/moderator/member) ou null */
  role: RoomRole;
  /** true se a sala existe e está ativa */
  roomExists: boolean;
  /** true se a sala está ativa (is_active = true) */
  roomIsActive: boolean;
  /** true se a sala está aberta para novos membros (is_open = true) */
  roomIsOpen: boolean;
  /** true se a sala está cheia (member_count >= max_members) */
  isFull: boolean;
  /** Erro na consulta (para log, não para o cliente) */
  error?: string;
}

/**
 * Verifica a filiação de um usuário em uma sala em uma única consulta.
 *
 * @param roomId - UUID da sala
 * @param userId - UUID do usuário autenticado
 * @returns Objeto RoomMembership com todas as flags de autorização
 */
export async function checkRoomMembership(
  roomId: string,
  userId: string
): Promise<RoomMembership> {
  const supabase = await createClient();

  // Consulta paralela: dados da sala + membership do usuário
  const [roomRes, memberRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, is_active, is_open, max_members, member_count")
      .eq("id", roomId)
      .maybeSingle(),
    supabase
      .from("room_members")
      .select("role, is_banned, banned_until")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // Se a sala não existe ou não pode ser vista (RLS bloqueia), retorna falso para tudo
  if (roomRes.error || !roomRes.data) {
    return {
      isMember: false,
      isBanned: false,
      role: null,
      roomExists: false,
      roomIsActive: false,
      roomIsOpen: false,
      isFull: false,
      error: roomRes.error?.message,
    };
  }

  const room = roomRes.data;
  const member = memberRes.data;

  // Verificar se banimento expirou
  let isBanned = member?.is_banned === true;
  if (isBanned && member?.banned_until) {
    const until = new Date(member.banned_until);
    if (until < new Date()) {
      // Banimento expirou — considerar como não banido
      isBanned = false;
    }
  }

  const isMember = !!member && !isBanned;
  const maxMembers = room.max_members;
  const memberCount = room.member_count ?? 0;
  const isFull = maxMembers !== null && memberCount >= maxMembers;

  return {
    isMember,
    isBanned,
    role: (member?.role as RoomRole) ?? null,
    roomExists: true,
    roomIsActive: room.is_active === true,
    roomIsOpen: room.is_open !== false,
    isFull,
  };
}

/**
 * Verifica se o usuário pode LER mensagens da sala.
 * Regra: autenticado + membro ativo (não banido) + sala ativa.
 */
export async function canReadRoomMessages(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  const membership = await checkRoomMembership(roomId, userId);

  if (!membership.roomExists || !membership.roomIsActive) {
    return { allowed: false, reason: "Sala não encontrada ou inativa", membership };
  }
  if (membership.isBanned) {
    return { allowed: false, reason: "Você foi banido desta sala", membership };
  }
  if (!membership.isMember) {
    return { allowed: false, reason: "Você não é membro desta sala", membership };
  }
  return { allowed: true, membership };
}

/**
 * Verifica se o usuário pode ENVIAR mensagens na sala.
 * Regra: autenticado + membro ativo (não banido) + sala ativa.
 * (Regras adicionais como "sala silenciada" podem ser adicionadas aqui.)
 */
export async function canSendRoomMessage(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  // Mesmas regras de leitura por enquanto.
  // Se no futuro houver "sala somente leitura" ou "membros silenciados",
  // adicionar a verificação aqui.
  return canReadRoomMessages(roomId, userId);
}

/**
 * Verifica se o usuário pode ver a LISTA DE MEMBROS da sala.
 * Regra: deve ser membro ativo da própria sala.
 * Não-membros não devem conseguir enumerar participantes de salas privadas.
 */
export async function canViewRoomMembers(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  const membership = await checkRoomMembership(roomId, userId);

  if (!membership.roomExists || !membership.roomIsActive) {
    return { allowed: false, reason: "Sala não encontrada ou inativa", membership };
  }
  if (membership.isBanned) {
    return { allowed: false, reason: "Você foi banido desta sala", membership };
  }
  if (!membership.isMember) {
    return { allowed: false, reason: "Apenas membros podem ver a lista de participantes", membership };
  }
  return { allowed: true, membership };
}

/**
 * Verifica se o usuário pode ver DETALHES COMPLETOS da sala.
 * Não-membros podem ver apenas informações públicas.
 */
export async function canViewRoomDetails(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; membership: RoomMembership }> {
  const membership = await checkRoomMembership(roomId, userId);

  // Não-membros podem ver informações públicas da sala (se ativa)
  // Mas NÃO podem ver detalhes internos como lista de membros, regras, etc.
  if (!membership.roomExists || !membership.roomIsActive) {
    return { allowed: false, membership };
  }
  // Membro ativo pode ver tudo
  if (membership.isMember) {
    return { allowed: true, membership };
  }
  // Banido não pode ver nada
  if (membership.isBanned) {
    return { allowed: false, membership };
  }
  // Não-membro pode ver apenas info pública — o caller deve usar
  // a função formatPublicRoomInfo() para construir a resposta
  return { allowed: false, membership, /* publicViewAllowed: true */ } as any;
}

/**
 * Verifica se o usuário é moderador ou criador da sala.
 * Para operações como banir, kickar, promover, silenciar.
 */
export async function isRoomModeratorOrAbove(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  const membership = await checkRoomMembership(roomId, userId);

  if (!membership.roomExists) {
    return { allowed: false, reason: "Sala não encontrada", membership };
  }
  if (membership.isBanned) {
    return { allowed: false, reason: "Você foi banido desta sala", membership };
  }
  if (!membership.isMember) {
    return { allowed: false, reason: "Você não é membro desta sala", membership };
  }
  if (membership.role !== "creator" && membership.role !== "moderator") {
    return { allowed: false, reason: "Apenas moderadores ou criadores podem realizar esta ação", membership };
  }
  return { allowed: true, membership };
}

/**
 * Verifica se o usuário é o criador da sala.
 * Para operações como excluir a sala, promover moderadores.
 */
export async function isRoomCreator(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  const membership = await checkRoomMembership(roomId, userId);

  if (!membership.roomExists) {
    return { allowed: false, reason: "Sala não encontrada", membership };
  }
  if (membership.isBanned) {
    return { allowed: false, reason: "Você foi banido desta sala", membership };
  }
  if (!membership.isMember) {
    return { allowed: false, reason: "Você não é membro desta sala", membership };
  }
  if (membership.role !== "creator") {
    return { allowed: false, reason: "Apenas o criador pode realizar esta ação", membership };
  }
  return { allowed: true, membership };
}

/**
 * Constrói resposta com informações PÚBLICAS da sala (para não-membros).
 *
 * Não-membros podem ver:
 *   - id, name, icon, description (curta), has_password, member_count,
 *     is_open, is_active, type, canJoin
 *
 * Não-membros NÃO podem ver:
 *   - Lista de membros
 *   - Regras internas
 *   - password_hash (revogado via RLS também)
 *   - Outros metadados internos
 */
export function formatPublicRoomInfo(room: any, membership: RoomMembership) {
  return {
    id: room.id,
    name: room.name,
    icon: room.icon,
    description: room.description,
    type: room.type,
    is_active: room.is_active,
    is_open: room.is_open !== false,
    has_password: !!room.password_hash,
    member_count: room.member_count ?? 0,
    max_members: room.max_members,
    // Flags de filiação para o cliente saber o que mostrar
    isMember: membership.isMember,
    isBanned: membership.isBanned,
    myRole: membership.role,
    canJoin:
      !membership.isMember &&
      !membership.isBanned &&
      membership.roomIsActive &&
      membership.roomIsOpen &&
      !membership.isFull,
    // Explicitamente SEM listas internas
  };
}
