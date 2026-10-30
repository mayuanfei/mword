package com.mayuanfei.mword.learning;

import com.mayuanfei.mword.common.Time;
import java.util.*;
import org.springframework.stereotype.Component;

/** interval-v1：确定性基础间隔规则；不是FSRS，也不据此宣称熟练度。 */
@Component
public class ReviewScheduler {
    public static final String VERSION="interval-v1";
    public List<LearningDtos.ReviewState> calculate(List<LearningDtos.ReviewEvent> input) {
        var events=new ArrayList<>(input);
        events.sort(Comparator.comparingLong((LearningDtos.ReviewEvent event)->Time.parse(event.occurredAt())).thenComparing(LearningDtos.ReviewEvent::eventId));
        Map<String,LearningDtos.ReviewState> states=new TreeMap<>();
        for(var event:events) {
            if("EXPOSURE".equals(event.kind())) continue;
            String key=event.wordId()+"\u0000"+event.senseId();
            var previous=states.get(key);
            int repetitions=previous==null?0:previous.repetitions();
            int lapses=previous==null?0:previous.lapses();
            int interval=previous==null?0:previous.intervalDays();
            int rating=event.usedHint()?Math.min(event.rating(),2):event.rating();
            long at=Time.parse(event.occurredAt()); String status;
            if(rating==1) {repetitions=0;lapses++;interval=0;status="LEARNING";}
            else if(rating==2){repetitions++;interval=1;status="LEARNING";}
            else {repetitions++;interval=interval<=0?(rating==4?3:1):(int)Math.ceil(interval*(rating==4?3.5:2.5));interval=Math.min(interval,365);status="REVIEW";}
            long due=at+(rating==1?600_000L:interval*86_400_000L);
            states.put(key,new LearningDtos.ReviewState(event.wordId(),event.senseId(),repetitions,lapses,interval,Time.iso(due),Time.iso(at),status));
        }
        return new ArrayList<>(states.values());
    }
}
