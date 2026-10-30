package com.mayuanfei.mword.learning;

import com.mayuanfei.mword.auth.AuthService;
import com.mayuanfei.mword.catalog.*;
import com.mayuanfei.mword.common.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SyncService {
    private final JdbcTemplate jdbc;private final AuthService auth;private final CatalogService catalog;private final ArticleService articles;private final ReviewScheduler scheduler;
    public SyncService(JdbcTemplate jdbc,AuthService auth,CatalogService catalog,ArticleService articles,ReviewScheduler scheduler){this.jdbc=jdbc;this.auth=auth;this.catalog=catalog;this.articles=articles;this.scheduler=scheduler;}
    @Transactional public LearningDtos.SyncResponse sync(String userId,LearningDtos.SyncRequest input) {
        var user=auth.lockUser(userId);
        long cursor=((Number)user.get("sync_cursor")).longValue();
        if(input.cursor()>cursor) throw new ApiException(409,"CURSOR_AHEAD","本地同步游标超出服务端，请重新拉取");
        var accepted=new ArrayList<String>();
        var acceptedReading=new ArrayList<String>();
        Map<String,LearningDtos.ReviewEvent> existing=new HashMap<>();for(var event:reviews(userId)) existing.put(event.eventId(),event);
        for(var raw:input.events()) {
            if(!raw.deviceId().equals(input.deviceId())) throw ApiException.badRequest("设备编号与事件不一致");
            catalog.validateSense(raw.wordId(),raw.senseId());
            long at=validateTime(raw.occurredAt());
            var event=new LearningDtos.ReviewEvent(raw.eventId(),raw.deviceId(),raw.wordId(),raw.senseId(),Time.iso(at),raw.kind(),raw.rating(),raw.usedHint());
            if(existing.containsKey(event.eventId())) {
                if(!event.equals(existing.get(event.eventId()))) throw new ApiException(409,"EVENT_CONFLICT","同一个学习事件编号不能对应不同内容");
            } else {
                jdbc.update("INSERT INTO mw_review_event(user_id,event_id,device_id,word_id,sense_id,occurred_at,kind,rating,used_hint,revision) VALUES(?,?,?,?,?,?,?,?,?,?)",userId,event.eventId(),event.deviceId(),event.wordId(),event.senseId(),at,event.kind(),event.rating(),event.usedHint(),++cursor);
                existing.put(event.eventId(),event);
            }
            accepted.add(event.eventId());
        }
        Map<String,LearningDtos.ReadingEvent> readings=new HashMap<>();for(var event:readings(userId)) readings.put(event.eventId(),event);
        for(var raw:input.readingEvents()==null?List.<LearningDtos.ReadingEvent>of():input.readingEvents()) {
            if(!raw.deviceId().equals(input.deviceId())) throw ApiException.badRequest("设备编号与事件不一致");
            articles.get(userId,raw.articleId()); long at=validateTime(raw.occurredAt());
            var event=new LearningDtos.ReadingEvent(raw.eventId(),raw.deviceId(),raw.articleId(),raw.position(),raw.completed(),Time.iso(at));
            if(readings.containsKey(event.eventId())) {
                if(!event.equals(readings.get(event.eventId()))) throw new ApiException(409,"EVENT_CONFLICT","同一个阅读事件编号不能对应不同内容");
            } else {
                jdbc.update("INSERT INTO mw_reading_event(user_id,event_id,article_id,device_id,position,completed,occurred_at,revision) VALUES(?,?,?,?,?,?,?,?)",userId,event.eventId(),event.articleId(),event.deviceId(),event.position(),event.completed(),at,++cursor);
                readings.put(event.eventId(),event);
            }
            acceptedReading.add(event.eventId());
        }
        jdbc.update("UPDATE mw_user SET sync_cursor=? WHERE id=?",cursor,userId);
        var all=reviews(userId);
        // 全量历史供客户端重算，cursor用于确认并标示账号变更版本；不会丢掉迟到事件。
        return new LearningDtos.SyncResponse(cursor,accepted,acceptedReading,all,readings(userId),scheduler.calculate(all),auth.get(userId).profile(),articles.list(userId),Time.now(),ReviewScheduler.VERSION);
    }
    private long validateTime(String value) {
        long at=Time.parse(value);if(at<0||at>System.currentTimeMillis()+300_000L) throw ApiException.badRequest("设备时间异常，请校准时间后重试");return at;
    }
    public List<LearningDtos.ReviewEvent> reviews(String userId) {return jdbc.query("SELECT * FROM mw_review_event WHERE user_id=? ORDER BY occurred_at,event_id",(rs,n)->new LearningDtos.ReviewEvent(rs.getString("event_id"),rs.getString("device_id"),rs.getString("word_id"),rs.getString("sense_id"),Time.iso(rs.getLong("occurred_at")),rs.getString("kind"),rs.getInt("rating"),rs.getBoolean("used_hint")),userId);}
    private List<LearningDtos.ReadingEvent> readings(String userId){return jdbc.query("SELECT * FROM mw_reading_event WHERE user_id=? ORDER BY occurred_at,event_id",(rs,n)->new LearningDtos.ReadingEvent(rs.getString("event_id"),rs.getString("device_id"),rs.getString("article_id"),rs.getDouble("position"),rs.getBoolean("completed"),Time.iso(rs.getLong("occurred_at"))),userId);}
}
