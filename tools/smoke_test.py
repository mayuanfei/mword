#!/usr/bin/env python3
"""仅向本机 mword 测试服务发送请求；不读取真实凭据或调用付费模型。"""
import http.cookiejar
import json
import secrets
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18081/mword-api"
parsed = urlsplit(BASE)
if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.scheme != "http":
    raise SystemExit("只允许本机 HTTP 测试服务，不能对正式服务创建测试数据。")


def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(http, path, body=None, status=200, method=None):
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json"} if data else {})
    try:
        response = http.open(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    value = response.read()
    actual = response.code
    decoded = json.loads(value) if value else None
    if actual != status:
        # Never dump complete responses, credentials, tokens, articles or provider secrets.
        raise AssertionError(f"{path}: expected {status}, got {actual}; code={decoded.get('code') if isinstance(decoded, dict) else 'unknown'}")
    return decoded


def run():
    anonymous, first, second, other_device = client(), client(), client(), client()
    request(anonymous, "/me", status=401)
    password = secrets.token_urlsafe(20)
    username = "smoke_" + secrets.token_hex(5)
    request(first, "/auth/register", {"username": username, "password": password}, status=201)
    request(second, "/auth/register", {"username": "smoke_" + secrets.token_hex(5), "password": secrets.token_urlsafe(20)}, status=201)
    owner = request(first, "/me")
    assert request(second, "/me")["id"] != owner["id"]
    books = request(first, "/books")
    assert {book["id"] for book in books} == {"cet4", "cet6", "postgraduate"}
    assert all(book["wordCount"] > 3000 and book["license"] for book in books)
    words = request(first, "/books/cet4/words")
    assert len(words) == next(book["wordCount"] for book in books if book["id"] == "cet4")
    word = next(word for word in words if word["lemma"] == "retain")
    profile = {"bookId": "cet4", "goal": "读懂技术文章", "interests": ["人工智能"], "dailyMinutes": 20, "level": "基础", "onboardingCompleted": True}
    assert request(first, "/me/profile", profile, method="PUT") == profile
    article = request(first, "/articles", {"title": "Smoke test", "body": "We retain the evidence and adapt our plan when we learn something new.", "source": "USER", "targetWordIds": [word["id"]]}, status=201)
    request(second, "/articles/" + article["id"], status=404)
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    event = {"eventId": secrets.token_hex(16), "deviceId": "smoke_web", "wordId": word["id"], "senseId": word["senseId"], "occurredAt": now, "kind": "RECALL", "rating": 3, "usedHint": False}
    reading = {"eventId": secrets.token_hex(16), "deviceId": "smoke_web", "articleId": article["id"], "position": 1, "completed": True, "occurredAt": now}
    payload = {"cursor": 0, "deviceId": "smoke_web", "events": [event], "readingEvents": [reading]}
    synced = request(first, "/sync", payload)
    assert event["eventId"] in synced["acceptedEventIds"]
    assert reading["eventId"] in synced["acceptedReadingEventIds"]
    assert synced["readingEvents"][0]["completed"] is True
    assert synced["schedulerVersion"] == "interval-v1"
    replayed = request(first, "/sync", payload)
    assert len(replayed["events"]) == 1 and len(replayed["readingEvents"]) == 1
    request(first, "/sync", {**payload, "events": [{**event, "rating": 1}]}, status=409)
    empty = request(second, "/sync", {"cursor": 0, "deviceId": "smoke_other", "events": [], "readingEvents": []})
    assert empty["events"] == [] and empty["readingEvents"] == []
    request(other_device, "/auth/login", {"username": username, "password": password})
    restored = request(other_device, "/sync", {"cursor": 0, "deviceId": "smoke_phone", "events": [], "readingEvents": []})
    assert restored["events"] == replayed["events"] and restored["profile"] == profile
    phone_event = {**event, "eventId": secrets.token_hex(16), "deviceId": "smoke_phone", "kind": "CONTEXT", "rating": 4}
    request(other_device, "/sync", {"cursor": restored["cursor"], "deviceId": "smoke_phone", "events": [phone_event], "readingEvents": []})
    combined = request(first, "/sync", {"cursor": replayed["cursor"], "deviceId": "smoke_web", "events": [], "readingEvents": []})
    assert len(combined["events"]) == 2
    request(first, "/admin/users", status=403)
    quota = request(first, "/ai/quota")
    request(first, "/ai/tasks", {"requestId": secrets.token_hex(16), "scene": "EXPLAIN", "wordId": word["id"], "senseId": word["senseId"]}, status=503)
    assert request(first, "/ai/quota")["available"] == quota["available"]
    request(first, "/auth/logout", method="POST", status=204)
    request(first, "/me", status=401)
    assert request(other_device, "/me")["id"] == owner["id"]
    print("PASS: 真实词库、Cookie登录、资料保存、阅读同步、幂等重放、双设备合并、账号隔离、管理员权限、AI未配置不扣额度、单设备退出")


if __name__ == "__main__":
    run()
