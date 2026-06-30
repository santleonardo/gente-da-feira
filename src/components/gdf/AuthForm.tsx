"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/utils";
import { BAIRROS, TERMS_VERSION } from "@/lib/constants";
import { TermsDialog } from "@/components/TermsDialog";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, ShieldCheck, ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react";

const PROFILE_SAFE_SELECT = "id,username,display_name,avatar_url,bio,neighborhood,theme,is_private,hide_following,hide_followers,hide_neighborhood,approve_followers,created_at,updated_at";

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
    if (!regData.name || !regData.username || !regData.email || !regData.password) { toast.error("Preencha todos os campos obrigatórios"); return; }
    const passError = validatePasswordStrength(regData.password);
    if (passError) { toast.error(passError); return; }
    if (!declaredAdult) { toast.error("Você precisa declarar que tem 18 anos ou mais"); return; }
    if (!agreedTerms) { toast.error("Você precisa aceitar os Termos de Uso para se cadastrar"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: regData.email, password: regData.password,
        options: { data: { name: regData.name, username: regData.username, neighborhood: regData.neighborhood } },
      });
      if (error) { toast.error(error.message); return; }
      if (data.user) {
        await supabase.from("profiles").update({ neighborhood: regData.neighborhood || null }).eq("id", data.user.id);
        const { data: geralRoom } = await supabase.from("rooms").select("id").eq("slug", "geral-fsa").single();
        if (geralRoom) await supabase.from("room_members").insert({ room_id: geralRoom.id, user_id: data.user.id });
        const { data: profile } = await supabase.from("profiles").select(PROFILE_SAFE_SELECT).eq("id", data.user.id).single();
        if (profile) { setProfile(profile); toast.success("Conta criada com sucesso!"); }
      }
    } catch { toast.error("Erro ao criar conta"); } finally { setLoading(false); }
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
            <span className="text-2xl font-bold leading-none text-primary-foreground">GF</span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Gente da Feira</CardTitle>
          <p className="text-sm text-muted-foreground">A rede social do seu bairro em Feira de Santana</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Modo: Esqueci minha senha ─────────────────────── */}
          {mode === "forgot" ? (
            <>
              {forgotSent ? (
                /* Estado: e-mail enviado */
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      Se este e-mail estiver cadastrado, você receberá um link de recuperação em instantes. Verifique sua caixa de entrada e spam.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setMode("login");
                      setForgotSent(false);
                      setForgotEmail("");
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para o login
                  </Button>
                </div>
              ) : (
                /* Estado: formulário de e-mail */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">E-mail</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe o e-mail associado à sua conta. Enviaremos um link para redefinir sua senha.
                  </p>
                  <Button
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Enviar link de recuperação
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar para o login
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── Tabs: Entrar / Criar conta ───────────────── */}
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  onClick={() => setMode("login")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => setMode("register")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  Criar conta
                </button>
              </div>

              {mode === "login" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-pass">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-pass"
                        type={showLoginPass ? "text" : "password"}
                        placeholder="\u2022\u2022\u2022\u2022\u2022\u2022"
                        className="pr-10"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showLoginPass ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* UX-001: Link "Esqueci minha senha" */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  <Button onClick={handleLogin} disabled={loading} className="w-full">
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">Nome</Label>
                    <Input
                      id="reg-name"
                      placeholder="Seu nome completo"
                      value={regData.name}
                      onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-username">Usuário</Label>
                    <Input
                      id="reg-username"
                      placeholder="seu_usuario"
                      value={regData.username}
                      onChange={(e) => setRegData({ ...regData, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={regData.email}
                      onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-pass">Senha</Label>
                    <div className="relative">
                      <Input
                        id="reg-pass"
                        type={showRegPass ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres, com letra e número"
                        className="pr-10"
                        value={regData.password}
                        onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showRegPass ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-neighborhood">Bairro</Label>
                    <select
                      id="reg-neighborhood"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={regData.neighborhood}
                      onChange={(e) => setRegData({ ...regData, neighborhood: e.target.value })}
                    >
                      <option value="">Selecione seu bairro</option>
                      {BAIRROS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/40 p-3.5">
                    <label htmlFor="decl-adult" className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                      <Checkbox
                        id="decl-adult"
                        checked={declaredAdult}
                        onCheckedChange={(v) => setDeclaredAdult(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-foreground/90">
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
                      <span className="text-foreground/90">
                        Li e aceito os <strong className="font-semibold">Termos de Uso</strong> e a Política de Privacidade.
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="flex items-center gap-1.5 pl-6 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> Ler Termos de Uso completos (v{TERMS_VERSION})
                    </button>
                  </div>
                  <Button onClick={handleRegister} disabled={loading} className="w-full">
                    <ShieldCheck className="h-4 w-4" />
                    {loading ? "Criando conta..." : "Criar conta"}
                  </Button>
                </div>
              )}
            </>
          )}
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