import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    parameters = StdioServerParameters(command=sys.executable, args=['-m', 'app.mcp_server'], cwd=str(Path(__file__).resolve().parents[1] / 'backend'))
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = sorted(tool.name for tool in tools.tools)
            assert len(names) == 7 and 'approve_request' not in names
            result = await session.call_tool('check_budget', {'department': 'Engineering'})
            assert not result.isError
            print(json.dumps({'tools': names, 'budget_tool': 'passed'}))


asyncio.run(main())
