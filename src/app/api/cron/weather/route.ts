import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import { publishWeatherPost } from "@/lib/weather-bot";
import {
  startWeatherRun,
  finishWeatherRun,
  type WeatherRunResult,
  type WeatherRunSample,
} from "@/lib/weather-run-log";

/**
 * GET /api/cron/weather
 *
 * 1) Consulta Open-Meteo (Feira de Santana)
 * 2) Publica previsão diária (1x pela manhã, 5h–10h BRT)
 * 3) Publica alerta se chuva forte / calor extremo / tempestade
 * 4) Registra execução em weather_runs
 *
 * Auth: Authorization: Bearer <INTERNAL_API_SECRET>
 *
 * Agendamento: pg_cron + pg_net no Supabase (ver
 * sql/13_cron_supabase_pg_cron.sql), não mais vercel.json.
 *   "0 9 * * *"    → previsão da manhã (~06h BRT)
 *   "15 * * * *"   → checagem de alertas a cada hora
 */

const LAT = -12.2667;
const LON = -38.9667;
const TIMEZONE = "America/Bahia";

const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
  `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
  `&timezone=${encodeURIComponent(TIMEZONE)}` +
  `&forecast_days=2`;

const THRESHOLDS = {
  rainProbAlert: 70,
  rainProbStrong: 85,
  precipMmStrong: 15,
  heatExtreme: 35,
  windStrong: 40,
};

const WMO: Record<number, string> = {
  0: "Céu limpo",
  1: "Principalmente limpo",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Nevoeiro",
  48: "Nevoeiro com geada",
  51: "Garoa leve",
  53: "Garoa moderada",
  55: "Garoa forte",
  61: "Chuva leve",
  63: "Chuva moderada",
  65: "Chuva forte",
  66: "Chuva congelante leve",
  67: "Chuva congelante forte",
  71: "Neve leve",
  73: "Neve moderada",
  75: "Neve forte",
  80: "Pancadas de chuva leves",
  81: "Pancadas de chuva moderadas",
  82: "Pancadas de chuva fortes",
  95: "Tempestade",
  96: "Tempestade com granizo leve",
  99: "Tempestade com granizo forte",
};

function weatherLabel(code: number): string {
  return WMO[code] ?? `Código ${code}`;
}

function emojiForCode(code: number): string {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    time: string;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    weather_code: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
  };
};

async function fetchOpenMeteo(): Promise<OpenMeteoResponse> {
  const res = await fetch(OPEN_METEO_URL, {
    next: { revalidate: 0 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return res.json();
}

function buildDailyForecastContent(data: OpenMeteoResponse): string {
  const d = data.daily;
  const c = data.current;
  if (!d || !d.time?.length) {
    return "🌤️ Previsão indisponível no momento.";
  }

  const code = d.weather_code[0];
  const tmax = Math.round(d.temperature_2m_max[0]);
  const tmin = Math.round(d.temperature_2m_min[0]);
  const rainProb = Math.round(d.precipitation_probability_max[0] ?? 0);
  const rainSum = Math.round((d.precipitation_sum[0] ?? 0) * 10) / 10;
  const emoji = emojiForCode(code);
  const label = weatherLabel(code);
  const nowTemp =
    c?.temperature_2m != null ? Math.round(c.temperature_2m) : null;

  const lines = [
    `${emoji} Clima de hoje em Feira`,
    "",
    `Máxima: ${tmax}°C  ·  Mínima: ${tmin}°C`,
    `Condição: ${label}`,
    `Chuva: ${rainProb}%${rainSum > 0 ? ` (≈ ${rainSum} mm)` : ""}`,
  ];

  if (nowTemp != null) {
    lines.push(`Agora: ${nowTemp}°C`);
  }

  lines.push("");

  if (rainProb >= 60) {
    lines.push("👉 Leve o guarda-chuva se for sair.");
  } else if (tmax >= 34) {
    lines.push("👉 Dia quente — hidrate-se e evite o sol do meio-dia.");
  } else if (code <= 1) {
    lines.push("👉 Bom dia para resolver as coisas na rua.");
  } else {
    lines.push("👉 Acompanhe atualizações ao longo do dia.");
  }

  lines.push("");
  lines.push("Fonte: Open-Meteo");

  return lines.join("\n").slice(0, 1000);
}

type AlertDecision = {
  severity: "watch" | "warning" | "emergency";
  title: string;
  body: string;
  externalId: string;
} | null;

function decideAlert(data: OpenMeteoResponse): AlertDecision {
  const d = data.daily;
  const h = data.hourly;
  const c = data.current;
  if (!d || !h) return null;

  const now = new Date();
  const nextHours = 6;
  let maxRainProb = 0;
  let sumPrecip = 0;
  let hasThunder = false;
  const maxTemp = d.temperature_2m_max[0] ?? 0;

  for (let i = 0; i < Math.min(nextHours, h.time.length); i++) {
    const t = new Date(h.time[i]);
    if (t < now) continue;
    maxRainProb = Math.max(maxRainProb, h.precipitation_probability[i] ?? 0);
    sumPrecip += h.precipitation[i] ?? 0;
    const code = h.weather_code[i] ?? 0;
    if (code >= 95) hasThunder = true;
  }

  const wind = c?.wind_speed_10m ?? 0;
  const dayKey = d.time[0]?.replace(/-/g, "") ?? "unknown";

  if (hasThunder) {
    return {
      severity: "emergency",
      title: "Tempestade prevista nas próximas horas",
      body: "Risco de raios, ventos fortes e chuva intensa. Busque abrigo seguro e evite áreas abertas.",
      externalId: `storm-${dayKey}-${Math.floor(now.getHours() / 3)}`,
    };
  }

  if (
    maxRainProb >= THRESHOLDS.rainProbStrong ||
    sumPrecip >= THRESHOLDS.precipMmStrong
  ) {
    return {
      severity: "warning",
      title: "Chuva forte nas próximas horas",
      body: `Chance de chuva em torno de ${Math.round(maxRainProb)}%. Risco de alagamento em pontos baixos. Evite circular nessas áreas.`,
      externalId: `rain-strong-${dayKey}-${Math.floor(now.getHours() / 2)}`,
    };
  }

  if (maxRainProb >= THRESHOLDS.rainProbAlert) {
    return {
      severity: "watch",
      title: "Atenção: chuva prevista",
      body: `Probabilidade de chuva cerca de ${Math.round(maxRainProb)}% nas próximas horas. Leve o guarda-chuva.`,
      externalId: `rain-watch-${dayKey}`,
    };
  }

  if (maxTemp >= THRESHOLDS.heatExtreme) {
    return {
      severity: "watch",
      title: `Calor intenso: máxima de ${Math.round(maxTemp)}°C`,
      body: "Hidrate-se com frequência, evite exposição prolongada ao sol entre 10h e 16h e proteja crianças e idosos.",
      externalId: `heat-${dayKey}`,
    };
  }

  if (wind >= THRESHOLDS.windStrong) {
    return {
      severity: "watch",
      title: "Ventos fortes na região",
      body: `Rajadas em torno de ${Math.round(wind)} km/h. Cuidado com objetos soltos e galhos.`,
      externalId: `wind-${dayKey}-${Math.floor(now.getHours() / 3)}`,
    };
  }

  return null;
}

function isMorningWindow(): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(fmt.format(new Date()), 10);
  return hour >= 5 && hour < 10;
}

export async function GET(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  const startedAt = Date.now();
  const admin = createAdminClient();
  const runId = await startWeatherRun(admin, "cron");

  try {
    const data = await fetchOpenMeteo();
    const results: WeatherRunResult[] = [];

    // 1) Previsão diária (só de manhã)
    if (isMorningWindow()) {
      const dayKey = data.daily?.time?.[0]?.replace(/-/g, "") ?? "unknown";
      const content = buildDailyForecastContent(data);
      const published = await publishWeatherPost(
        admin,
        content,
        `daily-${dayKey}`
      );
      results.push({ type: "daily", ...published });
    } else {
      results.push({
        type: "daily",
        ok: false,
        reason: "fora da janela matinal (5h–10h BRT)",
      });
    }

    // 2) Alertas
    const alert = decideAlert(data);
    if (alert) {
      const emoji =
        alert.severity === "emergency"
          ? "🚨"
          : alert.severity === "warning"
            ? "⚠️"
            : "👀";

      const content = [
        `${emoji} ${alert.title}`,
        "",
        alert.body,
        "",
        "Fonte: Open-Meteo",
      ].join("\n");

      const published = await publishWeatherPost(
        admin,
        content,
        alert.externalId
      );
      results.push({
        type: `alert:${alert.severity}`,
        ...published,
      });
    } else {
      results.push({ type: "alert", ok: false, reason: "nenhum alerta" });
    }

    const posted = results.filter((r) => r.ok).length;
    const sample: WeatherRunSample = {
      currentTemp: data.current?.temperature_2m ?? null,
      dailyMax: data.daily?.temperature_2m_max?.[0] ?? null,
      rainProbMax: data.daily?.precipitation_probability_max?.[0] ?? null,
    };

    const hasInfraFailure = results.some(
      (r) =>
        r.reason?.includes("não configurada") ||
        r.reason?.includes("falha ao inserir")
    );

    await finishWeatherRun(admin, runId, {
      status: hasInfraFailure ? "error" : "ok",
      postedCount: posted,
      results,
      sample,
      startedAt,
    });

    return NextResponse.json({
      ok: true,
      runId,
      posted,
      results,
      sample,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "erro desconhecido";

    await finishWeatherRun(admin, runId, {
      status: "error",
      postedCount: 0,
      results: [],
      errorMessage: msg,
      startedAt,
    });

    const { message, status } = safeErrorResponse(
      error,
      500,
      "[cron/weather]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
