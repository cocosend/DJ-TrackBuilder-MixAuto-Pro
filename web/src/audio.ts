import { DJ_MATRIX, stripeFilter, type PresetKey } from './presets'
export type DeckIndex = 0 | 1
export type Voice = 'kick' | 'hat' | 'bass'
export type Pattern = Record<Voice, boolean[]>
export type DeckSnapshot = {
  title: string
  kind: 'pattern' | 'file'
  duration: number
  playing: boolean
  position: number
  bpm: number
  preset: PresetKey | null
  bank: number
  peaks: number[]
  cues: Array<number | null>
  loopBeats: 0 | 4 | 8 | 16
  volume: number
  eq: [number, number, number]
  filter: number
  echo: number
  muted: Record<Voice, boolean>
}

const banks: Pattern[] = [
  { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], hat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0], bass: [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0] },
  { kick: [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0], hat: [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1], bass: [1,0,0,0,0,1,0,0,1,0,0,0,0,1,0,0] },
  { kick: [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0], hat: [0,0,1,0,1,0,1,0,0,0,1,0,1,0,1,0], bass: [1,0,0,0,1,0,0,1,1,0,0,0,1,0,0,1] },
  { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1], hat: [0,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1], bass: [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0] },
].map(p => ({ kick: p.kick.map(Boolean), hat: p.hat.map(Boolean), bass: p.bass.map(Boolean) }))

export const BANK_NAMES = ['A', 'B', 'C', 'D']
export const makePatterns = (): Pattern[] => banks.map(p => ({
  kick: [...p.kick], hat: [...p.hat], bass: [...p.bass],
}))

export const demoPeaks = (seed: number): number[] => Array.from({ length: 160 }, (_, i) => {
  const beat = i % 40
  const pulse = Math.exp(-Math.pow((beat - 3) / 7, 2))
  const hit = Math.exp(-Math.pow((beat - 22) / 5, 2))
  return Math.min(1, .07 + pulse * .78 + hit * .42 + .12 * Math.abs(Math.sin(i * (seed ? 2.17 : 1.79))))
})

type DeckRuntime = {
  buffer: AudioBuffer | null
  source: AudioBufferSourceNode | null
  offset: number
  startedAt: number
  nextStepAt: number
  step: number
  gain: GainNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  filterNode: BiquadFilterNode
  punch: BiquadFilterNode
  driveIn: GainNode
  driveOut: GainNode
  lfo: OscillatorNode | null
  lfoGain: GainNode | null
  loadId: number
  drive: WaveShaperNode
  delay: DelayNode
  feedback: GainNode
  wet: GainNode
}

export class MixEngine {
  private context: AudioContext | null = null
  private media: MediaStreamAudioDestinationNode | null = null
  private runtime: [DeckRuntime, DeckRuntime] | null = null
  private ticker: number | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private hatBuffer: AudioBuffer | null = null
  crossfade = .5
  patterns = makePatterns()
  decks: [DeckSnapshot, DeckSnapshot] = [0, 1].map(i => ({
    title: i === 0 ? 'Night Circuit' : 'Retro Coast', kind: 'pattern', duration: 0,
    playing: false, position: 0, bpm: 132, bank: 0, preset: null,
    peaks: demoPeaks(i), cues: Array(8).fill(null), loopBeats: 0,
    volume: .85, eq: [0, 0, 0], filter: 1, echo: 0,
    muted: { kick: false, hat: false, bass: false },
  })) as [DeckSnapshot, DeckSnapshot]

