import "server-only";

import { parseBuffer, TrackType, type IAudioMetadata } from "music-metadata";
import { ERRORS } from "./api-errors";
import { AUDIO_MIME_TYPES, LIMITS } from "./schemas";
import { webmBlockDuration } from "./webm-duration";

export type ValidatedAudio = { data: string; mimeType: string };

export function normalizeAudioMimeType(value: string): string {
  const base = value.split(";")[0].trim().toLowerCase();
  if (!Object.hasOwn(AUDIO_MIME_TYPES, base)) throw ERRORS.mediaType();
  const normalized = AUDIO_MIME_TYPES[base];
  return normalized;
}

function containerMatches(mimeType: string, metadata: IAudioMetadata): boolean {
  const container = (metadata.format.container ?? "").toLowerCase();
  if (mimeType === "audio/webm") return container === "ebml/webm";
  if (mimeType === "audio/ogg") return container === "ogg";
  if (mimeType === "audio/wav")
    return container.includes("wave") || container.includes("riff");
  if (mimeType === "audio/flac") return container === "flac";
  if (mimeType === "audio/aiff") return container.startsWith("aiff");
  if (mimeType === "audio/mp4" || mimeType === "audio/m4a")
    return container.includes("mp4") || container.includes("quicktime");
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3")
    return container.includes("mpeg");
  if (mimeType === "audio/aac")
    return container.includes("adts") || container.includes("aac");
  return false;
}

export async function validateAudio(
  audioBase64: string,
  mimeType: string,
): Promise<ValidatedAudio> {
  const normalizedMime = normalizeAudioMimeType(mimeType);
  // Strict, canonical, padded base64. Buffer.from alone accepts corrupted data.
  if (
    audioBase64.length % 4 !== 0 ||
    // Character-class scan avoids recursive group captures and stack overflow
    // on multi-megabyte inputs; the canonical round-trip below checks padding.
    !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)
  )
    throw ERRORS.input();

  const bytes = Buffer.from(audioBase64, "base64");
  if (!bytes.length || bytes.toString("base64") !== audioBase64)
    throw ERRORS.input();
  if (bytes.byteLength > LIMITS.audioBytes) throw ERRORS.payloadTooLarge();

  let metadata: IAudioMetadata;
  try {
    metadata = await parseBuffer(
      bytes,
      { mimeType: normalizedMime, size: bytes.byteLength },
      {
        duration: true,
        skipCovers: true,
        includeChapters: false,
        mkvUseIndex: false, // Do not skip the clusters whose timestamps enforce the cap.
        maxMemoryAllocation: 1024 * 1024,
        maxMetadataEntries: 1000,
      },
    );
  } catch {
    throw ERRORS.audioInvalid();
  }

  if (
    !containerMatches(normalizedMime, metadata) ||
    metadata.format.hasAudio !== true ||
    metadata.format.trackInfo.some((track) => track.type === TrackType.video)
  ) {
    throw ERRORS.audioInvalid();
  }

  const durations = [
    metadata.format.duration,
    metadata.format.containerDuration,
    ...metadata.format.trackInfo.map((track) => track.duration),
  ];
  if (normalizedMime === "audio/webm") {
    // Only Opus is emitted by the supported MediaRecorder path. Its packets
    // are at most 120 ms; the timestamp reader uses that bound when necessary.
    if (!metadata.format.codec?.toLowerCase().includes("opus"))
      throw ERRORS.audioInvalid();
    durations.push(webmBlockDuration(bytes));
  }
  const known = durations.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  if (!known.length) throw ERRORS.audioInvalid();
  // A short header cannot hide a longer block timestamp.
  if (
    Math.max(...known) >
    LIMITS.audioDurationSeconds + LIMITS.audioDurationToleranceSeconds
  ) {
    throw ERRORS.audioTooLong();
  }
  return { data: audioBase64, mimeType: normalizedMime };
}
