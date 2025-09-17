import asyncio
from pathlib import Path
from forgekeeper_v2.orchestrator.orchestrator import Orchestrator
from forgekeeper_v2.orchestrator.adapters import LLMMock

async def main():
    rec = Path('tmp_events_local.jsonl')
    if rec.exists():
        rec.unlink()
    orch = Orchestrator(recorder_path=rec, llm_a=LLMMock('A'), llm_b=LLMMock('B'), tools=[])
    await orch.run(duration_s=2.0)
    print('--- FILE ---')
    print(rec.read_text(encoding='utf-8'))

asyncio.run(main())
