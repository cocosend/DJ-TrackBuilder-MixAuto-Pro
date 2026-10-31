import Foundation

/// Adapted tone routes from the seven Stripe Waves presets. The iOS engine
/// applies the source cutoff to imported files, and routes EQ/echo through
/// its existing native controls; it does not emulate the donor synthesizers.
struct StripeWaveTonePreset: Identifiable, Sendable {
    let id: String
    let name: String
    let cutoffHz: Double
    let eq: [Double] // LOW, MID, HIGH
    let echoWet: Double

    static let all: [Self] = [
        .init(id: "maddix", name: "RUMBLE 909", cutoffHz: 420, eq: [3, 1, 1], echoWet: 0.18),
        .init(id: "artbat", name: "SPACE ATMOSPHERE", cutoffHz: 1400, eq: [2, -1, -1], echoWet: 0.30),
        .init(id: "brejcha", name: "HIGH-TECH", cutoffHz: 240, eq: [1, 2, -1], echoWet: 0.15),
        .init(id: "guetta", name: "FUTURE RAVE", cutoffHz: 1800, eq: [3, 1, 2], echoWet: 0.20),
        .init(id: "kazantip", name: "RETRO REVOLUTION", cutoffHz: 650, eq: [2, 3, 1], echoWet: 0.23),
        .init(id: "legends", name: "PURE ACID", cutoffHz: 350, eq: [0, 4, 2], echoWet: 0.25),
        .init(id: "modern", name: "LIVE AGGRESSION", cutoffHz: 290, eq: [3, 4, 2], echoWet: 0.11)
    ]

    /// Invert the synth's one-pole coefficient at its 48 kHz design rate.
    /// The existing filter slider remains the source of truth for patterns.
    var patternFilter: Double {
        let alpha = 1 - exp(-2 * Double.pi * cutoffHz / 48_000)
        return min(1, max(0, sqrt(max(0, (alpha - 0.004) / 0.996))))
    }
}

/// Portable project schema; audio is generated from the saved step velocities.
/// All banks are persisted, including ones that are not currently active.
struct TrackProject: Codable, Sendable {
    static let currentVersion = 1
    static let voiceNames = ["KICK 909", "HAT", "BASS 303"]
    static let bankNames = ["A", "B", "C", "D"]

    var schemaVersion = currentVersion
    var bpm: Double = 132
    var swing: Double = 0
    var crossfader: Double = 0.5
    var masterGain: Double = 0.7
    var bank: [Int] = [0, 0]
    var deckGain: [Double] = [1, 1]
    var deckFilter: [Double] = [1, 1]
    // Nil follows the manual slider. A preset keeps the exact imported-file
    // low-pass cutoff across launches while patterns use deckFilter.
    var deckPresetCutoffHz: [Double?] = [nil, nil]
    // Band order: LOW, MID, HIGH. Persisted alongside mixer state.
    var deckEQ: [[Double]] = [[0, 0, 0], [0, 0, 0]]
    // Optional legacy-safe per-deck live delay wet fraction 0...0.5.
    var deckDelay: [Double] = [0, 0]
    // Real mute/solo of our 3 ORIGINAL synthesized voices per deck. These
    // are not separated DRUMS/BASS/VOCALS/MUSIC from an imported file.
    var patternMute: [[Bool]] = [[false, false, false], [false, false, false]]
    var patternSolo: [[Bool]] = [[false, false, false], [false, false, false]]
    // [deck][bank][voice][step]: 0=off; 1...127=on with velocity.
    var velocity: [[[[Int]]]] = TrackProject.makeFactoryPatterns()

    init() {}

