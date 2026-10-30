#!/usr/bin/env python3
"""打包已经构建完成的 Web/JAR；不构建、不读取本机环境配置。

    python3 tools/package_release.py --dry-run
    python3 tools/package_release.py

同一组输入得到相同 tar.gz：清单排序，文件权限/属主/时间戳固定，
manifest 不记录当前时间或本机绝对路径。SHA256SUMS 包含所有负载及
manifest.json；manifest 的 files 只包含负载，避免递归计算自身校验和。
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile
import tempfile
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
RELEASES = ROOT / ".cache" / "releases"
STATIC_SUFFIXES = {
    ".html", ".js", ".css", ".svg", ".json", ".webmanifest", ".woff",
    ".woff2", ".ttf", ".png", ".webp", ".jpg", ".jpeg", ".ico", ".txt", ".md",
}
REQUIRED_DOCS = (
    "API_CONTRACT.md", "DEPLOYMENT.md", "MOBILE_BUILD.md",
    "VALIDATION.md", "VOCABULARY_SOURCES.md", "RELEASE_PACKAGE.md",
)
BOOKS = ("cet4", "cet6", "postgraduate")
FORBIDDEN_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".log", ".pem", ".key", ".p12", ".pfx", ".jks"}


class ReleaseError(Exception):
    pass


@dataclass(frozen=True)
class Entry:
    path: str
    content: bytes

    def metadata(self) -> dict:
        return {"path": self.path, "size": len(self.content), "sha256": digest(self.content)}


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def safe_name(name: str) -> None:
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ReleaseError(f"不安全的产物路径：{name}")
    for part in path.parts:
        lower = part.lower()
        if lower.startswith(".env") or lower in {"node_modules", ".git", ".cache", "local", "test-classes", "surefire-reports"}:
            raise ReleaseError(f"禁止包含环境/本机/测试文件：{name}")
    if path.suffix.lower() in FORBIDDEN_SUFFIXES:
        raise ReleaseError(f"禁止包含数据库、日志或密钥文件：{name}")


def read_source(path: Path, *, configuration_example: bool = False) -> bytes:
    relative = path.relative_to(ROOT)
    if configuration_example:
        if path != ROOT / "mword-server" / ".env.example":
            raise ReleaseError("只允许白名单中的服务端配置示例")
    else:
        safe_name(relative.as_posix())
    for ancestor in (path, *path.parents):
        if ancestor == ROOT:
            break
        if ancestor.is_symlink():
            raise ReleaseError(f"不打包符号链接：{relative}")
    if not path.is_file():
        raise ReleaseError(f"缺少产物：{relative}；请先完成构建")
    return path.read_bytes()


def read_configuration_example() -> bytes:
    """唯一可读取的环境示例，发布时改名；敏感字段必须为空。"""
    content = read_source(ROOT / "mword-server" / ".env.example", configuration_example=True)
    allowed = {
        "MW_DB_URL", "MW_DB_USERNAME", "MW_DB_PASSWORD", "MW_PORT", "MW_SECURE_COOKIE",
        "MW_REGISTRATION_ENABLED", "MW_INITIAL_QUOTA", "MW_SESSION_DAYS", "MW_ALLOWED_ORIGINS",
        "MW_KEY_ENCRYPTION_SECRET", "MW_ADMIN_USERNAME", "MW_ADMIN_PASSWORD", "MW_PROVIDER_HOSTS",
        "MW_COST_EXPLAIN", "MW_COST_MEMORY", "MW_COST_CONTEXT", "MW_COST_ARTICLE",
        "MW_AI_WORKER_ENABLED", "MW_AI_REQUEST_TIMEOUT_SECONDS",
    }
    values: dict[str, str] = {}
    for line in content.decode("utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", line)
        if not match or match.group(1) not in allowed or match.group(1) in values:
            raise ReleaseError("配置示例存在未知字段、重复字段或非赋值内容")
        values[match.group(1)] = match.group(2).strip().strip("\"'")
    for key in ("MW_DB_PASSWORD", "MW_KEY_ENCRYPTION_SECRET", "MW_ADMIN_USERNAME", "MW_ADMIN_PASSWORD"):
        if values.get(key) != "":
            raise ReleaseError(f"配置示例字段必须为空，禁止打包真实凭证：{key}")
    example_url = "jdbc:mysql://localhost:3306/mword?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC"
    if values.get("MW_DB_USERNAME") != "mword" or values.get("MW_DB_URL") != example_url:
        raise ReleaseError("配置示例必须使用本机 mword 示例数据库，不能打包真实连接配置")
    if values.get("MW_SECURE_COOKIE") != "true" or values.get("MW_AI_WORKER_ENABLED") != "true":
        raise ReleaseError("配置示例必须是生产 Cookie/worker 设置")
    return content


def validate_jar(content: bytes, version: str, book_content: dict[str, bytes]) -> dict:
    try:
        with ZipFile(io.BytesIO(content)) as jar:
            names = jar.namelist()
            if len(names) != len(set(names)):
                raise ReleaseError("生产 JAR 存在重复 ZIP 成员")
            for name in names:
                safe_name(name)
                lower = name.lower()
                if re.search(r"(^|/)h2(?:-[^/]+)?\.jar$", lower) or "org/h2/" in lower:
                    raise ReleaseError("生产 JAR 含 H2，不能作为正式发布产物")
                if re.search(r"(^|/)application[-_.](?:test|h2|local)(?:[-_.][^/]*)?\.(?:yml|yaml|properties)$", lower):
                    raise ReleaseError(f"生产 JAR 含测试或本机 profile：{name}")
                if name.startswith("BOOT-INF/classes/") and ("/test/" in lower or re.search(r"Tests?\.class$", name)):
                    raise ReleaseError(f"生产 JAR 含测试类：{name}")
            manifest = jar.read("META-INF/MANIFEST.MF").decode("utf-8")
            if "Main-Class: org.springframework.boot.loader.launch.JarLauncher" not in manifest or "Start-Class: com.mayuanfei.mword.MwordApplication" not in manifest:
                raise ReleaseError("JAR 不是预期的 mword Spring Boot 可执行产物")
            properties = jar.read("META-INF/maven/com.mayuanfei/mword-server/pom.properties").decode("utf-8")
            if not re.search(rf"(?m)^version={re.escape(version)}\s*$", properties):
                raise ReleaseError("服务端 JAR 版本与 mword-client/package.json 不一致")
            if not any(name.startswith("BOOT-INF/lib/mysql-connector-j-") for name in names):
                raise ReleaseError("生产 JAR 缺少 MySQL 驱动")
            for name in names:
                if not name.startswith("BOOT-INF/classes/") or not name.endswith((".yml", ".yaml", ".properties")):
                    continue
                config = jar.read(name).decode("utf-8")
                if "jdbc:h2:" in config.lower() or re.search(r"(?:on-profile|profiles\.active|active)\s*[:=]\s*['\"]?(?:test|h2)\b", config, re.I):
                    raise ReleaseError(f"生产 JAR 配置激活测试/H2：{name}")
                for match in re.finditer(r"(?m)^\s*([\w.-]*(?:password|secret)|api[-_.]?key)\s*[:=]\s*([^\r\n]*)", config, re.I):
                    value = match.group(2).split(" #", 1)[0].strip().strip("\"'")
                    if value and "${" not in value and value.lower() != "null":
                        raise ReleaseError(f"生产 JAR 配置字段必须使用环境变量占位符：{name} / {match.group(1)}")
            for book, data in book_content.items():
                if jar.read(f"BOOT-INF/classes/books/{book}.json") != data:
                    raise ReleaseError(f"JAR 词库 {book} 与 data/books 不一致；请重新构建后端")
            return {"springBootExecutable": True, "mysqlDriverPresent": True, "h2Excluded": True, "testProfileExcluded": True, "vocabularyMatchesSource": True}
    except (BadZipFile, KeyError, UnicodeDecodeError) as error:
        raise ReleaseError(f"无法验证生产 JAR：{type(error).__name__}") from error


def collect(version: str) -> tuple[list[Entry], dict]:
    entries: dict[str, Entry] = {}

    def add(source: Path, target: str) -> bytes:
        safe_name(target)
        if target in entries:
            raise ReleaseError(f"发布路径重复：{target}")
        content = read_source(source)
        entries[target] = Entry(target, content)
        return content

    dist = ROOT / "mword-client" / "dist"
    add(dist / "index.html", "web/index.html")
    for source in sorted(dist.rglob("*")):
        if source.is_symlink():
            raise ReleaseError(f"Web 产物含符号链接：{source.relative_to(ROOT)}")
        if source.is_dir() or source == dist / "index.html":
            continue
        if source.suffix.lower() not in STATIC_SUFFIXES:
            raise ReleaseError(f"Web 产物含非静态文件：{source.relative_to(ROOT)}")
        add(source, "web/" + source.relative_to(dist).as_posix())
    if not any(entry.path.startswith("web/assets/") and entry.path.endswith(".js") for entry in entries.values()):
        raise ReleaseError("Web dist 缺少编译后的 JavaScript")
    if b"/mword/assets/" not in entries["web/index.html"].content:
        raise ReleaseError("Web dist 不是 /mword/ 的 Web 构建；请运行 npm run build")

    for name in ("ATTRIBUTION.md", "CC-BY-SA-4.0.txt", "ECDICT-MIT.txt"):
        license_data = add(ROOT / "data" / "licenses" / name, f"data/licenses/{name}")
        web_license = entries.get(f"web/licenses/{name}")
        if web_license is None or web_license.content != license_data:
            raise ReleaseError(f"Web dist 缺少或使用过期的授权文件：{name}；请重新构建 Web")
    books = {book: add(ROOT / "data" / "books" / f"{book}.json", f"data/books/{book}.json") for book in BOOKS}
    add(ROOT / "data" / "quality-report.json", "data/quality-report.json")
    add(ROOT / "data" / "README.md", "data/README.md")
    jar_name = f"mword-server-{version}.jar"
    jar_data = add(ROOT / "mword-server" / "target" / jar_name, f"server/{jar_name}")
    validations = validate_jar(jar_data, version, books)
    entries["server/configuration.example"] = Entry("server/configuration.example", read_configuration_example())
    validations["configurationExampleCredentialsEmpty"] = True
    for name in ("nginx-mword.conf", "mword.service"):
        content = add(ROOT / "deploy" / name, f"deploy/{name}")
        if name == "mword.service" and jar_name.encode() not in content:
            raise ReleaseError("systemd 模板的 JAR 文件名与发布版本不一致；请更新 deploy/mword.service")
    add(ROOT / "docs" / "RELEASE_PACKAGE.md", "README.md")
    for name in REQUIRED_DOCS:
        if not (ROOT / "docs" / name).is_file():
            raise ReleaseError(f"缺少发布文档：docs/{name}")
    for source in sorted((ROOT / "docs").rglob("*.md")):
        add(source, "docs/" + source.relative_to(ROOT / "docs").as_posix())
    return sorted(entries.values(), key=lambda entry: entry.path), validations


def write_archive(directory: Path, archive: Path, release_name: str) -> None:
    files = sorted(path for path in directory.rglob("*") if path.is_file())
    directories = {PurePosixPath(release_name)}
    for path in files:
        relative = PurePosixPath(release_name) / path.relative_to(directory).as_posix()
        directories.update(relative.parents)
    directories.discard(PurePosixPath("."))
    with archive.open("wb") as output, gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0, compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT) as tar:
            for name in sorted(directories, key=str):
                info = tarfile.TarInfo(str(name))
                info.type, info.mode, info.mtime = tarfile.DIRTYPE, 0o755, 0
                tar.addfile(info)
            for path in files:
                content = path.read_bytes()
                info = tarfile.TarInfo(f"{release_name}/{path.relative_to(directory).as_posix()}")
                info.size, info.mode, info.mtime = len(content), 0o644, 0
                tar.addfile(info, io.BytesIO(content))


def check_existing(directory: Path, release_name: str) -> None:
    if directory.is_symlink():
        raise ReleaseError("发布目录是符号链接，拒绝覆盖")
    if not directory.exists():
        return
    try:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("application") != "mword" or manifest.get("release") != release_name:
            raise ValueError()
        expected = {item["path"] for item in manifest["files"]} | {"manifest.json", "SHA256SUMS"}
        actual = {path.relative_to(directory).as_posix() for path in directory.rglob("*") if not path.is_dir()}
        if actual != expected or any(path.is_symlink() for path in directory.rglob("*")):
            raise ValueError()
    except (OSError, ValueError, TypeError, KeyError):
        raise ReleaseError("既有发布目录含未知文件或不是本工具生成的产物，未覆盖") from None


def package(entries: list[Entry], validations: dict, version: str) -> tuple[Path, str]:
    release_name = f"mword-{version}"
    for path in (ROOT / ".cache", RELEASES):
        if path.is_symlink():
            raise ReleaseError("发布输出目录不可为符号链接")
    RELEASES.mkdir(parents=True, exist_ok=True)
    destination = RELEASES / release_name
    for output in (RELEASES / f"{release_name}.tar.gz", RELEASES / f"{release_name}.tar.gz.sha256"):
        if output.is_symlink():
            raise ReleaseError("发布归档或校验和不可为符号链接，拒绝覆盖")
    check_existing(destination, release_name)
    manifest = {
        "formatVersion": 1, "application": "mword", "release": release_name, "version": version,
        "artifacts": {"web": "web/", "server": f"server/mword-server-{version}.jar"},
        "validations": validations, "files": [entry.metadata() for entry in entries],
    }
    manifest_entry = Entry("manifest.json", (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode())
    checked = sorted([*entries, manifest_entry], key=lambda entry: entry.path)
    sums = Entry("SHA256SUMS", "".join(f"{digest(entry.content)}  {entry.path}\n" for entry in checked).encode())
    with tempfile.TemporaryDirectory(prefix=".packaging-", dir=RELEASES) as temporary:
        temporary_path = Path(temporary)
        directory = temporary_path / release_name
        directory.mkdir()
        for entry in [*checked, sums]:
            path = directory / entry.path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(entry.content)
            path.chmod(0o644)
        archive = temporary_path / f"{release_name}.tar.gz"
        write_archive(directory, archive, release_name)
        archive_hash = digest(archive.read_bytes())
        with tarfile.open(archive, "r:gz") as tar:
            archived = {member.name: member for member in tar if member.isfile()}
            if set(archived) != {f"{release_name}/{entry.path}" for entry in [*checked, sums]}:
                raise ReleaseError("归档文件清单与发布目录不一致")
            for entry in [*checked, sums]:
                member = tar.extractfile(archived[f"{release_name}/{entry.path}"])
                if member is None or member.read() != entry.content:
                    raise ReleaseError(f"归档内容校验失败：{entry.path}")
        # 只替换已经校验过归属和文件清单的生成目录，不接触本机配置或日志。
        if destination.exists():
            previous = temporary_path / "previous"
            destination.rename(previous)
            try:
                directory.rename(destination)
            except OSError:
                previous.rename(destination)
                raise
        else:
            directory.rename(destination)
        final_archive = RELEASES / archive.name
        archive.replace(final_archive)
        checksum = RELEASES / f"{archive.name}.sha256"
        checksum.write_text(f"{archive_hash}  {archive.name}\n", encoding="utf-8")
    return final_archive, archive_hash


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="校验已构建产物并预览清单，不写发布包")
    args = parser.parse_args()
    try:
        version = json.loads(read_source(ROOT / "mword-client" / "package.json"))["version"]
        if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
            raise ReleaseError("package.json version 必须是可用的版本号")
        entries, validations = collect(version)
        print(f"发布预览：mword-{version}")
        for entry in entries:
            print(f"  {entry.path} ({len(entry.content):,} bytes)")
        print(f"共 {len(entries)} 个负载文件，{sum(len(entry.content) for entry in entries):,} bytes；另生成 manifest.json 和 SHA256SUMS。")
        if args.dry_run:
            print("校验通过，未生成发布包。")
        else:
            archive, checksum = package(entries, validations, version)
            print(f"发布目录：{archive.with_suffix('').with_suffix('').relative_to(ROOT)}")
            print(f"压缩包：{archive.relative_to(ROOT)}")
            print(f"SHA-256：{checksum}")
        return 0
    except (ReleaseError, OSError, ValueError, KeyError) as error:
        print(f"打包失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
