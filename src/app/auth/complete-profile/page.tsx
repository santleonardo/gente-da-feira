"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { BAIRROS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ShieldCheck, UserRound, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const TermsDialog = dynamic(() =>
  import("@/components/TermsDialog").then((m) => ({ default: m.TermsDialog }))
);

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export default function CompleteProfilePage() {
  const router = useRouter();
  const { setProfile } = useStore();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pré-preenche o nome com o que o Google devolveu (full_name / name)
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setCheckingSession(false);
        setHasSession(false);
        return;
      }
      setHasSession(true);
      const meta = data.user.user_metadata || {};
      const suggestedName = meta.full_name || meta.name || "";
      if (suggestedName) setDisplayName(suggestedName);
      setCheckingSession(false);
    };
    init();
  }, []);

  const usernameError =
    username.length > 0 && !USERNAME_RE.test(username)
      ? "3–24 caracteres: letras, números ou _"
      : null;

  const canSubmit =
    displayName.trim().length >= 2 &&
    USERNAME_RE.test(username) &&
    agreedTerms &&
    declaredAdult &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          neighborhood,
          agreedTerms: true,
          declaredAdult: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Erro ao salvar perfil");
        setSubmitting(false);
        return;
      }
      if (data.user) setProfile(data.user);
      toast.success("Cadastro concluído! Bem-vindo(a) ao Gente da Feira.");
      router.push("/");
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
      setSubmitting(false);
    }
  };

  const goToLogin = useCallback(() => router.push("/"), [router]);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F8F6] p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#4A4A4A]/40" />
          <p className="text-sm text-[#4A4A4A]/40">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F8F6] p-4">
        <Card className="w-full max-w-md border-2 border-destructive/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Sessão não encontrada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Não encontramos uma sessão ativa. Faça login novamente para
              continuar seu cadastro.
            </p>
            <Button onClick={goToLogin} className="w-full">
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-10 bg-[#F9F8F6]">
      <Card className="w-full max-w-md border-black/[0.08] bg-white shadow-sm rounded-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A1A1A]">
            <UserRound className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="font-serif text-2xl font-medium text-[#1A1A1A]">
            Falta pouco!
          </CardTitle>
          <p className="text-sm text-[#4A4A4A]/70 mt-1">
            Escolha um usuário para finalizar sua conta do Google
          </p>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="display-name" className="text-[#4A4A4A]">
              Nome
            </Label>
            <Input
              id="display-name"
              placeholder="Seu nome"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11 rounded-xl border-black/10 bg-[#F9F8F6]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-[#4A4A4A]">
              Usuário
            </Label>
            <Input
              id="username"
              placeholder="ex: joaosilva"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.replace(/\s/g, ""))
              }
              className="h-11 rounded-xl border-black/10 bg-[#F9F8F6]"
            />
            {usernameError && (
              <p className="text-xs text-destructive">{usernameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="neighborhood" className="text-[#4A4A4A]">
              Bairro (opcional)
            </Label>
            <select
              id="neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-black/10 bg-[#F9F8F6] px-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#D96C4A]/25"
            >
              <option value="">Selecione…</option>
              {BAIRROS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 rounded-xl border border-black/[0.06] bg-[#F9F8F6] p-3.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="declared-adult"
                checked={declaredAdult}
                onCheckedChange={(v) => setDeclaredAdult(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="declared-adult"
                className="text-xs text-[#4A4A4A] leading-relaxed font-normal"
              >
                Declaro que tenho 18 anos ou mais
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="agreed-terms"
                checked={agreedTerms}
                onCheckedChange={(v) => setAgreedTerms(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="agreed-terms"
                className="text-xs text-[#4A4A4A] leading-relaxed font-normal"
              >
                Li e aceito os{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="font-semibold text-[#D96C4A] underline underline-offset-2"
                >
                  Termos de Uso
                </button>
              </Label>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 disabled:opacity-40 gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            {submitting ? "Salvando…" : "Concluir cadastro"}
          </Button>
        </CardContent>
      </Card>

      <TermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onAccept={() => {
          setAgreedTerms(true);
          toast.success("Termos de Uso aceitos");
        }}
      />
    </div>
  );
}
