/**
 * Geolocalização do navegador + correspondência com bairros de Feira de Santana.
 * Reverse geocode via /api/geo/reverse (Nominatim no servidor).
 *
 * Fluxo de permissão:
 * 1. UI do app explica o motivo (nunca dispare o prompt no page load).
 * 2. No clique do usuário, chame requestLocationAccess() / detectNeighborhood().
 * 3. O navegador mostra o prompt nativo só nesse gesto.
 */

import { BAIRROS } from "@/lib/constants";

/** Bounding box aproximada de Feira de Santana (BA). */
export const FEIRA_BOUNDS = {
  minLat: -12.42,
  maxLat: -12.10,
  minLon: -39.15,
  maxLon: -38.80,
} as const;

export type GeoCoords = { lat: number; lon: number };

export type LocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unknown";

export type DetectErrorCode =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "outside"
  | "network"
  | "unknown";

export type DetectNeighborhoodResult =
  | {
      ok: true;
      neighborhood: string;
      coords: GeoCoords;
      rawLabel?: string;
      matched: boolean;
      inCity: boolean;
    }
  | {
      ok: false;
      error: string;
      code: DetectErrorCode;
    };

const GEO_PROMPT_DISMISSED_KEY = "gdf_geo_prompt_dismissed";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeName(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias comuns OSM / fala local → nome canônico em BAIRROS */
const BAIRRO_ALIASES: Record<string, string> = {
  centro: "Centro",
  "ponto central": "Ponto Central",
  brasilia: "Brasília (FSA)",
  "brasilia fsa": "Brasília (FSA)",
  caseb: "Caseb",
  capuchinhos: "Capuchinhos",
  queimadinha: "Queimadinha",
  tomba: "Tomba",
  "campo limpo": "Campo Limpo",
  "cidade nova": "Cidade Nova",
  gabriela: "Gabriela",
  kalilandia: "Kalilândia",
  muchila: "Muchila",
  sobradinho: "Sobradinho",
  "jardim sobradinho": "Jardim Sobradinho",
  "george americo": "George Américo",
  sim: "SIM",
  subae: "Subaé",
  "asa branca": "Asa Branca",
  aviario: "Aviário",
  mangabeira: "Mangabeira",
  papagaio: "Papagaio",
  limoeiro: "Limoeiro",
  "olhos dagua": "Olhos d'Água",
  "olhos d agua": "Olhos d'Água",
  "feira 6": "Feira VI",
  "feira vi": "Feira VI",
  "feira 7": "Feira VII",
  "feira vii": "Feira VII",
  "feira 8": "Feira VIII",
  "feira viii": "Feira VIII",
  "feira 9": "Feira IX",
  "feira ix": "Feira IX",
  "feira 10": "Feira X",
  "feira x": "Feira X",
};

export function isInsideFeira(lat: number, lon: number): boolean {
  return (
    lat >= FEIRA_BOUNDS.minLat &&
    lat <= FEIRA_BOUNDS.maxLat &&
    lon >= FEIRA_BOUNDS.minLon &&
    lon <= FEIRA_BOUNDS.maxLon
  );
}

export function matchBairroFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const n = normalizeName(label);
  if (!n) return null;

  if (BAIRRO_ALIASES[n]) return BAIRRO_ALIASES[n];

  for (const b of BAIRROS) {
    if (normalizeName(b) === n) return b;
  }

  let best: string | null = null;
  let bestLen = 0;
  for (const b of BAIRROS) {
    const bn = normalizeName(b);
    if (bn.length < 3) continue;
    if (n.includes(bn) || bn.includes(n)) {
      if (bn.length > bestLen) {
        best = b;
        bestLen = bn.length;
      }
    }
  }
  return best;
}

/**
 * Consulta o estado da permissão de geolocalização (Permissions API).
 * Em browsers sem suporte, retorna "unknown" (ainda dá para tentar getCurrentPosition).
 */
export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "unsupported";
  }
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      if (status.state === "prompt") return "prompt";
    }
  } catch {
    /* Safari antigo / Firefox: query pode falhar */
  }
  return "unknown";
}

