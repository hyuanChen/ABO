"""Tests for CLI runner module"""
import pytest
import asyncio
import os
from unittest.mock import patch, MagicMock, AsyncMock
from dataclasses import asdict

from abo.cli.runner import StreamEvent, BaseRunner, RawRunner, AcpRunner, RunnerFactory
from abo.cli.detector import CliInfo


class TestStreamEvent:
    """Tests for StreamEvent dataclass"""

    def test_stream_event_creation(self):
        """Test StreamEvent dataclass creation with default values"""
        event = StreamEvent(
            type="content",
            data="Hello world",
            msg_id="msg-123"
        )
        assert event.type == "content"
        assert event.data == "Hello world"
        assert event.msg_id == "msg-123"
        assert event.metadata is None

    def test_stream_event_with_metadata(self):
        """Test StreamEvent with metadata"""
        event = StreamEvent(
            type="finish",
            data="",
            msg_id="msg-456",
            metadata={"total_length": 100, "tokens": 50}
        )
        assert event.type == "finish"
        assert event.data == ""
        assert event.msg_id == "msg-456"
        assert event.metadata == {"total_length": 100, "tokens": 50}

    def test_stream_event_all_types(self):
        """Test StreamEvent with different event types"""
        types = ["start", "content", "tool_call", "error", "finish"]
        for t in types:
            event = StreamEvent(type=t, data="test", msg_id="id")
            assert event.type == t


class TestRunnerFactory:
    """Tests for RunnerFactory class"""

    def test_factory_creates_raw_runner(self):
        """Test factory creates RawRunner for raw protocol"""
        cli_info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            protocol="raw"
        )

        runner = RunnerFactory.create(cli_info, "session-123", "/tmp/workspace")

        assert isinstance(runner, RawRunner)
        assert runner.cli_info == cli_info
        assert runner.session_id == "session-123"
        assert runner.workspace == "/tmp/workspace"

    def test_factory_creates_acp_runner(self):
        """Test factory creates AcpRunner for acp protocol"""
        cli_info = CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            protocol="acp"
        )

        runner = RunnerFactory.create(cli_info, "session-456", "/home/user")

        assert isinstance(runner, AcpRunner)
        assert runner.cli_info == cli_info
        assert runner.session_id == "session-456"
        assert runner.workspace == "/home/user"

    def test_factory_defaults_to_raw_for_unknown_protocol(self):
        """Test factory defaults to RawRunner for unknown protocol"""
        cli_info = CliInfo(
            id="unknown",
            name="Unknown CLI",
            command="unknown",
            check_cmd="unknown --version",
            protocol="unknown_protocol"
        )

        runner = RunnerFactory.create(cli_info, "session-789")

        assert isinstance(runner, RawRunner)

    def test_factory_uses_default_workspace(self):
        """Test factory uses default workspace when not provided"""
        cli_info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            protocol="raw"
        )

        runner = RunnerFactory.create(cli_info, "session-000")

        assert runner.workspace == os.getcwd()


class TestBaseRunner:
    """Tests for BaseRunner abstract class"""

    def test_base_runner_initialization(self):
        """Test BaseRunner initialization"""
        cli_info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version"
        )

        class ConcreteRunner(BaseRunner):
            async def send_message(self, message, msg_id, on_event):
                pass

        runner = ConcreteRunner(cli_info, "session-1", "/workspace")

        assert runner.cli_info == cli_info
        assert runner.session_id == "session-1"
        assert runner.workspace == "/workspace"
        assert runner.process is None
        assert runner._closed is False

    def test_base_runner_get_env(self):
        """Test BaseRunner _get_env method"""
        cli_info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version"
        )

        class ConcreteRunner(BaseRunner):
            async def send_message(self, message, msg_id, on_event):
                pass

        runner = ConcreteRunner(cli_info, "session-1")
        env = runner._get_env()

        assert isinstance(env, dict)
        assert "PATH" in env

    @pytest.mark.asyncio
    async def test_base_runner_close_no_process(self):
        """Test BaseRunner close when no process exists"""
        cli_info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version"
        )

        class ConcreteRunner(BaseRunner):
            async def send_message(self, message, msg_id, on_event):
                pass

        runner = ConcreteRunner(cli_info, "session-1")
        await runner.close()

        assert runner._closed is True


