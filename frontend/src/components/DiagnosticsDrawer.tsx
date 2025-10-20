import React from 'react';
import type { CtxEvent } from '../lib/ctxClient';

export default function DiagnosticsDrawer({ events, onClose }: { events: CtxEvent[]; onClose: () => void }) {
  const hasContinuations = Array.isArray(events) && events.some(e => e.act === 'auto_continue');
  return (
    <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100}} onClick={onClose}>
      <div style={{width:'min(900px, 94vw)', background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 12px 32px rgba(0,0,0,0.18)', padding:16, maxHeight:'80vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontWeight:700, color:'#334155'}}>Diagnostics — Recent Events</div>
          <button onClick={onClose} aria-label="Close" title="Close">✕</button>
        </div>
        {hasContinuations && (
          <div style={{marginBottom:12, padding:10, background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:8, color:'#8c6d1f'}}>
            <div style={{fontWeight:700}}>Continuations</div>
            <ul style={{margin:'6px 0 0 16px', padding:0, fontSize:12}}>
              {events.filter(e => e.act === 'auto_continue').map((e, i) => (
                <li key={`cont-${i}`}>attempt {String(e.attempt || '?')}: {String(e.reason || 'incomplete')} {typeof e.elapsed_ms === 'number' ? `(${e.elapsed_ms} ms)` : ''}</li>
              ))}
            </ul>
          </div>
        )}

        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>ts</th>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>actor</th>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>act</th>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>name</th>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>preview</th>
              <th style={{padding:'6px 8px', fontSize:12, color:'#64748b'}}>ms</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, idx) => (
              <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155'}}>{e.ts?.replace('T',' ').replace('Z','Z')}</td>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155'}}>{e.actor}</td>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155'}}>{e.act}</td>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155'}}>{e.name || ''}</td>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155', maxWidth:480, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                  {e.content_preview || e.result_preview || e.args_preview || ''}
                </td>
                <td style={{padding:'6px 8px', fontSize:12, color:'#334155'}}>{typeof e.elapsed_ms === 'number' ? e.elapsed_ms : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
