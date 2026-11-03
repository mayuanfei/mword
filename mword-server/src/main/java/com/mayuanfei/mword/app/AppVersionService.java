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
        @Value("${mword.app.latest-version-code:2}") int latestVersionCode,
        @Value("${mword.app.latest-version-name:1.0.1}") String latestVersionName,
        @Value("${mword.app.min-supported-version-code:1}") int minSupportedVersionCode,
        @Value("${mword.app.changelog:}") String configuredChangelog,
        @Value("${mword.app.download-url:https://www.mayuanfei.com/mword-downloads/mword.apk}") String downloadUrl
    ) {
        this.latestVersionCode = latestVersionCode;
        this.latestVersionName = latestVersionName;
        this.minSupportedVersionCode = minSupportedVersionCode;
        this.configuredChangelog = configuredChangelog;
        this.downloadUrl = downloadUrl;
    }

    public AppDtos.VersionResponse checkVersion(Integer clientVersionCode) {
        // 判断客户端是否低于最新版本
        boolean hasUpdate = clientVersionCode != null && clientVersionCode < latestVersionCode;
        // 判断客户端版本是否已被强制废弃需要强更
        boolean forceUpdate = clientVersionCode != null && clientVersionCode < minSupportedVersionCode;
        String changelog = resolveChangelog(latestVersionName);
        return new AppDtos.VersionResponse(
            latestVersionCode,
            latestVersionName,
            minSupportedVersionCode,
            changelog,
            downloadUrl,
            hasUpdate,
            forceUpdate
        );
    }

    public String resolveChangelog(String versionName) {
        if (configuredChangelog != null && !configuredChangelog.isBlank()) {
            return configuredChangelog.trim();
        }
        return extractFromChangelog(versionName);
    }

    //////////////////////////////////////公私有方法分割线//////////////////////////////////

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