class TestRawRunner:
    """Tests for RawRunner class"""

    @pytest.fixture
    def cli_info(self):
        return CliInfo(
            id="claude",
            name="Claude Code",
            command="cat",  # Use cat for testing
            check_cmd="cat --version",
            protocol="raw",
            acp_args=[]
        )

    @pytest.mark.asyncio
    async def test_raw_runner_lifecycle_with_cat(self, cli_info):
        """Test RawRunner full lifecycle using cat command"""
        events = []

        async def event_handler(event):
            events.append(event)

        runner = RawRunner(cli_info, "session-test", "/tmp")

        try:
            await runner.send_message("Hello", "msg-1", event_handler)
        finally:
            await runner.close()

        # Should have received start, content, and finish events
        assert len(events) >= 2
        assert events[0].type == "start"
        assert events[0].msg_id == "msg-1"
        assert events[-1].type == "finish"
        assert events[-1].msg_id == "msg-1"

        # Content should contain our message (cat echoes stdin)
        content_events = [e for e in events if e.type == "content"]
        assert len(content_events) >= 1
        assert "Hello" in "".join(e.data for e in content_events)

    @pytest.mark.asyncio
    async def test_raw_runner_with_echo(self):
        """Test RawRunner using echo command"""
        cli_info = CliInfo(
            id="echo",
            name="Echo",
            command="echo",
            check_cmd="echo --version",
            protocol="raw",
            acp_args=["test message"]
        )

        events = []

        async def event_handler(event):
            events.append(event)

        runner = RawRunner(cli_info, "session-echo")

        try:
            await runner.send_message("ignored", "msg-echo", event_handler)
        finally:
            await runner.close()

        # Should have events
        assert len(events) >= 2
        assert events[0].type == "start"
        assert events[-1].type == "finish"

    @pytest.mark.asyncio
    async def test_raw_runner_process_cleanup(self, cli_info):
        """Test that RawRunner properly cleans up process"""
        runner = RawRunner(cli_info, "session-cleanup")

        async def event_handler(event):
            pass

        await runner.send_message("test", "msg-1", event_handler)

        # After send_message, process should be cleaned up
        assert runner.process is None or runner._closed is True

    @pytest.mark.asyncio
    async def test_raw_runner_close_idempotent(self, cli_info):
        """Test that close() can be called multiple times safely"""
        runner = RawRunner(cli_info, "session-idempotent")

        async def event_handler(event):
            pass

        await runner.send_message("test", "msg-1", event_handler)
        await runner.close()
        await runner.close()  # Should not raise

        assert runner._closed is True


class TestAcpRunner:
    """Tests for AcpRunner class"""

    @pytest.fixture
    def acp_cli_info(self):
        return CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="cat",  # Use cat for testing
            check_cmd="cat --version",
            protocol="acp",
            acp_args=[]
        )

    @pytest.mark.asyncio
    async def test_acp_runner_initialization(self, acp_cli_info):
        """Test AcpRunner initialization"""
        runner = AcpRunner(acp_cli_info, "session-acp", "/workspace")

        assert runner.cli_info == acp_cli_info
        assert runner.session_id == "session-acp"
        assert runner.workspace == "/workspace"

    def test_acp_runner_is_base_runner_subclass(self):
        """Test AcpRunner inherits from BaseRunner"""
        assert issubclass(AcpRunner, BaseRunner)


class TestStreamEventTypes:
    """Tests for different StreamEvent types"""

    def test_start_event(self):
        """Test start event type"""
        event = StreamEvent(type="start", data="", msg_id="msg-1")
        assert event.type == "start"

    def test_content_event(self):
        """Test content event type"""
        event = StreamEvent(type="content", data="Hello", msg_id="msg-1")
        assert event.type == "content"
        assert event.data == "Hello"

    def test_tool_call_event(self):
        """Test tool_call event type"""
        event = StreamEvent(
            type="tool_call",
            data='{"tool": "read_file"}',
            msg_id="msg-1",
            metadata={"tool": "read_file", "args": ["file.txt"]}
        )
        assert event.type == "tool_call"
        assert event.metadata is not None

    def test_error_event(self):
        """Test error event type"""
        event = StreamEvent(type="error", data="Something went wrong", msg_id="msg-1")
        assert event.type == "error"
        assert event.data == "Something went wrong"

    def test_finish_event(self):
        """Test finish event type"""
        event = StreamEvent(type="finish", data="", msg_id="msg-1", metadata={"total_length": 100})
        assert event.type == "finish"
        assert event.metadata == {"total_length": 100}
