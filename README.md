# DJ TrackBuilder MixAuto Pro — native iOS 0.6.0 (build 14)

The **FIRST approved nine-page Canva** design is the only visual target: [open the canonical concept](https://www.canva.com/d/UoJgnHMYH-EJu2u). The later redesign is rejected. This is a separate project from Stripewolf Wave, ARTSS DJ Creator and DJ NOVA.

**Project state: native Xcode CI passed.** [Xcode workflow](https://github.com/cocosend/DJ-TrackBuilder-MixAuto-Pro/actions/workflows/ci.yml) built the simulator app and the physical-iPhone architecture without signing, ran the DSP suite, both Apple audio graph integration tests and four XCUITest UI checks. Build 14 adds seven adapted Stripe Waves tone presets to the FX screen. The portrait and actual landscape layouts were captured in the simulator. A signed IPA and physical-iPhone audio verification are still pending Apple development signing and device testing.

## What this source currently contains

- C++17 real-time dual-deck synth sequencer with four 16-step pattern banks, original Kick/Hat/Bass voices, velocity, swing, smoothed EQ/filters/echo, crossfader and Pattern AutoMix.
- SwiftUI iPhone-first DJ Cockpit following the graphite/cyan/coral original Canva identity, two distinct decks with vertical PCM-derived **5-band spectral waveform energy**, fixed transport and a landscape control rail. Deck A is cyan and Deck B coral; idle waveform rendering pauses when its deck stops.
- Native iOS file-deck sources with AVAudioPlayerNode, EQ/delay, file import, play/cue, **eight live Hot Cues per deck**, sample-segment seek and bounded file loops (4/8/16 approximate beats); Apple runtime **unverified**.
- Beat hint estimate, grid correction, conservative unwarped file transition and immediate manual fader takeover. **These do NOT provide pitch-preserving Sync or phrase-aware beat matching.**
- Real mute/solo for *synthesized Kick/Hat/Bass* on each deck. **Imported-song four-channel STEMS NOT available.**
- Seven adapted Stripe Waves tone routes configure per-deck cutoff, EQ and echo without replacing the saved patterns. Source preset resonance, drive, synth voices and delay timing are not emulated.
- Native mixer WAV recording pipeline and offline original-pattern WAV render. Native recording runtime **unverified**.
- JSON project store, backwards-compatible audio manifests, off-callback waveform analysis, C++/Swift automated tests and macOS simulator GitHub Actions template.

## Verify portable code

```bash
scripts/verify_linux.sh
```

Checks 5 Release C++ suites, 5 Clang sanitizers suites, portable Swift Foundation model/algorithm tests (including route safety and background cancellation), Swift syntax parsing and real 16-second WAV format/peaks. The macOS GitHub Actions runner supplies Xcode; this local workspace does not have Xcode or a connected iPhone.

## Build and exercise real Apple Audio Units on a Mac

Version 0.6.0 introduces an XcodeGen XCTest **integration target** using Apple's
actual `AVAudioEngine` in offline/manual mode. It feeds **two independently
scheduled audio files into EQ/Delay/mixer** and verifies nonzero PCM output;
a second test checks repeated AVAudioPlayerNode `.loops` output. XCUITest UI
smokes open WAVE/MIX/STEMS/BUILDER/FX/AUTO, rotate to landscape, check both deck controls remain reachable and save simulator screenshots. These
checks passed on the GitHub Actions macOS runner. They cannot prove iPhone audio latency, speaker routing or master
recording.

From the source root on any appropriately configured Mac with Xcode + XcodeGen:

```bash
scripts/ios_build_on_mac.sh
```

It produces `ios-build-results/` with a **simulator-only unsigned `.app`**, XCTest
result bundle, test logs and the cockpit screenshot. The file is **not an IPA**
and cannot be installed on a physical iPhone. The same test matrix runs in
`.github/workflows/ci.yml` in this project's isolated GitHub repo.
No other DJ app repository should be used as a substitute.

## Alternative manual simulator build on Mac

```bash
brew install xcodegen
xcodegen generate --spec project.yml
xcodebuild -project DJTrackBuilderMixAutoPro.xcodeproj \
  -scheme DJTrackBuilderMixAutoPro \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Then validate both imported decks, file loops, live WAV recording, accessibility and route changes on an actual iPhone. The macOS CI run linked above is the build and test evidence; these commands are also available for a local Mac.

## Safety and reliability corrections in 0.5.1

- Headphone or Bluetooth output disconnect pauses all decks **even if the output sample rate is unchanged**. Any live recording is stopped safely; the user must explicitly tap PLAY again.
- Long-running waveform/tempo/file-loop/import/export work now propagates parent cancellation into its detached worker to avoid stale CPU load, waveform data, and unnecessary disk work after a deck changes.
- Import destination path is reserved on the owning task; a canceled/failed background file copy is cleaned up rather than being left as an orphan.
- iOS bundle and CMake versions are aligned at **0.5.1**. Sanitized CMake build directories are excluded from the source ZIP and cannot inflate or leak binaries into delivery.

## Project docs

- [0.5.1 reliability fixes, safety and tests](docs/RELIABILITY-FIXES-0.5.1.md)
- [0.5.2 route safety, cancellation and packaging](docs/ENGINEERING-CHECKPOINT-0.5.2.md)
- [0.5.0 engineering and evidence](docs/ENGINEERING-CHECKPOINT-0.5.0.md)
- [Release readiness and missing Apple runtime gates](docs/RELEASE-READINESS.md)
- [First Canva visual conformance matrix](docs/APPROVED-CANVA-CONFORMANCE.md)
- [Core audio architecture](docs/ARCHITECTURE.md)
- [0.4.0 historical checkpoint](docs/ENGINEERING-CHECKPOINT-0.4.0.md)

## Checkpoint packaging

```bash
python3 scripts/package_source.py /path/to/DJ-TrackBuilder-MixAuto-Pro-0.6.0-Source-Checkpoint.zip
```

The source-only ZIP includes a `SOURCE_SHA256SUMS.txt` manifest and excludes generated build directories, artifacts and private credentials. No paid/third-party music or third-party DJ artwork is bundled. Do **not** request release approval until Xcode, iPhone sound, navigation and original Canva visual QA are actually proven.


### Current 0.6.0 validation status

Portable DSP and Swift Foundation tests: run `scripts/verify_linux.sh`.
Apple's audio graph integration tests: **2/2 passed** on iPhone 16 Pro Simulator.
SwiftUI UI smoke: **4/4 passed**, including actual landscape rotation and reachable A/B transport; simulator app, screenshots and test result bundle are in the CI artifact.
Portable DSP/Linux CI also passed. A physical iPhone installation requires a
development signing team/provisioning profile and a connected iPhone or a
TestFlight distribution setup. Preserve the first nine-page Canva design as
sole visual target.

## Signed installation on a registered iPhone

The manual GitHub Actions workflow **Signed iPhone development IPA** archives
and exports a development-signed `.ipa`. It needs four repository Actions
secrets, set in GitHub rather than committed or sent in chat:

- `IOS_DEVELOPMENT_P12_BASE64`: base64 of the Apple Development certificate
  and its private key exported as a `.p12`.
- `IOS_P12_PASSWORD`: password of that `.p12`.
- `IOS_PROVISIONING_PROFILE_BASE64`: base64 of a development `.mobileprovision`
  for `com.artss.trackbuilder.mixautopro`, with the intended iPhone UDID registered.
- `IOS_TEAM_ID`: the Apple Developer Team ID matching the profile.

After those are configured, run **Actions → Signed iPhone development IPA → Run
workflow**. The workflow checks the profile's Team ID and bundle ID, builds an
archive and uploads an IPA artifact only if export succeeds. The current CI artifact includes an unsigned `Payload`-structured IPA for signing tools, as well as simulator and device builds. The unsigned IPA cannot be installed on a physical iPhone until it is signed with a matching Apple provisioning profile. Development signing also does not verify real speaker,
Bluetooth or recording behavior; exercise those after installation.
