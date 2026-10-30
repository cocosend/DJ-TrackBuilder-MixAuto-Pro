export type PresetKey = 'maddix' | 'artbat' | 'brejcha' | 'guetta' | 'kazantip' | 'legends' | 'modern';
export interface HardwarePreset {
  name: string; artist: string; style: string; gearUsed: string;
  filterType: BiquadFilterType; cutoff: number; resonance: number;
  drive: number; delayTime: number; feedback: number;
  has909Punch: boolean; has808Sub: boolean; has303Acid: boolean;
}
export const DJ_MATRIX: Record<PresetKey, HardwarePreset> = {
  maddix: { name:'HARDWELL & MADDIX RUMBLE', artist:'Maddix / Hardwell', style:'Big Room / Hard Techno', gearUsed:'TR-909 + Virus TI inspired', filterType:'lowpass', cutoff:420, resonance:9, drive:750, delayTime:.22, feedback:.35, has909Punch:true, has808Sub:true, has303Acid:false },
  artbat: { name:'ARTBAT SPACE ATMOSPHERE', artist:'ARTBAT', style:'Melodic Techno', gearUsed:'Prophet-6 + Moog inspired', filterType:'lowpass', cutoff:1400, resonance:2.5, drive:60, delayTime:.48, feedback:.6, has909Punch:false, has808Sub:true, has303Acid:false },
  brejcha: { name:'BORIS BREJCHA HIGH-TECH', artist:'Boris Brejcha', style:'High-Tech Minimal', gearUsed:'MS-20 + TR-808 inspired', filterType:'peaking', cutoff:240, resonance:7, drive:120, delayTime:.12, feedback:.3, has909Punch:false, has808Sub:false, has303Acid:false },
  guetta: { name:'FUTURE RAVE HYMNS', artist:'David Guetta', style:'Future Rave / EDM', gearUsed:'JP-8000 + TR-909 inspired', filterType:'lowpass', cutoff:1800, resonance:3, drive:280, delayTime:.33, feedback:.4, has909Punch:true, has808Sub:false, has303Acid:false },
  kazantip: { name:'KAZANTIP RETRO REVOLUTION', artist:'Kazantip', style:'Rave nostalgia', gearUsed:'Nord Lead 2 + TB-303 inspired', filterType:'lowpass', cutoff:650, resonance:15, drive:400, delayTime:.26, feedback:.45, has909Punch:true, has808Sub:true, has303Acid:true },
  legends: { name:'PURE ACID LEGENDS LIVE', artist:'Hawtin / Hardfloor / Pierre', style:'Acid Techno', gearUsed:'TB-303 + TR-606 inspired', filterType:'lowpass', cutoff:350, resonance:28, drive:520, delayTime:.3, feedback:.5, has909Punch:false, has808Sub:false, has303Acid:true },
  modern: { name:'MODERN LIVE AGGRESSION', artist:'Charlotte / Reinier / 999999999', style:'Industrial Hard Techno', gearUsed:'TD-3-MO + analog kick inspired', filterType:'lowpass', cutoff:290, resonance:19, drive:990, delayTime:.15, feedback:.22, has909Punch:true, has808Sub:true, has303Acid:true }
};
