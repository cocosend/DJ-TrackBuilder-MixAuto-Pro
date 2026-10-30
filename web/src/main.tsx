import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, CircleHelp, Disc3, FileAudio2, Mic2, Pause, Play, Plus, RotateCcw, Save, SlidersHorizontal, Upload, Waves, ZoomIn, ZoomOut } from 'lucide-react'
import { BANK_NAMES, MixEngine, type DeckIndex, type DeckSnapshot, type Pattern, type Voice } from './audio'
import { DJ_MATRIX, type PresetKey } from './presets'
import './style.css'

type Mode = 'PRESETS' | 'WAVE' | 'MIX' | 'BUILDER' | 'FX' | 'AUTO'
const modes: Mode[] = ['WAVE', 'PRESETS', 'MIX', 'BUILDER', 'FX', 'AUTO']
const voiceNames: Record<Voice, string> = { kick: 'KICK', hat: 'HAT', bass: 'BASS' }

function stamp(t: number) {
  if (!Number.isFinite(t)) return '00:00'
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`
}

function Waveform({ deck, index, zoom, onSeek }: { deck: DeckSnapshot; index: DeckIndex; zoom: number; onSeek: (fraction: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const draw = () => {
      const rect = el.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      el.width = Math.round(rect.width * dpr); el.height = Math.round(rect.height * dpr)
      const c = el.getContext('2d'); if (!c) return
      c.scale(dpr, dpr)
      const w = rect.width, h = rect.height, bars = Math.max(12, Math.floor(w / (3 * zoom)))
      const colors = index === 0 ? ['#ff4d50', '#ff961f', '#ffd04c', '#e44fae', '#55ddcd'] : ['#ff4d50', '#ff9729', '#ffd449', '#d75bc0', '#50dbcf']
      const yCenter = h * .48
      for (let n = 0; n < bars; n++) {
        const idx = Math.min(deck.peaks.length - 1, Math.floor(n * deck.peaks.length / bars))
        const peak = deck.peaks[idx] || 0
        const rhythm = Math.abs(Math.sin(idx * 1.18 + index * 3))
        const length = Math.max(4, (peak * .72 + rhythm * .18) * w * .83)
        const x = n * w / bars + 1
        for (let band = 0; band < 5; band++) {
          const variation = .2 + .8 * Math.abs(Math.sin(idx * (.22 + band * .23) + band))
          const span = Math.min(w * .46, length * variation / 2)
          c.fillStyle = colors[band]
          c.fillRect(x, yCenter - span, Math.max(1.4, w / bars - 1.2), span * 2)
        }
      }

    }
    const observer = new ResizeObserver(draw); observer.observe(el); draw()
    return () => observer.disconnect()
  }, [deck.peaks, index, zoom])
  return <div className="wave-panel">
    <canvas ref={canvas} className="vertical-wave" role="img" aria-label={`Обзор сигнала деки ${index === 0 ? 'A' : 'B'}`} onClick={e => {
      if (deck.kind !== 'file') return
      const rect = e.currentTarget.getBoundingClientRect()
      onSeek(Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)))
    }} />
    <span className="playhead" style={{ top: `${100 * (1 - (deck.kind === 'file' && deck.duration ? deck.position / deck.duration : .5))}%` }} />
    <span className={`wave-letter deck-${index}`}>{index === 0 ? 'A' : 'B'}</span>
    <span className="wave-caption">{deck.kind === 'file' ? `${stamp(deck.position)} / ${stamp(deck.duration)}` : 'PATTERN / FOUR BARS'}</span>
  </div>
}


function Slider({ label, value, min = 0, max = 1, step = .01, onChange, deck }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; deck?: DeckIndex
}) {
  return <label className={`slider-block ${deck === undefined ? '' : `deck-${deck}`}`}><span>{label}<strong>{Number.isInteger(value) ? value : value.toFixed(2)}</strong></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>
}

function App() {
  const [engine] = useState(() => new MixEngine())
  const fileInputs = useRef<[HTMLInputElement | null, HTMLInputElement | null]>([null, null])
  const projectInput = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState<[boolean, boolean]>([false, false])
  const [mode, setMode] = useState<Mode>('PRESETS')
  const [version, setVersion] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<DeckIndex>(0)
  const [recording, setRecording] = useState(false)
  const [auto, setAuto] = useState(false)
  const [autoBars, setAutoBars] = useState(8)
  const [message, setMessage] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoRef = useRef({ start: 0, from: .5, to: 1 })
  const e = engine, decks = e.decks
  const refresh = () => setVersion(v => v + 1)
  const notice = (text: string) => { setMessage(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setMessage(''), 4500) }
  const run = (action: () => Promise<unknown> | void) => {
    try { Promise.resolve(action()).then(refresh).catch(error => notice(error instanceof Error ? error.message : 'Не удалось выполнить действие.')) }
    catch (error) { notice(error instanceof Error ? error.message : 'Не удалось выполнить действие.') }
  }
  useEffect(() => {
    let lastState = ''
    const id = window.setInterval(() => {
      const state = e.decks.map(d => `${d.kind}:${d.playing}`).join('|')
      if (state !== lastState || e.decks.some(d => d.playing && d.kind === 'file')) {
        e.decks.forEach((d, i) => { if (d.kind === 'file') d.position = e.position(i as DeckIndex) })
        lastState = state; refresh()
      }
    }, 150)
    return () => { clearInterval(id); clearTimeout(noticeTimer.current); e.dispose() }
  }, [e])
  useEffect(() => {
    if (!auto) return
    let frame = 0
    autoRef.current = { start: performance.now(), from: e.crossfade, to: e.crossfade < .5 ? 1 : 0 }
    let lastPaint = 0
    const tick = (now: number) => {
      const current = autoRef.current
      const bpm = (decks[0].bpm + decks[1].bpm) / 2
      const period = autoBars * 4 * 60 / bpm * 1000
      const progress = Math.min(1, (now - current.start) / period)
      const transition = Math.min(1, Math.max(0, (progress - .65) / .35))
      e.setCrossfade(current.from + (current.to - current.from) * (transition * transition * (3 - 2 * transition)))
      if (progress >= 1) autoRef.current = { start: now, from: current.to, to: current.to === 1 ? 0 : 1 }
      if (now - lastPaint >= 33) { refresh(); lastPaint = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [auto, autoBars, e])

  const loadFile = async (deck: DeckIndex, file?: File) => {
    if (!file) return
    setLoading(old => old.map((v, i) => i === deck ? true : v) as [boolean, boolean])
    try { await e.load(deck, file); setSelected(deck); refresh(); notice(`${file.name} загружен в деку ${deck === 0 ? 'A' : 'B'}`) }
    finally { setLoading(old => old.map((v, i) => i === deck ? false : v) as [boolean, boolean]) }
  }
  const saveProject = () => {
    const data = { version: 1, crossfade: e.crossfade, autoBars, patterns: e.patterns,
      decks: decks.map(d => ({ preset: d.preset, bpm: d.bpm, bank: d.bank, volume: d.volume, eq: d.eq,
        filter: d.filter, echo: d.echo, muted: d.muted })) }
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'mixauto-project.json')
    notice('Настройки проекта сохранены. Аудиофайлы не включены.')
  }
  const openProject = async (file?: File) => {
    if (!file) return
    const data: unknown = JSON.parse(await file.text())
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('decks' in data) || !Array.isArray(data.decks) || data.decks.length !== 2) throw new Error('Неверный файл проекта.')
    const project = data as { crossfade?: number; autoBars?: number; patterns?: Pattern[]; decks: Array<Partial<DeckSnapshot>> }
    if (typeof project.crossfade === 'number' && project.crossfade >= 0 && project.crossfade <= 1) e.setCrossfade(project.crossfade)
    if ([4, 8, 16].includes(project.autoBars || 0)) setAutoBars(project.autoBars!)
    if (Array.isArray(project.patterns) && project.patterns.length === 4 && project.patterns.every(p => ['kick', 'hat', 'bass'].every(v => Array.isArray(p[v as Voice]) && p[v as Voice].length === 16 && p[v as Voice].every(x => typeof x === 'boolean')))) e.patterns = project.patterns
    project.decks.forEach((saved, i) => {
      const deck = i as DeckIndex
      if (saved.preset && Object.hasOwn(DJ_MATRIX, saved.preset)) e.applyPreset(deck, saved.preset)
      else e.clearPreset(deck)
      if (typeof saved.bpm === 'number') e.setBpm(deck, saved.bpm)
      if (Number.isInteger(saved.bank) && saved.bank! >= 0 && saved.bank! <= 3) e.setBank(deck, saved.bank!)
      if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) e.setVolume(deck, saved.volume)
      if (Array.isArray(saved.eq) && saved.eq.length === 3) saved.eq.forEach((x, j) => { if (typeof x === 'number' && x >= -18 && x <= 18) e.setEq(deck, j as 0 | 1 | 2, x) })
      if (typeof saved.filter === 'number' && saved.filter >= 0 && saved.filter <= 1) e.setFilter(deck, saved.filter)
      if (typeof saved.echo === 'number' && saved.echo >= 0 && saved.echo <= 1) e.setEcho(deck, saved.echo)
      if (saved.muted && ['kick', 'hat', 'bass'].every(v => typeof saved.muted?.[v as Voice] === 'boolean')) decks[deck].muted = saved.muted
    })
    refresh(); notice('Настройки загружены. Треки импортируются отдельно.')
  }
  const toggleRecording = () => run(async () => {
    if (!recording) { await e.startRecording(); setRecording(true); notice('Запись мастера началась.') }
    else {
      const blob = await e.stopRecording()
      setRecording(false)
      download(blob, `mixauto-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
      notice('Запись сохранена.')
    }
  })
  const toggleAuto = () => {
    if (!auto && !decks.every(d => d.playing)) { notice('Для AutoMix запусти обе деки.'); return }
    setAuto(v => !v)
  }
  const crossfade = (value: number) => { if (auto) setAuto(false); e.setCrossfade(value); refresh() }
  const loadButton = (deck: DeckIndex) => fileInputs.current[deck]?.click()
  const deckCard = (deck: DeckIndex) => <button key={deck} className={`deck-card deck-${deck}`} disabled={loading[deck]} onClick={() => loadButton(deck)} title={`Загрузить аудио в деку ${deck === 0 ? 'A' : 'B'}`}>
    <span className="album">{deck === 0 ? 'A' : 'B'}</span><span className="deck-info"><small>● DECK {deck === 0 ? 'A' : 'B'}</small><strong>{loading[deck] ? 'Загрузка…' : decks[deck].title}</strong><em>{decks[deck].kind === 'file' ? `FILE · ${stamp(decks[deck].duration)}` : `BANK ${BANK_NAMES[decks[deck].bank]} · SYNTH`}</em></span>
  </button>
  const pattern = e.patterns[decks[selected].bank]

  return <div className="app-shell" data-version={version}>
    <input className="visually-hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" ref={node => { fileInputs.current[0] = node }} onChange={ev => { run(() => loadFile(0, ev.target.files?.[0])); ev.target.value = '' }} aria-label="Файл для деки A" />
    <input className="visually-hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" ref={node => { fileInputs.current[1] = node }} onChange={ev => { run(() => loadFile(1, ev.target.files?.[0])); ev.target.value = '' }} aria-label="Файл для деки B" />
    <input className="visually-hidden" type="file" accept="application/json,.json" ref={projectInput} onChange={ev => { run(() => openProject(ev.target.files?.[0])); ev.target.value = '' }} aria-label="Открыть проект" />

    <header className="topbar"><div className="brand"><Waves size={22} strokeWidth={3} /><strong>TRACKBUILDER</strong><span>/ MIXAUTO PRO</span></div><span className="edition">STUDIO 0.9</span></header>
    <section className="decks-head">{deckCard(0)}<span className="deck-divider" />{deckCard(1)}</section>


    <main>
      {mode === 'PRESETS' && <section className="mode-body presets-body"><div className="section-heading"><div><span className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</span><h2>Характер звука</h2></div><span className="preset-count">07</span></div><p>Пресеты из Stripe Waves. Выбери деку, затем пресет. BPM и трек сохраняются.</p><div className="deck-choice" aria-label="Дека для пресета">{([0, 1] as DeckIndex[]).map(i => <button key={i} aria-pressed={selected === i} className={selected === i ? `chosen deck-${i}` : ''} onClick={() => setSelected(i)}>ДЕКА {i === 0 ? 'A' : 'B'} · {decks[i].preset ? decks[i].preset.toUpperCase() : 'ЧИСТЫЙ ЗВУК'}</button>)}</div><div className="preset-grid">{(Object.entries(DJ_MATRIX) as [PresetKey, typeof DJ_MATRIX[PresetKey]][]).map(([key, p], index) => <button key={key} className={`preset-card ${decks[selected].preset === key ? 'active' : ''}`} aria-pressed={decks[selected].preset === key} onClick={() => { e.applyPreset(selected, key); refresh() }}><span className="preset-index">0{index + 1}</span><span><strong>{key.toUpperCase()}</strong><small>{p.style}</small></span><span className="preset-dot" /></button>)}</div><div className="preset-detail" aria-live="polite">{decks[selected].preset ? <><strong>{DJ_MATRIX[decks[selected].preset!].name}</strong><span>{DJ_MATRIX[decks[selected].preset!].cutoff} Hz · Q {DJ_MATRIX[decks[selected].preset!].resonance} · Delay {DJ_MATRIX[decks[selected].preset!].delayTime}s</span><span>{DJ_MATRIX[decks[selected].preset!].gearUsed}</span></> : <span>Выбери характер для деки {selected === 0 ? 'A' : 'B'}</span>}<button className="subtle" onClick={() => { e.clearPreset(selected); refresh() }}>Сбросить пресет</button></div><p className="hint">Профили вдохновлены стилями артистов. Матрица и обработка FX перенесены из Stripe Waves; это не оригинальные записи или фирменные пресеты артистов.</p></section>}

      {mode === 'WAVE' && <section className="wave-screen"><div className="wave-pair">{([0, 1] as DeckIndex[]).map(i => <Waveform key={i} deck={decks[i]} index={i} zoom={zoom} onSeek={fraction => run(() => e.seek(i, fraction * decks[i].duration))} />)}</div>
        <div className="wave-footer"><span>PCM SIGNAL OVERVIEW · {decks.some(d => d.kind === 'file') ? 'IMPORTED AUDIO' : 'ORIGINAL PATTERNS'}</span><div><button aria-label="Уменьшить сигнал" onClick={() => setZoom(v => Math.max(.5, v / 1.5))}><ZoomOut size={20} /></button><button aria-label="Увеличить сигнал" onClick={() => setZoom(v => Math.min(4, v * 1.5))}><ZoomIn size={20} /></button></div></div>
        {decks.some(d => d.kind === 'file') && <div className="cue-row">{([0, 1] as DeckIndex[]).map(i => <div key={i} className={`cue-deck deck-${i}`}><span>DECK {i === 0 ? 'A' : 'B'}</span><div>{decks[i].kind === 'file' && decks[i].cues.map((cue, n) => <button key={n} className={cue !== null ? 'set' : ''} title={cue === null ? 'Установить метку' : `Перейти к ${stamp(cue)}; удерживай для перезаписи`} onClick={() => run(() => cue === null ? e.setCue(i, n) : e.jumpCue(i, n))} onContextMenu={ev => { ev.preventDefault(); e.setCue(i, n); refresh() }}>{n + 1}</button>)}</div><select value={decks[i].loopBeats} onChange={ev => run(() => e.setLoop(i, Number(ev.target.value) as 0 | 4 | 8 | 16))} disabled={decks[i].kind !== 'file'} aria-label={`Цикл деки ${i === 0 ? 'A' : 'B'}`}><option value="0">LOOP OFF</option><option value="4">4 BEATS</option><option value="8">8 BEATS</option><option value="16">16 BEATS</option></select></div>)}</div>}
      </section>}
      {mode === 'MIX' && <section className="mode-body"><h2>Микшер <SlidersHorizontal size={20} /></h2><p>Уровни и частоты каждой деки управляют живым звуком.</p><div className="mode-columns">{([0, 1] as DeckIndex[]).map(i => <div className={`control-card deck-${i}`} key={i}><h3>DECK {i === 0 ? 'A' : 'B'}</h3><Slider label="LEVEL" value={decks[i].volume} onChange={v => { e.setVolume(i, v); refresh() }} deck={i} />{(['LOW', 'MID', 'HIGH'] as const).map((name, j) => <Slider key={name} label={name} value={decks[i].eq[j]} min={-18} max={18} step={1} onChange={v => { e.setEq(i, j as 0 | 1 | 2, v); refresh() }} deck={i} />)}<button className="subtle" onClick={() => { for (let j = 0; j < 3; j++) e.setEq(i, j as 0 | 1 | 2, 0); refresh() }}>RESET EQ</button></div>)}</div></section>}
      {mode === 'BUILDER' && <section className="mode-body"><h2>Каналы паттерна <Disc3 size={20} /></h2><p>Отключай Kick, Hat и Bass в синтезированных паттернах. Разделение импортированных песен на дорожки недоступно.</p><div className="mode-columns">{([0, 1] as DeckIndex[]).map(i => <div className={`control-card deck-${i}`} key={i}><h3>DECK {i === 0 ? 'A' : 'B'}</h3>{(['kick', 'hat', 'bass'] as Voice[]).map(voice => <button key={voice} disabled={decks[i].kind === 'file'} className={`voice-toggle ${decks[i].muted[voice] ? 'muted' : ''}`} onClick={() => { decks[i].muted[voice] = !decks[i].muted[voice]; refresh() }}><span>{voiceNames[voice]}</span><b>{decks[i].muted[voice] ? 'MUTED' : 'ON'}</b></button>)}</div>)}</div></section>}
      {mode === 'BUILDER' && <section className="mode-body"><h2>Паттерн <Waves size={20} /></h2><p>Выбери банк и касайся шагов, чтобы менять ритм на обеих деках.</p><div className="bank-row">{BANK_NAMES.map((name, bank) => <button key={name} className={decks[selected].bank === bank ? 'chosen' : ''} onClick={() => { e.setBank(selected, bank); refresh() }}>BANK {name}</button>)}</div><div className="deck-choice">{([0, 1] as DeckIndex[]).map(i => <button key={i} className={selected === i ? `chosen deck-${i}` : ''} onClick={() => setSelected(i)}>DECK {i === 0 ? 'A' : 'B'}</button>)}</div>{(['kick', 'hat', 'bass'] as Voice[]).map(voice => <div className="step-row" key={voice}><strong>{voiceNames[voice]}</strong><div>{pattern[voice].map((on, step) => <button key={step} aria-label={`${voiceNames[voice]}, шаг ${step + 1}`} aria-pressed={on} className={on ? `active deck-${selected}` : ''} onClick={() => { pattern[voice][step] = !on; refresh() }}>{(step % 4) + 1}</button>)}</div></div>)}<div className="project-actions"><button onClick={saveProject}><Save size={17} /> SAVE PROJECT</button><button onClick={() => projectInput.current?.click()}><Upload size={17} /> OPEN PROJECT</button></div></section>}
      {mode === 'FX' && <section className="mode-body"><h2>Эффекты <Waves size={20} /></h2><p>Фильтр и эхо обрабатывают звук выбранной деки в реальном времени.</p><div className="mode-columns">{([0, 1] as DeckIndex[]).map(i => <div className={`control-card deck-${i}`} key={i}><h3>DECK {i === 0 ? 'A' : 'B'}</h3><Slider label="FILTER" value={decks[i].filter} onChange={v => { e.setFilter(i, v); refresh() }} deck={i} /><Slider label="ECHO" value={decks[i].echo} onChange={v => { e.setEcho(i, v); refresh() }} deck={i} /><button className="subtle" onClick={() => { e.clearPreset(i); refresh() }}><RotateCcw size={14} /> CLEAR FX</button></div>)}</div></section>}
      {mode === 'AUTO' && <section className="mode-body"><h2>Pattern AutoMix <ArrowLeftRight size={20} /></h2><p>Автоматический кроссфейд между запущенными деками. Ручное движение фейдера сразу останавливает автоматизацию.</p><button className={`main-action ${auto ? 'live' : ''}`} onClick={toggleAuto}>{auto ? 'STOP AUTOMIX' : 'START AUTOMIX'}</button><div className="bank-row">{[4, 8, 16].map(bars => <button key={bars} className={bars === autoBars ? 'chosen' : ''} onClick={() => setAutoBars(bars)}>{bars} BARS</button>)}</div><p className="hint">При импорте треков скорость аудио не меняется; сведение выполняется только фейдером.</p></section>}
    </main>

    <nav className="mode-tabs" aria-label="Режимы">{modes.map(item => <button key={item} aria-pressed={mode === item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item === 'PRESETS' ? 'ПРЕСЕТЫ' : item}</button>)}</nav>
    <footer className="transport"><div className="tempo"><div><strong>{decks[0].bpm.toFixed(1)}</strong><strong>{decks[1].bpm.toFixed(1)}</strong></div><div><span>BPM · {decks[0].kind === 'file' ? 'FILE' : 'PATTERN'}</span><span>CROSSFADE</span><span>BPM · {decks[1].kind === 'file' ? 'FILE' : 'PATTERN'}</span></div></div>
      <div className="utility-row"><button disabled={decks[0].kind !== 'pattern'} onClick={() => { e.setBpm(0, decks[1].bpm); refresh() }}>SYNC</button><button onClick={() => run(() => e.seek(0, decks[0].cues[0] ?? 0))} disabled={decks[0].kind !== 'file'}>CUE</button><button className={auto ? 'auto-active' : 'auto-button'} onClick={toggleAuto}><ArrowLeftRight size={17} /> AUTO</button><button onClick={() => run(() => e.seek(1, decks[1].cues[0] ?? 0))} disabled={decks[1].kind !== 'file'}>CUE</button><button disabled={decks[1].kind !== 'pattern'} onClick={() => { e.setBpm(1, decks[0].bpm); refresh() }}>SYNC</button></div>
      <div className="play-row"><button className="play-button deck-0" aria-label={decks[0].playing ? 'Пауза A' : 'Играть A'} onClick={() => run(() => decks[0].playing ? e.pause(0) : e.play(0))}>{decks[0].playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><span>A</span><input type="range" aria-label="Кроссфейдер" min="0" max="1" step="0.001" value={e.crossfade} onChange={ev => crossfade(Number(ev.target.value))} /><span>B</span><button className="play-button deck-1" aria-label={decks[1].playing ? 'Пауза B' : 'Играть B'} onClick={() => run(() => decks[1].playing ? e.pause(1) : e.play(1))}>{decks[1].playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button></div>
      <div className="bottom-actions"><button onClick={() => loadButton(0)}><Plus size={15} /> LOAD A</button><button className={recording ? 'recording' : ''} onClick={toggleRecording}><Mic2 size={15} /> {recording ? 'STOP REC' : 'RECORD'}</button><button onClick={() => loadButton(1)}><Plus size={15} /> LOAD B</button></div>
    </footer>
    {message && <div className="toast" role="status">{message}</div>}
    <div className="help" title="Локальное приложение: аудио остаётся в браузере"><FileAudio2 size={14} /> Файлы остаются на устройстве <CircleHelp size={13} /></div>
  </div>
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

createRoot(document.getElementById('root')!).render(<App />)
