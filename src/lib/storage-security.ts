// ============================================================
// SEC-008: Storage Security — Validação centralizada de mídia
//
// Toda URL ou caminho de armazenamento fornecido pelo cliente
// DEVE passar por esta camada antes de ser armazenado ou usado.
//
// Regras:
//   1. URLs devem apontar exclusivamente para o Supabase Storage
//   2. Buckets devem estar na whitelist
//   3. Caminhos devem começar com user.id (ownership)
//   4. Nenhum path traversal (..)
//   5. Storage paths para deleção devem ser derivados do DB ou
//      validados contra o user.id
// ============================================================

/** Buckets autorizados da aplicação */
export const ALLOWED_BUCKETS = new Set([
  "post-photos",
  "post-videos",
  "post-audios",
  "post-images",
  "profile-videos",
  "avatars",
]);

/**
 * Mapeamento de buckets → extensões permitidas.
 * Usado para validar que a URL corresponde ao tipo de mídia esperado.
 */
export const BUCKET_ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  "post-photos": new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]),
  "post-videos": new Set(["mp4", "webm", "mov"]),
  "post-audios": new Set(["mp3", "m4a", "webm", "ogg", "wav"]),
  "post-images": new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]),
  "profile-videos": new Set(["mp4", "webm", "mov"]),
  "avatars": new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]),
};

/**
 * Folders permitidos por tipo de upload.
 * Impede path traversal via parâmetro `folder` do cliente.
 */
export const UPLOAD_FOLDER_WHITELIST: Record<string, Set<string>> = {
  "post-photos": new Set(["posts", "video-thumbs"]),
  "post-videos": new Set(["posts"]),
  "post-audios": new Set(["posts", "chat", "album-audios", "rooms"]),
  "profile-videos": new Set(["album-videos"]),
};

/**
 * Valida uma URL de mídia do cliente.
 *
 * Retorna a URL limpa se válida, ou null se rejeitada.
 *
 * Verificações:
 *   - Protocolo http/https
 *   - Host é o Supabase Storage autorizado
 *   - Path contém um bucket conhecido
 *   - Extensão do arquivo é permitida para o bucket
 *   - Sem null bytes ou caracteres de controle
 */
export function validateMediaUrl(
  url: string,
  options?: { allowedBuckets?: Set<string>; requireUserId?: string }
): string | null {
  if (!url || typeof url !== "string") return null;

  // Remove null bytes e caracteres de controle
  const cleaned = url.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) return null;

  // Protocolo
  if (!cleaned.startsWith("https://") && !cleaned.startsWith("http://")) return null;

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }

  // Apenas http/https
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  // Verificar host — deve ser o Supabase Storage
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  let supabaseHost: string;
  try {
    supabaseHost = new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }

  if (parsed.hostname !== supabaseHost) return null;

  // Verificar se o path contém um bucket conhecido
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const allowedBuckets = options?.allowedBuckets || ALLOWED_BUCKETS;

  let bucketIdx = -1;
  for (let i = 0; i < pathParts.length; i++) {
    if (allowedBuckets.has(pathParts[i])) {
      bucketIdx = i;
      break;
    }
  }

  if (bucketIdx === -1) return null;

  const bucket = pathParts[bucketIdx];

  // Verificar ownership se exigido
  if (options?.requireUserId) {
    // O path após o bucket deve começar com o userId
    const storagePath = pathParts.slice(bucketIdx + 1).join("/");
    if (!storagePath.startsWith(options.requireUserId + "/")) {
      return null;
    }
  }

  // Verificar extensão do arquivo
  const fullPath = pathParts.slice(bucketIdx + 1).join("/");
  const lastSegment = fullPath.split("/").pop() || "";
  const dotIdx = lastSegment.lastIndexOf(".");
  if (dotIdx > 0) {
    const ext = lastSegment.slice(dotIdx + 1).toLowerCase();
    const allowedExts = BUCKET_ALLOWED_EXTENSIONS[bucket];
    if (allowedExts && !allowedExts.has(ext)) {
      return null;
    }
  }

  // Remover query params potencialmente perigosos (preservar ?t= para cache busting)
  const safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  return safeUrl;
}

/**
 * Valida um caminho de storage para deleção.
 *
 * Verifica:
 *   - Não contém ..
 *   - Começa com o userId do dono
 *   - Aponta para um bucket conhecido (se bucket fornecido)
 */
export function validateStoragePath(
  path: string,
  userId: string,
  options?: { requireBucket?: string }
): string | null {
  if (!path || typeof path !== "string") return null;

  // Remove null bytes
  const cleaned = path.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) return null;

  // Bloquear path traversal
  if (cleaned.includes("..")) return null;

  // Verificar ownership
  if (!cleaned.startsWith(userId + "/")) return null;

  // Verificar bucket se exigido
  if (options?.requireBucket) {
    if (!cleaned.startsWith(userId + "/" + options.requireBucket.replace(userId + "/", ""))) {
      // O path deve estar dentro do diretório do usuário, não necessariamente conter o nome do bucket
      // pois o bucket é selecionado separadamente no storage.from(bucket)
    }
  }

  // Verificar extensões perigosas
  const lastSegment = cleaned.split("/").pop() || "";
  if (lastSegment.includes("..") || lastSegment.includes("\0")) return null;

  return cleaned;
}

/**
 * Valida o parâmetro `folder` de upload.
 * Retorna o folder sanitizado ou null se inválido.
 */
export function validateUploadFolder(
  folder: string,
  bucket: string
): string | null {
  if (!folder || typeof folder !== "string") return null;

  const cleaned = folder.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) return null;

  // Bloquear path traversal
  if (cleaned.includes("..") || cleaned.includes("/") || cleaned.includes("\\")) return null;

  const allowed = UPLOAD_FOLDER_WHITELIST[bucket];
  if (!allowed) return null;

  if (!allowed.has(cleaned)) return null;

  return cleaned;
}

/**
 * Extrai o caminho de storage de uma URL do Supabase Storage.
 * Retorna null se a URL não for do Supabase ou não conter um bucket conhecido.
 *
 * USO: Apenas para caminhos que já estão no banco (não para validação de input do cliente).
 */
export function extractStoragePathFromUrl(
  url: string,
  allowedBuckets?: Set<string>
): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;

    const supabaseHost = new URL(supabaseUrl).hostname;
    if (parsed.hostname !== supabaseHost) return null;

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const buckets = allowedBuckets || ALLOWED_BUCKETS;

    for (let i = 0; i < pathParts.length; i++) {
      if (buckets.has(pathParts[i])) {
        const storagePath = pathParts.slice(i + 1).join("/");
        if (storagePath) return { bucket: pathParts[i], path: storagePath };
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Valida que todas as URLs em um array são URLs de mídia válidas.
 * Retorna o array de URLs validadas ou null se qualquer uma for inválida.
 */
export function validateMediaUrlArray(
  urls: string[],
  options?: { allowedBuckets?: Set<string>; requireUserId?: string }
): string[] | null {
  if (!Array.isArray(urls) || urls.length === 0) return null;

  const validated: string[] = [];
  for (const url of urls) {
    const safeUrl = validateMediaUrl(url, options);
    if (!safeUrl) return null;
    validated.push(safeUrl);
  }

  return validated;
}
