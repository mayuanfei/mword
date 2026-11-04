package com.mayuanfei.mword.app;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
public class AppVersionService {
    private final int latestVersionCode;
    private final String latestVersionName;
    private final int minSupportedVersionCode;
    private final String configuredChangelog;
    private final String downloadUrl;

    public AppVersionService(
        @Value("${mword.app.latest-version-code:10}") int latestVersionCode,
        @Value("${mword.app.latest-version-name:1.0.5}") String latestVersionName,
        @Value("${mword.app.min-supported-version-code:1}") int minSupportedVersionCode,
        @Value("${mword.app.changelog:}") String configuredChangelog,
        @Value("${mword.app.download-url:https://github.com/mayuanfei/mword/releases/download/v{version}/mword-{version}.apk}") String downloadUrl
    ) {
        this.latestVersionCode = latestVersionCode;
        this.latestVersionName = latestVersionName;
        this.minSupportedVersionCode = minSupportedVersionCode;
        this.configuredChangelog = configuredChangelog;
        this.downloadUrl = downloadUrl;
    }

    public AppDtos.VersionResponse checkVersion(Integer clientVersionCode) {
        return checkVersion(clientVersionCode, null);
    }

    public AppDtos.VersionResponse checkVersion(Integer clientVersionCode, String clientVersionName) {
        // 判断客户端是否低于最新版本 (结合versionCode与版本名双重比较)
        boolean hasUpdate = isNewerThanClient(clientVersionCode, clientVersionName);
        // 判断客户端版本是否已被强制废弃需要强更
        boolean forceUpdate = clientVersionCode != null && clientVersionCode < minSupportedVersionCode;
        String changelog = resolveChangelog(latestVersionName);
        String resolvedDownloadUrl = resolveDownloadUrl(latestVersionName);
        return new AppDtos.VersionResponse(
            latestVersionCode,
            latestVersionName,
            minSupportedVersionCode,
            changelog,
            resolvedDownloadUrl,
            hasUpdate,
            forceUpdate
        );
    }

    public String resolveDownloadUrl(String versionName) {
        if (downloadUrl == null || downloadUrl.isBlank()) {
            return "https://github.com/mayuanfei/mword/releases/download/v" + versionName + "/mword-" + versionName + ".apk";
        }
        return downloadUrl.replace("{version}", versionName);
    }

    public String resolveChangelog(String versionName) {
        if (configuredChangelog != null && !configuredChangelog.isBlank()) {
            return configuredChangelog.trim();
        }
        return extractFromChangelog(versionName);
    }

    //////////////////////////////////////公私有方法分割线//////////////////////////////////

    private boolean isNewerThanClient(Integer clientVersionCode, String clientVersionName) {
        if (clientVersionCode != null && clientVersionCode < latestVersionCode) {
            return true;
        }
        if (clientVersionName != null && !clientVersionName.isBlank()) {
            return compareSemVer(latestVersionName, clientVersionName) > 0;
        }
        return false;
    }

    private int compareSemVer(String v1, String v2) {
        String[] parts1 = v1.replaceAll("^v", "").split("\\.");
        String[] parts2 = v2.replaceAll("^v", "").split("\\.");
        int len = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < len; i++) {
            int num1 = i < parts1.length ? parseSafeInt(parts1[i]) : 0;
            int num2 = i < parts2.length ? parseSafeInt(parts2[i]) : 0;
            if (num1 != num2) {
                return Integer.compare(num1, num2);
            }
        }
        return 0;
    }

    private int parseSafeInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private String extractFromChangelog(String versionName) {
        String content = readChangelogFile();
        if (content.isBlank()) {
            return "暂无更新日志说明。";
        }
        // 匹配对应版本号的段落内容
        Pattern pattern = Pattern.compile("## \\[" + Pattern.quote(versionName) + "\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)");
        Matcher matcher = pattern.matcher(content);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return "暂无版本 " + versionName + " 的更新日志。";
    }

    private String readChangelogFile() {
        try {
            ClassPathResource resource = new ClassPathResource("CHANGELOG.md");
            if (resource.exists()) {
                try (InputStream inputStream = resource.getInputStream()) {
                    return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
            Path external = Path.of("CHANGELOG.md");
            if (Files.exists(external)) {
                return Files.readString(external, StandardCharsets.UTF_8);
            }
            Path parentExternal = Path.of("../CHANGELOG.md");
            if (Files.exists(parentExternal)) {
                return Files.readString(parentExternal, StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
            // 读取异常时回退为空字符串
        }
        return "";
    }
}
