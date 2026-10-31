import Foundation

/// Value-level validation for a file deck; safe to test without Apple SDK.
/// Hot cues are absolute file seconds; they do not pretend to be beat sync.
enum FileDeckPerformance {
    static let slotCount = 8
    static func validPosition(_ seconds: Double, duration: Double) -> Bool {
        seconds.isFinite && duration.isFinite && duration > 0 &&
            seconds >= 0 && seconds < duration
    }

    static func setCue(_ imported: ImportedAudio, slot: Int, seconds: Double) -> ImportedAudio? {
        guard imported.isValid, (0..<slotCount).contains(slot),
              validPosition(seconds, duration: imported.duration) else { return nil }
        var cues = imported.hotCues ?? [Double?](repeating: nil, count: slotCount)
        cues[slot] = seconds
        return replacingCues(imported, cues)
    }

    static func clearCue(_ imported: ImportedAudio, slot: Int) -> ImportedAudio? {
        guard imported.isValid, (0..<slotCount).contains(slot) else { return nil }
        var cues = imported.hotCues ?? [Double?](repeating: nil, count: slotCount)
        cues[slot] = nil
        return replacingCues(imported, cues)
    }

    static func cuePosition(_ imported: ImportedAudio, slot: Int) -> Double? {
        guard (0..<slotCount).contains(slot) else { return nil }
        return imported.hotCues?[slot]
    }

    static func seekFrame(seconds: Double, sampleRate: Double, length: Int64) -> Int64? {
        guard seconds.isFinite, sampleRate.isFinite, sampleRate > 0,
              length > 0, seconds >= 0, seconds * sampleRate < Double(length),
              seconds * sampleRate < Double(Int64.max) else { return nil }
        let frame = Int64((seconds * sampleRate).rounded(.down))
        return min(length - 1, max(0, frame))
    }

    /// Keep normalized seeks in frame coordinates, avoiding a lossy round trip
    /// through seconds that could move the requested position one sample back.
    static func seekFrame(progress: Double, length: Int64) -> Int64? {
        guard progress.isFinite, length > 0 else { return nil }
        if progress <= 0 { return 0 }
        if progress >= 1 { return length - 1 }
        let frame = progress * Double(length)
        guard frame < Double(Int64.max) else { return length - 1 }
        return min(length - 1, Int64(frame))
    }

    /// Wrap in the ACTUAL resampled buffer's clock, then map one cycle back
    /// to source frames. Source-rate modulo accumulates conversion rounding.
    static func loopFrame(sampleTime: Int64, playerRate: Double, bufferRate: Double,
                          bufferFrames: Int64, sourceStart: Int64, sourceFrames: Int64) -> Int64 {
        guard playerRate.isFinite, bufferRate.isFinite, playerRate > 0,
              bufferRate > 0, bufferFrames > 0, sourceFrames > 0 else { return sourceStart }
        let elapsed = max(0, Double(sampleTime)) * bufferRate / playerRate
        guard elapsed.isFinite else { return sourceStart }
        let phase = elapsed.truncatingRemainder(dividingBy: Double(bufferFrames)) /
            Double(bufferFrames)
        return sourceStart + min(sourceFrames - 1, Int64(phase * Double(sourceFrames)))
    }

    /// The same gesture must cover the same time on a short track or long mix.
    static func waveformSpan(duration: Double?, zoom: Double) -> Double {
        let scale = zoom.isFinite ? max(1, zoom) : 1
        guard let duration, duration.isFinite, duration > 0 else { return 0.30 / scale }
        return min(1, 8 / duration) / scale
    }

    private static func replacingCues(_ imported: ImportedAudio, _ cues: [Double?]) -> ImportedAudio? {
        let replacement = ImportedAudio(fileName: imported.fileName, title: imported.title,
                                        duration: imported.duration, tempo: imported.tempo,
                                        beatGrid: imported.beatGrid,
                                        manuallyAdjustedGrid: imported.manuallyAdjustedGrid,
                                        hotCues: cues, loop: imported.loop)
        return replacement.isValid ? replacement : nil
    }
}
