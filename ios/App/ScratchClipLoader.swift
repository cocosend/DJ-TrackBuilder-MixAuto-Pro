import AVFAudio

final class PreparedScratchClip: @unchecked Sendable {
    let buffer: AVAudioPCMBuffer
    let start: Double
    let end: Double
    init(buffer: AVAudioPCMBuffer, start: Double, end: Double) {
        self.buffer = buffer; self.start = start; self.end = end
    }
}

/// Decode a bounded stereo window outside the real-time callback. The source
/// stays in the app's imported-audio store; no full-track memory load.
enum ScratchClipLoader {
    static func prepare(url: URL, near seconds: Double, outputRate: Double) throws
        -> PreparedScratchClip {
        let reader = try AVAudioFile(forReading: url,
            commonFormat: .pcmFormatFloat32, interleaved: false)
        let sourceRate = reader.processingFormat.sampleRate
        let center = min(reader.length - 1, max(0, Int64(seconds * sourceRate)))
        let half = Int64(sourceRate * 6)
        let start = max(0, center - half)
        let count = AVAudioFrameCount(min(reader.length - start, Int64(sourceRate * 12)))
        guard count >= 32,
              let input = AVAudioPCMBuffer(pcmFormat: reader.processingFormat,
                                           frameCapacity: count) else {
            throw NSError(domain: "Scratch", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Audio window is too short"])
        }
        reader.framePosition = start
        try reader.read(into: input, frameCount: count)
        guard input.frameLength == count else {
            throw NSError(domain: "Scratch", code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Incomplete PCM window"])
        }
        let output: AVAudioPCMBuffer
        if abs(sourceRate-outputRate) < 0.5 && reader.processingFormat.channelCount == 2 {
            output = input
        } else {
            guard let format = AVAudioFormat(standardFormatWithSampleRate: outputRate, channels: 2),
                  let converter = AVAudioConverter(from: reader.processingFormat, to: format),
                  let result = AVAudioPCMBuffer(pcmFormat: format,
                    frameCapacity: AVAudioFrameCount(ceil(Double(count)*outputRate/sourceRate)+128))
            else { throw NSError(domain: "Scratch", code: 4,
                userInfo: [NSLocalizedDescriptionKey: "PCM converter unavailable"]) }
            var pending = true
            var conversionError: NSError?
            let status = converter.convert(to: result, error: &conversionError) { _, inputStatus in
                if !pending { inputStatus.pointee = .endOfStream; return nil }
                pending = false
                inputStatus.pointee = .haveData
                return input
            }
            guard status != .error && result.frameLength >= 32 else {
                throw conversionError ?? NSError(domain: "Scratch", code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "PCM conversion failed"])
            }
            output = result
        }
        return PreparedScratchClip(buffer: output, start: Double(start)/sourceRate,
            end: Double(start)/sourceRate + Double(output.frameLength)/outputRate)
    }
}
