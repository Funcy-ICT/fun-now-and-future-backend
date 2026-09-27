import {
  BaselineConfig,
  BaselineSettings,
  BaselineSettingsPatch,
  BaselineSettingsPatchSchema,
  DEFAULT_BASELINE_SETTINGS,
} from "../schema/baseline_settings";

// 打ち間違いで設定全体が既定値に戻らないよう、項目ごとに検証する。おかしい項目だけを捨ててログに残す。
export const pickValidSettings = (value: unknown, where: string): BaselineSettingsPatch => {
  if (value === null || typeof value !== "object") return {};

  const patch: Record<string, number> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const parsed = BaselineSettingsPatchSchema.safeParse({ [key]: v });
    if (!parsed.success) {
      console.error(`Invalid value in ${where}.${key}:`, parsed.error.issues[0].message);
      continue;
    }
    if (parsed.data[key as keyof BaselineSettingsPatch] !== undefined) {
      patch[key] = v as number;
    }
  }
  return patch as BaselineSettingsPatch;
};

// locationの上書き、全体の既定値、コードの既定値の順に、項目ごとに解決する。
// 稼働時間帯が逆転していると窓が1つも無くなるので、その組み合わせだけは捨ててコードの既定値に戻す。
export const resolveSettings = (config: BaselineConfig | null, location: string): BaselineSettings => {
  const defaults = pickValidSettings(config?.defaults, "config/baseline.defaults");
  const override = pickValidSettings(config?.locations?.[location], `config/baseline.locations.${location}`);
  const settings = { ...DEFAULT_BASELINE_SETTINGS, ...defaults, ...override };

  if (settings.operatingStartHour >= settings.operatingEndHour) {
    console.error(`Invalid operating hours for ${location}: start must be before end.`);
    return {
      ...settings,
      operatingStartHour: DEFAULT_BASELINE_SETTINGS.operatingStartHour,
      operatingEndHour: DEFAULT_BASELINE_SETTINGS.operatingEndHour,
    };
  }
  return settings;
};
