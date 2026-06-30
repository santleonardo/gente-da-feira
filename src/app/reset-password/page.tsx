"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

type Status = "loading" | "ready" | "submitting" | "success" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  // ── Validação em tempo real ─────────────────────────────────
  const passwordError = password ? validatePasswordStrength(password) : null;
  const matchError =
    confirmPassword && password !== confirmPassword
      ? "As senhas não coincidem"
      : null;

  const canSubmit =
    password &&
    confirmPassword &&
    !passwordError &&
    !matchError &&
    status === "ready";

  // ── Detectar sessão de recuperação (hash fragment) ─────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const supabase = createClient();

      // Verifica se a URL contém type=recovery no hash
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const type = hashParams.get("type");

      if (type !== "recovery") {
        if (mounted) {
          setStatus("error");
          setErrorCode("invalid_link");
          setErrorMessage(
            "Link inválido ou inexistente. Solicite um novo link de recuperação de senha."
          );
        }
        return;
      }

      // O Supabase SSR client processa automaticamente o hash fragment
      // e troca os tokens por uma sessão temporária.
      const waitForSession = async (): Promise<boolean> => {
        // Tenta getSession imediatamente
        const { data } = await supabase.auth.getSession();
        if (data.session) return true;

        // Aguarda o onAuthStateChange com timeout
        return new Promise<boolean>((resolve) => {
          let resolved = false;
          const finish = (result: boolean) => {
            if (!resolved) {
              resolved = true;
              resolve(result);
            }
          };

          const { data: sub } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (event === "PASSWORD_RECOVERY" || session) {
                finish(true);
              }
            }
          );

          // Timeout de 5s
          setTimeout(() => finish(false), 5000);
        });
      };

      const hasSession = await waitForSession();

      if (!mounted) return;

      if (hasSession) {
        setStatus("ready");
      } else {
        setStatus("error");
        setErrorCode("expired_link");
        setErrorMessage(
          "Este link expirou ou já foi utilizado. Solicite um novo link de recuperação de senha."
        );
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Ouvir erros de auth em tempo real ──────────────────────
  useEffect(() => {
    if (status !== "ready" && status !== "submitting") return;

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRealtimeError(
          "Sessão expirada. Este link pode ter sido invalidado."
        );
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [status]);

  // ── Redirecionar após sucesso ──────────────────────────────
  useEffect(() => {
    if (status !== "success") return;

    const timer = setTimeout(() => {
      router.push("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, router]);

  // ── Enviar nova senha ──────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || realtimeError) return;

    setStatus("submitting");
    setErrorMessage("");
    setRealtimeError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");

      if (
        error.message.toLowerCase().includes("expired") ||
        error.message.toLowerCase().includes("invalid") ||
        error.code === "session_not_found"
      ) {
        setErrorCode("expired_link");
        setErrorMessage(
          "Este link expirou ou já foi utilizado. Solicite um novo link de recuperação."
        );
      } else if (
        error.message.toLowerCase().includes("password") ||
        error.message.toLowerCase().includes("weak")
      ) {
        setErrorCode("weak_password");
        setErrorMessage(error.message);
      } else {
        setErrorCode("unknown");
        setErrorMessage(
          "Ocorreu um erro ao redefinir a senha. Tente solicitar um novo link."
        );
      }
      return;
    }

    setStatus("success");
  };

  // ── Ações de navegação ─────────────────────────────────────
  const goToLogin = useCallback(() => {
    router.push("/");
  }, [router]);

  const retryForm = useCallback(() => {
    setStatus("ready");
    setErrorMessage("");
    setErrorCode(null);
    setPassword("");
    setConfirmPassword("");
    setRealtimeError(null);
  }, []);

  // ── Loading ────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary animate-pulse shadow-md">
            <KeyRound className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
            <p className="text-sm text-primary/40">Verificando link...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Erro: link inválido ou expirado ────────────────────────
  if (
    status === "error" &&
    (errorCode === "invalid_link" || errorCode === "expired_link")
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-2 border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Link inválido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {errorMessage}
            </p>
            <Button onClick={goToLogin} className="w-full" variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Erro: senha fraca (pode tentar novamente) ──────────────
  if (status === "error" && errorCode === "weak_password") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-2 border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Senha inválida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {errorMessage}
            </p>
            <Button onClick={retryForm} className="w-full">
              Tentar novamente
            </Button>
            <Button onClick={goToLogin} variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Erro genérico ──────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-2 border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Erro inesperado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {errorMessage}
            </p>
            <Button onClick={goToLogin} variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Sucesso ────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-2 border-emerald-500/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Senha redefinida!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Sua senha foi alterada com sucesso. Você será redirecionado
              para a tela de login em instantes.
            </p>
            <Button onClick={goToLogin} className="w-full">
              Ir para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Formulário de redefinição ─────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
            <KeyRound className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Redefinir senha
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Digite sua nova senha abaixo
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Erro em tempo real (sessão revogada) */}
          {realtimeError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {realtimeError}
            </div>
          )}

          {/* Nova senha */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nova senha</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPass ? "text" : "password"}
                placeholder="Mínimo 8 caracteres, com letra e número"
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && canSubmit && handleSubmit()
                }
                autoFocus
                disabled={status === "submitting"}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-destructive">{passwordError}</p>
            )}
          </div>

          {/* Confirmar senha */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Repita a nova senha"
                className="pr-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && canSubmit && handleSubmit()
                }
                disabled={status === "submitting"}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {matchError && (
              <p className="text-xs text-destructive">{matchError}</p>
            )}
          </div>

          {/* Indicador de requisitos */}
          <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Requisitos da senha
            </p>
            <ul className="space-y-1 pl-5">
              {[
                { ok: password.length >= 8, label: "Pelo menos 8 caracteres" },
                { ok: /[a-zA-Z]/.test(password), label: "Pelo menos uma letra" },
                {
                  ok: /[0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?']/.test(password),
                  label: "Um número ou caractere especial",
                },
                {
                  ok:
                    confirmPassword.length > 0 && password === confirmPassword,
                  label: "Senhas coincidem",
                },
              ].map((req) => (
                <li
                  key={req.label}
                  className={`text-xs transition-colors ${
                    req.ok ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  {req.ok ? "\u2713" : "\u25CB"} {req.label}
                </li>
              ))}
            </ul>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || !!realtimeError}
            className="w-full"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redefinindo...
              </>
            ) : (
              "Redefinir senha"
            )}
          </Button>

          <button
            type="button"
            onClick={goToLogin}
            className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}