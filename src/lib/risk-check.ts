/**
 * Aviso de risco (client + server): golpe, pedido de dinheiro, link suspeito.
 * Heurístico e síncrono — não depende de IA. Não bloqueia; só orienta.
 */

export type RiskFlag =
  | "money_request"
  | "suspicious_link"
  | "scam_phrase"
  | "credential_request";

export type RiskAssessment = {
  level: "none" | "warn";
  flags: RiskFlag[];
  /** Mensagens curtas para UI */
  messages: string[];
};

const MONEY_RE =
  /\b(pix|transfer[eê]ncia|transferir|dep[oó]sito|boleto|chave\s*pix|conta\s*banc[aá]ria|dados\s*banc[aá]rios|cart[aã]o\s*de\s*cr[eé]dito|gift\s*card|vale[- ]?presente|bitcoin|btc|usdt|crypto|criptomoeda|nft)\b/i;

const SCAM_RE =
  /\b(ganhe\s+dinheiro|renda\s+extra\s+f[aá]cil|investimento\s+garantido|lucro\s+garantido|dobrar?\s+(seu\s+)?dinheiro|sou\s+da\s+pol[ií]cia|suporte\s+(oficial|do\s+banco|whatsapp)|conta\s+bloqueada|urgente.{0,40}(pix|pagar|transfer)|pr[eê]mio\s+surpreendido|voc[eê]\s+ganhou\s+um?\s+pr[eê]mio|taxa\s+de\s+libera[cç][aã]o)\b/i;

const CREDENTIAL_RE =
  /\b(sua\s+senha|me\s+passa\s+a\s+senha|c[oó]digo\s+de\s+verifica[cç][aã]o|token\s+do\s+banco|n[uú]mero\s+do\s+cart[aã]o|\bcvv\b|validade\s+do\s+cart[aã]o|selfie\s+com\s+documento)\b/i;

const URL_RE =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-z0-9][-a-z0-9]{1,30}\.(com|net|org|br|io|co|cc|tk|ml|ga|cf|gq|xyz|top|click|link|shop|online|site)(\/[^\s]*)?/gi;

const SHORTENER_HOSTS =
  /\b(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|goo\.gl|ow\.ly|is\.gd|rb\.gy|rebrand\.ly|shorturl\.at|s\.id|clck\.ru)\b/i;

const IP_URL_RE = /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/i;

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Avalia sinais de risco no texto. Use antes de enviar DM/sala ou publicar.
 */
export function assessTextRisk(raw: string): RiskAssessment {
  const text = (raw || "").trim();
  if (!text) {
    return { level: "none", flags: [], messages: [] };
  }

  const flags: RiskFlag[] = [];
  const messages: string[] = [];

  if (MONEY_RE.test(text)) {
    flags.push("money_request");
    messages.push(
      "Este texto fala em dinheiro, Pix ou pagamento. Desconfie de pedidos de valor a desconhecidos."
    );
  }

  if (SCAM_RE.test(text)) {
    flags.push("scam_phrase");
    messages.push(
      "Há trechos parecidos com golpe ou oferta boa demais. Confirme por outro canal antes de agir."
    );
  }

  if (CREDENTIAL_RE.test(text)) {
    flags.push("credential_request");
    messages.push(
      "Parece pedir senha, código ou dados de cartão. Nunca compartilhe isso por mensagem."
    );
  }

  const urls = text.match(URL_RE) || [];
  if (urls.length > 0) {
    const joined = urls.join(" ");
    const suspicious =
      SHORTENER_HOSTS.test(joined) ||
      IP_URL_RE.test(text) ||
      /https?:\/\//i.test(text) === false && urls.some((u) => /\.(tk|ml|ga|cf|gq|xyz|top|click)\b/i.test(u)) ||
      urls.length >= 3 ||
      (urls.length >= 1 && (MONEY_RE.test(text) || SCAM_RE.test(text)));

    if (suspicious) {
      flags.push("suspicious_link");
      messages.push(
        "Há link suspeito (encurtador, muitos links ou link + dinheiro). Não abra nem informe dados."
      );
    } else if (urls.length >= 1 && CREDENTIAL_RE.test(text)) {
      flags.push("suspicious_link");
      messages.push("Link combinado com pedido de dados sensíveis — trate como risco alto.");
    }
  }

  const uniqFlags = unique(flags);
  const uniqMessages = unique(messages);

  return {
    level: uniqFlags.length > 0 ? "warn" : "none",
    flags: uniqFlags,
    messages: uniqMessages,
  };
}

/** Título curto para o banner */
export function riskBannerTitle(assessment: RiskAssessment): string {
  if (assessment.flags.includes("credential_request")) {
    return "Cuidado: dados sensíveis";
  }
  if (assessment.flags.includes("scam_phrase")) {
    return "Possível golpe";
  }
  if (assessment.flags.includes("suspicious_link")) {
    return "Link suspeito";
  }
  if (assessment.flags.includes("money_request")) {
    return "Pedido envolvendo dinheiro";
  }
  return "Aviso de segurança";
}
