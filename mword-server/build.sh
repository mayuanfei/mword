#!/usr/bin/env sh
set -eu

# 环境覆盖只作用于这次Maven进程，不修改用户的全局Java配置。
MW_BUILD_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MW_JAVA_HOME=${MW_JAVA_HOME:-}
if [ -z "$MW_JAVA_HOME" ] && [ -x /usr/libexec/java_home ]; then
  MW_JAVA_HOME=$(/usr/libexec/java_home -v 21)
fi
if [ -z "$MW_JAVA_HOME" ]; then
  MW_JAVA_HOME=${JAVA_HOME:-}
fi
if [ -n "$MW_JAVA_HOME" ]; then
  MW_JAVA_CMD="$MW_JAVA_HOME/bin/java"
else
  MW_JAVA_CMD=java
fi
MW_JAVA_VERSION=$("$MW_JAVA_CMD" -version 2>&1 | head -n 1)
case "$MW_JAVA_VERSION" in
  *'"21'*|*' 21'*) ;;
  *) echo 'mword需要JDK21。请设置MW_JAVA_HOME=/path/to/jdk-21后重试。' >&2; exit 1 ;;
esac
cd "$MW_BUILD_DIR"
if [ "$#" -eq 0 ]; then set -- test package; fi
if [ -n "$MW_JAVA_HOME" ]; then
  exec env JAVA_HOME="$MW_JAVA_HOME" mvn -s maven-settings.xml -Dmaven.repo.local=.mvn/repository "$@"
else
  exec mvn -s maven-settings.xml -Dmaven.repo.local=.mvn/repository "$@"
fi
