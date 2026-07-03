/**
 * SEC-002/SEC-003: Helper de verificação de filiação em salas.
 *
 * Centraliza TODAS as verificações de autorização relacionadas a salas.
 * Deve ser usado por TODOS os endpoints /api/rooms/[id]/* antes de
 * qualquer operação de leitura ou escrita.
 *
 * SEC-003: Nunca acessa password_hash. Usa apenas colunas seguras.
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
import { ROOM_MEMBERSHIP_COLUMNS, selectCols } from "@/lib/safe-columns";
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
 * SEC-003: Usa select explícito — nunca SELECT * (password_hash excluído).
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
      .select(selectCols(ROOM_MEMBERSHIP_COLUMNS))
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

  // Type assertion necessário porque selectCols() retorna string dinâmica
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const room = roomRes.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const member = memberRes.data as any;

  // Verificar se banimento expirou
  let isBanned = member?.is_banned === true;
  if (isBanned && member?.banned_until) {
    const until = new Date(member.banned_until);
    if (until < new Date()) {
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
 */
export async function canSendRoomMessage(
  roomId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string; membership: RoomMembership }> {
  return canReadRoomMessages(roomId, userId);
}

/**
 * Verifica se o usuário pode ver a LISTA DE MEMBROS da sala.
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
 * Verifica se o usuário é moderador ou criador da sala.
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
 * SEC-003: Constrói resposta com informações PÚBLICAS da sala.
 *
 * Não acessa password_hash. O has_password deve ser derivado
 * de uma RPC separada (room_has_password) quando necessário.
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
    // SEC-003: has_password vem da coluna computada do banco
    has_password: !!room.has_password,
    member_count: room.member_count ?? 0,
    max_members: room.max_members,
    isMember: membership.isMember,
    isBanned: membership.isBanned,
    myRole: membership.role,
    canJoin:
      !membership.isMember &&
      !membership.isBanned &&
      membership.roomIsActive &&
      membership.roomIsOpen &&
      !membership.isFull,
  };
}
