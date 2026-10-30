#!/usr/bin/env python3
"""通过本机 HTTP 验证授权的 MySQL 测试服务；不执行 SQL 或调用模型。

完整队列验证必须显式传入 --allow-queued-tests，且服务端 worker 必须已关闭。
运行时才读取本机配置中的管理员凭据。密码、Cookie、Token 均不落盘或打印。
verification.json 保留确切测试数据 ID，供操作者在验证后独立执行精确清理。
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import re
import secrets
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / ".cache/mysql/config.json"
JOURNAL_PATH = ROOT / ".cache/mysql/verification.json"
STATS_PATH = ROOT / ".cache/mysql/stats.json"


class VerificationFailure(Exception):
    def __init__(self, endpoint: str, status: int, code: str):
        super().__init__("Verification failed")
        self.endpoint = endpoint
        self.status = status
        self.code = code if re.fullmatch(r"[A-Z0-9_]{1,80}", code) else "UNEXPECTED_RESPONSE"

    def public(self):
        return {"endpoint": self.endpoint, "status": self.status, "code": self.code}


def require(condition, endpoint: str, code: str, status: int = 200):
    if not condition:
        raise VerificationFailure(endpoint, status, code)


def atomic_json(path: Path, value, mode: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


class Journal:
    """追加记录，不覆盖前一次验证留下的待清理 ID。"""

    def __init__(self, nonce: str):
        self.lock = threading.Lock()
        if JOURNAL_PATH.exists():
            try:
                self.data = json.loads(JOURNAL_PATH.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                raise VerificationFailure("local-journal", 0, "JOURNAL_INVALID") from None
            require(isinstance(self.data, dict), "local-journal", "JOURNAL_INVALID", 0)
        else:
            self.data = {}
        for key in ("users", "providerIds", "articleIds", "taskIds", "pendingUsernames", "pendingProviderNames"):
            self.data.setdefault(key, [])
            require(isinstance(self.data[key], list), "local-journal", "JOURNAL_INVALID", 0)
        self.data["lastRunNonce"] = nonce
        self.data["updatedAt"] = utc_now()
        atomic_json(JOURNAL_PATH, self.data, 0o600)

    def pending(self, key: str, value: str):
        with self.lock:
            if value not in self.data[key]:
                self.data[key].append(value)
                self._save()

    def user(self, identifier: str, username: str):
        with self.lock:
            if not any(item.get("id") == identifier for item in self.data["users"]):
                self.data["users"].append({"id": identifier, "username": username})
            self.data["pendingUsernames"] = [name for name in self.data["pendingUsernames"] if name != username]
            self._save()

    def created(self, key: str, identifier: str, provider_name: str | None = None):
        with self.lock:
            if identifier in self.data[key]:
                return
            self.data[key].append(identifier)
            if provider_name:
                self.data["pendingProviderNames"] = [name for name in self.data["pendingProviderNames"] if name != provider_name]
            self._save()

    def _save(self):
        self.data["updatedAt"] = utc_now()
        atomic_json(JOURNAL_PATH, self.data, 0o600)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


@dataclass
class Result:
    status: int
    value: object


class Client:
    def __init__(self, base: str):
        self.base = base
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPCookieProcessor(self.cookies)
        )

    def call(self, endpoint: str, body=None, *, method: str | None = None, allowed=(200,)) -> Result:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self.base + endpoint,
            data=data,
            method=method or ("POST" if body is not None else "GET"),
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        except (urllib.error.URLError, TimeoutError, OSError):
            raise VerificationFailure(endpoint, 0, "NETWORK_ERROR") from None
        with response:
            status = response.code
            try:
                content = response.read()
                value = json.loads(content) if content else None
            except (OSError, ValueError, UnicodeError):
                raise VerificationFailure(endpoint, status, "INVALID_RESPONSE") from None
        if status not in allowed:
            code = value.get("code") if isinstance(value, dict) else None
            raise VerificationFailure(endpoint, status, code if isinstance(code, str) else "UNEXPECTED_STATUS")
        return Result(status, value)

    def get(self, endpoint: str):
        return self.call(endpoint).value


def object_response(result: Result, endpoint: str):
    require(isinstance(result.value, dict), endpoint, "INVALID_RESPONSE", result.status)
    return result.value


def parallel(items, operation, workers: int):
    with ThreadPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(operation, items))


def registered(client: Client, journal: Journal, username: str, password: str):
    journal.pending("pendingUsernames", username)
    result = client.call("/auth/register", {"username": username, "password": password}, allowed=(201,))
    value = object_response(result, "/auth/register")
    user = value.get("user")
    require(isinstance(user, dict) and isinstance(user.get("id"), str) and user.get("username") == username,
            "/auth/register", "CREATED_USER_INVALID", 201)
    # Record immediately, before any subsequent request. Never persist the auth response.
    journal.user(user["id"], username)
    require(any(cookie.name == "mw_session" for cookie in client.cookies), "/auth/register", "COOKIE_MISSING", 201)
    return user


def run(base: str, credentials: dict, journal: Journal, nonce: str, queued: bool, stats: dict):
    admin, anonymous, first, second, other_device = (Client(base) for _ in range(5))
    admin.call("/auth/login", {"username": credentials["adminUsername"], "password": credentials["adminPassword"]})
    require(admin.get("/me").get("role") == "ADMIN", "/me", "ADMIN_REQUIRED")
    anonymous.call("/me", allowed=(401,))
    first_password = secrets.token_urlsafe(32)
    first_name, second_name = f"qa_mword_{nonce}_a", f"qa_mword_{nonce}_b"
    owner = registered(first, journal, first_name, first_password)
    other = registered(second, journal, second_name, secrets.token_urlsafe(32))
    stats["usersCreated"] = 2
    require(first.get("/me")["id"] == owner["id"] and second.get("/me")["id"] == other["id"], "/me", "COOKIE_ACCOUNT_ISOLATION_FAILED")
    require(owner["id"] != other["id"], "/me", "ACCOUNT_IDS_NOT_DISTINCT")
    stats["cookieLogin"] = True

    books = first.get("/books")
    require(isinstance(books, list) and {book["id"] for book in books} == {"cet4", "cet6", "postgraduate"}, "/books", "PRESET_BOOKS_INVALID")
    require(all(book.get("wordCount", 0) > 3000 and book.get("license") for book in books), "/books", "CATALOG_CONTENT_INVALID")
    words = first.get("/books/cet4/words")
    require(isinstance(words, list) and len(words) == next(book["wordCount"] for book in books if book["id"] == "cet4"), "/books/cet4/words", "WORD_COUNT_MISMATCH")
    word = next((item for item in words if item.get("lemma") == "retain"), None)
    require(isinstance(word, dict) and isinstance(word.get("senseId"), str), "/books/cet4/words", "TEST_WORD_UNAVAILABLE")
    stats["presetBooks"] = len(books)
    stats["cet4WordCount"] = len(words)

    profile = {"bookId": "cet4", "goal": "验证跨设备英文阅读", "interests": ["人工智能", "摄影"], "dailyMinutes": 20, "level": "基础", "onboardingCompleted": True}
    saved = first.call("/me/profile", profile, method="PUT").value
    require(saved == profile and first.get("/me")["profile"] == profile, "/me/profile", "PROFILE_NOT_PERSISTED")
    require(second.get("/me")["profile"] != profile, "/me/profile", "PROFILE_ACCOUNT_LEAK")
    created = object_response(first.call("/articles", {"title": "MySQL HTTP verification", "body": "We retain the evidence and adapt our reading plan.", "source": "USER", "targetWordIds": [word["id"]]}, allowed=(201,)), "/articles")
    require(isinstance(created.get("id"), str), "/articles", "CREATED_ARTICLE_INVALID", 201)
    journal.created("articleIds", created["id"])
    second.call("/articles/" + created["id"], allowed=(404,))
    require(all(item["id"] != created["id"] for item in second.get("/articles")), "/articles", "ARTICLE_ACCOUNT_LEAK")
    stats["profileAndArticleIsolation"] = True

    device = f"qa_device_{nonce}"
    now = utc_now()
    lower_id = f"qa_case_{nonce}_lower"
    upper_id = lower_id.upper()
    event = {"eventId": lower_id, "deviceId": device, "wordId": word["id"], "senseId": word["senseId"], "occurredAt": now, "kind": "RECALL", "rating": 3, "usedHint": False}
    second_event = {**event, "eventId": upper_id, "rating": 2}
    reading = {"eventId": f"qa_reading_{nonce}", "deviceId": device, "articleId": created["id"], "position": 1, "completed": True, "occurredAt": now}
    payload = {"cursor": 0, "deviceId": device, "events": [event, second_event], "readingEvents": [reading]}
    synced = first.call("/sync", payload).value
    require(set(synced["acceptedEventIds"]) == {lower_id, upper_id}, "/sync", "CASE_DISTINCT_IDS_NOT_ACCEPTED")
    require({item["eventId"] for item in synced["events"]} == {lower_id, upper_id}, "/sync", "CASE_DISTINCT_IDS_NOT_PERSISTED")
    require(reading["eventId"] in synced["acceptedReadingEventIds"], "/sync", "READING_NOT_PERSISTED")
    require(synced["schedulerVersion"] == "interval-v1", "/sync", "SCHEDULER_VERSION_MISMATCH")
    replay = first.call("/sync", payload).value
    require(len(replay["events"]) == 2 and len(replay["readingEvents"]) == 1, "/sync", "REPLAY_NOT_IDEMPOTENT")
    first.call("/sync", {**payload, "events": [{**event, "rating": 1}], "readingEvents": []}, allowed=(409,))
    isolated = second.call("/sync", {"cursor": 0, "deviceId": f"qa_other_{nonce}", "events": [], "readingEvents": []}).value
    require(isolated["events"] == [] and isolated["readingEvents"] == [], "/sync", "SYNC_ACCOUNT_LEAK")
    other_device.call("/auth/login", {"username": first_name, "password": first_password})
    recovered = other_device.call("/sync", {"cursor": 0, "deviceId": f"qa_phone_{nonce}", "events": [], "readingEvents": []}).value
    require(recovered["events"] == replay["events"] and recovered["profile"] == profile, "/sync", "CROSS_DEVICE_RECOVERY_FAILED")
    first.call("/admin/users", allowed=(403,))
    stats["syncCaseSensitiveEventIds"] = True
    stats["syncReplayAndRecovery"] = True

    providers = admin.get("/admin/providers")
    require(isinstance(providers, list), "/admin/providers", "INVALID_PROVIDER_LIST")
    before = first.get("/ai/quota")
    if not providers:
        first.call("/ai/tasks", {"requestId": f"qa_unconfigured_{nonce}", "scene": "EXPLAIN", "wordId": word["id"], "senseId": word["senseId"]}, allowed=(503,))
        after = first.get("/ai/quota")
        require((after["available"], after["reserved"]) == (before["available"], before["reserved"]), "/ai/quota", "UNCONFIGURED_AI_CHANGED_BALANCE")
        stats["unconfiguredAi503NoCharge"] = True
    else:
        stats["unconfiguredAi503NoCharge"] = "skipped_existing_providers"

    if queued and not providers:
        verify_queue(admin, first, second, owner["id"], word, journal, nonce, stats)
    else:
        stats["queuedTests"] = "skipped_existing_providers" if providers and queued else "basic_only"

    first.call("/auth/logout", method="POST", allowed=(204,))
    first.call("/me", allowed=(401,))
    require(other_device.get("/me")["id"] == owner["id"], "/me", "LOGOUT_AFFECTED_OTHER_DEVICE")
    stats["singleDeviceLogout"] = True


def verify_queue(admin: Client, first: Client, second: Client, user_id: str, word: dict, journal: Journal, nonce: str, stats: dict):
    quota = first.get("/ai/quota")
    require(quota["sceneCosts"].get("EXPLAIN") == 1 and quota["reserved"] == 0, "/ai/quota", "QUEUE_TEST_COST_OR_BALANCE_INVALID")
    if quota["available"] < 1:
        admin.call(f"/admin/users/{user_id}/quota", {"requestId": f"qa_initial_quota_{nonce}", "amount": 1 - quota["available"], "reason": "mword本机MySQL验证初始额度"})
        quota = first.get("/ai/quota")

    provider_name = f"qa_mword_{nonce}"
    journal.pending("pendingProviderNames", provider_name)
    provider = object_response(admin.call("/admin/providers", {"name": provider_name, "baseUrl": "https://api.deepseek.com/v1", "model": "qa-no-network", "apiKey": f"qa-invalid-do-not-call-{nonce}", "enabled": True, "scenes": ["EXPLAIN"], "priority": 0}, allowed=(201,)), "/admin/providers")
    require(isinstance(provider.get("id"), str), "/admin/providers", "CREATED_PROVIDER_INVALID", 201)
    journal.created("providerIds", provider["id"], provider_name=provider_name)
    require(provider.get("hasKey") is True and "apiKey" not in provider, "/admin/providers", "PROVIDER_KEY_RESPONSE_INVALID", 201)
    stats["fakeProviderCreated"] = True

    def create(request_id: str, allowed=(202,)):
        result = first.call("/ai/tasks", {"requestId": request_id, "scene": "EXPLAIN", "wordId": word["id"], "senseId": word["senseId"], "context": "Retain the evidence; this is a queue-only test."}, allowed=allowed)
        if result.status == 202:
            task = object_response(result, "/ai/tasks")
            require(isinstance(task.get("id"), str), "/ai/tasks", "TASK_ID_INVALID", 202)
            journal.created("taskIds", task["id"])
            require(task.get("status") == "QUEUED", "/ai/tasks", "WORKER_MUST_BE_DISABLED", 202)
        return result

    shared_request = f"qa_same_request_{nonce}"
    responses = parallel([shared_request] * 20, create, 20)
    identifiers = {result.value["id"] for result in responses}
    require(len(identifiers) == 1, "/ai/tasks", "CONCURRENT_REQUEST_NOT_IDEMPOTENT", 202)
    task_id = next(iter(identifiers))
    reserved = first.get("/ai/quota")
    require((reserved["available"], reserved["reserved"]) == (quota["available"] - 1, 1), "/ai/quota", "SHARED_REQUEST_RESERVED_MORE_THAN_ONCE")
    second.call("/ai/tasks/" + task_id, allowed=(404,))
    parallel([task_id] * 20, lambda identifier: first.call("/ai/tasks/" + identifier, method="DELETE", allowed=(204,)), 20)
    restored = first.get("/ai/quota")
    require((restored["available"], restored["reserved"]) == (quota["available"], 0), "/ai/quota", "CONCURRENT_CANCEL_RELEASED_MORE_THAN_ONCE")
    stats["sameRequestConcurrency"] = 20
    stats["sameRequestUniqueTasks"] = 1
    stats["sameRequestReservedUnits"] = 1

    admin.call(f"/admin/users/{user_id}/quota", {"requestId": f"qa_set_two_{nonce}", "amount": 2 - restored["available"], "reason": "mword本机MySQL验证余额边界"})
    require(first.get("/ai/quota")["available"] == 2, "/ai/quota", "QUOTA_ADJUSTMENT_FAILED")
    independent = parallel([f"qa_budget_{nonce}_{index}" for index in range(5)], lambda identifier: create(identifier, allowed=(202, 402)), 5)
    accepted = [result.value["id"] for result in independent if result.status == 202]
    rejected = [result for result in independent if result.status == 402]
    require(len(accepted) == 2 and len(set(accepted)) == 2 and len(rejected) == 3, "/ai/tasks", "CONCURRENT_QUOTA_BOUNDARY_FAILED")
    exhausted = first.get("/ai/quota")
    require((exhausted["available"], exhausted["reserved"]) == (0, 2), "/ai/quota", "CONCURRENT_QUOTA_BALANCE_INVALID")
    parallel([identifier for identifier in accepted for _ in range(3)], lambda identifier: first.call("/ai/tasks/" + identifier, method="DELETE", allowed=(204,)), 6)
    final = first.get("/ai/quota")
    require((final["available"], final["reserved"]) == (2, 0), "/ai/quota", "REPEATED_CANCEL_CHANGED_FINAL_BALANCE")
    stats["quotaBoundaryAccepted"] = len(accepted)
    stats["quotaBoundaryRejected402"] = len(rejected)
    stats["repeatedCancelRestoredBalance"] = True
    stats["queuedTests"] = "passed"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:18084/mword-api")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--basic-only", action="store_true", help="仅验证基础流程，不创建假供应商或排队AI任务")
    parser.add_argument("--allow-queued-tests", action="store_true", help="确认本机服务worker=false，允许创建假供应商并测试额度并发")
    args = parser.parse_args()
    stats = {"result": "RUNNING", "startedAt": utc_now(), "usersCreated": 0}
    try:
        parsed = urlsplit(args.base)
        require(parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
                and parsed.username is None and parsed.password is None and parsed.path.rstrip("/") == "/mword-api"
                and not parsed.query and not parsed.fragment, "local-base", "LOCAL_HTTP_BASE_REQUIRED", 0)
        require(args.basic_only != args.allow_queued_tests, "local-options", "CHOOSE_BASIC_OR_EXPLICIT_QUEUED_TESTS", 0)
        try:
            credentials = json.loads(args.config.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise VerificationFailure("local-config", 0, "ADMIN_CONFIG_INVALID") from None
        require(isinstance(credentials, dict) and all(isinstance(credentials.get(key), str) and credentials[key]
                for key in ("adminUsername", "adminPassword")), "local-config", "ADMIN_CONFIG_INVALID", 0)
        nonce = secrets.token_hex(8)
        journal = Journal(nonce)
        run(args.base.rstrip("/"), credentials, journal, nonce, args.allow_queued_tests, stats)
        stats.update({"result": "PASS", "finishedAt": utc_now()})
        atomic_json(STATS_PATH, stats, 0o644)
        print("PASS")
        return 0
    except VerificationFailure as error:
        stats.update({"result": "FAIL", "finishedAt": utc_now(), **error.public()})
        try:
            atomic_json(STATS_PATH, stats, 0o644)
        except OSError:
            pass
        print(json.dumps(error.public(), ensure_ascii=False))
        return 1
    except Exception:
        # Never print traceback, exception text or response payloads with possible credentials.
        failure = {"endpoint": "local-verifier", "status": 0, "code": "VERIFIER_ERROR"}
        stats.update({"result": "FAIL", "finishedAt": utc_now(), **failure})
        try:
            atomic_json(STATS_PATH, stats, 0o644)
        except OSError:
            pass
        print(json.dumps(failure, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
