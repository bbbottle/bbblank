/**
 * 今日天气：Open-Meteo 公开接口（免费、无需 key、允许跨域），响应体先经 Schema 解码再使用。
 */
import { Schema } from "effect";

/** 长沙市区 */
const CHANGSHA = { latitude: 28.2282, longitude: 112.9388 };

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?" +
  new URLSearchParams({
    latitude: String(CHANGSHA.latitude),
    longitude: String(CHANGSHA.longitude),
    current: "temperature_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "Asia/Shanghai",
    forecast_days: "1",
  }).toString();

const decodeForecast = Schema.decodeUnknownSync(
  Schema.Struct({
    current: Schema.Struct({ temperature_2m: Schema.Number }),
    daily: Schema.Struct({
      weather_code: Schema.Array(Schema.Number),
      temperature_2m_max: Schema.Array(Schema.Number),
      temperature_2m_min: Schema.Array(Schema.Number),
    }),
  }),
);

/** WMO 天气代码（Open-Meteo 文档） */
const WMO: ReadonlyArray<readonly [ReadonlyArray<number>, string]> = [
  [[0], "晴"],
  [[1], "大部晴朗"],
  [[2], "多云"],
  [[3], "阴"],
  [[45, 48], "雾"],
  [[51, 53, 55], "细雨"],
  [[56, 57], "冻毛毛雨"],
  [[61], "小雨"],
  [[63], "中雨"],
  [[65], "大雨"],
  [[66, 67], "冻雨"],
  [[71], "小雪"],
  [[73], "中雪"],
  [[75], "大雪"],
  [[77], "雪粒"],
  [[80, 81, 82], "阵雨"],
  [[85, 86], "阵雪"],
  [[95], "雷暴"],
  [[96, 99], "雷暴伴冰雹"],
];

const describe = (code: number) =>
  WMO.find(([codes]) => codes.includes(code))?.[1] ?? `天气代码 ${code}`;

/** 形如「长沙今日：毛毛雨，16.4–23.5°C，当前 19.6°C」 */
export const fetchTodayWeather = async (
  signal?: AbortSignal,
): Promise<string> => {
  const res = await fetch(FORECAST_URL, { signal });
  if (!res.ok) throw new Error(`GET ${FORECAST_URL} ${res.status}`);
  const { current, daily } = decodeForecast(await res.json());
  const [code, max, min] = [
    daily.weather_code[0],
    daily.temperature_2m_max[0],
    daily.temperature_2m_min[0],
  ];
  if (code === undefined || max === undefined || min === undefined)
    throw new Error("forecast has no daily entry");
  return `${describe(code)}，${min}–${max}°C，当前 ${current.temperature_2m}°C`;
};
