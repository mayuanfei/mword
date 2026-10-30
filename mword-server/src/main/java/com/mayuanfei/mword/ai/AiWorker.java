package com.mayuanfei.mword.ai;

import com.mayuanfei.mword.auth.AuthService;
import com.mayuanfei.mword.auth.AuthDtos;
import com.mayuanfei.mword.common.Json;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class AiWorker {
    private static final Logger LOG=LoggerFactory.getLogger(AiWorker.class);
    private final AiService tasks;private final ProviderService providers;private final AiGateway gateway;private final AuthService auth;private final boolean enabled;
    public AiWorker(AiService tasks,ProviderService providers,AiGateway gateway,AuthService auth,@Value("${mword.ai-worker-enabled}") boolean enabled){this.tasks=tasks;this.providers=providers;this.gateway=gateway;this.auth=auth;this.enabled=enabled;}
    @Scheduled(fixedDelay=1000) public void tick(){
        if(!enabled)return;
        for(String id:tasks.expiredIds())tasks.fail(id,"任务超时或服务重启中断，额度已释放");
        for(String id:tasks.queue())runOne(id);
    }
    public void runOne(String id){
        var row=tasks.claim(id);if(row==null)return;
        try{
            var input=Json.read((String)row.get("request_json"),AiDtos.CreateTask.class);
            var currentProvider=providers.connection((String)row.get("provider_id"));
            var provider=new ProviderService.Connection(currentProvider.id(),(String)row.get("provider_name"),currentProvider.baseUrl(),(String)row.get("provider_model"),currentProvider.key());
            var profile=Json.read((String)row.get("profile_json"),AuthDtos.Profile.class);
            var result=gateway.generate(provider,input,profile);
            tasks.recordMetrics(id,result);
            tasks.succeed(id,result);
        }catch(Exception ex){
            // Do not log provider exception message, headers or model input/output.
            LOG.warn("AI task {} failed: {}",id,ex.getClass().getSimpleName());
            tasks.fail(id,"AI未生成可用结果，额度已释放；请稍后重试");
        }
    }
}
