#!/usr/bin/env python3
"""Tests for FastAPI routes."""
import sys
import asyncio

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
import httpx


# Backend URL
BASE_URL = "http://127.0.0.1:8765"


class TestHealthEndpoint:
    """Test health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        """Test /api/health returns OK status."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/api/health", timeout=5)
                assert response.status_code == 200
                data = response.json()
                assert data.get("status") == "ok"
            except httpx.ConnectError:
                pytest.skip("Backend not running")


class TestConfigEndpoints:
    """Test config endpoints."""

    @pytest.mark.asyncio
    async def test_get_config(self):
        """Test GET /api/config returns config."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/api/config", timeout=5)
                assert response.status_code == 200
                data = response.json()
                assert "vault_path" in data
            except httpx.ConnectError:
                pytest.skip("Backend not running")


class TestModulesEndpoints:
    """Test modules endpoints."""

    @pytest.mark.asyncio
    async def test_get_modules(self):
        """Test GET /api/modules returns modules list."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/api/modules", timeout=5)
                assert response.status_code == 200
                data = response.json()
                assert "modules" in data
                assert isinstance(data["modules"], list)
            except httpx.ConnectError:
                pytest.skip("Backend not running")


class TestCardsEndpoints:
    """Test cards endpoints."""

    @pytest.mark.asyncio
    async def test_get_cards(self):
        """Test GET /api/cards returns cards."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/api/cards", timeout=5)
                assert response.status_code == 200
                data = response.json()
                assert "cards" in data
                assert isinstance(data["cards"], list)
            except httpx.ConnectError:
                pytest.skip("Backend not running")


class TestProfileEndpoints:
    """Test profile endpoints."""

    @pytest.mark.asyncio
    async def test_get_profile(self):
        """Test GET /api/profile returns profile data."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/api/profile", timeout=5)
                assert response.status_code == 200
                data = response.json()
                assert "identity" in data
                assert "stats" in data
            except httpx.ConnectError:
                pytest.skip("Backend not running")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
