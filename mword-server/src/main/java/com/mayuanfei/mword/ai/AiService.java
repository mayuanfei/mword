package com.mayuanfei.mword.ai;

import com.mayuanfei.mword.auth.AuthService;
import com.mayuanfei.mword.catalog.*;
import com.mayuanfei.mword.common.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiService {
    private final JdbcTemplate jdbc;private final AuthService auth;private final CatalogService catalog;private final ArticleService articles;
    private final ProviderService providers;private final AiContentValidator validator;
    private final Map<String,Integer> costs;
    public AiService(JdbcTemplate jdbc,AuthService auth,CatalogService catalog,ArticleService articles,ProviderService providers,AiContentValidator validator,
        @Value("${mword.cost-explain:1}") int explain,@Value("${mword.cost-memory:1}") int memory,@Value("${mword.cost-context:1}") int context,@Value("${mword.cost-article:3}") int article){
        this.jdbc=jdbc;this.auth=auth;this.catalog=catalog;this.articles=articles;this.providers=providers;this.validator=validator;
        if(Math.min(Math.min(explain,memory),Math.min(context,article))<1)throw new IllegalStateException("AI场景成本必须为正整数");
        costs=Map.of("EXPLAIN",explain,"MEMORY",memory,"CONTEXT",context,"ARTICLE",article);
    }
    @Transactional public AiDtos.Task create(String userId,AiDtos.CreateTask input) {
        String hash=AuthService.hash(Json.write(input));
        var user=auth.lockUser(userId);
        var existing=jdbc.queryForList("SELECT t.*,r.payload_hash AS alias_hash FROM mw_ai_request r JOIN mw_ai_task t ON t.id=r.task_id WHERE r.user_id=? AND r.request_id=?",userId,input.requestId());
        if(!existing.isEmpty()){
            if(!hash.equals(existing.getFirst().get("alias_hash")))throw new ApiException(409,"REQUEST_CONFLICT","同一请求编号不能对应不同AI请求");
            return view(existing.getFirst());
        }
        validate(input);
        var canonical=new LinkedHashMap<String,Object>();
        canonical.put("scene",input.scene());canonical.put("wordId",input.wordId());canonical.put("senseId",input.senseId());
        canonical.put("context",input.context());canonical.put("difficulty",input.difficulty());canonical.put("targets",input.targetWordIds());canonical.put("profile",user.get("profile_json"));
        String contentHash=AuthService.hash(Json.write(canonical));
        if(!input.regenerate()&&(input.scene()==AiDtos.Scene.EXPLAIN||input.scene()==AiDtos.Scene.MEMORY)) {
            var cache=jdbc.queryForList("SELECT * FROM mw_ai_task WHERE user_id=? AND content_hash=? AND status='SUCCEEDED' ORDER BY created_at DESC LIMIT 1",userId,contentHash);
            if(!cache.isEmpty()) {
                String cachedId=(String)cache.getFirst().get("id");
                jdbc.update("INSERT INTO mw_ai_request(user_id,request_id,task_id,payload_hash) VALUES(?,?,?,?)",userId,input.requestId(),cachedId,hash);
                return view(cache.getFirst());
            }
        }
        var provider=providers.select(input.scene());
        // Validate key availability before reserving, never return it to a DTO.
        providers.connection(provider.id());
        long cost=costs.get(input.scene().name()),available=((Number)user.get("quota_available")).longValue();
        if(available<cost)throw new ApiException(402,"QUOTA_INSUFFICIENT","AI学习额度不足，已有内容仍可继续阅读和复习");
        var active=jdbc.queryForObject("SELECT COUNT(*) FROM mw_ai_task WHERE user_id=? AND status IN ('QUEUED','RUNNING')",Long.class,userId);
        if(active!=null&&active>=10)throw new ApiException(429,"TOO_MANY_TASKS","请等待当前AI任务完成");
        var queued=jdbc.queryForObject("SELECT COUNT(*) FROM mw_ai_task WHERE status IN ('QUEUED','RUNNING')",Long.class);
        if(queued!=null&&queued>=200)throw new ApiException(429,"AI_BUSY","AI服务繁忙，请稍后重试");
        String id=UUID.randomUUID().toString();long now=System.currentTimeMillis();
        jdbc.update("INSERT INTO mw_ai_task(id,user_id,request_id,payload_hash,content_hash,scene,status,cost,request_json,profile_json,provider_id,provider_name,provider_model,created_at,updated_at) VALUES(?,?,?,?,?,?,'QUEUED',?,?,?,?,?,?,?,?)",id,userId,input.requestId(),hash,contentHash,input.scene().name(),cost,Json.write(input),user.get("profile_json"),provider.id(),provider.name(),provider.model(),now,now);
        jdbc.update("INSERT INTO mw_ai_request(user_id,request_id,task_id,payload_hash) VALUES(?,?,?,?)",userId,input.requestId(),id,hash);
        jdbc.update("UPDATE mw_user SET quota_available=quota_available-?,quota_reserved=quota_reserved+? WHERE id=?",cost,cost,userId);
        ledger(userId,id,"RESERVE",-cost,"AI任务预占");
        return get(userId,id);
    }
    public List<AiDtos.Task> list(String userId){return jdbc.queryForList("SELECT * FROM mw_ai_task WHERE user_id=? ORDER BY created_at DESC,id LIMIT 100",userId).stream().map(this::view).toList();}
    public AiDtos.Task get(String userId,String id){var rows=jdbc.queryForList("SELECT * FROM mw_ai_task WHERE user_id=? AND id=?",userId,id);if(rows.isEmpty())throw ApiException.notFound();return view(rows.getFirst());}
    public AiDtos.Quota quota(String userId){var user=jdbc.queryForMap("SELECT quota_available,quota_reserved FROM mw_user WHERE id=?",userId);var usage=list(userId).stream().map(task->new AiDtos.Usage(task.id(),task.scene(),task.cost(),task.status(),task.createdAt())).toList();return new AiDtos.Quota(((Number)user.get("quota_available")).longValue(),((Number)user.get("quota_reserved")).longValue(),costs,usage);}
    public List<String> queue(){return jdbc.query("SELECT id FROM mw_ai_task WHERE status='QUEUED' ORDER BY created_at,id LIMIT 2",(rs,n)->rs.getString(1));}
    @Transactional public Map<String,Object> claim(String id){
        int changed=jdbc.update("UPDATE mw_ai_task SET status='RUNNING',updated_at=?,attempts=attempts+1 WHERE id=? AND status='QUEUED'",System.currentTimeMillis(),id);
        return changed==0?null:jdbc.queryForMap("SELECT * FROM mw_ai_task WHERE id=?",id);
    }
    @Transactional public void succeed(String id,AiGateway.Result output){
        var row=row(id);String userId=(String)row.get("user_id");auth.lockUser(userId);row=lockedRow(id);
        if(!"RUNNING".equals(row.get("status")))return;
        var request=Json.read((String)row.get("request_json"),AiDtos.CreateTask.class);
        String result=validator.validate(request,output.content());String articleId=null;
        if(request.scene()==AiDtos.Scene.ARTICLE){var node=Json.tree(result);articleId=articles.create(userId,node.path("title").asText(),node.path("body").asText(),"AI",request.targetWordIds()).id();}
        long cost=((Number)row.get("cost")).longValue();
        jdbc.update("UPDATE mw_user SET quota_reserved=quota_reserved-? WHERE id=?",cost,userId);
        ledger(userId,id,"SETTLE",0,"AI结果保存成功");
        jdbc.update("UPDATE mw_ai_task SET status='SUCCEEDED',result_text=?,article_id=?,input_tokens=?,output_tokens=?,duration_ms=?,updated_at=? WHERE id=?",result,articleId,output.inputTokens(),output.outputTokens(),output.durationMs(),System.currentTimeMillis(),id);
    }
    @Transactional public void recordMetrics(String id,AiGateway.Result output){
        jdbc.update("UPDATE mw_ai_task SET input_tokens=?,output_tokens=?,duration_ms=? WHERE id=?",output.inputTokens(),output.outputTokens(),output.durationMs(),id);
    }
    @Transactional public void fail(String id,String reason){
        var row=row(id);String userId=(String)row.get("user_id");auth.lockUser(userId);row=lockedRow(id);
        if(!Set.of("QUEUED","RUNNING").contains(row.get("status")))return;
        long cost=((Number)row.get("cost")).longValue();
        jdbc.update("UPDATE mw_user SET quota_available=quota_available+?,quota_reserved=quota_reserved-? WHERE id=?",cost,cost,userId);
        ledger(userId,id,"RELEASE",cost,"AI任务失败或取消，释放预占");
        jdbc.update("UPDATE mw_ai_task SET status='FAILED',error_message=?,updated_at=? WHERE id=?",reason,System.currentTimeMillis(),id);
    }
    @Transactional public void cancel(String userId,String id){get(userId,id);fail(id,"任务已取消，额度已释放");}
    public List<String> expiredIds(){long now=System.currentTimeMillis();return jdbc.query("SELECT id FROM mw_ai_task WHERE (status='RUNNING' AND updated_at<?) OR (status='QUEUED' AND created_at<?)",(rs,n)->rs.getString(1),now-180_000L,now-86_400_000L);}
    public Map<String,Object> row(String id){var rows=jdbc.queryForList("SELECT * FROM mw_ai_task WHERE id=?",id);if(rows.isEmpty())throw ApiException.notFound();return rows.getFirst();}
    public List<Map<String,Object>> adminUsers(){
        long now=System.currentTimeMillis();
        String sql="SELECT u.id,u.username,u.role,COALESCE(u.status,'ACTIVE') AS status,u.remark,u.quota_available AS available,u.quota_reserved AS reserved,u.created_at AS createdAt,u.last_login_at AS lastLoginAt,(SELECT COUNT(DISTINCT r.word_id) FROM mw_review_event r WHERE r.user_id=u.id) AS wordCount,(SELECT COUNT(*) FROM mw_review_event r WHERE r.user_id=u.id AND r.kind='RECALL') AS reviewCount,(SELECT COUNT(*) FROM mw_session s WHERE s.user_id=u.id AND s.expires_at>?) AS activeSessions,(SELECT COALESCE(SUM(t.input_tokens+t.output_tokens),0) FROM mw_ai_task t WHERE t.user_id=u.id) AS totalTokens FROM mw_user u ORDER BY u.created_at DESC";
        return adminDates(jdbc.queryForList(sql,now));
    }
    @Transactional public Map<String,Long> adjustQuota(String userId,AiDtos.QuotaAdjustment input){
        var user=auth.lockUser(userId);
        var previous=jdbc.queryForList("SELECT amount,reason FROM mw_quota_ledger WHERE user_id=? AND reference_id=? AND kind='ADJUST'",userId,input.requestId());
        if(!previous.isEmpty()){
            var row=previous.getFirst();if(((Number)row.get("amount")).longValue()!=input.amount()||!input.reason().equals(row.get("reason")))throw new ApiException(409,"REQUEST_CONFLICT","额度调整请求编号已用于其他内容");
        }else{
            long next=((Number)user.get("quota_available")).longValue()+input.amount();if(next<0)throw ApiException.badRequest("可用额度不能低于零");
            jdbc.update("UPDATE mw_user SET quota_available=? WHERE id=?",next,userId);ledger(userId,input.requestId(),"ADJUST",input.amount(),input.reason());
        }
        var quota=quota(userId);return Map.of("available",quota.available(),"reserved",quota.reserved());
    }
    public List<Map<String,Object>> adminUsage(){return adminDates(jdbc.queryForList("SELECT t.id,t.user_id AS userId,u.username,t.scene,t.cost,t.status,t.input_tokens AS inputTokens,t.output_tokens AS outputTokens,t.duration_ms AS durationMs,t.created_at AS createdAt FROM mw_ai_task t JOIN mw_user u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 500"));}
    public List<Map<String,Object>> adminTasks(){return adminDates(jdbc.queryForList("SELECT id,user_id AS userId,request_id AS requestId,scene,status,cost,error_message AS error,created_at AS createdAt,updated_at AS updatedAt FROM mw_ai_task ORDER BY created_at DESC LIMIT 500"));}

    //////////////////////////////////////公私有方法分割线//////////////////////////////////

    private void validate(AiDtos.CreateTask input){
        if(input.scene()==AiDtos.Scene.ARTICLE){
            if(input.targetWordIds()==null||input.targetWordIds().isEmpty())throw ApiException.badRequest("文章生成至少选择一个目标词");
            if(new HashSet<>(input.targetWordIds()).size()!=input.targetWordIds().size())throw ApiException.badRequest("目标词不能重复");
            for(String id:input.targetWordIds())catalog.word(id);
        }else{
            if(input.wordId()==null||input.wordId().isBlank())throw ApiException.badRequest("此AI功能需要目标单词");
            var word=catalog.word(input.wordId());
            if(input.senseId()!=null)catalog.validateSense(word.id(),input.senseId());
        }
    }
    private Map<String,Object> lockedRow(String id){
        // MySQL RR普通SELECT会保留旧快照；FOR UPDATE是current-read，必须在用户锁后重新读取终态。
        // 所有额度终态先锁user再锁task，避免不同任务间的反向锁顺序。
        return jdbc.queryForMap("SELECT * FROM mw_ai_task WHERE id=? FOR UPDATE",id);
    }
    private AiDtos.Task view(Map<String,Object> row){var request=Json.read((String)row.get("request_json"),AiDtos.CreateTask.class);return new AiDtos.Task((String)row.get("id"),(String)row.get("request_id"),(String)row.get("scene"),(String)row.get("status"),((Number)row.get("cost")).longValue(),(String)row.get("result_text"),(String)row.get("error_message"),Time.iso(((Number)row.get("created_at")).longValue()),Time.iso(((Number)row.get("updated_at")).longValue()),(String)row.get("article_id"),request.wordId(),request.senseId());}
    private void ledger(String userId,String ref,String kind,long amount,String reason){jdbc.update("INSERT INTO mw_quota_ledger(id,user_id,reference_id,kind,amount,reason,created_at) VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),userId,ref,kind,amount,reason,System.currentTimeMillis());}

    private List<Map<String,Object>> adminDates(List<Map<String,Object>> rows){
        // JDBC drivers may fold labels to lowercase: normalize explicit API field names.
        Map<String,String> labels=Map.ofEntries(
                Map.entry("userid","userId"),Map.entry("requestid","requestId"),
                Map.entry("createdat","createdAt"),Map.entry("updatedat","updatedAt"),
                Map.entry("lastloginat","lastLoginAt"),Map.entry("wordcount","wordCount"),
                Map.entry("reviewcount","reviewCount"),Map.entry("activesessions","activeSessions"),
                Map.entry("totaltokens","totalTokens"),Map.entry("inputtokens","inputTokens"),
                Map.entry("outputtokens","outputTokens"),Map.entry("durationms","durationMs")
        );
        var result=new ArrayList<Map<String,Object>>();
        for(var row:rows){var normalized=new LinkedHashMap<String,Object>();for(var entry:row.entrySet()){String key=labels.getOrDefault(entry.getKey().toLowerCase(Locale.ROOT),entry.getKey());Object value=entry.getValue();if((key.equals("createdAt")||key.equals("updatedAt")||key.equals("lastLoginAt"))&&value instanceof Number number)value=Time.iso(number.longValue());normalized.put(key,value);}result.add(normalized);}return result;
    }
}
