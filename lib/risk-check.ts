/**
 * Aviso de risco (client + server): golpe, pedido de dinheiro, link suspeito.
 * Heurístico e síncrono — não depende de IA. Não bloqueia; só orienta.
 *
 * ── Como configurar ────────────────────────────────────────────────
 * Edite RISK_RULES abaixo:
 *   enabled     — liga/desliga a regra
 *   patterns    — lista de regex (string); use \b e classes unicode com cuidado
 *   message     — texto do banner
 *   title       — título curto (prioridade na UI)
 *   priority    — maior = título preferido no banner
 *
 * RISK_LINK_CONFIG controla detecção de URLs suspeitas.
 */

export type RiskFlag =
  | "money_request"
  | "suspicious_link"
  | "scam_phrase"
  | "credential_request";

export type RiskAssessment = {
  level: "none" | "warn";
  flags: RiskFlag[];
  messages: string[];
  /** Regras que dispararam (ids) — útil para debug */
  matchedRuleIds: string[];
};

export type RiskRuleConfig = {
  id: string;
  flag: RiskFlag;
  enabled: boolean;
  /** Prioridade do título no banner (maior vence) */
  priority: number;
  title: string;
  message: string;
  /** Padrões regex (sem flags; a avaliação usa "i") */
  patterns: string[];
};

/**
 * Regras de texto — ajuste padrões conforme casos reais do bairro.
 */
export const RISK_RULES: RiskRuleConfig[] = [
  {
    id: "money",
    flag: "money_request",
    enabled: true,
    priority: 20,
    title: "Pedido envolvendo dinheiro",
    message:
      "Este texto fala em dinheiro, Pix ou pagamento. Desconfie de pedidos de valor a desconhecidos.",
    patterns: [
      String.raw`\b(pix|transfer[eê]ncia|transferir|dep[oó]sito|boleto)\b`,
      String.raw`\b(chave\s*pix|conta\s*banc[aá]ria|dados\s*banc[aá]rios)\b`,
      String.raw`\b(cart[aã]o\s*de\s*cr[eé]dito|gift\s*card|vale[- ]?presente)\b`,
      String.raw`\b(bitcoin|btc|usdt|crypto|criptomoeda|nft)\b`,
      String.raw`\b(pague\s+aqui|manda\s+o\s+pix|me\s+faz\s+um\s+pix|envia\s+pix)\b`,
    ],
  },
  {
    id: "scam",
    flag: "scam_phrase",
    enabled: true,
    priority: 40,
    title: "Possível golpe",
    message:
      "Há trechos parecidos com golpe ou oferta boa demais. Confirme por outro canal antes de agir.",
    patterns: [
      String.raw`\b(ganhe\s+dinheiro|renda\s+extra\s+f[aá]cil)\b`,
      String.raw`\b(investimento\s+garantido|lucro\s+garantido)\b`,
      String.raw`\b(dobrar?\s+(seu\s+)?dinheiro)\b`,
      String.raw`\b(sou\s+da\s+pol[ií]cia|suporte\s+(oficial|do\s+banco|whatsapp))\b`,
      String.raw`\b(conta\s+bloqueada|taxa\s+de\s+libera[cç][aã]o)\b`,
      String.raw`\b(pr[eê]mio\s+surpreendido|voc[eê]\s+ganhou\s+um?\s+pr[eê]mio)\b`,
      String.raw`urgente.{0,40}(pix|pagar|transfer)`,
      String.raw`\b(kit\s+de\s+empreendedorismo|trabalhe\s+em\s+casa\s+ganhando)\b`,
    ],
  },
  {
    id: "credentials",
    flag: "credential_request",
    enabled: true,
    priority: 50,
    title: "Cuidado: dados sensíveis",
    message:
      "Parece pedir senha, código ou dados de cartão. Nunca compartilhe isso por mensagem.",
    patterns: [
      String.raw`\b(sua\s+senha|me\s+passa\s+a\s+senha|digite\s+sua\s+senha)\b`,
      String.raw`\b(c[oó]digo\s+de\s+verifica[cç][aã]o|token\s+do\s+banco)\b`,
      String.raw`\b(n[uú]mero\s+do\s+cart[aã]o|\bcvv\b|validade\s+do\s+cart[aã]o)\b`,
      String.raw`\b(selfie\s+com\s+documento|foto\s+do\s+rg|foto\s+do\s+cpf)\b`,
    ],
  },
];

/**
 * Configuração de links suspeitos.
 */
export const RISK_LINK_CONFIG = {
  enabled: true,
  flag: "suspicious_link" as const,
  priority: 30,
  title: "Link suspeito",
  message:
    "Há link suspeito (encurtador, muitos links ou link + dinheiro). Não abra nem informe dados.",
  messageWithCredentials:
    "Link combinado com pedido de dados sensíveis — trate como risco alto.",
  /** Hosts de encurtadores */
  shortenerHosts: [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "rb.gy",
    "rebrand.ly",
    "shorturl.at",
    "s.id",
    "clck.ru",
  ],
  /** TLDs frequentemente abusados */
  riskyTlds: ["tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "link"],
  /** Quantidade de URLs a partir da qual alerta sozinho */
  maxUrlsBeforeWarn: 3,
  /** Alertar se houver URL + regra de dinheiro/golpe */
  warnOnUrlWithMoneyOrScam: true,
  /** Alertar URL em IP cru */
  warnOnIpUrl: true,
};

// ── Internals ────────────────────────────────────────────────────────

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((p) => {
    try {
      return new RegExp(p, "i");
    } catch {
      console.warn("[risk-check] regex inválida ignorada:", p);
      return /$^/; // nunca casa
    }
  });
}

