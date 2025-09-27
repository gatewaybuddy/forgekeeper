import React from 'react'

export default function Watermark({ ms }:{ ms:number }) {
  return (
    <span style={{fontSize:12, opacity:0.6}}>wm={ms}ms</span>
  )
}

