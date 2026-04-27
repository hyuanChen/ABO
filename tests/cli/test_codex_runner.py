import asyncio

from abo.cli.detector import CliInfo
from abo.cli.runner import CodexRunner, RunnerFactory


def _cli_info() -> CliInfo:
    return CliInfo(
        id="codex",
        name="OpenAI Codex",
        command="codex",
        check_cmd="codex --version",
        acp_args=["exec", "--full-auto", "--skip-git-repo-check", "--color", "never"],
        protocol="raw",
        is_available=True,
    )


def test_runner_factory_prefers_codex_runner_for_codex_cli():
    runner = RunnerFactory.create(_cli_info(), "session-123", "/tmp/workspace")
    assert isinstance(runner, CodexRunner)


def test_codex_runner_builds_resume_command():
    runner = CodexRunner(
        _cli_info(),
        "session-456",
        "/tmp/workspace",
        resume_session_id="thread-abc",
    )
    assert runner._build_command() == [
        "codex",
        "exec",
        "resume",
        "--json",
        "--full-auto",
        "--skip-git-repo-check",
        "thread-abc",
    ]


def test_codex_runner_processes_thread_message_and_finish_events():
    runner = CodexRunner(_cli_info(), "session-789", "/tmp/workspace")
    events = []

    async def on_event(event):
        events.append(event)

    async def exercise():
        delta, finished = await runner._process_codex_line(
            '{"type":"thread.started","thread_id":"thread-123"}',
            "msg-1",
            on_event,
            False,
        )
        assert delta == 0
        assert finished is False
        assert runner.last_session_handle == "thread-123"

        delta, finished = await runner._process_codex_line(
            '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello"}}',
            "msg-1",
            on_event,
            False,
        )
        assert delta == 5
        assert finished is False

        delta, finished = await runner._process_codex_line(
            '{"type":"turn.completed","usage":{"input_tokens":10}}',
            "msg-1",
            on_event,
            False,
        )
        assert delta == 0
        assert finished is True

    asyncio.run(exercise())

    assert [event.type for event in events] == ["status", "status", "content", "finish"]
    assert events[0].metadata["phase"] == "session"
    assert events[1].metadata["phase"] == "responding"
    assert events[2].data == "hello"
    assert events[3].metadata["thread_id"] == "thread-123"


def test_codex_runner_maps_command_execution_to_tool_call():
    runner = CodexRunner(_cli_info(), "session-000", "/tmp/workspace")
    events = []

    async def on_event(event):
        events.append(event)

    async def exercise():
        await runner._process_codex_line(
            '{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"echo hi"}}',
            "msg-1",
            on_event,
            False,
        )

    asyncio.run(exercise())

    assert [event.type for event in events] == ["status", "tool_call"]
    assert events[0].metadata["phase"] == "tool"
    assert events[1].data == "echo hi"
