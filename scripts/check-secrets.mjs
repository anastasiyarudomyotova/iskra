#!/usr/bin/env node
/**
 * Проверка гигиены репозитория «Искра».
 *
 * Блокирует попадание в Git того, чего там быть не должно:
 *   • файлы окружения (кроме .env.example);
 *   • ключи, сертификаты и токены;
 *   • аудиозаписи и сгенерированные записи голоса;
 *   • артефакты сборки и локальные данные.
 *
 * Дополнительно ищет в текстовых файлах характерные сигнатуры секретов.
 *
 * Использование:
 *   node scripts/check-secrets.mjs            # все файлы под контролем Git
 *   node scripts/check-secrets.mjs --staged   # только файлы в индексе (pre-commit)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const staged = process.argv.includes("--staged");

const ALLOWED_ENV_FILES = new Set([".env.example"]);

const BLOCKED_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
  ".netrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
]);

const BLOCKED_EXTENSIONS = [
  ".m4a",
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
  ".aac",
  ".aiff",
  ".amr",
  ".pem",
  ".key",
  ".p8",
  ".p12",
  ".keystore",
];

const BLOCKED_PATH_SEGMENTS = [
  "recordings/",
  "samples/",
  "audio/",
  "secrets/",
  "credentials/",
  ".next/",
  "/out/",
  "node_modules/",
];

const SECRET_PATTERNS = [
  { name: "Google API key (AIza…)", regex: /AIza[0-9A-Za-z_-]{35}/ },
  {
    name: "GitHub token",
    regex: /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    name: "Private key block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  { name: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", regex: /\bxox[abpsr]-[0-9A-Za-z-]{10,}/ },
  { name: "Google OAuth client secret", regex: /\bGOCSPX-[0-9A-Za-z_-]{20,}/ },
];

const TEXT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".yml",
  ".yaml",
  ".py",
  ".sh",
  ".txt",
  ".example",
  ".html",
];

function gitFiles() {
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files"];

  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    console.error("Не удалось получить список файлов Git.");
    process.exit(2);
  }
}

function baseName(filePath) {
  return filePath.split("/").pop() ?? filePath;
}

function extName(filePath) {
  const name = baseName(filePath);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isBlockedPath(filePath) {
  const name = baseName(filePath);

  if (name.startsWith(".env")) {
    return ALLOWED_ENV_FILES.has(name)
      ? null
      : `файл окружения «${name}» (коммитится только .env.example)`;
  }

  if (BLOCKED_NAMES.has(name)) {
    return `файл с учётными данными «${name}»`;
  }

  const ext = extName(filePath);
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    const audio = [
      ".m4a",
      ".mp3",
      ".wav",
      ".ogg",
      ".oga",
      ".opus",
      ".flac",
      ".aac",
      ".aiff",
      ".amr",
    ];
    return audio.includes(ext)
      ? `аудиофайл «${name}» (записи голоса не хранятся в Git)`
      : `ключ или сертификат «${name}»`;
  }

  const segment = BLOCKED_PATH_SEGMENTS.find((part) => filePath.includes(part));
  if (segment) {
    return `путь «${segment}» не должен попадать в Git`;
  }

  return null;
}

function looksTextual(filePath) {
  if (baseName(filePath) === ".env.example") {
    return true;
  }
  const ext = extName(filePath);
  return TEXT_EXTENSIONS.includes(ext) || ext === "";
}

function scanContent(filePath) {
  const findings = [];

  let content;
  try {
    if (statSync(filePath).size > 2 * 1024 * 1024) {
      return findings;
    }
    content = readFileSync(filePath, "utf8");
  } catch {
    return findings;
  }

  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(content)) {
      findings.push(`${filePath}: похоже на секрет — ${name}`);
    }
  }

  if (baseName(filePath) === ".env.example") {
    for (const line of content.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (match && !match[2].startsWith("#")) {
        findings.push(
          `${filePath}: переменная ${match[1]} должна быть пустой заглушкой, а не значением`,
        );
      }
    }
  }

  return findings;
}

const files = gitFiles();
const problems = [];

for (const file of files) {
  const reason = isBlockedPath(file);
  if (reason) {
    problems.push(`${file}: ${reason}`);
    continue;
  }

  if (looksTextual(file)) {
    problems.push(...scanContent(file));
  }
}

if (problems.length > 0) {
  console.error("Проверка гигиены репозитория не пройдена:\n");
  for (const problem of problems) {
    console.error(`  ✗ ${problem}`);
  }
  console.error(
    "\nУдалите файл из индекса и добавьте его в .gitignore. " +
      "Реальные ключи и записи голоса в репозиторий не попадают.",
  );
  process.exit(1);
}

console.log(
  `Проверка гигиены репозитория пройдена: ${files.length} файлов, секретов и запрещённых артефактов нет.`,
);
