package com.mayuanfei.mword.app;

public final class AppDtos {
    private AppDtos() {}

    public record VersionResponse(
        int latestVersionCode,
        String latestVersionName,
        int minSupportedVersionCode,
        String changelog,
        String downloadUrl,
        boolean hasUpdate,
        boolean forceUpdate
    ) {}
}
