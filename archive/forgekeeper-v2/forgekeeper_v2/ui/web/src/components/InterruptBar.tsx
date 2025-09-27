import React, { useEffect, useRef, useState } from 'react'

export default function InterruptBar({ onInput }:{ onInput: (text:string)=>void }) {
  const [text, setText] = useState('')
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onInput(text), 220)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [text])
  return (
    <div style={{position:'fixed', left:12, right:12, bottom:12}}>
      <input value={text} onChange={e=>setText(e.target.value)} placeholder="Type to interrupt…" style={{width:'100%', padding:8}}/>
    </div>
  )
}

