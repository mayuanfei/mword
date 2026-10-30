package com.mayuanfei.mword;

import com.mayuanfei.mword.ai.*;
import com.mayuanfei.mword.auth.*;
import com.mayuanfei.mword.catalog.*;
import com.mayuanfei.mword.common.*;
import com.mayuanfei.mword.learning.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import jakarta.servlet.http.Cookie;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class BackendIntegrationTest {
    @Autowired AuthService auth;
    @Autowired SyncService sync;
    @Autowired CatalogService catalog;
    @Autowired ArticleService articles;
    @Autowired AiService ai;
    @Autowired AiWorker worker;
    @Autowired ProviderService providers;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean AiGateway gateway;
    private AuthDtos.AuthResponse user;
    private CatalogDtos.Word word;

    @BeforeEach void setup(){
        user=auth.register(new AuthDtos.Credentials("u_"+UUID.randomUUID().toString().replace("-","").substring(0,16),"StrongPassword123!"));
        word=catalog.words("cet4").getFirst();
        jdbc.update("UPDATE mw_ai_provider SET enabled=false");
        providers.save(null,new AiDtos.ProviderInput("integration","https://api.deepseek.com/v1","test-model","not-a-real-key",true,List.of(AiDtos.Scene.values()),0));
    }
    private LearningDtos.ReviewEvent event(String id,String device,String at,int rating,boolean hint){return new LearningDtos.ReviewEvent(id,device,word.id(),word.senseId(),at,"RECALL",rating,hint);}
    private AiDtos.CreateTask request(String id,AiDtos.Scene scene){return new AiDtos.CreateTask(id,scene,word.id(),word.senseId(),"A clear example of "+word.lemma(),"beginner",null,false);}
    private String explanation(){return Json.write(Map.of("meaning",word.meaning(),"explanation","本文中表示"+word.meaning(),"collocations",List.of("a clear example"),"memoryTip","创作联想：建立场景联系","example","We discuss "+word.lemma()+" today.","exampleTranslation","我们今天讨论这个词。","sourceNote","基于词库义项，AI辅助解释；非词源考证"));}
    @Test void cookieLoginLogoutAndCredentialStorageAreSafe() throws Exception {
        var result=mvc.perform(post("/auth/login").contentType("application/json").content(Json.write(new AuthDtos.Credentials(user.user().username(),"StrongPassword123!")))).andExpect(status().isOk()).andExpect(header().string("Set-Cookie",org.hamcrest.Matchers.containsString("HttpOnly"))).andReturn();
        String token=Json.tree(result.getResponse().getContentAsString()).path("token").asText();
        mvc.perform(get("/me").cookie(new Cookie("mw_session",token))).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(user.user().id()));
        assertThat(jdbc.queryForObject("SELECT token_hash FROM mw_session WHERE token_hash=?",String.class,AuthService.hash(token))).isNotEqualTo(token);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM mw_user WHERE id=?",String.class,user.user().id())).startsWith("$2a$");
        mvc.perform(post("/auth/logout").cookie(new Cookie("mw_session",token))).andExpect(status().isNoContent());
        mvc.perform(get("/me").cookie(new Cookie("mw_session",token))).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/providers").header("Authorization","Bearer "+user.token())).andExpect(status().isForbidden());
        mvc.perform(put("/me/profile").header("Origin","https://untrusted.example").cookie(new Cookie("mw_session",user.token())).contentType("application/json").content("{}")).andExpect(status().isForbidden());
    }
    @Test void threeBooksRetainAttributionAndStableWordIds(){
        assertThat(catalog.books()).hasSize(3);assertThat(catalog.books()).allSatisfy(book->{assertThat(book.license()).isNotBlank();assertThat(book.wordCount()).isGreaterThan(1000);});
        assertThat(word.sourceUrl()).isNotBlank();assertThat(word.senseId()).isNotBlank();
    }
    @Test void bareJsonAiRequestDefaultsOptionalRegenerateToFalse() throws Exception {
        // Match the client payload, which omits the optional regenerate flag.
        String body=Json.write(Map.of("requestId","optional-flag","scene","EXPLAIN","wordId",word.id(),"senseId",word.senseId()));
        var response=mvc.perform(post("/ai/tasks").header("Authorization","Bearer "+user.token()).contentType("application/json").content(body))
            .andExpect(status().isAccepted()).andReturn();
        String taskId=Json.tree(response.getResponse().getContentAsString()).path("id").asText();
        var stored=Json.read((String)ai.row(taskId).get("request_json"),AiDtos.CreateTask.class);
        assertThat(stored.regenerate()).isFalse();
        mvc.perform(post("/ai/tasks").header("Authorization","Bearer "+user.token()).contentType("application/json").content(body))
            .andExpect(status().isAccepted()).andExpect(jsonPath("$.id").value(taskId));
        assertThat(ai.quota(user.user().id()).reserved()).isEqualTo(1);
        jdbc.update("UPDATE mw_ai_provider SET enabled=false");
        String unconfigured=Json.write(Map.of("requestId","optional-unconfigured","scene","MEMORY","wordId",word.id()));
        mvc.perform(post("/ai/tasks").header("Authorization","Bearer "+user.token()).contentType("application/json").content(unconfigured))
            .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("AI_NOT_CONFIGURED"));
    }
    @Test void syncMergesOutOfOrderEventsIdempotentlyAndIsolatesAccounts(){
        var first=event("later","phone","2026-01-03T00:00:00Z",3,false);
        var older=event("older","web","2026-01-01T00:00:00Z",4,false);
        var initial=sync.sync(user.user().id(),new LearningDtos.SyncRequest(0,"phone",List.of(first),List.of()));
        var merged=sync.sync(user.user().id(),new LearningDtos.SyncRequest(initial.cursor(),"web",List.of(older),List.of()));
        assertThat(merged.events()).hasSize(2);assertThat(merged.states().getFirst().intervalDays()).isEqualTo(8);
        assertThat(merged.states().getFirst().dueAt()).isEqualTo("2026-01-11T00:00:00.000Z");
        var repeated=sync.sync(user.user().id(),new LearningDtos.SyncRequest(0,"phone",List.of(first),List.of()));
        assertThat(repeated.cursor()).isEqualTo(merged.cursor());assertThat(repeated.acceptedEventIds()).containsExactly("later");
        var other=auth.register(new AuthDtos.Credentials("other_"+UUID.randomUUID().toString().substring(0,8),"StrongPassword123!"));
        assertThat(sync.sync(other.user().id(),new LearningDtos.SyncRequest(0,"web",List.of(),List.of())).events()).isEmpty();
        var conflicting=event("later","phone","2026-01-03T00:00:00Z",1,false);
        assertThatThrownBy(()->sync.sync(user.user().id(),new LearningDtos.SyncRequest(0,"phone",List.of(conflicting),List.of()))).isInstanceOf(ApiException.class);
        assertThat(sync.reviews(user.user().id())).hasSize(2);
    }
    @Test void readingAcknowledgementsAndExposureDoNotClaimRecall(){
        var exposure=new LearningDtos.ReviewEvent("exposure","web",word.id(),word.senseId(),"2026-01-01T00:00:00Z","EXPOSURE",4,false);
        var reading=new LearningDtos.ReadingEvent("read-1","web","sample-curiosity",0.75,true,"2026-01-01T00:00:00Z");
        var response=sync.sync(user.user().id(),new LearningDtos.SyncRequest(0,"web",List.of(exposure),List.of(reading)));
        assertThat(response.states()).isEmpty();assertThat(response.acceptedReadingEventIds()).containsExactly("read-1");assertThat(response.readingEvents().getFirst().completed()).isTrue();
        var hint=event("hint","web","2026-01-02T00:00:00Z",4,true);
        var updated=sync.sync(user.user().id(),new LearningDtos.SyncRequest(response.cursor(),"web",List.of(hint),List.of()));
        assertThat(updated.states().getFirst().intervalDays()).isEqualTo(1);assertThat(updated.states().getFirst().status()).isEqualTo("LEARNING");
    }
    @Test void concurrentDuplicateRequestsReserveOnlyOnceAndFailureReleasesOnce() throws Exception {
        var input=request("repeat",AiDtos.Scene.EXPLAIN);
        try(var pool=Executors.newFixedThreadPool(2)){
            var a=pool.submit(()->ai.create(user.user().id(),input));var b=pool.submit(()->ai.create(user.user().id(),input));
            assertThat(a.get().id()).isEqualTo(b.get().id());
        }
        assertThat(ai.quota(user.user().id()).available()).isEqualTo(29);assertThat(ai.quota(user.user().id()).reserved()).isEqualTo(1);
        var task=ai.list(user.user().id()).getFirst();ai.fail(task.id(),"test failure");ai.fail(task.id(),"second failure");
        assertThat(ai.quota(user.user().id()).available()).isEqualTo(30);assertThat(ai.quota(user.user().id()).reserved()).isZero();
        assertThat(ai.create(user.user().id(),input).status()).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM mw_quota_ledger WHERE reference_id=? AND kind='RELEASE'",Long.class,task.id())).isEqualTo(1);
    }
    @Test void successfulExplanationsCacheWithoutQuotaOrProviderButContextsAreFresh() throws Exception {
        when(gateway.generate(any(),any(),any())).thenReturn(new AiGateway.Result(explanation(),100,80,50));
        var first=ai.create(user.user().id(),request("first",AiDtos.Scene.EXPLAIN));worker.runOne(first.id());
        assertThat(ai.get(user.user().id(),first.id()).status()).isEqualTo("SUCCEEDED");
        jdbc.update("UPDATE mw_ai_provider SET enabled=false");ai.adjustQuota(user.user().id(),new AiDtos.QuotaAdjustment("zero",-29,"test zero"));
        var cache=ai.create(user.user().id(),request("second",AiDtos.Scene.EXPLAIN));assertThat(cache.id()).isEqualTo(first.id());assertThat(ai.quota(user.user().id()).available()).isZero();
        assertThat(ai.create(user.user().id(),request("second",AiDtos.Scene.EXPLAIN)).id()).isEqualTo(first.id());
        assertThatThrownBy(()->ai.create(user.user().id(),request("third",AiDtos.Scene.MEMORY))).isInstanceOf(ApiException.class);
        ai.adjustQuota(user.user().id(),new AiDtos.QuotaAdjustment("restore",10,"test restore"));jdbc.update("UPDATE mw_ai_provider SET enabled=true");
        String question=Json.write(Map.of("sentence","We discuss "+word.lemma()+" today.","options",List.of("甲","乙","丙","丁"),"answer",0,"explanation","符合本文义项"));
        when(gateway.generate(any(),any(),any())).thenReturn(new AiGateway.Result(question,90,50,40));
        var q1=ai.create(user.user().id(),request("q1",AiDtos.Scene.CONTEXT));worker.runOne(q1.id());
        var q2=ai.create(user.user().id(),request("q2",AiDtos.Scene.CONTEXT));assertThat(q2.id()).isNotEqualTo(q1.id());
        assertThat(ai.quota(user.user().id()).available()).isEqualTo(8);
    }
    @Test void queuedTaskUsesProfileAndModelSnapshotsNotLaterEdits() throws Exception {
        var savedProfile=user.user().profile();
        var task=ai.create(user.user().id(),request("snapshot",AiDtos.Scene.EXPLAIN));
        var provider=providers.list().stream().filter(AiDtos.Provider::enabled).findFirst().orElseThrow();
        auth.saveProfile(user.user().id(),new AuthDtos.Profile(savedProfile.bookId(),"read news",List.of("sports"),15,"intermediate",true));
        providers.save(provider.id(),new AiDtos.ProviderInput(provider.name(),provider.baseUrl(),"new-model",null,true,provider.scenes(),provider.priority()));
        when(gateway.generate(any(),any(),any())).thenReturn(new AiGateway.Result(explanation(),1,1,1));worker.runOne(task.id());
        var usedProfile=org.mockito.ArgumentCaptor.forClass(AuthDtos.Profile.class);
        var usedProvider=org.mockito.ArgumentCaptor.forClass(ProviderService.Connection.class);
        verify(gateway).generate(usedProvider.capture(),any(),usedProfile.capture());
        assertThat(usedProfile.getValue()).isEqualTo(savedProfile);assertThat(usedProvider.getValue().model()).isEqualTo("test-model");
        auth.saveProfile(user.user().id(),savedProfile);
        assertThat(ai.create(user.user().id(),request("snapshot-cached",AiDtos.Scene.EXPLAIN)).id()).isEqualTo(task.id());
    }
    @Test void invalidContentAndExpiredRunningTasksRefundAndRecordProviderTokens() throws Exception {
        when(gateway.generate(any(),any(),any())).thenReturn(new AiGateway.Result("{\"sentence\":\"missing target\",\"options\":[],\"answer\":8}",10,20,30));
        var bad=ai.create(user.user().id(),request("bad",AiDtos.Scene.CONTEXT));worker.runOne(bad.id());
        assertThat(ai.get(user.user().id(),bad.id()).status()).isEqualTo("FAILED");assertThat(ai.quota(user.user().id()).available()).isEqualTo(30);
        assertThat(((Number)ai.row(bad.id()).get("input_tokens")).longValue()).isEqualTo(10);
        var interrupted=ai.create(user.user().id(),request("crash",AiDtos.Scene.EXPLAIN));ai.claim(interrupted.id());
        jdbc.update("UPDATE mw_ai_task SET updated_at=? WHERE id=?",System.currentTimeMillis()-200000,interrupted.id());
        assertThat(ai.expiredIds()).contains(interrupted.id());ai.fail(interrupted.id(),"recovery timeout");
        ai.succeed(interrupted.id(),new AiGateway.Result(explanation(),1,1,1));
        assertThat(ai.get(user.user().id(),interrupted.id()).status()).isEqualTo("FAILED");assertThat(ai.quota(user.user().id()).reserved()).isZero();
        var queued=ai.create(user.user().id(),request("normal-queue",AiDtos.Scene.MEMORY));jdbc.update("UPDATE mw_ai_task SET updated_at=?,created_at=? WHERE id=?",System.currentTimeMillis()-200000,System.currentTimeMillis()-200000,queued.id());assertThat(ai.expiredIds()).doesNotContain(queued.id());
    }
    @Test void concurrentSuccessCancellationAndTimeoutHaveOnlyOneTerminalLedgerEntry() throws Exception {
        var task=ai.create(user.user().id(),request("terminal-race",AiDtos.Scene.EXPLAIN));ai.claim(task.id());
        var other=ai.create(user.user().id(),request("unrelated-reservation",AiDtos.Scene.MEMORY));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(3)){
            var success=pool.submit(()->{start.await();ai.succeed(task.id(),new AiGateway.Result(explanation(),1,1,1));return null;});
            var cancel=pool.submit(()->{start.await();ai.cancel(user.user().id(),task.id());return null;});
            var timeout=pool.submit(()->{start.await();ai.fail(task.id(),"expired lease");return null;});
            start.countDown();success.get();cancel.get();timeout.get();
        }
        String status=ai.get(user.user().id(),task.id()).status();assertThat(status).isIn("SUCCEEDED","FAILED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM mw_quota_ledger WHERE reference_id=? AND kind IN ('SETTLE','RELEASE')",Long.class,task.id())).isEqualTo(1);
        var quota=ai.quota(user.user().id());assertThat(quota.reserved()).isEqualTo(other.cost());assertThat(quota.available()).isEqualTo(status.equals("SUCCEEDED")?28:29);
    }
    @Test void articleMustContainEveryTargetBeforeItCanBeCharged() throws Exception {
        var request=new AiDtos.CreateTask("article",AiDtos.Scene.ARTICLE,null,null,"travel","beginner",List.of(word.id()),false);
        when(gateway.generate(any(),any(),any())).thenReturn(new AiGateway.Result(Json.write(Map.of("title","Story","body","No targets here.","targetWordIds",List.of(word.id()))),10,10,10));
        var task=ai.create(user.user().id(),request);worker.runOne(task.id());
        assertThat(ai.get(user.user().id(),task.id()).status()).isEqualTo("FAILED");assertThat(ai.quota(user.user().id()).available()).isEqualTo(30);assertThat(articles.list(user.user().id())).hasSize(2);
    }
    @Test void providerKeyEncryptedAndNeverExposed(){
        var provider=providers.list().stream().filter(AiDtos.Provider::enabled).findFirst().orElseThrow();
        assertThat(Json.write(provider)).doesNotContain("not-a-real-key");
        var stored=jdbc.queryForObject("SELECT encrypted_key FROM mw_ai_provider WHERE id=?",String.class,provider.id());assertThat(stored).startsWith("v1:").doesNotContain("not-a-real-key");
        assertThatThrownBy(()->providers.save(null,new AiDtos.ProviderInput("bad","http://127.0.0.1/v1","x","x",true,null,0))).isInstanceOf(ApiException.class);
        var before=ai.quota(user.user().id()).available();ai.adjustQuota(user.user().id(),new AiDtos.QuotaAdjustment("grant",5,"grant"));ai.adjustQuota(user.user().id(),new AiDtos.QuotaAdjustment("grant",5,"grant"));assertThat(ai.quota(user.user().id()).available()).isEqualTo(before+5);
    }
}
