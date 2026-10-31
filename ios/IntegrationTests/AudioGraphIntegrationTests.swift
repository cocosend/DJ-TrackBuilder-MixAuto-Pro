import XCTest
import AVFAudio
@testable import DJTrackBuilderMixAutoPro

/// Executed by Xcode on Apple's actual AVAudioEngine implementation, not a
/// Linux mock. It proves a two-file/EQ/delay offline signal path in Simulator;
/// hardware output, interruptions and iPhone latency remain separate gates.
final class AudioGraphIntegrationTests: XCTestCase {
    private let sampleRate: Double = 48_000
    private let channels: AVAudioChannelCount = 2

    private func testFormat() throws -> AVAudioFormat {
        try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels))
    }

    private func fileWithTone(_ frequency: Double, duration: Double = 0.75) throws -> URL {
        let format = try testFormat()
        let location = FileManager.default.temporaryDirectory
            .appendingPathComponent("mixauto-audio-unit-test-\(UUID().uuidString).caf")
        let count = AVAudioFrameCount(duration * sampleRate)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        let pcm = try XCTUnwrap(buffer.floatChannelData)
        buffer.frameLength = count
        for i in 0..<Int(count) {
            let value = Float(0.17 * sin(2 * Double.pi * frequency * Double(i) / sampleRate))
            pcm[0][i] = value
            pcm[1][i] = value
        }
        do {
            let writer = try AVAudioFile(forWriting: location,
                                         settings: format.settings,
                                         commonFormat: .pcmFormatFloat32,
                                         interleaved: false)
            try writer.write(from: buffer)
        }
        return location
    }

    private func render(_ engine: AVAudioEngine, seconds: Double) throws -> Double {
        let format = engine.manualRenderingFormat
        let out = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024))
        var framesRemaining = Int(seconds * sampleRate)
        var totalEnergy = 0.0
        var samples = 0
        var retries = 0
        while framesRemaining > 0 {
            let amount = AVAudioFrameCount(min(framesRemaining, 1024))
            let state = try engine.renderOffline(amount, to: out)
            switch state {
            case .success:
                retries = 0
                guard let data = out.floatChannelData else {
                    XCTFail("Manual mixer returned no Float32 PCM"); return 0
                }
                for i in 0..<Int(out.frameLength) {
                    let l = Double(data[0][i]), r = Double(data[1][i])
                    XCTAssertTrue(l.isFinite && r.isFinite, "NaN/Inf in hardware graph")
                    totalEnergy += l * l + r * r
                }
                samples += Int(out.frameLength) * 2
                framesRemaining -= Int(out.frameLength)
            case .cannotDoInCurrentContext, .insufficientDataFromInputNode:
                retries += 1
                XCTAssertLessThan(retries, 15, "Manual AVAudioEngine did not advance")
            case .error:
                XCTFail("Native AVAudioEngine reported offline render error")
                return 0
            @unknown default:
                XCTFail("Unknown AVAudioEngine manual rendering status")
                return 0
            }
        }
        return sqrt(totalEnergy / Double(max(1, samples)))
    }

    func testTwoFileDecksEQAndDelayRenderNonSilentPCM() throws {
        let urls = [try fileWithTone(220), try fileWithTone(440)]
        defer { urls.forEach { try? FileManager.default.removeItem(at: $0) } }
        let files = try urls.map { try AVAudioFile(forReading: $0) }
        let output = try testFormat()
        let engine = AVAudioEngine()
        let players = [AVAudioPlayerNode(), AVAudioPlayerNode()]
        let eqs = [AVAudioUnitEQ(numberOfBands: 3), AVAudioUnitEQ(numberOfBands: 3)]
        let delays = [AVAudioUnitDelay(), AVAudioUnitDelay()]
        for deck in 0..<2 {
            let player = players[deck], eq = eqs[deck], delay = delays[deck]
            for band in eq.bands { band.bypass = true }
            delay.wetDryMix = 0
            player.volume = 0.5
            engine.attach(player); engine.attach(eq); engine.attach(delay)
            engine.connect(player, to: eq, format: files[deck].processingFormat)
            engine.connect(eq, to: delay, format: files[deck].processingFormat)
            engine.connect(delay, to: engine.mainMixerNode, format: output)
            player.scheduleFile(files[deck], at: nil)
        }
        try engine.enableManualRenderingMode(.offline, format: output,
                                              maximumFrameCount: 1024)
        try engine.start()
        players.forEach { $0.play() }
        let rms = try render(engine, seconds: 0.5)
        players.forEach { $0.stop() }
        engine.stop()
        XCTAssertGreaterThan(rms, 0.02, "Two-file native graph rendered silence")
        XCTAssertLessThan(rms, 0.5, "Master output unexpectedly over-amplified")
    }

    func testNativeLoopRepeatsInSameAudioGraph() throws {
        let output = try testFormat()
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: output)
        let count: AVAudioFrameCount = 12_000 // quarter-second 48 kHz PCM
        let loop = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: output, frameCapacity: count))
        let pcm = try XCTUnwrap(loop.floatChannelData)
        loop.frameLength = count
        for i in 0..<Int(count) {
            let value = Float(0.2 * sin(2 * Double.pi * 440 * Double(i) / sampleRate))
            pcm[0][i] = value; pcm[1][i] = value
        }
        player.scheduleBuffer(loop, at: nil, options: [.loops], completionHandler: nil)
        try engine.enableManualRenderingMode(.offline, format: output,
                                              maximumFrameCount: 1024)
        try engine.start()
        player.play()
        let first = try render(engine, seconds: 0.50)
        let second = try render(engine, seconds: 0.50)
        player.stop(); engine.stop()
        XCTAssertGreaterThan(first, 0.02)
        XCTAssertGreaterThan(second, 0.02, "Loop became silent after source buffer ended")
        XCTAssertLessThan(abs(first - second), 0.06)
    }

    func testLoopSeamRemovesDiscontinuityWithoutChangingTheBody() throws {
        let format = try testFormat()
        let count: AVAudioFrameCount = 4_800
        let loop = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        let pcm = try XCTUnwrap(loop.floatChannelData)
        loop.frameLength = count
        for i in 0..<Int(count) {
            pcm[0][i] = i < 2_400 ? 0.75 : -0.75
            pcm[1][i] = i < 2_400 ? -0.25 : 0.25
        }
        LoopSeam.smooth(loop)
        XCTAssertEqual(pcm[0][0], pcm[0][Int(count)-1], accuracy: 0.00001)
        XCTAssertEqual(pcm[1][0], pcm[1][Int(count)-1], accuracy: 0.00001)
        XCTAssertEqual(pcm[0][Int(count)/2], -0.75, accuracy: 0.00001)
        XCTAssertEqual(pcm[1][Int(count)/2], 0.25, accuracy: 0.00001)
        XCTAssertEqual(loop.frameLength, count)
    }

    func testScratchReversesInFileMixerAndOtherDeckContinues() throws {
        let format = try testFormat()
        let engine = AVAudioEngine()
        let fileBus = AVAudioMixerNode()
        let scratch = try XCTUnwrap(ScratchBridge(sampleRate))
        defer { engine.stop() }
        let source = AVAudioSourceNode(format: format) { _, _, frames, output in
            scratch.render(frames, output)
        }
        let other = AVAudioPlayerNode()
        engine.attach(source); engine.attach(fileBus); engine.attach(other)
        engine.connect(source, to: fileBus, format: format)
        engine.connect(fileBus, to: engine.mainMixerNode, format: format)
        engine.connect(other, to: engine.mainMixerNode, format: format)
        let tone = try fileWithTone(440, duration: 1.5)
        defer { try? FileManager.default.removeItem(at: tone) }
        let file = try AVAudioFile(forReading: tone)
        other.scheduleFile(file, at: nil)
        let count: AVAudioFrameCount = 48_000
        let clip = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        clip.frameLength = count
        let pcm = try XCTUnwrap(clip.floatChannelData)
        for i in 0..<Int(count) {
            pcm[0][i] = 0.2
            pcm[1][i] = -0.2
        }
        XCTAssertTrue(scratch.load(clip, at: 0))
        scratch.target(0.5)
        scratch.active(true)
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 1024)
        try engine.start()
        other.play()
        let first = try render(engine, seconds: 0.3)
        scratch.target(0.1)
        let second = try render(engine, seconds: 0.3)
        XCTAssertGreaterThan(first, 0.05)
        XCTAssertGreaterThan(second, 0.05)
        XCTAssertLessThan(scratch.position(), 0.25)
        scratch.active(false)
        let otherOnly = try render(engine, seconds: 0.3)
        XCTAssertGreaterThan(otherOnly, 0.05, "Other deck must survive scratch release")
    }
}