const COMPILED_RULES = RISK_RULES.map((rule) => ({
  ...rule,
  regexes: compilePatterns(rule.patterns),
}));

const URL_RE =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-z0-9][-a-z0-9]{1,40}\.(com|net|org|br|io|co|cc|tk|ml|ga|cf|gq|xyz|top|click|link|shop|online|site)(\/[^\s]*)?/gi;

const IP_URL_RE = /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/i;

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractUrls(text: string): string[] {
  // Evita lastIndex residual de regex global
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  return text.match(re) || [];
}

function isSuspiciousLink(
  text: string,
  urls: string[],
  matchedFlags: Set<RiskFlag>
): { hit: boolean; withCredentials: boolean } {
  const cfg = RISK_LINK_CONFIG;
  if (!cfg.enabled || urls.length === 0) {
    return { hit: false, withCredentials: false };
  }

  const joined = urls.join(" ").toLowerCase();
  const shortenerHit = cfg.shortenerHosts.some((h) => joined.includes(h.toLowerCase()));
  const riskyTldHit = urls.some((u) =>
    cfg.riskyTlds.some((tld) => new RegExp(`\\.${tld}(?:\\/|\\b)`, "i").test(u))
  );
  const ipHit = cfg.warnOnIpUrl && IP_URL_RE.test(text);
  const manyUrls = urls.length >= cfg.maxUrlsBeforeWarn;
  const withMoneyOrScam =
    cfg.warnOnUrlWithMoneyOrScam &&
    (matchedFlags.has("money_request") || matchedFlags.has("scam_phrase"));
  const withCredentials = matchedFlags.has("credential_request");

  const hit =
    shortenerHit || riskyTldHit || ipHit || manyUrls || withMoneyOrScam || withCredentials;

  return { hit, withCredentials };
}

/**
 * Avalia sinais de risco no texto. Use antes de enviar DM/sala ou publicar.
 */
export function assessTextRisk(raw: string): RiskAssessment {
  const text = (raw || "").trim();
  if (!text) {
    return { level: "none", flags: [], messages: [], matchedRuleIds: [] };
  }

  const flags: RiskFlag[] = [];
  const messages: string[] = [];
  const matchedRuleIds: string[] = [];
  const matchedFlags = new Set<RiskFlag>();

  for (const rule of COMPILED_RULES) {
    if (!rule.enabled) continue;
    const hit = rule.regexes.some((re) => re.test(text));
    if (hit) {
      flags.push(rule.flag);
      messages.push(rule.message);
      matchedRuleIds.push(rule.id);
      matchedFlags.add(rule.flag);
    }
  }

  const urls = extractUrls(text);
  const link = isSuspiciousLink(text, urls, matchedFlags);
  if (link.hit) {
    flags.push(RISK_LINK_CONFIG.flag);
    messages.push(
      link.withCredentials
        ? RISK_LINK_CONFIG.messageWithCredentials
        : RISK_LINK_CONFIG.message
    );
    matchedRuleIds.push("suspicious_link");
    matchedFlags.add(RISK_LINK_CONFIG.flag);
  }

  const uniqFlags = unique(flags);
  const uniqMessages = unique(messages);

  return {
    level: uniqFlags.length > 0 ? "warn" : "none",
    flags: uniqFlags,
    messages: uniqMessages,
    matchedRuleIds: unique(matchedRuleIds),
  };
}

/** Título curto para o banner (regra de maior prioridade) */
export function riskBannerTitle(assessment: RiskAssessment): string {
  if (assessment.level === "none" || assessment.flags.length === 0) {
    return "Aviso de segurança";
  }

  let best: { priority: number; title: string } | null = null;

  for (const rule of RISK_RULES) {
    if (!rule.enabled) continue;
    if (!assessment.flags.includes(rule.flag)) continue;
    if (!best || rule.priority > best.priority) {
      best = { priority: rule.priority, title: rule.title };
    }
  }

  if (
    assessment.flags.includes("suspicious_link") &&
    (!best || RISK_LINK_CONFIG.priority > best.priority)
  ) {
    best = { priority: RISK_LINK_CONFIG.priority, title: RISK_LINK_CONFIG.title };
  }

  return best?.title || "Aviso de segurança";
}

/** Lista regras ativas (debug / admin futuro) */
export function listEnabledRiskRules(): { id: string; flag: RiskFlag; title: string }[] {
  const textRules = RISK_RULES.filter((r) => r.enabled).map((r) => ({
    id: r.id,
    flag: r.flag,
    title: r.title,
  }));
  if (RISK_LINK_CONFIG.enabled) {
    textRules.push({
      id: "suspicious_link",
      flag: RISK_LINK_CONFIG.flag,
      title: RISK_LINK_CONFIG.title,
    });
  }
  return textRules;
}
