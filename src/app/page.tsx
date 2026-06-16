"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, FileText, MapPin, ShieldCheck } from "lucide-react";
import { BAIRROS, TERMS_VERSION } from "@/lib/constants";
import { TermsDialog } from "@/components/TermsDialog";

type Mode = "login" | "register";

export default function Home() {
  const [mode, setMode] = useState<Mode>("register");
  const [loading, setLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [regData, setRegData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    neighborhood: "",
  });

  // Aceites exigidos na página de cadastro (Termos de Uso, Seções 3.1 e 4).
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [declaredAdult, setDeclaredAdult] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const regFieldsFilled =
    regData.name.trim() &&
    regData.username.trim() &&
    regData.email.trim() &&
    regData.password.length >= 6;

  const canRegister =
    !!regFieldsFilled && agreedTerms && declaredAdult && !loading;

  const handleLogin = async () => {
    if (!loginData.email || !loginData.password) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      // Demonstração — sem backend conectado.
      await new Promise((r) => setTimeout(r, 700));
      toast.success("Login simulado com sucesso!", {
        description: "Conecte o backend (Supabase) para autenticação real.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regFieldsFilled) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (regData.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
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
      // Demonstração — sem backend conectado.
      await new Promise((r) => setTimeout(r, 900));
      toast.success("Conta criada com sucesso!", {
        description: `Bem-vindo(a), ${regData.name.split(" ")[0]}!`,
      });
    } finally {
      setLoading(false);
    }
  };

  const acceptTermsFromDialog = () => {
    setAgreedTerms(true);
    toast.success("Termos de Uso aceitos");
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Fundo decorativo: manchas suaves com a cor da marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-accent blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <main className="flex flex-1 items-center justify-center p-4 py-8 sm:py-12">
        <div className="w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
          <Card className="border-2 border-primary/15 shadow-xl shadow-primary/5">
            <CardHeader className="items-center text-center">
              {/* Logotipo — monograma GF */}
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md shadow-primary/30">
                <span className="text-2xl font-bold leading-none text-primary-foreground">
                  GF
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Gente da Feira
              </CardTitle>
              <CardDescription className="text-sm">
                A rede social do seu bairro em Feira de Santana
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Alternador Entrar / Criar conta */}
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    mode === "login"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    mode === "register"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Criar conta
                </button>
              </div>

              {mode === "login" ? (
                <div className="space-y-3">
                  <Field label="Email" htmlFor="login-email">
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) =>
                        setLoginData({ ...loginData, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Senha" htmlFor="login-pass">
                    <PasswordInput
                      id="login-pass"
                      show={showLoginPass}
                      onToggle={() => setShowLoginPass((v) => !v)}
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({ ...loginData, password: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </Field>
                  <Button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label="Nome" htmlFor="reg-name" required>
                    <Input
                      id="reg-name"
                      placeholder="Seu nome completo"
                      value={regData.name}
                      onChange={(e) =>
                        setRegData({ ...regData, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Usuário" htmlFor="reg-username" required>
                    <Input
                      id="reg-username"
                      placeholder="seu_usuario"
                      value={regData.username}
                      onChange={(e) =>
                        setRegData({
                          ...regData,
                          username: e.target.value
                            .toLowerCase()
                            .replace(/\s/g, ""),
                        })
                      }
                    />
                  </Field>
                  <Field label="Email" htmlFor="reg-email" required>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={regData.email}
                      onChange={(e) =>
                        setRegData({ ...regData, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Senha" htmlFor="reg-pass" required>
                    <PasswordInput
                      id="reg-pass"
                      show={showRegPass}
                      onToggle={() => setShowRegPass((v) => !v)}
                      placeholder="Mínimo 6 caracteres"
                      value={regData.password}
                      onChange={(e) =>
                        setRegData({ ...regData, password: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Bairro" htmlFor="reg-neighborhood">
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <select
                        id="reg-neighborhood"
                        className="flex h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={regData.neighborhood}
                        onChange={(e) =>
                          setRegData({
                            ...regData,
                            neighborhood: e.target.value,
                          })
                        }
                      >
                        <option value="">Selecione seu bairro</option>
                        {BAIRROS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>

                  {/* ─── Termos de Uso e declaração de maioridade ─── */}
                  <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/40 p-3.5">
                    {/* Declaração de 18+ (Termos, Seção 3.1) */}
                    <label
                      htmlFor="decl-adult"
                      className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug"
                    >
                      <Checkbox
                        id="decl-adult"
                        checked={declaredAdult}
                        onCheckedChange={(v) => setDeclaredAdult(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-foreground/90">
                        Declaro que tenho{" "}
                        <strong className="font-semibold">
                          18 anos ou mais
                        </strong>{" "}
                        e plena capacidade civil.
                      </span>
                    </label>

                    {/* Aceite dos Termos de Uso */}
                    <label
                      htmlFor="agree-terms"
                      className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug"
                    >
                      <Checkbox
                        id="agree-terms"
                        checked={agreedTerms}
                        onCheckedChange={(v) => setAgreedTerms(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-foreground/90">
                        Li e aceito os{" "}
                        <strong className="font-semibold">Termos de Uso</strong>{" "}
                        e a Política de Privacidade.
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="flex items-center gap-1.5 pl-6 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ler Termos de Uso completos (v{TERMS_VERSION})
                    </button>
                  </div>

                  <Button
                    onClick={handleRegister}
                    disabled={!canRegister}
                    className="w-full"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {loading ? "Criando conta..." : "Criar conta"}
                  </Button>

                  {!canRegister && !loading && (
                    <p className="text-center text-xs text-muted-foreground">
                      {regFieldsFilled
                        ? "Aceite os Termos de Uso e confirme sua idade para continuar."
                        : "Preencha os campos obrigatórios para continuar."}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Ao se cadastrar, você passa a fazer parte da comunidade da sua
            vizinhança.
          </p>
        </div>
      </main>

      <footer className="mt-auto border-t border-border/60 bg-background/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground/80">
              Gente da Feira
            </span>
            <span aria-hidden>·</span>
            <span>Feira de Santana, BA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Termos de Uso v{TERMS_VERSION}
            </button>
            <span aria-hidden>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

      <TermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onAccept={acceptTermsFromDialog}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Subcomponentes de formulário
 * ────────────────────────────────────────────────────────────────────────── */

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </Label>
      {children}
    </div>
  );
}

function PasswordInput({
  id,
  show,
  onToggle,
  value,
  onChange,
  onKeyDown,
  placeholder,
}: {
  id: string;
  show: boolean;
  onToggle: () => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder ?? "••••••"}
        className="pr-10"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
