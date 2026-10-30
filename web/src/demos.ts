// Port of IOSAudioBackend.mm::synthPreset from cocosend/artss-dj-creator-ios.
// Source tree: d2c42ffaad94b3d687dcc5b1217667a4a307cb16. Original procedural grooves.
export const DEMOS = [
  {key:'maddix', name:'Maddix', genre:'PEAK TECHNO', bpm:145, root:38},
  {key:'artbat', name:'ARTBAT', genre:'MELODIC', bpm:124, root:34},
  {key:'brejcha', name:'Brejcha', genre:'MINIMAL', bpm:126, root:41},
  {key:'guetta', name:'Guetta', genre:'DANCE', bpm:128, root:36},
  {key:'kazantip', name:'Kazantip', genre:'RAVE', bpm:138, root:33},
  {key:'legends', name:'Legends', genre:'CLASSIC', bpm:130, root:43},
  {key:'modern', name:'Modern', genre:'FUTURE', bpm:132, root:39},
] as const
export function renderDemo(preset: number, sampleRate: number): [Float32Array, Float32Array] {
  if (!Number.isInteger(preset) || !DEMOS[preset] || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new Error('Invalid demo format')
  const demo = DEMOS[preset], beat = 60 / demo.bpm, frames = Math.ceil(beat * 16 * sampleRate)
  const left = new Float32Array(frames), right = new Float32Array(frames)
  const root = 440 * 2 ** ((demo.root - 69) / 12), pi = Math.PI
  const notes = [[0,0,3,-2],[0,7,3,5],[0,-2,5,3],[0,5,7,3],[0,3,-2,5],[0,7,5,3],[0,3,7,5]]
  for (let i=0;i<frames;i++) {
    const t=i/sampleRate, beatPosition=t/beat, beatNumber=Math.floor(beatPosition), phase=(beatPosition-beatNumber)*beat
    const kick=Math.sin(2*pi*(52*phase+42*(1-Math.exp(-phase*28))/28))*Math.exp(-phase*21)*.42
    const noise=Math.sin(2*pi*6413*t)*Math.sin(2*pi*9127*t)
    const hat=noise*Math.exp(-(t%(beat/2))*(preset===4?52:70))*.09
    const snare=(beatNumber%4===1||beatNumber%4===3)?noise*Math.exp(-phase*25)*.14:0
    const freq=root*2**(notes[preset][Math.floor(beatNumber/4)%4]/12)
    const bass=Math.sin(2*pi*freq*t)*(.5+.5*Math.sin(2*pi*freq*2*t))*Math.exp(-(t%(beat/2))*5)*.18
    const lead=Math.sin(2*pi*root*(preset%2===0?4:3)*t)*Math.exp(-(t%beat)*8)*.045
    left[i]=Math.max(-.95,Math.min(.95,kick+hat+snare+bass+lead))
    right[i]=Math.max(-.95,Math.min(.95,kick+hat*.8+snare*1.1+bass+lead*.7))
  }
  return [left,right]
}
