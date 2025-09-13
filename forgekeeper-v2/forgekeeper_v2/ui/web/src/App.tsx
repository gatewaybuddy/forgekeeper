import React, { useEffect, useRef, useState } from 'react'
import DuetLanes from './components/DuetLanes'
import ToolLane from './components/ToolLane'
import InterruptBar from './components/InterruptBar'

type Ev = { role: string, stream: string, act: string, text: string, seq: number, wm_event_time_ms: number }

export default function App() {
  const [events, setEvents] = useState<Ev[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/events`)
    wsRef.current = ws
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data)
        setEvents(prev => [...prev, ev])
      } catch {}
    }
    return () => ws.close()
  }, [])

  const toolStreams = Array.from(new Set(events.filter(e => e.role === 'tool').map(e => e.stream)))

  return (
    <div style={{fontFamily:'sans-serif', display:'flex', gap:12, padding:12}}>
      <DuetLanes events={events} />
      <div style={{minWidth: 360}}>
        {toolStreams.map(name => (
          <ToolLane key={name} name={name} events={events.filter(e => e.stream===name)} />
        ))}
      </div>
      <InterruptBar onInput={(text) => {
        console.log('interrupt', text)
      }} />
    </div>
  )
}

