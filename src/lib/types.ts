// ============================================================
// GDF Chat — Types (alinhado com o schema consolidado)
// Atualizado para corresponder às migrações 001-006.
// ============================================================

export type Tab = "feed" | "rooms" | "dms" | "discover" | "profile";

// ─── PROFILE ─────────────────────────────────────────────────
// Espelha: public.profiles (mig 001)
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  neighborhood: string | null;
  theme: string;                 // DEFAULT 'auto'
  is_private: boolean;
  hide_following: boolean;
  hide_followers: boolean;
  hide_neighborhood: boolean;
  approve_followers: boolean;
  created_at: string;
  updated_at: string;
}

// ─── ROOM ────────────────────────────────────────────────────
// Espelha: public.rooms (mig 001) — estendido com campos avançados
export interface Room {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  type: "official" | "community";
  is_active: boolean;
  is_open: boolean;
  max_members: number;
  rules: string | null;
  has_password?: boolean;
  created_by: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  _count?: {
    members: number;
  };
}

// ─── ROOM MEMBER ─────────────────────────────────────────────
// Espelha: public.room_members (mig 001) — estendido com roles e ban
export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: "creator" | "member" | "moderator";
  is_banned?: boolean;
  banned_until?: string | null;
  joined_at: string;
  // Relação
  profile?: Profile;
}

// ─── DIRECT CHAT ─────────────────────────────────────────────
// Espelha: public.direct_chats (mig 001)
export interface Conversation {
  id: string;
  initiator_id: string;
  receiver_id: string;
  last_message_at: string | null;  // restaurado
  created_at: string;
  updated_at: string;
  // Relações
  initiator: Profile;
  receiver: Profile;
}

// ─── MESSAGE ─────────────────────────────────────────────────
// Espelha: public.messages (mig 001)
export interface Message {
  id: string;
  content: string | null;
  sender_id: string;
  room_id: string | null;
  dm_id: string | null;
  target_type: "room" | "dm";
  media_url?: string | null;       // novo
  media_type?: "image" | "video" | "audio" | null; // novo
  expires_at?: string | null;      // novo — só preenchido quando há mídia
  is_deleted: boolean;
  created_at: string;
  // Relação
  sender?: Profile;
}

// ─── POST ────────────────────────────────────────────────────
// Espelha: public.posts (mig 001)
export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;       // restaurado
  neighborhood: string | null;
  visibility: "public" | "followers";  // novo
  expires_at: string | null;      // novo
  likes_count: number;
  is_deleted: boolean;
  created_at: string;
  // Relações
  author?: Author;
  reactions?: Reaction[];
  comments_count?: number;
  shared_post?: Post | null;
}

// ─── AUTHOR (perfil resumido) ────────────────────────────────
export interface Author {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  neighborhood: string | null;
}

// ─── COMMENT ─────────────────────────────────────────────────
// Espelha: public.comments (mig 001) — NOVO
export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;       // para replies
  content: string;
  is_deleted: boolean;
  created_at: string;
  // Relação
  author?: Author;
  replies?: Comment[];
}

// ─── REACTION ────────────────────────────────────────────────
// Espelha: public.reactions (mig 001)
export interface Reaction {
  user_id: string;
  type: string;
}

// ─── FOLLOW ──────────────────────────────────────────────────
// Espelha: public.follows (mig 001) — NOVO
export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  // Relações
  follower?: Profile;
  following?: Profile;
}

// ─── BLOCK ───────────────────────────────────────────────────
// Espelha: public.blocks (mig 001) — NOVO
export interface Block {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

// ─── NOTIFICATION ────────────────────────────────────────────
// Espelha: public.notifications (mig 001) — NOVO
export interface Notification {
  id: string;
  user_id: string;
  type: string;                   // 'follow_request', 'follow_accepted', 'reaction', 'comment', etc.
  actor_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
  // Relação
  actor?: Profile;
}

// ─── PROFILE PHOTO ───────────────────────────────────────────
// Espelha: public.profile_photos (mig 001) — NOVO
export interface ProfilePhoto {
  id: string;
  user_id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

// ─── PROFILE VIDEO ───────────────────────────────────────────
// Espelha: public.profile_videos (mig 001) — NOVO
export interface ProfileVideo {
  id: string;
  user_id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

// ─── USER SEARCH RESULT ─────────────────────────────────────
export interface UserSearchResult {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  neighborhood: string | null;
  bio: string;
}
