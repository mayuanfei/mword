package com.mayuanfei.mword.catalog;

import com.mayuanfei.mword.auth.AuthService;
import com.mayuanfei.mword.common.ApiException;
import com.mayuanfei.mword.common.Json;
import com.mayuanfei.mword.common.Time;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArticleService {
    public record CreateArticle(@NotBlank @Size(max=200) String title, @NotBlank @Size(max=30000) String body,
                                @NotBlank String source,@NotNull @Size(max=30) List<String> targetWordIds) {}
    private final CatalogService catalog;
    private final JdbcTemplate jdbc;
    private final AuthService auth;
    public ArticleService(CatalogService catalog,JdbcTemplate jdbc,AuthService auth) { this.catalog=catalog;this.jdbc=jdbc;this.auth=auth; }
    public List<CatalogDtos.Article> list(String userId) {
        var result = new ArrayList<>(catalog.samples());
        result.addAll(jdbc.query("SELECT * FROM mw_article WHERE user_id=? ORDER BY created_at DESC,id", (rs,n) -> new CatalogDtos.Article(rs.getString("id"),rs.getString("title"),rs.getString("body"),rs.getString("source"),Arrays.asList(Json.read(rs.getString("target_word_ids"),String[].class)),Time.iso(rs.getLong("created_at"))),userId));
        return result;
    }
    public CatalogDtos.Article get(String userId,String id) { return list(userId).stream().filter(article->article.id().equals(id)).findFirst().orElseThrow(ApiException::notFound); }
    @Transactional public CatalogDtos.Article createUser(String userId,CreateArticle input) {
        if(!"USER".equals(input.source())) throw ApiException.badRequest("导入文章来源必须为USER");
        return create(userId,input.title(),input.body(),"USER",input.targetWordIds());
    }
    @Transactional public CatalogDtos.Article create(String userId,String title,String body,String source,List<String> targetIds) {
        for(var id:targetIds) catalog.word(id);
        var user=auth.lockUser(userId);
        long revision=((Number)user.get("sync_cursor")).longValue()+1;
        var id=UUID.randomUUID().toString(); long now=System.currentTimeMillis();
        jdbc.update("INSERT INTO mw_article(id,user_id,title,body,source,target_word_ids,created_at,revision) VALUES(?,?,?,?,?,?,?,?)",id,userId,title,body,source,Json.write(targetIds),now,revision);
        jdbc.update("UPDATE mw_user SET sync_cursor=? WHERE id=?",revision,userId);
        return new CatalogDtos.Article(id,title,body,source,targetIds,Time.iso(now));
    }
}
