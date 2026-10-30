# MixAuto One — canonical application

The primary project remains cocosend/DJ-TrackBuilder-MixAuto-Pro.
Live browser app: https://cocosend.github.io/DJ-TrackBuilder-MixAuto-Pro-Web/

Integrated from cocosend/artss-dj-creator-ios, source tree d2c42ffaad94b3d687dcc5b1217667a4a307cb16:
- Seven original procedural demo grooves, with the source BPM, root notes and stereo render equations from IOSAudioBackend.mm::synthPreset.
- Home-screen demo selection per deck, local file import, 50–150% rate control and 1/2-beat loops.
- Demo rendering occurs in a disposable Web Worker; PCM playback uses the current Web Audio graph.

Retained from MixAuto: Stripe Waves FX matrix, independent deck FX/EQ, waveform, hot cues, editable pattern banks, recording and fader automation. Demo loading does not overwrite the other deck. Source repository is not modified by this integration.

The browser version does not run RemoteIO, Fabric, JSI or the donor's native C++ render callback. Existing SwiftUI/C++ sources remain in ios/ and native/; signed device delivery still requires Apple signing. Tempo changes pitch; no pitch-preserving sync or imported-song stem separation is claimed. Demo grooves are not songs or recordings by the named artists.
