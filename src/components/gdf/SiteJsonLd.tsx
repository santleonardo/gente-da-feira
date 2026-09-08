import { buildSiteJsonLd, serializeJsonLd } from "@/lib/schema-org";

/**
 * Schema.org JSON-LD validado (WebSite + WebApplication + Organization).
 * SSR — crawlers leem sem JS do client.
 *
 * Validação: src/lib/schema-org.ts (validateSchemaOrgDocument / buildSiteJsonLd).
 * Testar em: https://validator.schema.org/ e Google Rich Results Test.
 */
export function SiteJsonLd() {
  const { jsonLd, validation } = buildSiteJsonLd();

  // Em dev, data-attribute ajuda a inspecionar o status sem abrir o console
  const status = validation.ok ? "valid" : "invalid";

  return (
    <script
      type="application/ld+json"
      data-schema-org-validation={status}
      data-schema-org-errors={validation.errors.length || undefined}
      data-schema-org-warnings={validation.warnings.length || undefined}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
