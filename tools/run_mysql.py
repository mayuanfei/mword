#!/usr/bin/env python3
"""用受保护的云 MySQL 配置运行正式 JAR，仅监听本机。

固定配置：.cache/mysql/config.json（目录 700、文件 600，由使用者准备）。
必填字段：dbUrl、dbUsername、dbPassword、encryptionSecret。
可选字段：apiPort（默认 18084）、adminUsername/adminPassword（成对）。
本工具不生成凭证，不执行数据库管理命令，不加载 test/local profile。
"""

from __future__ import annotations

import argparse
import base64
import binascii
from dataclasses import dataclass
import errno
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qsl, urlsplit
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
MYSQL = ROOT / ".cache" / "mysql"
CONFIG = MYSQL / "config.json"


class LaunchError(Exception):
    pass


class Stopped(Exception):
    pass


def valid_port(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1024 <= value <= 65535


def validate_configuration(value: object) -> dict:
    required = {"dbUrl", "dbUsername", "dbPassword", "encryptionSecret"}
    optional = {"apiPort", "adminUsername", "adminPassword"}
    if not isinstance(value, dict) or not required <= value.keys() or value.keys() - required - optional:
        raise LaunchError("MySQL 配置字段不完整或包含不支持的字段。")
    for field in required | (value.keys() & {"adminUsername", "adminPassword"}):
        text = value[field]
        if not isinstance(text, str) or not text.strip() or any(ord(character) < 32 for character in text):
            raise LaunchError(f"配置字段 {field} 必须是非空单行字符串。")
        try:
            text.encode("utf-8")
        except UnicodeEncodeError:
            raise LaunchError(f"配置字段 {field} 必须是有效的 UTF-8 字符串。") from None
    if value["dbUsername"].strip().lower() == "root":
        raise LaunchError("请配置 mword 专用数据库用户，不能使用数据库 root。")
    if ("adminUsername" in value) != ("adminPassword" in value):
        raise LaunchError("adminUsername 和 adminPassword 必须同时提供或同时省略。")
    try:
        secret = base64.b64decode(value["encryptionSecret"], validate=True)
        if len(secret) != 32:
            raise ValueError()
    except (ValueError, binascii.Error):
        raise LaunchError("encryptionSecret 必须是 32 字节密钥的 Base64。") from None
    if not valid_port(value.get("apiPort", 18084)):
        raise LaunchError("apiPort 必须是 1024–65535 的整数。")
    try:
        url = value["dbUrl"]
        if not url.startswith("jdbc:mysql://"):
            raise ValueError()
        parsed = urlsplit(url[5:])
        if not parsed.hostname or not parsed.path.strip("/") or parsed.username is not None or parsed.password is not None or parsed.fragment:
            raise ValueError()
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            raise ValueError()
        query = parse_qsl(parsed.query, keep_blank_values=True)
        if [(key, item) for key, item in query if key.lower() == "sslmode"] != [("sslMode", "REQUIRED")]:
            raise ValueError()
        if any(key.lower() in {"user", "username", "password", "password1", "password2", "password3"} for key, _ in query):
            raise ValueError()
    except ValueError:
        raise LaunchError("dbUrl 必须是 jdbc:mysql:// 数据库地址，使用 sslMode=REQUIRED；凭证只能放在独立字段。") from None
    return {**value, "apiPort": value.get("apiPort", 18084)}


def unique_keys(pairs: list[tuple[str, object]]) -> dict:
    result: dict = {}
    for key, value in pairs:
        if key in result:
            raise LaunchError("MySQL 配置存在重复字段。")
        result[key] = value
    return result


def load_configuration() -> dict:
    try:
        if (ROOT / ".cache").is_symlink() or MYSQL.is_symlink() or CONFIG.is_symlink():
            raise LaunchError("MySQL 配置及目录不能是符号链接。")
        parent = MYSQL.stat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
            raise LaunchError(".cache/mysql 必须属于当前用户，目录权限为 700。")
        descriptor = os.open(CONFIG, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as handle:
            metadata = os.fstat(handle.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
                raise LaunchError("config.json 必须是当前用户拥有的普通文件，权限为 600。")
            if metadata.st_size > 16_384:
                raise LaunchError("MySQL 配置文件大小异常。")
            try:
                config = json.loads(handle.read(16_385), object_pairs_hook=unique_keys)
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise LaunchError("MySQL 配置必须是有效的 UTF-8 JSON。") from None
        return validate_configuration(config)
    except FileNotFoundError:
        raise LaunchError("缺少 .cache/mysql/config.json；请先准备受保护的专用数据库配置，本工具不会生成凭证。") from None
    except OSError:
        raise LaunchError("无法安全读取 MySQL 配置，请检查文件类型、归属和权限。") from None


def java_command() -> str:
    home = os.environ.get("MW_JAVA_HOME", "")
    if not home and Path("/usr/libexec/java_home").is_file():
        result = subprocess.run(["/usr/libexec/java_home", "-v", "21"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            home = result.stdout.strip()
    if not home:
        home = os.environ.get("JAVA_HOME", "")
    command = str(Path(home) / "bin" / "java") if home else shutil.which("java")
    if not command:
        raise LaunchError("缺少 JDK 21；请设置 MW_JAVA_HOME 后重试。")
    result = subprocess.run([command, "-version"], capture_output=True, text=True, timeout=10)
    first = (result.stderr or result.stdout).splitlines()
    if result.returncode != 0 or not first or not re.search(r'(?:"|\s)21(?:[.\s"]|$)', first[0]):
        raise LaunchError("mword 需要 JDK 21；请设置 MW_JAVA_HOME=/path/to/jdk-21 后重试。")
    return command


def production_jar() -> Path:
    try:
        version = json.loads((ROOT / "mword-client" / "package.json").read_text(encoding="utf-8"))["version"]
        if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
            raise ValueError()
        jar = ROOT / "mword-server" / "target" / f"mword-server-{version}.jar"
        if jar.is_symlink() or not jar.is_file():
            raise LaunchError("缺少正式 JAR；请先执行 cd mword-server && sh build.sh package。")
        with ZipFile(jar) as archive:
            names = archive.namelist()
            if any(re.search(r"(^|/)h2(?:-[^/]+)?\.jar$|(^|/)application[-_.](?:test|local|h2)\.(?:yml|yaml|properties)$", name, re.I) for name in names):
                raise LaunchError("JAR 包含 H2 或测试/local profile，请重新构建正式产物。")
            manifest = archive.read("META-INF/MANIFEST.MF").decode("utf-8")
            if "Start-Class: com.mayuanfei.mword.MwordApplication" not in manifest:
                raise LaunchError("JAR 不是预期的 mword 正式服务。")
        return jar
    except (OSError, ValueError, KeyError, BadZipFile):
        raise LaunchError("无法读取正式产物；请先在 mword-server 执行 sh build.sh package。") from None


def port_available(port: int) -> bool:
    # macOS 的双栈 IPv6 listener 可能仍允许 IPv4 SO_REUSEADDR bind。
    # 先连接检查实际 listener；只有明确拒绝连接才继续做 bind 检查。
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return False
    except OSError as error:
        if error.errno != errno.ECONNREFUSED:
            return False
    with socket.socket() as probe:
        try:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def base_environment() -> dict[str, str]:
    # 避免其他项目或 test-run 的环境覆盖本次数据库、profile 和监听地址。
    return {
        key: value for key, value in os.environ.items()
        if not key.startswith(("MW_", "SPRING_", "SERVER_")) and key not in {"JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"}
    }


def protected_output(path: Path, flags: int):
    descriptor = os.open(path, flags | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
        os.close(descriptor)
        raise LaunchError("运行日志或实例锁不是当前用户拥有的普通文件。")
    os.fchmod(descriptor, 0o600)
    return descriptor


@dataclass
class ManagedProcess:
    process: subprocess.Popen
    reader: threading.Thread


def start_process(command: list[str], cwd: Path, environment: dict[str, str], log_name: str, redactions: list[str]) -> ManagedProcess:
    descriptor = protected_output(MYSQL / log_name, os.O_WRONLY | os.O_TRUNC)
    log = os.fdopen(descriptor, "w", encoding="utf-8")
    try:
        process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", start_new_session=True)
    except OSError:
        log.close()
        raise LaunchError("无法创建运行进程，请检查 JDK/npm 路径和目录权限。") from None

    def pump() -> None:
        try:
            assert process.stdout is not None
            for line in process.stdout:
                for value in redactions:
                    line = line.replace(value, "[REDACTED]")
                log.write(line)
                log.flush()
        finally:
            log.close()

    reader = threading.Thread(target=pump, daemon=True)
    reader.start()
    return ManagedProcess(process, reader)


def wait_http(url: str, process: subprocess.Popen, stopped: threading.Event, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if stopped.is_set():
            raise Stopped()
        if process.poll() is not None:
            raise LaunchError("服务启动失败，详情见 .cache/mysql 中的脱敏日志。")
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except urllib.error.HTTPError as error:
            if error.code == 401:
                return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        stopped.wait(0.3)
    raise LaunchError("服务启动超时，详情见 .cache/mysql 中的脱敏日志。")


def stop_process(managed: ManagedProcess) -> None:
    process = managed.process
    try:
        # 只操作本工具通过 start_new_session 创建的进程组。
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        managed.reader.join(timeout=2)
        if managed.reader.is_alive():
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            managed.reader.join(timeout=2)
    except ProcessLookupError:
        process.wait()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="只验证固定配置的字段格式及权限，不连接数据库或启动进程")
    parser.add_argument("--web", action="store_true", help="同时启动本机 Web 开发页面")
    parser.add_argument("--web-port", type=int, default=5174)
    parser.add_argument("--enable-ai", action="store_true", help="启用已配置供应商的 AI worker，可能产生模型费用")
    args = parser.parse_args()
    managed: list[ManagedProcess] = []
    lock = None
    stopped = threading.Event()
    handlers: dict = {}
    try:
        config = load_configuration()
        if args.check:
            print("PASS：MySQL 配置字段、权限、独立凭证及 REQUIRED TLS 模式通过；未连接数据库。")
            return 0
        api_port = config["apiPort"]
        if args.web and (not valid_port(args.web_port) or args.web_port == api_port):
            raise LaunchError("Web 端口必须是与 API 不同的 1024–65535 整数。")
        java, jar = java_command(), production_jar()
        npm = None
        if args.web:
            npm = shutil.which("npm")
            if not npm or not shutil.which("node") or not (ROOT / "mword-client" / "node_modules").is_dir():
                raise LaunchError("Web 需要 Node/npm 和客户端依赖；请先在 mword-client 执行 npm ci。")
        lock = protected_output(MYSQL / "run.lock", os.O_RDWR)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise LaunchError("已有 run_mysql.py 实例，请先停止该实例；本工具不会停止其他服务。") from None
        for port in [api_port, *([args.web_port] if args.web else [])]:
            if not port_available(port):
                raise LaunchError(f"本机端口 {port} 已被占用，请调整端口；本工具不会终止已有服务。")
        for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            handlers[number] = signal.signal(number, lambda _number, _frame: stopped.set())
        env = base_environment()
        env.update({
            "MW_DB_URL": config["dbUrl"], "MW_DB_USERNAME": config["dbUsername"], "MW_DB_PASSWORD": config["dbPassword"],
            "MW_KEY_ENCRYPTION_SECRET": config["encryptionSecret"], "MW_PORT": str(api_port), "SERVER_PORT": str(api_port),
            "SERVER_ADDRESS": "127.0.0.1", "SERVER_SERVLET_CONTEXT_PATH": "/mword-api", "MW_SECURE_COOKIE": "false",
            "MW_AI_WORKER_ENABLED": "true" if args.enable_ai else "false",
            "MW_ADMIN_USERNAME": config.get("adminUsername", ""), "MW_ADMIN_PASSWORD": config.get("adminPassword", ""),
            "MW_ALLOWED_ORIGINS": f"http://127.0.0.1:{args.web_port},http://localhost:{args.web_port}",
        })
        redactions = sorted({value for key, value in config.items() if isinstance(value, str) and value}, key=len, reverse=True)
        backend = start_process([java, "-jar", str(jar)], ROOT / "mword-server", env, "backend.log", redactions)
        managed.append(backend)
        print("正在启动正式 MySQL 后台，日志：.cache/mysql/backend.log", flush=True)
        wait_http(f"http://127.0.0.1:{api_port}/mword-api/me", backend.process, stopped, 150)
        if args.web:
            web_env = base_environment()
            web_env["MW_DEV_API_TARGET"] = f"http://127.0.0.1:{api_port}"
            web = start_process([npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", str(args.web_port), "--strictPort"], ROOT / "mword-client", web_env, "web.log", redactions)
            managed.append(web)
            wait_http(f"http://127.0.0.1:{args.web_port}/mword/", web.process, stopped, 30)
            print(f"学习页面：http://127.0.0.1:{args.web_port}/mword/", flush=True)
        print(f"本机 API：http://127.0.0.1:{api_port}/mword-api", flush=True)
        print("AI worker：" + ("已启用。" if args.enable_ai else "关闭；需要时用 --enable-ai 启用。"), flush=True)
        print("Ctrl+C、SIGTERM 或 SIGHUP 停止本次启动的进程，云数据库保留。", flush=True)
        while not stopped.wait(0.3):
            if any(item.process.poll() is not None for item in managed):
                raise LaunchError("后台或 Web 进程已退出，请检查 .cache/mysql 中的脱敏日志。")
        raise Stopped()
    except (Stopped, KeyboardInterrupt):
        print("\n正在停止本次启动的进程。", flush=True)
        return 0
    except (LaunchError, OSError, subprocess.TimeoutExpired):
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, LaunchError) else "本机启动操作失败，请检查依赖、目录权限和脱敏日志。", file=sys.stderr)
        return 1
    finally:
        for item in reversed(managed):
            stop_process(item)
        if lock is not None:
            os.close(lock)
        for number, previous in handlers.items():
            signal.signal(number, previous)


if __name__ == "__main__":
    sys.exit(main())
