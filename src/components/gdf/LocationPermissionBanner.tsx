"use client";

import { useEffect, useState } from "react";
import { Navigation, X, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  detectNeighborhood,
  dismissGeoPrompt,
  getLocationPermissionState,
  wasGeoPromptDismissed,
  type LocationPermissionState,
} from "@/lib/geolocation";
import { useStore } from "@/lib/store";

type Props = {
  /** Se true, só mostra quando o perfil não tem bairro */
  onlyIfMissingNeighborhood?: boolean;
  /** Callback opcional quando um bairro é detectado */
  onDetected?: (neighborhood: string) => void;
};

/**
 * Banner do app pedindo permissão de localização (antes do prompt nativo).
 * Só aparece se:
 * - usuário logado
 * - permissão ainda não denied
 * - usuário não dispensou o aviso
 * - (opcional) bairro ainda vazio
 */
export function LocationPermissionBanner({
  onlyIfMissingNeighborhood = true,
  onDetected,
}: Props) {
  const { profile, updateProfile } = useStore();
  const [visible, setVisible] = useState(false);
  const [permission, setPermission] = useState<LocationPermissionState>("unknown");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) {
      setVisible(false);
      return;
    }
    if (onlyIfMissingNeighborhood && profile.neighborhood?.trim()) {
      setVisible(false);
      return;
    }
    if (wasGeoPromptDismissed()) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const state = await getLocationPermissionState();
      if (cancelled) return;
      setPermission(state);
      // Já concedida ou bloqueada: não insistir no banner
      if (state === "denied" || state === "unsupported") {
        setVisible(false);
        return;
      }
      if (state === "granted" && profile.neighborhood?.trim()) {
        setVisible(false);
        return;
      }
      setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, profile?.neighborhood, onlyIfMissingNeighborhood]);

  const handleDismiss = () => {
    dismissGeoPrompt();
    setVisible(false);
  };

  const handleAllow = async () => {
    setLoading(true);
    try {
      // Este clique é o gesto do usuário → o navegador pode mostrar o prompt nativo
      const result = await detectNeighborhood();
      if (!result.ok) {
        toast.error(result.error);
        if (result.code === "denied") {
          dismissGeoPrompt();
          setVisible(false);
        }
        return;
      }

      // Salva no perfil se estiver logado
      if (profile?.id) {
        try {
          const res = await fetch(`/api/users/${profile.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ neighborhood: result.neighborhood }),
          });
          const data = await res.json();
          if (res.ok && data.user) {
            updateProfile(data.user);
          } else {
            // Ainda assim preenche localmente via callback
            updateProfile({ neighborhood: result.neighborhood });
          }
        } catch {
          updateProfile({ neighborhood: result.neighborhood });
        }
      }

      onDetected?.(result.neighborhood);
      toast.success(
        result.matched
          ? `Bairro definido: ${result.neighborhood}`
          : `Sugerimos "${result.neighborhood}". Você pode ajustar no perfil.`
      );
      dismissGeoPrompt();
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Permissão de localização"
      className="mx-3 sm:mx-4 mt-3 rounded-2xl border border-[#D96C4A]/25 bg-white shadow-sm overflow-hidden"
    >
      <div className="flex gap-3 p-3.5 sm:p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D96C4A]/10 text-[#D96C4A]">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1A1A1A]">
            Usar sua localização?
          </p>
          <p className="mt-0.5 text-xs text-[#4A4A4A] leading-relaxed">
            Para sugerir seu <strong>bairro em Feira de Santana</strong>. Não guardamos
            coordenadas — só o nome do bairro que você confirmar.{" "}
            {permission === "prompt" || permission === "unknown"
              ? "O navegador vai pedir sua permissão em seguida."
              : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAllow}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1A1A1A]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="h-3.5 w-3.5" />
              )}
              {loading ? "Aguardando permissão…" : "Permitir localização"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={loading}
              className="inline-flex items-center rounded-full border border-black/10 px-3.5 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-black/[0.03] transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 self-start rounded-full p-1 text-[#4A4A4A]/50 hover:text-[#1A1A1A] hover:bg-black/[0.04]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
