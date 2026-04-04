import asyncio
import sys
sys.path.insert(0, '.')
from abo.cli.runner import RawRunner, StreamEvent
from abo.cli.detector import CliInfo

events = []
async def on_event(e):
    events.append(e)
    print(f'Event: {e.type} - {e.data[:30] if e.data else "(empty)"}')

async def test():
    cli = CliInfo('echo', 'Echo', 'cat', 'cat --version', acp_args=[], protocol='raw')
    runner = RawRunner(cli, 'test', '/tmp')

    try:
        await runner.send_message('hello', 'msg-001', on_event)
    except Exception as e:
        print(f'Error: {e}')

    print(f'\nTotal events: {len(events)}')
    print(f'Event types: {[e.type for e in events]}')

asyncio.run(test())
