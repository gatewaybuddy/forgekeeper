import React from 'react'

type Ev = { act: string, text: string, seq: number }

export default function ToolLane({ name, events }: { name: string, events: Ev[]}) {
  return (
    <div style={{border:'1px solid #ddd', borderRadius:6, padding:8, marginBottom:8}}>
      <div style={{fontWeight:600, marginBottom:6}}>{name}</div>
      <div style={{display:'flex', flexDirection:'column', gap:4, maxHeight:200, overflow:'auto'}}>
        {events.slice(-100).map(e => (
          <div key={e.seq} style={{background:e.act==='TOOL_ERR'?'#ffecec':'#f6f6ff', padding:6, borderRadius:4}}>
            <small style={{opacity:0.6}}>{e.act}</small>
            <div><pre style={{margin:0}}>{e.text}</pre></div>
          </div>
        ))}
      </div>
    </div>
  )
}

