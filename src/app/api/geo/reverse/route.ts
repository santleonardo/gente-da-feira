import { NextRequest, NextResponse } from "next/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { BAIRROS } from "@/lib/constants";
import {
  FEIRA_BOUNDS,
  isInsideFeira,
  matchBairroFromLabel,
} from "@/lib/geolocation";

/**
 * GET /api/geo/reverse?lat=&lon=
 * Reverse geocode via Nominatim (OpenStreetMap) e mapeia para BAIRROS de Feira.
 * Público (sem auth) — usado no cadastro e no perfil.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

function parseCoord(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function GET(req: NextRequest) {
  try {
    const blocked = await rateLimitByRule(req, "geo:reverse", undefined);
    if (blocked) return blocked;

    const { searchParams } = req.nextUrl;
    const lat = parseCoord(searchParams.get("lat"));
    const lon = parseCoord(searchParams.get("lon"));

    if (lat == null || lon == null) {
      return NextResponse.json(
        { error: "Parâmetros lat e lon são obrigatórios" },
        { status: 400 }
      );
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
    }

    const inBBox = isInsideFeira(lat, lon);

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "pt-BR,pt,en");
    // Zoom 18 ≈ nível de bairro / rua
    url.searchParams.set("zoom", "18");

    const nomRes = await fetch(url.toString(), {
      headers: {
        // Política do Nominatim exige User-Agent identificável
        "User-Agent": "GenteDaFeira/1.0 (https://www.gentedafeira.com; contato via site)",
        Accept: "application/json",
      },
      // Evita cache agressivo de CDN em coordenadas diferentes
      cache: "no-store",
    });

    if (!nomRes.ok) {
      return NextResponse.json(
        { error: "Serviço de mapa indisponível no momento" },
        { status: 502 }
      );
    }

    const data = (await nomRes.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };

    const addr = data.address || {};
    const cityCandidates = [
      addr.city,
      addr.town,
      addr.municipality,
      addr.county,
      addr.state_district,
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());

    const cityStr = cityCandidates.join(" ");
    const inCityByName =
      cityStr.includes("feira de santana") ||
      cityStr.includes("feira") ||
      // Alguns retornos usam só o estado + suburb
      (inBBox && Boolean(addr.state?.toLowerCase().includes("bahia") || addr["ISO3166-2-lvl4"] === "BR-BA"));

    const inCity = inBBox || inCityByName;

    const labelCandidates = [
      addr.suburb,
      addr.neighbourhood,
      addr.neighborhood,
      addr.city_district,
      addr.quarter,
      addr.residential,
      addr.hamlet,
      addr.village,
    ].filter(Boolean) as string[];

    const rawLabel = labelCandidates[0] || null;

    let neighborhood: string | null = null;
    for (const label of labelCandidates) {
      const matched = matchBairroFromLabel(label);
      if (matched) {
        neighborhood = matched;
        break;
      }
    }

    // Última tentativa: pedaços do display_name
    if (!neighborhood && data.display_name) {
      const parts = data.display_name.split(",").map((p) => p.trim());
      for (const p of parts.slice(0, 5)) {
        const matched = matchBairroFromLabel(p);
        if (matched && matched !== "Outro") {
          neighborhood = matched;
          break;
        }
      }
    }

    if (inCity && !neighborhood) {
      // Dentro da cidade mas sem match → permite "Outro"
      neighborhood = "Outro";
    }

    if (!inCity) {
      return NextResponse.json({
        neighborhood: null,
        rawLabel,
        city: cityCandidates[0] || null,
        inCity: false,
        matched: false,
        displayName: data.display_name || null,
        bounds: FEIRA_BOUNDS,
      });
    }

    return NextResponse.json({
      neighborhood,
      rawLabel,
      city: cityCandidates[0] || "Feira de Santana",
      inCity: true,
      matched: Boolean(
        neighborhood &&
          neighborhood !== "Outro" &&
          (BAIRROS as readonly string[]).includes(neighborhood)
      ),
      displayName: data.display_name || null,
    });
  } catch (error) {
    console.error("[geo/reverse]", error);
    return NextResponse.json(
      { error: "Erro ao resolver localização" },
      { status: 500 }
    );
  }
}
