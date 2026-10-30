import { renderDemo } from './demos'
self.onmessage = (event: MessageEvent<{index:number;sampleRate:number}>) => {
  try { const channels = renderDemo(event.data.index,event.data.sampleRate); self.postMessage({channels}, {transfer: channels.map(c=>c.buffer)}) }
  catch (error) { self.postMessage({error: error instanceof Error ? error.message : 'Demo render failed'}) }
}