  private async ready() {
    if (!this.context) {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      const output = ctx.createGain()
      const media = ctx.createMediaStreamDestination()
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12
      limiter.attack.value = .003; limiter.release.value = .15
      output.connect(limiter)
      limiter.connect(ctx.destination)
      limiter.connect(media)
      this.context = ctx
      this.media = media
      this.runtime = [0, 1].map(() => {
        const gain = ctx.createGain()
        const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250
        const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = .7
        const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000
        const filterNode = ctx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 20000
        const punch = ctx.createBiquadFilter(); punch.type = 'lowshelf'; punch.frequency.value = 110
        const driveIn = ctx.createGain(), driveOut = ctx.createGain()
        const drive = ctx.createWaveShaper(); drive.oversample = '2x'
        const delay = ctx.createDelay(1); delay.delayTime.value = .28
        const feedback = ctx.createGain(); feedback.gain.value = .25
        const wet = ctx.createGain(); wet.gain.value = 0
        gain.connect(low).connect(mid).connect(high).connect(filterNode).connect(punch).connect(driveIn).connect(drive).connect(driveOut).connect(output)
        driveOut.connect(delay).connect(wet).connect(output)
        delay.connect(feedback).connect(delay)
        return { buffer: null, source: null, offset: 0, startedAt: 0, nextStepAt: 0,
          step: 0, gain, low, mid, high, filterNode, punch, driveIn, driveOut, lfo: null, lfoGain: null, loadId: 0, drive, delay, feedback, wet }
      }) as [DeckRuntime, DeckRuntime]
      this.setCrossfade(this.crossfade)
      this.decks.forEach((d, i) => {
        const deck = i as DeckIndex
        this.setEq(deck, 0, d.eq[0]); this.setEq(deck, 1, d.eq[1]); this.setEq(deck, 2, d.eq[2])
        this.configurePreset(deck)
        this.setFilter(deck, d.filter); this.setEcho(deck, d.echo)
      })
    }
    if (this.context.state !== 'running') await this.context.resume()
  }

  private updateGains() {
    if (!this.context || !this.runtime) return
    this.runtime.forEach((r, i) => {
      const curve = i === 0 ? Math.cos(this.crossfade * Math.PI / 2) : Math.sin(this.crossfade * Math.PI / 2)
      r.gain.gain.setTargetAtTime(curve * this.decks[i].volume, this.context!.currentTime, .01)
    })
  }
  setCrossfade(value: number) { this.crossfade = Math.max(0, Math.min(1, value)); this.updateGains() }
  setVolume(deck: DeckIndex, value: number) { this.decks[deck].volume = value; this.updateGains() }
  setEq(deck: DeckIndex, index: 0 | 1 | 2, value: number) {
    this.decks[deck].eq[index] = value
    const r = this.runtime?.[deck]; const ctx = this.context
    if (r && ctx) [r.low, r.mid, r.high][index].gain.setTargetAtTime(value, ctx.currentTime, .02)
  }
  setFilter(deck: DeckIndex, value: number) {
    this.decks[deck].filter = value
    this.runtime?.[deck].filterNode.frequency.setTargetAtTime(120 * Math.pow(20000 / 120, value), this.context!.currentTime, .02)
  }
  setEcho(deck: DeckIndex, value: number) {
    this.decks[deck].echo = value
    this.runtime?.[deck].wet.gain.setTargetAtTime(value * (this.decks[deck].preset ? .18 * .17 : .55), this.context!.currentTime, .02)
  }
  applyPreset(deck: DeckIndex, key: PresetKey) {
    const preset = DJ_MATRIX[key]
    this.decks[deck].preset = key
    this.decks[deck].filter = Math.log(stripeFilter(preset).cutoff / 120) / Math.log(20000 / 120)
    this.decks[deck].echo = 1
    this.configurePreset(deck)
    this.setFilter(deck, this.decks[deck].filter); this.setEcho(deck, 1)
  }
  clearPreset(deck: DeckIndex) {
    this.decks[deck].preset = null; this.configurePreset(deck)
    this.setFilter(deck, 1); this.setEcho(deck, 0)
  }
  private configurePreset(deck: DeckIndex) {
    const r = this.runtime?.[deck], ctx = this.context
    if (!r || !ctx) return
    const key = this.decks[deck].preset, preset = key ? DJ_MATRIX[key] : null
    r.filterNode.type = 'lowpass'
    r.lfo?.stop(); r.lfo?.disconnect(); r.lfoGain?.disconnect(); r.lfo = null; r.lfoGain = null
    r.punch.gain.setTargetAtTime(preset?.has909Punch ? 4 : 0, ctx.currentTime, .08)
    r.driveIn.gain.setTargetAtTime(preset ? 1 + preset.drive / 2500 : 1, ctx.currentTime, .08)
    r.driveOut.gain.setTargetAtTime(preset ? 1.95 : 1, ctx.currentTime, .08)
    r.filterNode.Q.setTargetAtTime(preset ? stripeFilter(preset).q : 1, ctx.currentTime, .02)
    r.delay.delayTime.setTargetAtTime(preset?.delayTime ?? .28, ctx.currentTime, .02)
    r.feedback.gain.setTargetAtTime(preset ? Math.min(.16, preset.feedback * .35) : .25, ctx.currentTime, .02)
    if (preset) {
      const amount = 1 + preset.drive / 400, curve = new Float32Array(2048)
      for (let i = 0; i < curve.length; i++) {
        const x = i * 2 / (curve.length - 1) - 1
        curve[i] = Math.tanh(x * amount) / amount
      }
      r.drive.curve = curve
      if (preset.has303Acid) {
        r.lfo = ctx.createOscillator(); r.lfoGain = ctx.createGain()
        r.lfo.frequency.value = 1.6 + preset.resonance / 40
        r.lfoGain.gain.value = stripeFilter(preset).cutoff * .08
        r.lfo.connect(r.lfoGain).connect(r.filterNode.frequency); r.lfo.start()
      }
    } else r.drive.curve = null
  }
  setBank(deck: DeckIndex, bank: number) { this.decks[deck].bank = Math.max(0, Math.min(3, bank)) }
  setBpm(deck: DeckIndex, bpm: number) { this.decks[deck].bpm = Math.max(60, Math.min(200, bpm)) }

