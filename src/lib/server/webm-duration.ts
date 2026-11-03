import "server-only";

/**
 * MediaRecorder usually omits the WebM Duration element. Read the bounded
 * in-memory container's cluster/block timestamps instead of trusting a client
 * duration field (which is deliberately absent from the public contract).
 * This is a timestamp reader, not an audio decoder; it never executes content.
 */
const ID = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  defaultDuration: 0x23e383,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
} as const;
const CONTAINERS = new Set<number>([
  ID.segment,
  ID.info,
  ID.tracks,
  ID.trackEntry,
  ID.cluster,
  ID.blockGroup,
]);
const MAX_ELEMENTS = 100_000;

type Block = {
  cluster: number;
  relative: number;
  track: number;
  duration?: number;
};

function vint(bytes: Uint8Array, offset: number, keepMarker: boolean) {
  if (offset >= bytes.length) throw new Error("Truncated variable integer");
  const first = bytes[offset];
  let length = 1;
  while (length <= 8 && (first & (0x100 >> length)) === 0) length++;
  if (length > 8 || offset + length > bytes.length)
    throw new Error("Invalid variable integer");
  let value = keepMarker ? first : first & ((0x100 >> length) - 1);
  let allOnes = !keepMarker && value === (0x100 >> length) - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[offset + i];
    allOnes = allOnes && bytes[offset + i] === 0xff;
  }
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Oversized variable integer");
  return { value, length, unknownSize: allOnes };
}

function uint(bytes: Uint8Array) {
  if (bytes.length > 8) throw new Error("Oversized integer");
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  if (!Number.isSafeInteger(value)) throw new Error("Oversized integer");
  return value;
}

export function webmBlockDuration(bytes: Uint8Array): number | undefined {
  let timecodeScale = 1_000_000;
  let elements = 0;
  let clusterTimecode = 0;
  let currentTrack = 0;
  let currentBlock: Block | undefined;
  const defaults = new Map<number, number>();
  const blocks: Block[] = [];

  function walk(start: number, end: number, depth: number): void {
    if (depth > 12) throw new Error("Container nesting limit");
    let offset = start;
    while (offset < end) {
      if (++elements > MAX_ELEMENTS) throw new Error("Container element limit");
      const id = vint(bytes, offset, true);
      const size = vint(bytes, offset + id.length, false);
      const dataStart = offset + id.length + size.length;
      const dataEnd = size.unknownSize ? end : dataStart + size.value;
      if (dataEnd > end || dataEnd < dataStart)
        throw new Error("Truncated container");
      const data = bytes.subarray(dataStart, dataEnd);
      if (CONTAINERS.has(id.value)) {
        const previousBlock = currentBlock;
        const previousTrack = currentTrack;
        if (id.value === ID.cluster) clusterTimecode = 0;
        currentBlock = undefined;
        walk(dataStart, dataEnd, depth + 1);
        if (id.value === ID.blockGroup) currentBlock = previousBlock;
        if (id.value === ID.trackEntry) currentTrack = previousTrack;
      } else if (id.value === ID.timecodeScale) {
        timecodeScale = uint(data);
        if (timecodeScale <= 0) throw new Error("Invalid timecode scale");
      } else if (id.value === ID.trackNumber) {
        currentTrack = uint(data);
      } else if (id.value === ID.defaultDuration && currentTrack) {
        defaults.set(currentTrack, uint(data));
      } else if (id.value === ID.timecode) {
        clusterTimecode = uint(data);
      } else if (id.value === ID.simpleBlock || id.value === ID.block) {
        const track = vint(data, 0, false);
        if (track.value === 0 || track.length + 3 > data.length)
          throw new Error("Invalid block");
        const view = new DataView(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        const relative = view.getInt16(track.length, false);
        const flags = data[track.length + 2];
        // Lacing packs multiple frames into one timestamp. Browser recordings
        // do not use it; reject rather than undercount a manually crafted file.
        if (flags & 0x06) throw new Error("Laced audio is not supported");
        currentBlock = {
          cluster: clusterTimecode,
          relative,
          track: track.value,
        };
        blocks.push(currentBlock);
        if (blocks.length > MAX_ELEMENTS)
          throw new Error("Container block limit");
      } else if (id.value === ID.blockDuration && currentBlock) {
        currentBlock.duration = uint(data);
      }
      offset = dataEnd;
    }
  }

  try {
    walk(0, bytes.length, 0);
    if (!blocks.length) return undefined;
    let duration = 0;
    for (const block of blocks) {
      const frameTicks =
        block.duration ??
        (defaults.get(block.track) ?? 120_000_000) / timecodeScale;
      const seconds =
        ((block.cluster + block.relative + frameTicks) * timecodeScale) /
        1_000_000_000;
      if (!Number.isFinite(seconds)) throw new Error("Invalid timestamp");
      duration = Math.max(duration, seconds);
    }
    return duration;
  } catch {
    // The caller turns an unreadable/unsupported container into a safe 422.
    return undefined;
  }
}
