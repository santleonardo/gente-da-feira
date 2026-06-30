import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Valida a força da senha conforme política da aplicação.
 * Retorna null se válida, ou mensagem de erro descritiva.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres";
  if (password.length > 128) return "A senha é muito longa";
  if (!/[a-zA-Z]/.test(password)) return "A senha deve conter pelo menos uma letra";
  if (!/[0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?']/.test(password)) return "A senha deve conter um número ou caractere especial";
  if (/^\s+$/.test(password)) return "A senha não pode conter apenas espaços";
  return null;
}