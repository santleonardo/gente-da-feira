"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Push Subscription Logic (SEC-001 hardened) ────────────────────────────────

// Registra ou re-registra a push subscription para o usuário atual.
// Chamado quando: SW ativa, auth state muda (login/logout).
async function registerPushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    if (!("PushManager" in window)) return;
    const permission = await Notification.permission;
    if (permission === "denied") return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    // Remover subscription existente no pushManager antes de re-subscribing.
    // Isso garante que o endpoint antigo seja invalidado e um novo seja criado,
    // evitando vazamento entre contas em dispositivos compartilhados.
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe();
    }

    if (permission === "default") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
  } catch {
    // Push não suportado ou usuário negou — silencioso
  }
}

// Remove a push subscription do servidor quando o usuário faz logout.
// Isso previne que o próximo usuário no mesmo dispositivo receba
// notificações da conta anterior.
async function unregisterPushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      // Avisa o servidor para remover
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      // Remove do navegador
      await sub.unsubscribe();
    }
  } catch {
    // silent
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("Instalando GDF...");
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const dismissBanner = () => {
    setShowInstallBanner(false);
    try {
      localStorage.setItem("gdf_install_dismissed", Date.now().toString());
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("SW registrado:", reg.scope);
          swRef.current = reg;

          // Registrar push após SW ativo
          if (reg.active) {
            registerPushSubscription(reg);
          } else {
            reg.addEventListener("updatefound", () => {
              const worker = reg.installing;
              if (worker) {
                worker.addEventListener("statechange", () => {
                  if (worker.state === "activated") {
                    registerPushSubscription(reg);
                  }
                });
              }
            });
          }

          // Notificar atualização com botão de ação
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "activated") {
                  toast.success("Nova versão disponível!", {
                    duration: Infinity,
                    action: {
                      label: "Atualizar agora",
                      onClick: () => window.location.reload(),
                    },
                  });
                }
              });
            }
          });
        })
        .catch((err) => console.log("SW falhou:", err));
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowInstallBanner(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      toast.success("GDF instalado no seu dispositivo!");
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // ── SEC-001: Monitorar mudanças de auth para re-registrar/cancelar push ─
  useEffect(() => {
    // Polling simples para detectar mudança de usuário (login/logout).
    // O Supabase client-side events nem sempre são confiáveis em PWA.
    const checkAuth = async () => {
      try {
        const { createClient } = await import("@supabase/ssr");
        // Import client-side
        const { createBrowserClient } = await import("@supabase/ssr");
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id ?? null;

        if (currentUserId !== lastUserIdRef.current) {
          const reg = swRef.current;
          if (!reg) {
            lastUserIdRef.current = currentUserId;
            return;
          }

          if (lastUserIdRef.current && !currentUserId) {
            // Logout detectado — remover push subscription
            unregisterPushSubscription(reg);
          } else if (currentUserId && reg.active) {
            // Login ou troca de usuário — re-registrar push
            registerPushSubscription(reg);
          }

          lastUserIdRef.current = currentUserId;
        }
      } catch {
        // silent
      }
    };

    // Verificar imediatamente e depois a cada 5 segundos
    checkAuth();
    const interval = setInterval(checkAuth, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("gdf_install_dismissed");
      if (dismissed) {
        const elapsed = Date.now() - parseInt(dismissed);
        if (elapsed < 24 * 60 * 60 * 1000) {
          setShowInstallBanner(false);
        }
      }
    } catch {
      // silent
    }
  }, []);

  if (!showInstallBanner || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-24 left-3 right-3 z-50 md:bottom-6 md:left-auto md:right-6 md:w-80">
      <div className="rounded-2xl border bg-card p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Instalar GDF</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adicione ao celular para acesso rápido e notificações
            </p>
          </div>
          <button
            onClick={dismissBanner}
            className="shrink-0 rounded-full p-1 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={handleInstall}
            size="sm"
            className="flex-1 gap-1.5 rounded-full"
          >
            <Download className="h-3.5 w-3.5" />
            Instalar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissBanner}
            className="rounded-full"
          >
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}