/**
 * Zstandard 多帧容器的读取原语——dsh 会话日志专用。
 *
 * 为什么不能只用 `zstdDecompressSync`：dsh 的 `session.jsonl.zstd` 不是「一个
 * 文件一帧」，而是**每追加一批就压一帧**的串联容器（本机实测：804 KB 的文件
 * 里有 2099 帧）。Node 的 zstd API 只解第一帧，直接把整个文件丢进去只会得到
 * 文件头那 171 字节——本机真实数据上踩过这个坑。
 *
 * 帧边界不靠解压就能定位：zstd 帧是自描述长度结构（magic → frame header →
 * block headers），扫描头部的字节数即可。算法照公开格式规范实现，与 dsh 官方
 * `dsh-session-persistence-jsonl` 的 scanZstdFrames 行为一致（同样的 magic、
 * 保留位判定、RLE 块只占 1 字节、末尾 checksum 4 字节），因此对同一批文件得出
 * 同样的帧切分。
 *
 * 本模块是纯函数：只吃 Buffer、吐 Buffer/偏移，不碰文件系统、不 import
 * electron，判卷可以在 node 里直接跑（tools/dsh_reader_check.ts）。
 */

/** Zstandard 帧魔数（小端读出的 0xFD2FB528）。 */
const ZSTD_MAGIC = 4247762216

export interface ZstdFrameRange {
  start: number
  end: number
}

export interface ZstdFrameScan {
  /** 已完整落在 buffer 里的帧，按出现顺序。 */
  frames: ZstdFrameRange[]
  /**
   * 尾部不完整帧的起始偏移。dsh 是 append-only 的，进程被杀时最后一帧可能只
   * 写了一半；这不是损坏，是「还没写完」，读到它就该停下而不是报错误导用户。
   */
  tornStart: number | undefined
}

/**
 * 扫描串联 zstd 帧的边界，不解压块数据。
 *
 * @param buffer - 文件当前的全部字节
 * @param maxFrames - 只要元数据时的上限（列表页不需要读完 18 MB 的会话）
 * @throws 帧头/块头结构非法时抛错（真损坏，不是写了一半）
 */
export function scanZstdFrames(
  buffer: Buffer,
  maxFrames: number = Number.POSITIVE_INFINITY
): ZstdFrameScan {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`invalid zstd frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    // bit3 保留、bit4 未使用，两者都必须为 0；置位说明这不是我们认识的结构。
    if ((descriptor & 24) !== 0) {
      throw new Error(`reserved zstd frame-header bit at byte ${offset - 1}`)
    }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes =
      contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes =
      (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes

    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      // blockType 3 是保留值；出现即结构损坏。
      if (blockType === 3) {
        throw new Error(`reserved zstd block type at byte ${offset - 3}`)
      }
      // RLE 块的 payload 是 1 字节，blockSize 是解压后长度，不是磁盘长度。
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
    if (frames.length >= maxFrames) return { frames, tornStart: undefined }
  }
  return { frames, tornStart: undefined }
}
