import "server-only";

/** Public errors contain no provider response, request body, prompt or secret. */
export type ApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_INPUT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_AUDIO"
  | "AUDIO_TOO_LONG"
  | "SERVICE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_MODEL_OUTPUT"
  | "UPSTREAM_TIMEOUT";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const ERRORS = {
  json: () =>
    new ApiError(
      400,
      "INVALID_JSON",
      "Передайте корректный JSON в теле запроса.",
    ),
  input: () =>
    new ApiError(
      400,
      "INVALID_INPUT",
      "Проверьте запрос: обязательные поля должны быть заполнены корректно.",
    ),
  mediaType: () =>
    new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Этот формат аудио не поддерживается. Запишите ответ ещё раз или введите текст.",
    ),
  payloadTooLarge: () =>
    new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Запрос слишком большой. Сократите запись или ответы и попробуйте ещё раз.",
    ),
  audioInvalid: () =>
    new ApiError(
      422,
      "INVALID_AUDIO",
      "Не удалось прочитать запись. Попробуйте ещё раз или введите ответ вручную.",
    ),
  audioTooLong: () =>
    new ApiError(
      422,
      "AUDIO_TOO_LONG",
      "Запись длиннее 60 секунд. Сократите её или введите ответ вручную.",
    ),
  unavailable: () =>
    new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "Сервис временно недоступен. Попробуйте позже или введите ответ вручную.",
      true,
      5,
    ),
  rateLimited: (retryAfter = 30) =>
    new ApiError(
      429,
      "RATE_LIMITED",
      "Лимит запросов исчерпан. Попробуйте позже; введённые данные можно сохранить и продолжить.",
      true,
      retryAfter,
    ),
  upstream: () =>
    new ApiError(
      503,
      "UPSTREAM_ERROR",
      "Сервис обработки сейчас недоступен. Попробуйте ещё раз позже.",
      true,
      5,
    ),
  malformed: () =>
    new ApiError(
      502,
      "INVALID_MODEL_OUTPUT",
      "Не удалось получить корректный результат. Попробуйте ещё раз или введите ответ вручную.",
      true,
    ),
  timeout: () =>
    new ApiError(
      504,
      "UPSTREAM_TIMEOUT",
      "Сервис не ответил вовремя. Попробуйте ещё раз позже.",
      true,
      5,
    ),
} as const;
