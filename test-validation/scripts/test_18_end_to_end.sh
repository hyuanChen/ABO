#!/bin/bash
# End-to-end integration test for ABO
# Tests full system with backend running

set -e

echo "=================================="
echo "ABO End-to-End Integration Test"
echo "=================================="

BASE_URL="http://127.0.0.1:8765"
FAILED=0

# Helper function
check_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=${3:-200}

    echo -n "Testing $method $endpoint ... "

    status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$endpoint" 2>/dev/null || echo "000")

    if [ "$status" = "$expected_status" ]; then
        echo "✅ ($status)"
        return 0
    else
        echo "❌ (expected $expected_status, got $status)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo ""
echo "1. Testing Health Endpoints"
echo "----------------------------"
check_endpoint "GET" "/api/health"

echo ""
echo "2. Testing Config Endpoints"
echo "----------------------------"
check_endpoint "GET" "/api/config"

echo ""
echo "3. Testing Module Endpoints"
echo "----------------------------"
check_endpoint "GET" "/api/modules"

echo ""
echo "4. Testing Card Endpoints"
echo "--------------------------"
check_endpoint "GET" "/api/cards"
check_endpoint "GET" "/api/cards/unread-counts"

echo ""
echo "5. Testing Profile Endpoints"
echo "-----------------------------"
check_endpoint "GET" "/api/profile"
check_endpoint "GET" "/api/profile/stats"

echo ""
echo "6. Testing Tool Endpoints"
echo "--------------------------"
check_endpoint "GET" "/api/tools/xiaohongshu/config"
check_endpoint "GET" "/api/tools/zhihu/config"

echo ""
echo "=================================="
echo "Test Summary"
echo "=================================="
if [ $FAILED -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ $FAILED test(s) failed"
    exit 1
fi
