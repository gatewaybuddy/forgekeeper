import React from 'react'

type Ev = { role: string, stream: string, act: string, text: string, seq: number }

export default function DuetLanes({ events }: { events: Ev[] }) {
  const a = events.filter(e => e.role==='botA')
  const b = events.filter(e => e.role==='botB')
  const Lane = ({title, evs}:{title:string, evs:Ev[]}) => (
    <div style={{flex:1, border:'1px solid #ddd', borderRadius:6, padding:8}}>
      <div style={{fontWeight:600, marginBottom:6}}>{title}</div>
      <div style={{display:'flex', flexDirection:'column', gap:4}}>
        {evs.slice(-50).map(e => (
          <div key={e.seq} style={{background:'#fafafa', padding:6, borderRadius:4}}>
            <small style={{opacity:0.6}}>{e.act}</small>
            <div>{e.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div style={{display:'flex', gap:8, minWidth:520}}>
      <Lane title="Strategist" evs={a} />
      <Lane title="Implementer" evs={b} />
    </div>
  )
}

