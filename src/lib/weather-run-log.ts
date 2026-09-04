import type { SupabaseClient } from "@supabase/supabase-js";

export type WeatherRunResult = {
  type: string;
  ok: boolean;
  postId?: string;
  reason?: string;
};

export type WeatherRunSample = {
  currentTemp?: number | null;
  dailyMax?: number | null;
  rainProbMax?: number | null;
};

/**
 * Abre um registro de execução (status = running).
 * Retorna o id para atualizar no fim.
 */
export async function startWeatherRun(
  admin: SupabaseClient,
  trigger: "cron" | "manual" | "webhook" = "cron"
): Promise<string | null> {
  const { data, error } = await admin
    .from("weather_runs")
    .insert({
      status: "running",
      trigger,
      results: [],
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[weather-run-log] start failed:", error?.message);
    return null;
  }
  return data.id as string;
}

/**
 * Fecha o registro com resultado final.
 * Nunca lança — log é best-effort.
 */
export async function finishWeatherRun(
  admin: SupabaseClient,
  runId: string | null,
  opts: {
    status: "ok" | "error" | "partial";
    postedCount: number;
    results: WeatherRunResult[];
    sample?: WeatherRunSample | null;
    errorMessage?: string | null;
    startedAt: number;
  }
): Promise<void> {
  if (!runId) return;

  try {
    const durationMs = Math.max(0, Date.now() - opts.startedAt);

    const { error } = await admin
      .from("weather_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: opts.status,
        posted_count: opts.postedCount,
        results: opts.results,
        sample: opts.sample ?? null,
        error_message: opts.errorMessage ?? null,
        duration_ms: durationMs,
      })
      .eq("id", runId);

    if (error) {
      console.warn("[weather-run-log] finish failed:", error.message);
    }
  } catch (err) {
    console.warn("[weather-run-log] finish exception:", err);
  }
}
