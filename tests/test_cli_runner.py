"""Tests for CLI runner module"""

import pytest
from dataclasses import dataclass
from typing import List

from abo.cli.runner import StreamEvent, BaseRunner, RawRunner, AcpRunner, WebSocketRunner, RunnerFactory
from abo.cli.detector import CliInfo


class TestStreamEvent:
    """Test StreamEvent dataclass"""

    def test_stream_event_creation(self):
        """Test StreamEvent can be created with required fields"""
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
        """Test StreamEvent can include metadata"""
        event = StreamEvent(
            type="finish",
            data="",
            msg_id="msg-456",
            metadata={"total_length": 100, "tokens": 50}
        )
        assert event.type == "finish"
        assert event.metadata == {"total_length": 100, "tokens": 50}


class TestRunnerFactory:
    """Test RunnerFactory class"""

    def test_runner_factory_create_raw(self):
        """Test factory creates RawRunner for raw protocol"""
        cli_info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            protocol="raw",
            acp_args=["--print"]
        )
        runner = RunnerFactory.create(cli_info, "session-123", "/tmp")
        assert isinstance(runner, RawRunner)
        assert runner.session_id == "session-123"
        assert runner.workspace == "/tmp"

    def test_runner_factory_create_acp(self):
        """Test factory creates AcpRunner for acp protocol"""
        cli_info = CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            protocol="acp",
            acp_args=["--experimental-acp"]
        )
        runner = RunnerFactory.create(cli_info, "session-456", "/workspace")
        assert isinstance(runner, AcpRunner)
        assert runner.session_id == "session-456"
        assert runner.workspace == "/workspace"

    def test_runner_factory_create_websocket(self):
        """Test factory creates WebSocketRunner for websocket protocol"""
        cli_info = CliInfo(
            id="openclaw",
            name="OpenClaw",
            command="openclaw",
            check_cmd="openclaw --version",
            protocol="websocket",
            acp_args=["gateway"]
        )
        runner = RunnerFactory.create(cli_info, "session-789", "/home")
        assert isinstance(runner, WebSocketRunner)
        assert runner.session_id == "session-789"
        assert runner.workspace == "/home"

    def test_runner_factory_defaults_to_raw(self):
        """Test factory defaults to RawRunner for unknown protocol"""
        cli_info = CliInfo(
            id="custom",
            name="Custom CLI",
            command="custom",
            check_cmd="custom --version",
            protocol="unknown"
        )
        runner = RunnerFactory.create(cli_info, "session-000")
        assert isinstance(runner, RawRunner)


class TestRawRunner:
    """Test RawRunner class"""

    def test_raw_runner_initialization(self):
        """Test RawRunner can be initialized"""
        cli_info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            protocol="raw",
            acp_args=["--print"]
        )
        runner = RawRunner(cli_info, "session-abc", "/workspace")
        assert runner.cli_info == cli_info
        assert runner.session_id == "session-abc"
        assert runner.workspace == "/workspace"
        assert runner.process is None
        assert runner._closed is False


class TestAcpRunner:
    """Test AcpRunner class"""

    def test_acp_runner_initialization(self):
        """Test AcpRunner can be initialized"""
        cli_info = CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            protocol="acp",
            acp_args=["--experimental-acp"]
        )
        runner = AcpRunner(cli_info, "session-def", "/home/user")
        assert runner.cli_info == cli_info
        assert runner.session_id == "session-def"
        assert runner.workspace == "/home/user"
        assert runner.process is None
        assert runner._closed is False


class TestWebSocketRunner:
    """Test WebSocketRunner class"""

    def test_websocket_runner_initialization(self):
        """Test WebSocketRunner can be initialized"""
        cli_info = CliInfo(
            id="openclaw",
            name="OpenClaw",
            command="openclaw",
            check_cmd="openclaw --version",
            protocol="websocket",
            acp_args=["gateway"]
        )
        runner = WebSocketRunner(cli_info, "session-ghi", "/tmp")
        assert runner.cli_info == cli_info
        assert runner.session_id == "session-ghi"
        assert runner.workspace == "/tmp"
        assert runner.process is None
        assert runner._closed is False
        assert runner.ws is None
        assert runner.ws_url == "ws://localhost:8080"


class TestBaseRunner:
    """Test BaseRunner abstract class"""

    def test_base_runner_is_abstract(self):
        """Test BaseRunner cannot be instantiated directly"""
        cli_info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version",
            protocol="raw"
        )
        with pytest.raises(TypeError):
            BaseRunner(cli_info, "session-test")
