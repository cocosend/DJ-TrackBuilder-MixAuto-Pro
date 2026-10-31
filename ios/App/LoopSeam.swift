import AVFAudio

/// Shape only the end of an owned PCM loop. A beat-aligned cut can still split
/// a waveform mid-cycle, creating a sharp, audible step at every repetition.
/// Runs on the preparation worker, never in the audio rendering callback.
enum LoopSeam {
    static func smooth(_ buffer: AVAudioPCMBuffer, milliseconds: Double = 5) {
        guard let channels = buffer.floatChannelData,
              buffer.format.commonFormat == .pcmFormatFloat32,
              !buffer.format.isInterleaved,
              buffer.frameLength >= 16,
              buffer.format.sampleRate.isFinite, buffer.format.sampleRate > 0 else { return }
        let length = Int(buffer.frameLength)
        let ramp = min(length / 4,
                       max(2, Int(buffer.format.sampleRate * milliseconds / 1000)))
        guard ramp >= 2 else { return }
        for channel in 0..<Int(buffer.format.channelCount) {
            let data = channels[channel]
            let target = data[0]
            for i in 0..<ramp {
                let t = Float(i) / Float(ramp - 1)
                let weight = t * t * (3 - 2 * t)
                let index = length - ramp + i
                data[index] = data[index] * (1 - weight) + target * weight
            }
        }
    }
}