  async load(deck: DeckIndex, file: File) {
    await this.ready()
    const runtime = this.runtime![deck], request = ++runtime.loadId
    const buffer = await this.context!.decodeAudioData(await file.arrayBuffer())
    if (request !== runtime.loadId) return
    this.pause(deck)
    const r = this.runtime![deck]
    r.buffer = buffer; r.offset = 0
    const samples = buffer.getChannelData(0)
    const peaks = Array.from({ length: 160 }, (_, i) => {
      const begin = Math.floor(i * samples.length / 160)
      const end = Math.min(samples.length, Math.floor((i + 1) * samples.length / 160))
      const stride = Math.max(1, Math.floor((end - begin) / 192))
      let peak = 0
      for (let j = begin; j < end; j += stride) peak = Math.max(peak, Math.abs(samples[j]))
      return peak
    })
    Object.assign(this.decks[deck], { title: file.name.replace(/\.[^.]+$/, ''), kind: 'file',
      duration: buffer.duration, peaks, cues: Array(8).fill(null), loopBeats: 0, position: 0 })
  }
  usePattern(deck: DeckIndex) {
    this.pause(deck)
    const r = this.runtime?.[deck]; if (r) { r.loadId++; r.buffer = null; r.offset = 0 }
    Object.assign(this.decks[deck], { kind: 'pattern', title: deck === 0 ? 'Night Circuit' : 'Retro Coast',
      duration: 0, peaks: demoPeaks(deck), cues: Array(8).fill(null), loopBeats: 0, position: 0 })
  }
  async play(deck: DeckIndex) {
    await this.ready()
    const d = this.decks[deck], r = this.runtime![deck], ctx = this.context!
    if (d.playing) return
    d.playing = true
    if (r.buffer) {
      const source = ctx.createBufferSource()
      source.buffer = r.buffer
      source.connect(r.gain)
      if (d.loopBeats) this.applyLoop(deck, source)
      const offset = Math.min(r.offset, Math.max(0, r.buffer.duration - .001))
      r.startedAt = ctx.currentTime - offset
      r.source = source
      source.onended = () => {
        if (r.source === source) { r.source = null; d.playing = false; r.offset = 0; d.position = 0 }
      }
      source.start(0, offset)
    } else {
      r.nextStepAt = ctx.currentTime + .04
      this.startTicker()
    }
  }
  pause(deck: DeckIndex) {
    const d = this.decks[deck], r = this.runtime?.[deck]
    if (r && d.kind === 'file' && d.playing && this.context) {
      r.offset = Math.min(r.buffer?.duration ?? 0, this.context.currentTime - r.startedAt)
      r.source?.stop(); r.source = null
    }
    d.playing = false
  }
  position(deck: DeckIndex) {
    const d = this.decks[deck], r = this.runtime?.[deck]
    if (d.kind !== 'file' || !r?.buffer) return 0
    if (!d.playing || !this.context) return r.offset
    const t = this.context.currentTime - r.startedAt
    if (d.loopBeats) {
      const len = Math.min(r.buffer.duration, d.loopBeats * 60 / d.bpm)
      const start = Math.floor(r.offset / len) * len
      return start + ((t - start) % len + len) % len
    }
    return Math.min(r.buffer.duration, t)
  }
  async seek(deck: DeckIndex, position: number) {
    const r = this.runtime?.[deck]
    if (!r?.buffer) return
    const wasPlaying = this.decks[deck].playing
    this.pause(deck)
    r.offset = Math.max(0, Math.min(r.buffer.duration - .001, position))
    this.decks[deck].position = r.offset
    if (wasPlaying) await this.play(deck)
  }
  private applyLoop(deck: DeckIndex, source: AudioBufferSourceNode) {
    const d = this.decks[deck], r = this.runtime![deck]
    if (!r.buffer || !d.loopBeats) return
    const len = Math.min(r.buffer.duration, d.loopBeats * 60 / d.bpm)
    const start = Math.floor(r.offset / len) * len
    source.loop = true; source.loopStart = start; source.loopEnd = Math.min(r.buffer.duration, start + len)
  }
  async setLoop(deck: DeckIndex, beats: 0 | 4 | 8 | 16) {
    const r = this.runtime?.[deck]
    if (!r?.buffer) return
    const pos = this.position(deck), active = this.decks[deck].playing
    this.pause(deck); r.offset = pos; this.decks[deck].loopBeats = beats
    if (active) await this.play(deck)
  }
  setCue(deck: DeckIndex, index: number) { this.decks[deck].cues[index] = this.position(deck) }
  async jumpCue(deck: DeckIndex, index: number) {
    const cue = this.decks[deck].cues[index]
    if (cue !== null) await this.seek(deck, cue)
  }