export function wasGeoPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(GEO_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissGeoPrompt(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GEO_PROMPT_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearGeoPromptDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GEO_PROMPT_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        Object.assign(new Error("Geolocalização não suportada"), {
          code: "unsupported" as const,
        })
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        let code: DetectErrorCode = "unknown";
        if (err.code === err.PERMISSION_DENIED) code = "denied";
        else if (err.code === err.POSITION_UNAVAILABLE) code = "unavailable";
        else if (err.code === err.TIMEOUT) code = "timeout";
        reject(
          Object.assign(new Error(err.message || "Falha ao obter localização"), {
            code,
          })
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60_000,
        ...options,
      }
    );
  });
}

/**
 * Dispara o prompt nativo do navegador (deve ser chamado a partir de um clique).
 * Se já estiver granted, só resolve as coordenadas.
 */
export async function requestLocationAccess(
  options?: PositionOptions
): Promise<
  | { ok: true; coords: GeoCoords; permission: LocationPermissionState }
  | { ok: false; error: string; code: DetectErrorCode; permission: LocationPermissionState }
> {
  const permissionBefore = await getLocationPermissionState();
  if (permissionBefore === "unsupported") {
    return {
      ok: false,
      error: ERROR_MESSAGES.unsupported,
      code: "unsupported",
      permission: "unsupported",
    };
  }
  if (permissionBefore === "denied") {
    return {
      ok: false,
      error:
        "Localização bloqueada neste site. Nas configurações do navegador, permita o acesso à localização para gentedafeira.com e tente de novo.",
      code: "denied",
      permission: "denied",
    };
  }

  try {
    const coords = await getCurrentPosition(options);
    return {
      ok: true,
      coords,
      permission: "granted",
    };
  } catch (e: unknown) {
    const code = ((e as { code?: DetectErrorCode })?.code || "unknown") as DetectErrorCode;
    const permissionAfter = await getLocationPermissionState();
    return {
      ok: false,
      error: ERROR_MESSAGES[code] || ERROR_MESSAGES.unknown,
      code: code in ERROR_MESSAGES ? code : "unknown",
      permission: permissionAfter,
    };
  }
}

export type ReverseGeoResponse = {
  neighborhood: string | null;
  rawLabel: string | null;
  city: string | null;
  inCity: boolean;
  matched: boolean;
  displayName?: string | null;
};

export async function reverseGeocode(coords: GeoCoords): Promise<ReverseGeoResponse> {
  const qs = new URLSearchParams({
    lat: String(coords.lat),
    lon: String(coords.lon),
  });
  const res = await fetch(`/api/geo/reverse?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((data as { error?: string }).error || "Falha ao resolver endereço"),
      {
        code: res.status === 422 ? ("outside" as const) : ("network" as const),
      }
    );
  }
  return res.json();
}

const ERROR_MESSAGES: Record<DetectErrorCode, string> = {
  unsupported: "Seu navegador ou dispositivo não suporta geolocalização.",
  denied:
    "Permissão de localização negada. Ative em Configurações do navegador/app e tente de novo.",
  unavailable: "Não foi possível obter sua localização agora.",
  timeout: "Tempo esgotado ao obter localização. Tente de novo.",
  outside: "Localização fora de Feira de Santana. Selecione o bairro manualmente.",
  network: "Falha de rede ao identificar o bairro.",
  unknown: "Não foi possível detectar o bairro automaticamente.",
};

/** Fluxo completo: pede permissão (gesto do usuário) → GPS → reverse → bairro. */
export async function detectNeighborhood(): Promise<DetectNeighborhoodResult> {
  try {
    const access = await requestLocationAccess();
    if (!access.ok) {
      return { ok: false, error: access.error, code: access.code };
    }

    const geo = await reverseGeocode(access.coords);

    if (!geo.inCity) {
      return {
        ok: false,
        error: ERROR_MESSAGES.outside,
        code: "outside",
      };
    }

    const fromApi =
      geo.neighborhood && (BAIRROS as readonly string[]).includes(geo.neighborhood)
        ? geo.neighborhood
        : null;
    const fromLabel = matchBairroFromLabel(geo.rawLabel);
    const final = fromApi || fromLabel || "Outro";

    return {
      ok: true,
      neighborhood: final,
      coords: access.coords,
      rawLabel: geo.rawLabel || undefined,
      matched: final !== "Outro",
      inCity: true,
    };
  } catch (e: unknown) {
    const code = ((e as { code?: DetectErrorCode })?.code || "unknown") as DetectErrorCode;
    return {
      ok: false,
      error: ERROR_MESSAGES[code] || ERROR_MESSAGES.unknown,
      code: code in ERROR_MESSAGES ? code : "unknown",
    };
  }
}
