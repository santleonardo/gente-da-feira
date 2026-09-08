// ─── Categorias do mural de avisos das salas ───
// Fonte única de verdade: usada na API (validação) e na UI (cores/rótulos).

export const BULLETIN_CATEGORIES = ["aviso", "evento", "promocao", "urgente"] as const;

export type BulletinCategory = (typeof BULLETIN_CATEGORIES)[number];

export const BULLETIN_CATEGORY_META: Record<
  BulletinCategory,
  {
    label: string;
    /** Texto e borda (chip claro) */
    chipClass: string;
    /** Ponto/indicador sólido */
    dotClass: string;
  }
> = {
  aviso: {
    label: "Aviso",
    chipClass: "bg-[#0A4D5C]/10 text-[#0A4D5C] border-[#0A4D5C]/20",
    dotClass: "bg-[#0A4D5C]",
  },
  evento: {
    label: "Evento",
    chipClass: "bg-[#6C4AB6]/10 text-[#6C4AB6] border-[#6C4AB6]/20",
    dotClass: "bg-[#6C4AB6]",
  },
  promocao: {
    label: "Promoção",
    chipClass: "bg-[#2E8B57]/10 text-[#2E8B57] border-[#2E8B57]/20",
    dotClass: "bg-[#2E8B57]",
  },
  urgente: {
    label: "Urgente",
    chipClass: "bg-[#C1272D]/10 text-[#C1272D] border-[#C1272D]/20",
    dotClass: "bg-[#C1272D]",
  },
};

export function isBulletinCategory(value: unknown): value is BulletinCategory {
  return typeof value === "string" && (BULLETIN_CATEGORIES as readonly string[]).includes(value);
}
