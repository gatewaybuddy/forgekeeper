import httpx


async def check_gateway_health(base_url: str) -> dict:
    async with httpx.AsyncClient(base_url=base_url, timeout=5) as client:
        r = await client.get("/healthz")
        r.raise_for_status()
        return r.json()
