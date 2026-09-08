/**
 * Schema.org JSON-LD — construção + validação.
 *
 * Garante que o markup enviado ao HTML:
 *  - usa @context correto
 *  - tem @type e campos obrigatórios por tipo
 *  - URLs absolutas https (ou http só em dev)
 *  - não inclui campos vazios/inválidos
 *
 * Referências:
 *  - https://schema.org/WebSite
 *  - https://schema.org/WebApplication
 *  - https://schema.org/Organization
 *  - https://developers.google.com/search/docs/appearance/structured-data
 */

import { getSiteUrl, SITE_DESCRIPTION_SHORT, SITE_NAME } from "@/lib/site";

export type JsonLd = Record<string, unknown>;

export interface SchemaValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface SchemaValidationResult {
  ok: boolean;
  errors: SchemaValidationIssue[];
  warnings: SchemaValidationIssue[];
}

const ABSOLUTE_URL_RE = /^https?:\/\/.+/i;
const HTTPS_URL_RE = /^https:\/\/.+/i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function push(
  list: SchemaValidationIssue[],
  path: string,
  message: string,
  severity: "error" | "warning"
) {
  list.push({ path, message, severity });
}

/** Valida uma URL absoluta (http/https). Em produção prefere https. */
export function validateAbsoluteUrl(
  value: unknown,
  path: string,
  opts?: { preferHttps?: boolean }
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (!isNonEmptyString(value)) {
    push(issues, path, "URL obrigatória ausente ou vazia", "error");
    return issues;
  }
  if (!ABSOLUTE_URL_RE.test(value)) {
    push(issues, path, `URL deve ser absoluta (http/https): "${value}"`, "error");
    return issues;
  }
  const preferHttps = opts?.preferHttps !== false;
  const isProd = process.env.NODE_ENV === "production";
  if (preferHttps && isProd && !HTTPS_URL_RE.test(value)) {
    push(issues, path, `Em produção a URL deve ser HTTPS: "${value}"`, "warning");
  }
  return issues;
}

function validateOrganization(node: JsonLd, path: string): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (node["@type"] !== "Organization") {
    push(issues, `${path}.@type`, 'Deve ser "Organization"', "error");
  }
  if (!isNonEmptyString(node.name)) {
    push(issues, `${path}.name`, "name é obrigatório", "error");
  }
  issues.push(...validateAbsoluteUrl(node.url, `${path}.url`));
  const logo = node.logo as JsonLd | undefined;
  if (logo && typeof logo === "object") {
    if (logo["@type"] !== "ImageObject") {
      push(issues, `${path}.logo.@type`, 'logo.@type deve ser "ImageObject"', "warning");
    }
    issues.push(...validateAbsoluteUrl(logo.url, `${path}.logo.url`));
  } else {
    push(issues, `${path}.logo`, "logo recomendado (ImageObject com url)", "warning");
  }
  return issues;
}

function validateWebSite(node: JsonLd, path: string): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (node["@type"] !== "WebSite") {
    push(issues, `${path}.@type`, 'Deve ser "WebSite"', "error");
  }
  if (!isNonEmptyString(node.name)) {
    push(issues, `${path}.name`, "name é obrigatório", "error");
  }
  issues.push(...validateAbsoluteUrl(node.url, `${path}.url`));
  if (!isNonEmptyString(node.description)) {
    push(issues, `${path}.description`, "description recomendada", "warning");
  }
  if (node.inLanguage && node.inLanguage !== "pt-BR") {
    push(issues, `${path}.inLanguage`, 'Recomendado "pt-BR" para este app', "warning");
  }
  return issues;
}

function validateWebApplication(node: JsonLd, path: string): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  if (node["@type"] !== "WebApplication") {
    push(issues, `${path}.@type`, 'Deve ser "WebApplication"', "error");
  }
  if (!isNonEmptyString(node.name)) {
    push(issues, `${path}.name`, "name é obrigatório", "error");
  }
  issues.push(...validateAbsoluteUrl(node.url, `${path}.url`));
  if (!isNonEmptyString(node.applicationCategory)) {
    push(issues, `${path}.applicationCategory`, "applicationCategory recomendada", "warning");
  }
  if (!isNonEmptyString(node.operatingSystem)) {
    push(issues, `${path}.operatingSystem`, "operatingSystem recomendado", "warning");
  }
  if (!isNonEmptyString(node.description)) {
    push(issues, `${path}.description`, "description recomendada", "warning");
  }
  const offers = node.offers as JsonLd | undefined;
  if (offers) {
    if (offers["@type"] !== "Offer") {
      push(issues, `${path}.offers.@type`, 'offers.@type deve ser "Offer"', "warning");
    }
    if (offers.price === undefined || offers.price === null || offers.price === "") {
      push(issues, `${path}.offers.price`, "offers.price recomendado (ex.: \"0\")", "warning");
    }
    if (!isNonEmptyString(offers.priceCurrency)) {
      push(issues, `${path}.offers.priceCurrency`, "offers.priceCurrency recomendado (ex.: BRL)", "warning");
    }
  }
  const area = node.areaServed as JsonLd | undefined;
  if (area) {
    if (area["@type"] !== "City") {
      push(issues, `${path}.areaServed.@type`, 'areaServed.@type deve ser "City"', "warning");
    }
    if (!isNonEmptyString(area.name)) {
      push(issues, `${path}.areaServed.name`, "areaServed.name obrigatório quando areaServed existe", "error");
    }
  }
  return issues;
}

