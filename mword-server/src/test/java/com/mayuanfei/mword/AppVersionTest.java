package com.mayuanfei.mword;

import com.mayuanfei.mword.app.AppDtos;
import com.mayuanfei.mword.app.AppVersionController;
import com.mayuanfei.mword.app.AppVersionService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class AppVersionTest {

    @Test
    void shouldDetectNewVersionWhenClientCodeIsOlder() {
        AppVersionService service = new AppVersionService(
            2,
            "1.0.1",
            1,
            "",
            "https://www.mayuanfei.com/mword-downloads/mword.apk"
        );
        AppVersionController controller = new AppVersionController(service);

        // 客户端版本为1时，应提示发现新版本
        AppDtos.VersionResponse updateResp = controller.version(1);
        Assertions.assertTrue(updateResp.hasUpdate());
        Assertions.assertFalse(updateResp.forceUpdate());
        Assertions.assertEquals(2, updateResp.latestVersionCode());
        Assertions.assertEquals("1.0.1", updateResp.latestVersionName());
        Assertions.assertTrue(updateResp.changelog().contains("手机端版本检测与更新日志"));

        // 客户端版本已是最新2时，应提示无更新
        AppDtos.VersionResponse latestResp = controller.version(2);
        Assertions.assertFalse(latestResp.hasUpdate());
        Assertions.assertFalse(latestResp.forceUpdate());
    }

    @Test
    void shouldSupportCustomChangelogAndForceUpdate() {
        AppVersionService service = new AppVersionService(
            3,
            "1.0.2",
            2,
            "修复关键漏洞，必须升级",
            "https://www.mayuanfei.com/mword-downloads/mword.apk"
        );

        // 客户端为版本1（低于最低支持版本2），触发强制更新
        AppDtos.VersionResponse forced = service.checkVersion(1);
        Assertions.assertTrue(forced.hasUpdate());
        Assertions.assertTrue(forced.forceUpdate());
        Assertions.assertEquals("修复关键漏洞，必须升级", forced.changelog());
    }
}
