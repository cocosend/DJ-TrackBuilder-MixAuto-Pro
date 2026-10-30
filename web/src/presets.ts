export type PresetKey = 'maddix' | 'artbat' | 'brejcha' | 'guetta' | 'kazantip' | 'legends' | 'modern';
export interface HardwarePreset {
  name: string; artist: string; style: string; gearUsed: string;
  filterType: BiquadFilterType; cutoff: number; resonance: number;
  drive: number; delayTime: number; feedback: number;
  has909Punch: boolean; has808Sub: boolean; has303Acid: boolean;
}
// Source: cocosend/stripewolf-wave-base44/src/recovered.js (tree 22a70c99845326ee2f61b3eac16435c669f56f34).
export const DJ_MATRIX: Record<PresetKey, HardwarePreset> = {
  "maddix": {
    "name": "HARDWELL & MADDIX RUMBLE",
    "artist": "Maddix / Hardwell",
    "gearUsed": "TR-909 + Virus TI (Supersaw Layer)",
    "filterType": "lowpass",
    "cutoff": 420,
    "resonance": 9,
    "drive": 750,
    "delayTime": 0.22,
    "feedback": 0.35,
    "has909Punch": true,
    "has808Sub": true,
    "has303Acid": false,
    "style": "Big Room / Hard Techno"
  },
  "artbat": {
    "name": "ARTBAT SPACE ATMOSPHERE",
    "artist": "ARTBAT",
    "gearUsed": "Prophet-6 + Moog Sub 37 + Jupiter-8 Pads",
    "filterType": "lowpass",
    "cutoff": 1400,
    "resonance": 2.5,
    "drive": 60,
    "delayTime": 0.48,
    "feedback": 0.6,
    "has909Punch": false,
    "has808Sub": true,
    "has303Acid": false,
    "style": "Melodic Techno"
  },
  "brejcha": {
    "name": "BORIS BREJCHA HIGH-TECH",
    "artist": "Boris Brejcha",
    "gearUsed": "MS-20 (Rubber Bass) + TR-808 Clicks",
    "filterType": "peaking",
    "cutoff": 240,
    "resonance": 7,
    "drive": 120,
    "delayTime": 0.12,
    "feedback": 0.3,
    "has909Punch": false,
    "has808Sub": false,
    "has303Acid": false,
    "style": "High-Tech Minimal"
  },
  "guetta": {
    "name": "FUTURE RAVE HYMNS",
    "artist": "David Guetta",
    "gearUsed": "Roland JP-8000 (Supersaw) + TR-909 Punch",
    "filterType": "lowpass",
    "cutoff": 1800,
    "resonance": 3,
    "drive": 280,
    "delayTime": 0.33,
    "feedback": 0.4,
    "has909Punch": true,
    "has808Sub": false,
    "has303Acid": false,
    "style": "Future Rave / EDM"
  },
  "kazantip": {
    "name": "KAZANTIP RETRO REVOLUTION",
    "artist": "Kazantip",
    "gearUsed": "Nord Lead 2 (Bright Stabs) + TB-303 Acid",
    "filterType": "lowpass",
    "cutoff": 650,
    "resonance": 15,
    "drive": 400,
    "delayTime": 0.26,
    "feedback": 0.45,
    "has909Punch": true,
    "has808Sub": true,
    "has303Acid": true,
    "style": "Rave nostalgia"
  },
  "legends": {
    "name": "PURE ACID LEGENDS LIVE",
    "artist": "Hawtin / Hardfloor / DJ Pierre",
    "gearUsed": "3x TB-303 Modded (Devil Fish) + TR-606",
    "filterType": "lowpass",
    "cutoff": 350,
    "resonance": 28,
    "drive": 520,
    "delayTime": 0.3,
    "feedback": 0.5,
    "has909Punch": false,
    "has808Sub": false,
    "has303Acid": true,
    "style": "Acid Techno"
  },
  "modern": {
    "name": "MODERN LIVE AGGRESSION",
    "artist": "Charlotte / Reinier / 999999999",
    "gearUsed": "TD-3-MO + Custom Analog Euro Kick",
    "filterType": "lowpass",
    "cutoff": 290,
    "resonance": 19,
    "drive": 990,
    "delayTime": 0.15,
    "feedback": 0.22,
    "has909Punch": true,
    "has808Sub": true,
    "has303Acid": true,
    "style": "Industrial Hard Techno"
  }
};
export function stripeFilter(p: HardwarePreset) { return {cutoff: Math.min(14000, Math.max(1200, p.cutoff * 6)), q: Math.min(.9, .58 + p.resonance / 60)} }