    // Backward-compatible decoding: M1 v0.2 project files did not include EQ.
    // This preserves the user's original pattern banks while adding controls.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        bpm = try c.decode(Double.self, forKey: .bpm)
        swing = try c.decode(Double.self, forKey: .swing)
        crossfader = try c.decode(Double.self, forKey: .crossfader)
        masterGain = try c.decode(Double.self, forKey: .masterGain)
        bank = try c.decode([Int].self, forKey: .bank)
        deckGain = try c.decode([Double].self, forKey: .deckGain)
        deckFilter = try c.decode([Double].self, forKey: .deckFilter)
        deckPresetCutoffHz = try c.decodeIfPresent([Double?].self, forKey: .deckPresetCutoffHz) ?? [nil, nil]
        velocity = try c.decode([[[[Int]]]].self, forKey: .velocity)
        deckEQ = try c.decodeIfPresent([[Double]].self, forKey: .deckEQ) ?? [[0, 0, 0], [0, 0, 0]]
        deckDelay = try c.decodeIfPresent([Double].self, forKey: .deckDelay) ?? [0, 0]
        patternMute = try c.decodeIfPresent([[Bool]].self, forKey: .patternMute) ??
            [[false, false, false], [false, false, false]]
        patternSolo = try c.decodeIfPresent([[Bool]].self, forKey: .patternSolo) ??
            [[false, false, false], [false, false, false]]
    }

    static var fileURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("TrackBuilderMixAutoPro.project.json")
    }

    static func load() throws -> TrackProject {
        let file = fileURL
        guard FileManager.default.fileExists(atPath: file.path) else { return TrackProject() }
        let decoded = try JSONDecoder().decode(TrackProject.self, from: Data(contentsOf: file))
        guard decoded.isValid else { throw NSError(domain: "TrackBuilderProject", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Saved project is unsupported or contains invalid values."]) }
        return decoded
    }

    func save() throws {
        guard isValid else { throw NSError(domain: "TrackBuilderProject", code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Project validation failed."]) }
        let bytes = try JSONEncoder().encode(self)
        try bytes.write(to: Self.fileURL, options: [.atomic])
    }

    var isValid: Bool {
        guard schemaVersion == Self.currentVersion,
              bpm.isFinite, (60...200).contains(bpm),
              swing.isFinite, (0...0.75).contains(swing),
              crossfader.isFinite, (0...1).contains(crossfader),
              masterGain.isFinite, (0...1).contains(masterGain),
              bank.count == 2, bank.allSatisfy({ (0..<4).contains($0) }),
              deckGain.count == 2, deckGain.allSatisfy({ $0.isFinite && (0...1).contains($0) }),
              deckFilter.count == 2, deckFilter.allSatisfy({ $0.isFinite && (0...1).contains($0) }),
              deckPresetCutoffHz.count == 2,
              deckPresetCutoffHz.allSatisfy({ value in
                  value.map { $0.isFinite && (120...18_120).contains($0) } ?? true
              }),
              deckDelay.count == 2, deckDelay.allSatisfy({ $0.isFinite && (0...0.5).contains($0) }),
              patternMute.count == 2, patternMute.allSatisfy({ $0.count == 3 }),
              patternSolo.count == 2, patternSolo.allSatisfy({ $0.count == 3 }),
              deckEQ.count == 2,
              deckEQ.allSatisfy({ $0.count == 3 && $0.allSatisfy({ $0.isFinite && (-12...12).contains($0) }) }),
              velocity.count == 2 else { return false }
        for deck in velocity {
            guard deck.count == 4 else { return false }
            for pattern in deck {
                guard pattern.count == 3 else { return false }
                for voice in pattern {
                    guard voice.count == 16, voice.allSatisfy({ (0...127).contains($0) })
                    else { return false }
                }
            }
        }
        return true
    }

    private static func makeFactoryPatterns() -> [[[[Int]]]] {
        var output = Array(repeating:
            Array(repeating:
                Array(repeating: Array(repeating: 0, count: 16), count: 3),
                count: 4), count: 2)
        for deck in 0..<2 {
            for bank in 0..<4 {
                for step in 0..<16 {
                    let kick: Bool
                    if bank <= 1 { kick = step % 4 == 0 }
                    else if bank == 2 { kick = step % 8 == 0 }
                    else { kick = step % 4 == 0 || step == 14 }

                    let hat: Bool
                    if bank == 0 { hat = step % 4 == 2 }
                    else if bank == 1 { hat = step % 2 == 0 }
                    else if bank == 2 { hat = step == 6 || step == 14 }
                    else { hat = step % 2 != 0 }

                    let bass: Bool
                    if bank == 0 {
                        bass = deck == 0 ? [0, 7, 10].contains(step) : [0, 3, 11, 14].contains(step)
                    } else if bank == 1 {
                        bass = step % 4 == (deck == 0 ? 3 : 1)
                    } else if bank == 2 {
                        bass = [0, 8, 11].contains(step)
                    } else {
                        bass = [2, 6, 10, 15].contains(step)
                    }
                    output[deck][bank][0][step] = kick ? 112 : 0
                    output[deck][bank][1][step] = hat ? 90 : 0
                    output[deck][bank][2][step] = bass ? 106 : 0
                }
            }
        }
        return output
    }
}
