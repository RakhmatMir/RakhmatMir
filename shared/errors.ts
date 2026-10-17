export const API_ERRORS = {
  UNAUTHORIZED: { code: "UNAUTHORIZED", message: "Требуется вход в систему" },
  FORBIDDEN: { code: "FORBIDDEN", message: "Нет доступа к этому ресурсу" },
  NOT_PUBLISHED: { code: "NOT_PUBLISHED", message: "Тест не опубликован" },
  BUNDLE_NOT_PUBLISHED: {
    code: "BUNDLE_NOT_PUBLISHED",
    message: "Пакет тестов не опубликован для класса",
  },
  NEEDS_REVIEW: {
    code: "NEEDS_REVIEW",
    message: "Требуется проверка содержания теста",
  },
  TIME_EXPIRED: { code: "TIME_EXPIRED", message: "Время истекло" },
  ATTEMPT_FINISHED: { code: "ATTEMPT_FINISHED", message: "Попытка уже завершена" },
  SAVE_FAILED: { code: "SAVE_FAILED", message: "Не удалось сохранить ответ" },
  VALIDATION: { code: "VALIDATION", message: "Ошибка проверки данных" },
  NOT_FOUND: { code: "NOT_FOUND", message: "Ресурс не найден" },
  RATE_LIMIT: { code: "RATE_LIMIT", message: "Слишком много попыток входа" },
  SETUP_REQUIRED: {
    code: "SETUP_REQUIRED",
    message: "Исходный JSON не найден. Добавьте файл в source-materials/ и выполните bun run seed",
  },
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS]["code"];

export class ApiError extends Error {
  public readonly payload: { code: string; message: string };

  constructor(code: ApiErrorCode | string, message: string, public readonly status = 400) {
    super(message);
    this.payload = { code, message };
  }
}
