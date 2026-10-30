package com.mayuanfei.mword.ai;

import com.mayuanfei.mword.common.*;
import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProviderService {
    public record Connection(String id,String name,String baseUrl,String model,String key) {
        @Override public String toString(){return "Connection[redacted]";}
    }
    private final JdbcTemplate jdbc;private final KeyCipher cipher;private final Set<String> allowedHosts;
    public ProviderService(JdbcTemplate jdbc,KeyCipher cipher,@Value("${mword.provider-hosts}") String hosts){this.jdbc=jdbc;this.cipher=cipher;allowedHosts=new HashSet<>(Arrays.asList(hosts.split(",")));}
    public List<AiDtos.Provider> list(){return jdbc.query("SELECT * FROM mw_ai_provider ORDER BY priority DESC,id",(rs,n)->new AiDtos.Provider(rs.getString("id"),rs.getString("name"),rs.getString("base_url"),rs.getString("model"),rs.getBoolean("enabled"),true,Arrays.asList(Json.read(rs.getString("scenes_json"),AiDtos.Scene[].class)),rs.getInt("priority"),Time.iso(rs.getLong("updated_at"))));}
    @Transactional public AiDtos.Provider save(String id,AiDtos.ProviderInput input) {
        validateUrl(input.baseUrl());
        var scenes=input.scenes()==null?List.of(AiDtos.Scene.values()):input.scenes().stream().distinct().toList();
        if(scenes.isEmpty()) throw ApiException.badRequest("请至少选择一个AI场景");
        boolean create=id==null;
        if(create) id=UUID.randomUUID().toString();
        List<String> keys=jdbc.query("SELECT encrypted_key FROM mw_ai_provider WHERE id=?",(rs,n)->rs.getString(1),id);
        if(!create&&keys.isEmpty()) throw ApiException.notFound();
        String key=input.apiKey();
        if(create&&(key==null||key.isBlank())) throw ApiException.badRequest("新供应商必须配置API Key");
        String encrypted=(key==null||key.isBlank())?keys.getFirst():cipher.encrypt(id,key.trim());
        long now=System.currentTimeMillis();
        if(create) jdbc.update("INSERT INTO mw_ai_provider(id,name,base_url,model,encrypted_key,enabled,scenes_json,priority,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",id,input.name(),input.baseUrl(),input.model(),encrypted,input.enabled(),Json.write(scenes),input.priority(),now);
        else jdbc.update("UPDATE mw_ai_provider SET name=?,base_url=?,model=?,encrypted_key=?,enabled=?,scenes_json=?,priority=?,updated_at=? WHERE id=?",input.name(),input.baseUrl(),input.model(),encrypted,input.enabled(),Json.write(scenes),input.priority(),now,id);
        String savedId=id;
        return list().stream().filter(provider->provider.id().equals(savedId)).findFirst().orElseThrow();
    }
    @Transactional public void delete(String id){
        var pending=jdbc.queryForObject("SELECT COUNT(*) FROM mw_ai_task WHERE provider_id=? AND status IN ('QUEUED','RUNNING')",Long.class,id);
        if(pending!=null&&pending>0) throw new ApiException(409,"PROVIDER_IN_USE","该供应商仍有待处理任务，请先等待任务完成");
        if(jdbc.update("DELETE FROM mw_ai_provider WHERE id=?",id)==0) throw ApiException.notFound();
    }
    public AiDtos.Provider select(AiDtos.Scene scene){return list().stream().filter(provider->provider.enabled()&&provider.scenes().contains(scene)).findFirst().orElseThrow(()->new ApiException(503,"AI_NOT_CONFIGURED","此学习功能尚未配置AI服务，请联系管理员"));}
    public Connection connection(String id){
        var rows=jdbc.queryForList("SELECT * FROM mw_ai_provider WHERE id=?",id);
        if(rows.isEmpty()) throw new IllegalStateException("Provider unavailable");
        var row=rows.getFirst();String url=(String)row.get("base_url");validateUrl(url);
        return new Connection(id,(String)row.get("name"),url,(String)row.get("model"),cipher.decrypt(id,(String)row.get("encrypted_key")));
    }
    private void validateUrl(String value){
        try {
            URI uri=URI.create(value);
            if(!"https".equals(uri.getScheme())||uri.getHost()==null||!allowedHosts.contains(uri.getHost().toLowerCase(Locale.ROOT))||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getQuery()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)) throw new IllegalArgumentException();
        }catch(Exception e){throw ApiException.badRequest("供应商地址必须为HTTPS且域名在服务器MW_PROVIDER_HOSTS白名单内");}
    }
}
