package com.mayuanfei.mword;

import com.mayuanfei.mword.ai.*;
import com.mayuanfei.mword.auth.*;
import com.mayuanfei.mword.catalog.CatalogService;
import com.mayuanfei.mword.common.Time;
import com.mayuanfei.mword.learning.*;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import static org.assertj.core.api.Assertions.*;

class LocalPersistenceTest {
    @TempDir Path directory;

    @Test void localProfileRetainsAccountSessionLearningAndEncryptedProviderAcrossRestart() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);
        String secret=Base64.getEncoder().encodeToString(key);
        String password=UUID.randomUUID().toString();
        String url="jdbc:h2:file:"+directory.resolve("mword").toAbsolutePath()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_ON_EXIT=FALSE";
        AuthDtos.AuthResponse account;long cursor;String taskId,providerId;
        var profile=new AuthDtos.Profile("cet4","阅读科技文章",List.of("摄影","AI"),20,"基础",true);
        try(var first=open(url,password,secret)) {
            assertThat(first.getEnvironment().getProperty("spring.datasource.url")).startsWith("jdbc:h2:file:");
            assertThat(first.getEnvironment().getProperty("server.address")).isEqualTo("127.0.0.1");
            assertThat(first.getEnvironment().getProperty("mword.ai-worker-enabled")).isEqualTo("false");
            assertThat(first.getEnvironment().getProperty("mword.secure-cookie")).isEqualTo("false");
            var auth=first.getBean(AuthService.class);account=auth.register(new AuthDtos.Credentials("persistent_user","StrongPassword123!"));
            auth.saveProfile(account.user().id(),profile);
            var word=first.getBean(CatalogService.class).words("cet4").getFirst();
            String at=Time.iso(System.currentTimeMillis()-60000);
            var recall=new LearningDtos.ReviewEvent("saved-review","local-device",word.id(),word.senseId(),at,"RECALL",3,false);
            var reading=new LearningDtos.ReadingEvent("saved-reading","local-device","sample-curiosity",1,true,at);
            cursor=first.getBean(SyncService.class).sync(account.user().id(),new LearningDtos.SyncRequest(0,"local-device",List.of(recall),List.of(reading))).cursor();
            var provider=first.getBean(ProviderService.class).save(null,new AiDtos.ProviderInput("persistent-provider","https://api.deepseek.com/v1","test-model","fake-local-key",true,List.of(AiDtos.Scene.values()),0));providerId=provider.id();
            taskId=first.getBean(AiService.class).create(account.user().id(),new AiDtos.CreateTask("saved-task",AiDtos.Scene.EXPLAIN,word.id(),word.senseId(),null,null,null,false)).id();
        }
        assertThat(directory.resolve("mword.mv.db")).exists();
        try(var second=open(url,password,secret)) {
            var auth=second.getBean(AuthService.class);
            assertThat(auth.requireUser("Bearer "+account.token()).id()).isEqualTo(account.user().id());
            assertThat(auth.get(account.user().id()).profile()).isEqualTo(profile);
            var restored=second.getBean(SyncService.class).sync(account.user().id(),new LearningDtos.SyncRequest(cursor,"local-device",List.of(),List.of()));
            assertThat(restored.cursor()).isEqualTo(cursor);assertThat(restored.events()).extracting(LearningDtos.ReviewEvent::eventId).containsExactly("saved-review");
            assertThat(restored.readingEvents().getFirst().completed()).isTrue();assertThat(restored.states()).hasSize(1);
            assertThat(second.getBean(AiService.class).get(account.user().id(),taskId).status()).isEqualTo("QUEUED");
            assertThat(second.getBean(AiService.class).quota(account.user().id()).reserved()).isEqualTo(1);
            assertThat(second.getBean(ProviderService.class).connection(providerId).key()).isEqualTo("fake-local-key");
            assertThat(auth.login(new AuthDtos.Credentials("persistent_user","StrongPassword123!" )).user().id()).isEqualTo(account.user().id());
        }
    }
    private ConfigurableApplicationContext open(String url,String password,String secret) {
        // 测试随机值仅在内存注入，不读本机launcher的配置或实际API Key。
        return new SpringApplicationBuilder(MwordApplication.class).web(WebApplicationType.NONE).profiles("local").run(
            "--MW_LOCAL_DB_URL="+url,"--MW_LOCAL_DB_PASSWORD="+password,"--MW_KEY_ENCRYPTION_SECRET="+secret,
            "--mword.ai-worker-enabled=false","--mword.admin-username=","--mword.admin-password=","--mword.initial-quota=30","--mword.registration-enabled=true");
    }
}
