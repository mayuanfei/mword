package com.mayuanfei.mword.app;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppVersionController {
    private final AppVersionService appVersionService;

    public AppVersionController(AppVersionService appVersionService) {
        this.appVersionService = appVersionService;
    }

    @GetMapping("/app/version")
    public AppDtos.VersionResponse version(
        @RequestParam(value = "currentVersionCode", required = false) Integer currentVersionCode
    ) {
        // 返回当前最新的App版本信息以及与客户端版本的对比结果
        return appVersionService.checkVersion(currentVersionCode);
    }
}
