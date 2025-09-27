import asyncio, tempfile
from pathlib import Path
from forgekeeper_v2.orchestrator.orchestrator import Orchestrator
from forgekeeper_v2.orchestrator.adapters import LLMMock

async def main():
    tmp = Path(tempfile.mkdtemp())
    rec = tmp / 'events.jsonl'
    orch = Orchestrator(recorder_path=rec, llm_a=LLMMock('A'), llm_b=LLMMock('B'), tools=[])
    await orch.run(duration_s=2.0)
    print('rec_path', rec)
    print('content:\n', rec.read_text())
asyncio.run(main())