  private startTicker() {
    if (this.ticker !== null) return
    this.ticker = window.setInterval(() => {
      const ctx = this.context
      if (!ctx || !this.runtime || ctx.state !== 'running') return
      let active = false
      this.runtime.forEach((r, i) => {
        const d = this.decks[i]
        if (!d.playing || d.kind !== 'pattern') return
        active = true
        if (r.nextStepAt < ctx.currentTime - .12) r.nextStepAt = ctx.currentTime
        while (r.nextStepAt < ctx.currentTime + .12) {
          const step = r.step % 16
          const pattern = this.patterns[d.bank]
          if (pattern.kick[step] && !d.muted.kick) this.kick(r, r.nextStepAt, d.preset ? DJ_MATRIX[d.preset].has909Punch : false)
          if (pattern.hat[step] && !d.muted.hat) this.hat(r, r.nextStepAt)
          if (pattern.bass[step] && !d.muted.bass) this.bass(r, r.nextStepAt, step)
          if (d.preset && !d.muted.bass) {
            const preset = DJ_MATRIX[d.preset]
            if (preset.has808Sub && (step === 0 || step === 10)) this.sub(r, r.nextStepAt)
            if (preset.has303Acid) this.acid(r, r.nextStepAt, step, preset.cutoff, preset.resonance)
          }
          r.step++; r.nextStepAt += 60 / d.bpm / 4
        }
      })
      if (!active && this.ticker !== null) { clearInterval(this.ticker); this.ticker = null }
    }, 25)
  }
  private kick(r: DeckRuntime, at: number, punch: boolean) {
    const ctx = this.context!, osc = ctx.createOscillator(), amp = ctx.createGain()
    osc.type = 'sine'; osc.frequency.setValueAtTime(punch ? 190 : 140, at); osc.frequency.exponentialRampToValueAtTime(punch ? 48 : 52, at + (punch ? .07 : .14))
    amp.gain.setValueAtTime(.8, at); amp.gain.exponentialRampToValueAtTime(.001, at + .25)
    osc.connect(amp).connect(r.gain); osc.start(at); osc.stop(at + .26)
  }
  private hat(r: DeckRuntime, at: number) {
    const ctx = this.context!
    if (!this.hatBuffer) {
      this.hatBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .07), ctx.sampleRate)
      const data = this.hatBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    const buffer = this.hatBuffer
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), amp = ctx.createGain()
    src.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 6000
    amp.gain.setValueAtTime(.16, at); amp.gain.exponentialRampToValueAtTime(.001, at + .065)
    src.connect(filter).connect(amp).connect(r.gain); src.start(at); src.stop(at + .07)
  }
  private bass(r: DeckRuntime, at: number, step: number) {
    const ctx = this.context!, osc = ctx.createOscillator(), amp = ctx.createGain()
    osc.type = 'triangle'; osc.frequency.value = [55, 65.41, 73.42, 49][Math.floor(step / 4)]
    amp.gain.setValueAtTime(.001, at); amp.gain.linearRampToValueAtTime(.22, at + .012)
    amp.gain.exponentialRampToValueAtTime(.001, at + .19)
    osc.connect(amp).connect(r.gain); osc.start(at); osc.stop(at + .2)
  }

  private sub(r: DeckRuntime, at: number) {
    const ctx = this.context!, osc = ctx.createOscillator(), amp = ctx.createGain()
    osc.frequency.setValueAtTime(85, at); osc.frequency.exponentialRampToValueAtTime(38, at + .45)
    amp.gain.setValueAtTime(.0001, at); amp.gain.exponentialRampToValueAtTime(.25, at + .02)
    amp.gain.exponentialRampToValueAtTime(.0001, at + .85)
    osc.connect(amp).connect(r.gain); osc.start(at); osc.stop(at + 1)
  }
  private acid(r: DeckRuntime, at: number, step: number, cutoff: number, resonance: number) {
    const notes = [0,0,12,0,3,0,10,0,0,12,0,7,0,3,10,5]
    const accent = [0,4,9,12,15].includes(step)
    const ctx = this.context!, osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), amp = ctx.createGain()
    osc.type = 'sawtooth'; osc.frequency.value = 55 * 2 ** (notes[step] / 12)
    filter.type = 'lowpass'; filter.Q.value = resonance
    filter.frequency.setValueAtTime(Math.min(6000, cutoff * (accent ? 3.4 : 1.4)), at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(50, cutoff * .5), at + .22)
    amp.gain.setValueAtTime(.0001, at); amp.gain.exponentialRampToValueAtTime(accent ? .12 : .08, at + .005)
    amp.gain.exponentialRampToValueAtTime(.0001, at + .24)
    osc.connect(filter).connect(amp).connect(r.gain); osc.start(at); osc.stop(at + .3)
  }

  async startRecording() {
    await this.ready()
    if (!this.media || typeof MediaRecorder === 'undefined') throw new Error('Запись не поддерживается этим браузером.')
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t))
    if (!mime) throw new Error('Нет поддерживаемого формата записи.')
    this.chunks = []
    this.recorder = new MediaRecorder(this.media.stream, { mimeType: mime })
    this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data) }
    this.recorder.start()
  }
  stopRecording(): Promise<Blob> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') return Promise.reject(new Error('Запись не запущена.'))
    return new Promise((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Ошибка записи.'))
      recorder.onstop = () => {
        this.recorder = null
        resolve(new Blob(this.chunks, { type: recorder.mimeType }))
      }
      recorder.stop()
    })
  }
  dispose() {
    if (this.ticker !== null) clearInterval(this.ticker)
    this.decks.forEach((_, i) => this.pause(i as DeckIndex))
    this.runtime?.forEach(r => { r.loadId++; r.lfo?.stop(); r.lfo?.disconnect(); r.lfoGain?.disconnect() })
    if (this.recorder?.state === 'recording') this.recorder.stop()
    void this.context?.close()
  }
}