/**
 * Valida um documento JSON-LD (@graph ou nó único).
 */
export function validateSchemaOrgDocument(doc: JsonLd): SchemaValidationResult {
  const errors: SchemaValidationIssue[] = [];
  const warnings: SchemaValidationIssue[] = [];

  const collect = (issues: SchemaValidationIssue[]) => {
    for (const i of issues) {
      if (i.severity === "error") errors.push(i);
      else warnings.push(i);
    }
  };

  if (doc["@context"] !== "https://schema.org") {
    collect([
      {
        path: "@context",
        message: 'Deve ser "https://schema.org"',
        severity: "error",
      },
    ]);
  }

  const graph = doc["@graph"];
  const nodes: { node: JsonLd; path: string }[] = [];

  if (Array.isArray(graph)) {
    graph.forEach((n, i) => {
      if (n && typeof n === "object") {
        nodes.push({ node: n as JsonLd, path: `@graph[${i}]` });
      } else {
        collect([
          {
            path: `@graph[${i}]`,
            message: "Nó inválido no @graph",
            severity: "error",
          },
        ]);
      }
    });
  } else if (doc["@type"]) {
    nodes.push({ node: doc, path: "$" });
  } else {
    collect([
      {
        path: "@graph",
        message: "Documento sem @graph e sem @type",
        severity: "error",
      },
    ]);
  }

  for (const { node, path } of nodes) {
    const type = node["@type"];
    if (!isNonEmptyString(type)) {
      collect([{ path: `${path}.@type`, message: "@type obrigatório", severity: "error" }]);
      continue;
    }
    switch (type) {
      case "WebSite":
        collect(validateWebSite(node, path));
        break;
      case "WebApplication":
        collect(validateWebApplication(node, path));
        break;
      case "Organization":
        collect(validateOrganization(node, path));
        break;
      default:
        collect([
          {
            path: `${path}.@type`,
            message: `Tipo "${type}" não possui validador dedicado (ainda pode ser válido no Schema.org)`,
            severity: "warning",
          },
        ]);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Monta o JSON-LD oficial do Gente da Feira e valida antes de devolver.
 * Em desenvolvimento, emite warnings no console se houver problemas.
 */
export function buildSiteJsonLd(): { jsonLd: JsonLd; validation: SchemaValidationResult } {
  const url = getSiteUrl().replace(/\/$/, "");
  const logoUrl = `${url}/icon.png`;

  const jsonLd: JsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        url,
        name: SITE_NAME,
        description: SITE_DESCRIPTION_SHORT,
        inLanguage: "pt-BR",
        publisher: { "@id": `${url}/#organization` },
      },
      {
        "@type": "WebApplication",
        "@id": `${url}/#app`,
        name: SITE_NAME,
        url,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript and HTML5",
        description: SITE_DESCRIPTION_SHORT,
        inLanguage: "pt-BR",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "BRL",
        },
        areaServed: {
          "@type": "City",
          name: "Feira de Santana",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Feira de Santana",
            addressRegion: "BA",
            addressCountry: "BR",
          },
        },
        publisher: { "@id": `${url}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: SITE_NAME,
        url,
        logo: {
          "@type": "ImageObject",
          url: logoUrl,
        },
      },
    ],
  };

  const validation = validateSchemaOrgDocument(jsonLd);

  if (process.env.NODE_ENV !== "production") {
    if (validation.errors.length) {
      console.error("[schema.org] erros de validação:", validation.errors);
    }
    if (validation.warnings.length) {
      console.warn("[schema.org] avisos:", validation.warnings);
    }
  }

  // Em produção, se houver erros graves, ainda emite o JSON-LD mas loga
  if (process.env.NODE_ENV === "production" && !validation.ok) {
    console.error("[schema.org] JSON-LD com erros:", validation.errors);
  }

  return { jsonLd, validation };
}

/**
 * Serializa JSON-LD de forma segura para uso em <script type="application/ld+json">.
 * Escapa < para evitar quebra de script / XSS se algum campo vier dinâmico no futuro.
 */
export function serializeJsonLd(jsonLd: JsonLd): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}
