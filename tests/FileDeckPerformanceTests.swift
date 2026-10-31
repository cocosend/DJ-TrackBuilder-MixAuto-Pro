import Foundation

@main struct FileDeckPerformanceTests {
    static func main() throws {
        let original = ImportedAudio(fileName: "safe.wav", title: "A", duration: 120.5,
                                     tempo: TempoEstimate(bpm: 120, confidence: 0.75),
                                     beatGrid: BeatGridEstimate(firstBeatSeconds: 0.1,
                                        beatIntervalSeconds: 0.5, confidence: 0.6))
        precondition(original.isValid)
        var current = original
        for i in 0..<8 {
            guard let next = FileDeckPerformance.setCue(current, slot: i,
                            seconds: Double(i) * 4.0 + 0.25) else { preconditionFailure("Set cue") }
            current = next
        }
        precondition(current.hotCues?.count == 8)
        precondition(current.hotCues?[7] == 28.25)
        precondition(original.hotCues == nil, "Must not mutate source")
        precondition(FileDeckPerformance.setCue(current, slot: 8, seconds: 4) == nil)
        precondition(FileDeckPerformance.setCue(current, slot: -1, seconds: 4) == nil)
        precondition(FileDeckPerformance.setCue(current, slot: 0, seconds: 120.5) == nil)
        precondition(FileDeckPerformance.setCue(current, slot: 0, seconds: .nan) == nil)
        precondition(FileDeckPerformance.setCue(current, slot: 0, seconds: -.infinity) == nil)
        precondition(FileDeckPerformance.clearCue(current, slot: 8) == nil)
        current = FileDeckPerformance.clearCue(current, slot: 1)!
        precondition(current.hotCues?[1] == nil)
        precondition(current.hotCues?[0] == 0.25)
        precondition(FileDeckPerformance.cuePosition(current, slot: 7) == 28.25)
        precondition(FileDeckPerformance.cuePosition(current, slot: 1) == nil)
        precondition(FileDeckPerformance.seekFrame(seconds: 2.5, sampleRate: 48000,
                                                  length: 48000 * 12) == 120000)
        precondition(FileDeckPerformance.seekFrame(seconds: 12, sampleRate: 48000,
                                                  length: 48000 * 12) == nil)
        precondition(FileDeckPerformance.seekFrame(seconds: -1, sampleRate: 48000,
                                                  length: 48000 * 12) == nil)
        precondition(FileDeckPerformance.seekFrame(seconds: .infinity, sampleRate: 48000,
                                                  length: 48000 * 12) == nil)
        // Last-frame and normalized seeks never fall outside the file or take
        // a second lossy conversion through seconds.
        for rate in [44_100, 48_000, 96_000] {
            let length = Int64(rate * 123)
            for frame in [Int64(1), 7, 441, length / 2, length - 1] {
                let progress = (Double(frame) + 0.25) / Double(length)
                precondition(FileDeckPerformance.seekFrame(progress: progress, length: length) == frame)
            }
            precondition(FileDeckPerformance.seekFrame(progress: 1, length: length) == length - 1)
            precondition(FileDeckPerformance.seekFrame(progress: -1, length: length) == 0)
        }
        precondition(FileDeckPerformance.seekFrame(progress: .nan, length: 100) == nil)
        precondition(FileDeckPerformance.seekFrame(progress: 0, length: 0) == nil)
        precondition(FileDeckPerformance.seekFrame(progress: 1, length: Int64.max) == Int64.max - 1)

        // A converted loop may have a fractional source-to-output frame ratio.
        // Even after many cycles its source position must return to loop-in.
        let sourceFrames: Int64 = 88_201
        let outputFrames: Int64 = 96_001
        for cycles in [Int64(0), 1, 10, 1_000_000] {
            let atStart = FileDeckPerformance.loopFrame(sampleTime: cycles * outputFrames,
                playerRate: 48_000, bufferRate: 48_000, bufferFrames: outputFrames,
                sourceStart: 220_500, sourceFrames: sourceFrames)
            precondition(atStart == 220_500, "Converted loop clock must not drift")
            let halfway = FileDeckPerformance.loopFrame(sampleTime: cycles * outputFrames + 48_000,
                playerRate: 48_000, bufferRate: 48_000, bufferFrames: outputFrames,
                sourceStart: 220_500, sourceFrames: sourceFrames)
            precondition(abs(halfway - (220_500 + sourceFrames / 2)) <= 1)
        }
        precondition(FileDeckPerformance.loopFrame(sampleTime: -10, playerRate: 48_000,
            bufferRate: 48_000, bufferFrames: 100, sourceStart: 55, sourceFrames: 100) == 55)
        for duration in [30.0, 240.0, 3600.0] {
            let span = FileDeckPerformance.waveformSpan(duration: duration, zoom: 2)
            precondition(abs(span * duration - 4) < 0.000001,
                         "Touch sensitivity must not depend on track duration")
        }
        precondition(FileDeckPerformance.waveformSpan(duration: 2, zoom: 1) == 1)
        let roundTrip = try JSONDecoder().decode(ImportedAudio.self,
                                from: JSONEncoder().encode(current))
        precondition(current == roundTrip)
        precondition(roundTrip.tempo == original.tempo)
        precondition(roundTrip.beatGrid == original.beatGrid)
        let legacy = try JSONDecoder().decode(ImportedAudio.self,
            from: Data(#"{"fileName":"old.wav","title":"Old","duration":150}"#.utf8))
        precondition(legacy.hotCues == nil && legacy.isValid)
        print("FileDeckPerformanceTests PASS")
    }
}
