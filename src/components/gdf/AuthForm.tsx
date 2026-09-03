"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/utils";
import { BAIRROS, TERMS_VERSION } from "@/lib/constants";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, ShieldCheck, ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react";

// PERF-002: TermsDialog usa react-markdown + remark-gfm (~45KB gzipped).
// Lazy-load: só baixa o chunk quando o usuário clica "Ler Termos".
const TermsDialog = dynamic(
  () => import("@/components/TermsDialog").then((m) => ({ default: m.TermsDialog }))
);

const PROFILE_SAFE_SELECT = "id,username,display_name,avatar_url,bio,neighborhood,theme,is_private,hide_following,hide_followers,hide_neighborhood,approve_followers,created_at,updated_at";

const SIGNUP_DISABLED = ["1", "true", "yes", "on"].includes(
  (process.env.NEXT_PUBLIC_KILL_SWITCH_SIGNUP || "").trim().toLowerCase()
);

export function AuthForm() {
  const { setProfile } = useStore();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [regData, setRegData] = useState({ name: "", username: "", email: "", password: "", neighborhood: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleLogin = async () => {
    if (!loginData.email || !loginData.password) { toast.error("Preencha todos os campos"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginData.email, password: loginData.password });
      if (error) { toast.error(error.message); return; }
      const { data: profile } = await supabase.from("profiles").select(PROFILE_SAFE_SELECT).eq("id", data.user.id).single();
      if (profile) { setProfile(profile); toast.success(`Bem-vindo, ${profile.display_name}!`); }
    } catch { toast.error("Erro ao fazer login"); } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (SIGNUP_DISABLED) {
      toast.error("Cadastros temporariamente desabilitados. Tente novamente mais tarde.");
      return;
    }
    if (!regData.name || !regData.username || !regData.email || !regData.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const passError = validatePasswordStrength(regData.password);
    if (passError) { toast.error(passError); return; }
    if (!declaredAdult) {
      toast.error("Você precisa declarar que tem 18 anos ou mais");
      return;
    }
    if (!agreedTerms) {
      toast.error("Você precisa aceitar os Termos de Uso para se cadastrar");
      return;
    }
    setLoading(true);
    try {
      // Cadastro via API: rate limit por IP + Termos obrigatórios no servidor
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regData.name,
          username: regData.username,
          email: regData.email,
          password: regData.password,
          neighborhood: regData.neighborhood || "",
          agreedTerms: true,
          declaredAdult: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Erro ao criar conta");
        return;
      }
      if (data.needsEmailConfirmation) {
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
        setMode("login");
        return;
      }
      if (data.user) {
        setProfile(data.user);
        toast.success("Conta criada com sucesso!");
      } else {
        // Fallback: tenta carregar sessão/perfil no client
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select(PROFILE_SAFE_SELECT)
            .eq("id", sessionData.session.user.id)
            .single();
          if (profile) {
            setProfile(profile);
            toast.success("Conta criada com sucesso!");
            return;
          }
        }
        toast.success("Conta criada! Faça login para continuar.");
        setMode("login");
      }
    } catch {
      toast.error("Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  // UX-001: Solicitar e-mail de recuperação de senha
  const handleForgotPassword = async () => {
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      toast.error("Digite um endereço de e-mail válido");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (!res.ok) {
        // Mesmo em erro HTTP, o backend retorna mensagem genérica
        toast.error("Ocorreu um erro. Tente novamente.");
        return;
      }
      // Sucesso — sempre mostra a mesma mensagem (anti-enumeration)
      setForgotSent(true);
    } catch {
      toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-blog flex min-h-[100dvh] w-full max-w-full flex-col items-center justify-center px-3 sm:px-4 py-8 sm:py-10 bg-[#F9F8F6] overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        .auth-blog {
          font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
        }
        .auth-blog .font-serif {
          font-family: "Playfair Display", ui-serif, Georgia, Cambria, serif;
        }
      `}</style>

      {/* Brand */}
      <div className="mb-8 text-center">
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-[#1A1A1A]">
          Gente da Feira
        </h1>
        <p className="mt-2 text-sm text-[#4A4A4A]/70 max-w-xs mx-auto leading-relaxed">
          A rede local de Feira de Santana
        </p>
      </div>

      <Card className="w-full max-w-md min-w-0 border-black/[0.08] bg-white shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2 pt-5 sm:pt-6 px-4 sm:px-6">
          <CardTitle className="font-serif text-2xl font-medium text-[#1A1A1A] text-center">
            {mode === "login" && "Entrar"}
            {mode === "register" && "Criar conta"}
            {mode === "forgot" && "Recuperar senha"}
          </CardTitle>
          {mode !== "forgot" && (
            <div className="mt-4 flex rounded-full bg-[#F9F8F6] p-1 border border-black/[0.05]">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  mode === "login" ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#4A4A4A]/70 hover:text-[#1A1A1A]"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => !SIGNUP_DISABLED && setMode("register")}
                disabled={SIGNUP_DISABLED}
                className={`flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  mode === "register" ? "bg-[#1A1A1A] text-white shadow-sm" : "text-[#4A4A4A]/70 hover:text-[#1A1A1A]"
                } disabled:opacity-40`}
              >
                Cadastrar
              </button>
            </div>
          )}
        </CardHeader>

        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-7 pt-3 sm:pt-4">
          {mode === "forgot" ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setMode("login"); setForgotSent(false); }}
                className="inline-flex items-center gap-1.5 text-sm text-[#4A4A4A] hover:text-[#1A1A1A] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar ao login
              </button>
              {forgotSent ? (
                <div className="rounded-xl border border-black/8 bg-[#F9F8F6] p-5 text-center space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-[#0A4D5C] mx-auto" />
                  <p className="font-serif text-lg text-[#1A1A1A]">E-mail enviado</p>
                  <p className="text-sm text-[#4A4A4A]/70 leading-relaxed">
                    Se existir uma conta com esse e-mail, você receberá o link de recuperação.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[#4A4A4A]/70 leading-relaxed">
                    Informe seu e-mail e enviaremos um link para redefinir a senha.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-[#4A4A4A]">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                    />
                  </div>
                  <Button
                    onClick={handleForgotPassword}
                    disabled={loading || !forgotEmail.trim()}
                    className="w-full h-11 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                    ) : (
                      <><Mail className="h-4 w-4" /> Enviar link</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {mode === "login" ? (
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-[#4A4A4A]">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-pass" className="text-[#4A4A4A]">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-pass"
                        type={showLoginPass ? "text" : "password"}
                        placeholder="••••••"
                        className="pr-10 h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A4A4A]/50 hover:text-[#1A1A1A] transition-colors"
                        aria-label={showLoginPass ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-sm font-medium text-[#D96C4A] hover:text-[#D96C4A]/80 transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full h-11 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90"
                  >
                    {loading ? "Entrando…" : "Entrar"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {SIGNUP_DISABLED ? (
                    <p className="text-sm text-center text-[#4A4A4A]/70 py-6">
                      Cadastros temporariamente desabilitados.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-name" className="text-[#4A4A4A]">Nome</Label>
                        <Input
                          id="reg-name"
                          placeholder="Seu nome"
                          value={regData.name}
                          onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                          className="h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-user" className="text-[#4A4A4A]">Usuário</Label>
                        <Input
                          id="reg-user"
                          placeholder="seu_usuario"
                          value={regData.username}
                          onChange={(e) => setRegData({ ...regData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                          className="h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-email" className="text-[#4A4A4A]">Email</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={regData.email}
                          onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                          className="h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-pass" className="text-[#4A4A4A]">Senha</Label>
                        <div className="relative">
                          <Input
                            id="reg-pass"
                            type={showRegPass ? "text" : "password"}
                            placeholder="Mín. 8 caracteres"
                            className="pr-10 h-11 rounded-xl border-black/10 bg-[#F9F8F6] focus-visible:ring-[#D96C4A]/25"
                            value={regData.password}
                            onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPass((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A4A4A]/50 hover:text-[#1A1A1A]"
                            aria-label={showRegPass ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-bairro" className="text-[#4A4A4A]">Bairro (opcional)</Label>
                        <select
                          id="reg-bairro"
                          value={regData.neighborhood}
                          onChange={(e) => setRegData({ ...regData, neighborhood: e.target.value })}
                          className="flex h-11 w-full rounded-xl border border-black/10 bg-[#F9F8F6] px-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#D96C4A]/25"
                        >
                          <option value="">Selecione…</option>
                          {BAIRROS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2.5 rounded-xl border border-black/[0.06] bg-[#F9F8F6] p-3.5">
                        <label htmlFor="decl-adult" className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                          <Checkbox
                            id="decl-adult"
                            checked={declaredAdult}
                            onCheckedChange={(v) => setDeclaredAdult(v === true)}
                            className="mt-0.5"
                          />
                          <span className="text-[#1A1A1A]/90">
                            Declaro que tenho <strong className="font-semibold">18 anos ou mais</strong> e plena capacidade civil.
                          </span>
                        </label>
                        <label htmlFor="agree-terms" className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                          <Checkbox
                            id="agree-terms"
                            checked={agreedTerms}
                            onCheckedChange={(v) => setAgreedTerms(v === true)}
                            className="mt-0.5"
                          />
                          <span className="text-[#1A1A1A]/90">
                            Li e aceito os <strong className="font-semibold">Termos de Uso</strong> e a Política de Privacidade.
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          className="flex items-center gap-1.5 pl-6 text-xs font-medium text-[#D96C4A] underline-offset-2 hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> Ler Termos de Uso completos (v{TERMS_VERSION})
                        </button>
                      </div>

                      <Button
                        onClick={handleRegister}
                        disabled={loading || !agreedTerms || !declaredAdult}
                        className="w-full h-11 rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 disabled:opacity-40"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {loading ? "Criando conta…" : "Criar conta"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-8 text-[11px] text-[#4A4A4A]/40 text-center max-w-xs">
        Feito para a comunidade de Feira de Santana
      </p>

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
