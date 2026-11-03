import { vi } from "vitest";

export const TEST_KEY = "test-only-not-a-real-key";
export const SYNTHETIC_ANSWERS = {
  daily_tasks:
    "Проверяет вымышленные отчёты и отвечает на вопросы тестовой команды.",
  current_project: "Учебный каталог вымышленных товаров без реальных клиентов.",
  next_six_months:
    "Продолжит учебный каталог и добавит поиск по вымышленным категориям.",
  tools_and_knowledge:
    "Табличный редактор и основы работы с вымышленными данными.",
};

export const SYNTHETIC_VACANCY = {
  position_title: "Не указано",
  summary: "Работа с вымышленными отчётами и учебным каталогом товаров.",
  responsibilities: [
    "Проверять вымышленные отчёты",
    "Отвечать на вопросы тестовой команды",
  ],
  project_context:
    "Учебный каталог вымышленных товаров; в ближайшие полгода — поиск по категориям.",
  tools_and_knowledge: [
    "Табличный редактор",
    "Основы работы с вымышленными данными",
  ],
  missing_information: [
    "Название должности не указано",
    "Зарплата не указана",
    "Местоположение не указано",
    "График не указан",
    "Уровень позиции не указан",
    "Требования к опыту не указаны",
  ],
  vacancy_text:
    "Должность: не указано.\n\nПроверка вымышленных отчётов и работа с учебным каталогом.\nЗарплата, местоположение, график, уровень позиции и опыт: не указано.",
};

export const SYNTHETIC_TRANSCRIPT = {
  transcript: "Это полностью вымышленный ответ для проверки расшифровки.",
  language: "Russian",
  uncertainWords: [],
};

/** Silent PCM generated in memory; no recording or binary fixture is committed. */
export function syntheticWav(seconds = 0.1): Buffer {
  const sampleRate = 16_000;
  const samples = Math.round(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  return bytes;
}

function vint(value: number): Buffer {
  for (let length = 1; length <= 8; length++) {
    if (value < 2 ** (7 * length) - 1) {
      const bytes = Buffer.alloc(length);
      bytes.writeUIntBE(value + 2 ** (7 * length), 0, length);
      return bytes;
    }
  }
  throw new Error("Fixture integer too large");
}
function uint(value: number): Buffer {
  if (value === 0) return Buffer.from([0]);
  const bytes: number[] = [];
  while (value > 0) {
    bytes.unshift(value % 256);
    value = Math.floor(value / 256);
  }
  return Buffer.from(bytes);
}
function element(id: number, data: Buffer): Buffer {
  return Buffer.concat([uint(id), vint(data.length), data]);
}
const numberElement = (id: number, value: number) => element(id, uint(value));
const textElement = (id: number, value: string) =>
  element(id, Buffer.from(value));

/** Minimal synthetic Opus/WebM container for validation tests, not a speech sample. */
export function syntheticWebm(
  options: {
    headerSeconds?: number;
    blockMilliseconds?: number;
    additionalClusterMilliseconds?: number[];
    blockGroupDurationMilliseconds?: number;
    lace?: boolean;
    truncate?: boolean;
  } = {},
): Buffer {
  const header = element(
    0x1a45dfa3,
    Buffer.concat([
      numberElement(0x4286, 1),
      numberElement(0x42f7, 1),
      numberElement(0x42f2, 4),
      numberElement(0x42f3, 8),
      textElement(0x4282, "webm"),
      numberElement(0x4287, 2),
      numberElement(0x4285, 2),
    ]),
  );
  const info = element(
    0x1549a966,
    Buffer.concat([
      numberElement(0x2ad7b1, 1_000_000),
      textElement(0x4d80, "synthetic-test"),
      textElement(0x5741, "synthetic-test"),
      ...(options.headerSeconds === undefined
        ? []
        : [
            element(
              0x4489,
              Buffer.from(
                new Float64Array([options.headerSeconds]).buffer,
              ).reverse(),
            ),
          ]),
    ]),
  );
  const tracks = element(
    0x1654ae6b,
    element(
      0xae,
      Buffer.concat([
        numberElement(0xd7, 1),
        numberElement(0x73c5, 1),
        numberElement(0x83, 2),
        textElement(0x86, "A_OPUS"),
        numberElement(0x23e383, 20_000_000),
        element(
          0xe1,
          Buffer.concat([
            element(0xb5, Buffer.from([0x40, 0xe7, 0x70, 0, 0, 0, 0, 0])),
            numberElement(0x9f, 1),
          ]),
        ),
      ]),
    ),
  );
  const blockHeader = Buffer.from([0x81, 0, 0, options.lace ? 0x02 : 0]);
  const blockPayload = Buffer.concat([blockHeader, Buffer.from([0xfc])]);
  const firstBlock =
    options.blockGroupDurationMilliseconds === undefined
      ? element(0xa3, blockPayload)
      : element(
          0xa0,
          Buffer.concat([
            element(0xa1, blockPayload),
            numberElement(0x9b, options.blockGroupDurationMilliseconds),
          ]),
        );
  const cluster = (milliseconds: number, block: Buffer) =>
    element(
      0x1f43b675,
      Buffer.concat([numberElement(0xe7, milliseconds), block]),
    );
  const bytes = Buffer.concat([
    header,
    element(
      0x18538067,
      Buffer.concat([
        info,
        tracks,
        cluster(options.blockMilliseconds ?? 0, firstBlock),
        ...(options.additionalClusterMilliseconds ?? []).map((milliseconds) =>
          cluster(milliseconds, element(0xa3, blockPayload)),
        ),
      ]),
    ),
  ]);
  return options.truncate ? bytes.subarray(0, bytes.length - 3) : bytes;
}

export function interactionResponse(output: unknown, status = "completed") {
  return {
    id: "synthetic-interaction",
    status,
    steps: [
      {
        type: "thought",
        content: [{ type: "text", text: "not the final JSON" }],
      },
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(output) }],
      },
    ],
  };
}

export function mockGemini(output: unknown, init: ResponseInit = {}) {
  const mock = vi.fn<typeof fetch>(async () =>
    Response.json(interactionResponse(output), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function jsonRequest(
  path: string,
  body: unknown,
  headers?: HeadersInit,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function sentBody(mock: ReturnType<typeof mockGemini>, call = 0) {
  const init = mock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}
