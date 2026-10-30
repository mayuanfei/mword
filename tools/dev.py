#!/usr/bin/env python3
"""本机持久化联调入口；不读取其他项目配置，不打开浏览器，不修改全局环境。"""
from __future__ import annotations

import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.cache' / 'local'


def secure_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def configuration() -> dict:
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(LOCAL, 0o700)
    path = LOCAL / 'config.json'
    if path.exists():
        if path.is_symlink():
            raise ValueError('本机配置不能是符号链接。')
        os.chmod(path, 0o600)
        value = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(value, dict) or not isinstance(value.get('encryptionSecret'), str) or not isinstance(value.get('databasePassword'), str):
            raise ValueError('本机配置格式不正确；请保留数据库和配置备份后检查 config.json。')
        if value.get('version') != 1 or len(base64.b64decode(value['encryptionSecret'], validate=True)) != 32 or len(value['databasePassword']) < 24:
            raise ValueError('本机配置格式不正确；请保留数据库和配置备份后检查 config.json。')
        return value
    if (LOCAL / 'database' / 'mword.mv.db').exists():
        raise ValueError('已有持久化数据库但缺少密钥配置。请恢复 config.json，不能自动生成新密钥覆盖。')
    value = {'version': 1, 'encryptionSecret': base64.b64encode(secrets.token_bytes(32)).decode(), 'databasePassword': secrets.token_urlsafe(32)}
    secure_json(path, value)
    return value


def available(port: int) -> bool:
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.3):
            return False
    except ConnectionRefusedError:
        pass
    except OSError as error:
        if error.errno not in (61, 111):
            return False
    with socket.socket() as probe:
        try:
            # A closed previous server may leave TIME_WAIT sockets; active listeners still fail.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False


def wait_http(url: str, process: subprocess.Popen, timeout: int = 150) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('启动进程已退出，请检查 .cache/local 中的日志。')
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except urllib.error.HTTPError as error:
            if error.code == 401:
                return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(0.4)
    raise RuntimeError('启动超过等待时间，请检查日志后重试。')


def stop(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    except ProcessLookupError:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description='启动仅监听本机的持久化 mword 后台和 Web 开发页面。Ctrl+C 停止进程，数据保留。')
    parser.add_argument('--check', action='store_true', help='仅检查依赖，不创建配置或启动服务')
    parser.add_argument('--api-port', type=int, default=18083)
    parser.add_argument('--web-port', type=int, default=5173)
    parser.add_argument('--enable-ai', action='store_true', help='启用本机已配置供应商的 AI worker，可能产生实际模型费用')
    args = parser.parse_args()
    missing = [name for name in ('node', 'npm', 'mvn', 'java') if not shutil.which(name)]
    if missing:
        print('缺少运行依赖：' + '、'.join(missing), file=sys.stderr)
        return 1
    if not (ROOT / 'mword-client' / 'node_modules').is_dir():
        print('请先在 mword-client 执行 npm ci。', file=sys.stderr)
        return 1
    if not (ROOT / 'mword-server' / 'src/test/resources/application-local.yml').is_file():
        print('缺少本机 local profile，请检查完整项目。', file=sys.stderr)
        return 1
    if args.check:
        print('PASS: Node/npm/Maven/Java、客户端依赖及本机 profile 可用；JDK 21 由 build.sh 选择。')
        return 0
    if not all(1024 <= port <= 65535 for port in (args.api_port, args.web_port)) or args.api_port == args.web_port:
        print('请使用两个不同的 1024–65535 端口。', file=sys.stderr)
        return 1
    for port in (args.api_port, args.web_port):
        if not available(port):
            print(f'本机端口 {port} 已被占用。请选择其他端口；脚本不会终止已有服务。', file=sys.stderr)
            return 1
    if bool(os.environ.get('MW_ADMIN_USERNAME')) != bool(os.environ.get('MW_ADMIN_PASSWORD')):
        print('初始化管理员需同时设置 MW_ADMIN_USERNAME 和 MW_ADMIN_PASSWORD。', file=sys.stderr)
        return 1

    def interrupted(_number, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    if hasattr(signal, 'SIGHUP'):
        signal.signal(signal.SIGHUP, interrupted)

    processes: list[subprocess.Popen] = []
    handles = []
    lock_fd = None
    owns_lock = False
    try:
        config = configuration()
        lock_fd = os.open(LOCAL / 'run.lock', os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            owns_lock = True
        except BlockingIOError:
            raise RuntimeError('已有本机启动脚本使用此数据库。请先停止该脚本，不能同时启动第二份。')
        database = LOCAL / 'database' / 'mword'
        database.parent.mkdir(mode=0o700, exist_ok=True)
        if any(character in str(database) for character in (';', '\n', '\r')):
            raise ValueError('本机路径包含不支持的数据库URL字符。')
        env = dict(os.environ)
        env.update({
            'MW_PORT': str(args.api_port), 'MW_LOCAL_DB_URL': f'jdbc:h2:file:{database};MODE=MySQL;DATABASE_TO_LOWER=TRUE',
            'MW_LOCAL_DB_PASSWORD': config['databasePassword'], 'MW_KEY_ENCRYPTION_SECRET': config['encryptionSecret'],
            'MW_AI_WORKER_ENABLED': 'true' if args.enable_ai else 'false',
            'MW_ALLOWED_ORIGINS': f'http://127.0.0.1:{args.web_port},http://localhost:{args.web_port}',
            'MW_DEV_API_TARGET': f'http://127.0.0.1:{args.api_port}',
        })
        for name in ('backend', 'web'):
            fd = os.open(LOCAL / f'{name}.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            handles.append(os.fdopen(fd, 'w'))
        backend = subprocess.Popen(['sh', 'build.sh', 'test-compile', 'spring-boot:test-run', '-Dspring-boot.run.profiles=local'], cwd=ROOT / 'mword-server', env=env, stdout=handles[0], stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(backend)
        print('正在启动本机持久化后台，日志：.cache/local/backend.log', flush=True)
        wait_http(f'http://127.0.0.1:{args.api_port}/mword-api/me', backend)
        web = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(args.web_port)], cwd=ROOT / 'mword-client', env=env, stdout=handles[1], stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(web)
        wait_http(f'http://127.0.0.1:{args.web_port}/mword/', web, 30)
        secure_json(LOCAL / 'runtime.json', {'apiPort': args.api_port, 'webPort': args.web_port, 'launcherPid': os.getpid(), 'processIds': [process.pid for process in processes]})
        print(f'学习页面：http://127.0.0.1:{args.web_port}/mword/', flush=True)
        print('账号与学习记录保存在 .cache/local/database；密钥配置在 .cache/local/config.json。请一起备份。', flush=True)
        print('AI worker：' + ('已启用，请确认额度与模型费用。' if args.enable_ai else '关闭；需要配置模型后用 --enable-ai 重启。'), flush=True)
        print('Ctrl+C 停止本次启动的两个进程，数据库保留。', flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError('后台或页面进程退出，请检查本机日志。')
    except KeyboardInterrupt:
        print('\n正在停止本机服务，学习记录会保留。', flush=True)
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        for process in reversed(processes):
            stop(process)
        for handle in handles:
            handle.close()
        if owns_lock:
            (LOCAL / 'runtime.json').unlink(missing_ok=True)
        if lock_fd is not None:
            os.close(lock_fd)


if __name__ == '__main__':
    sys.exit(main())
