package com.mayuanfei.mword;

import com.mayuanfei.mword.learning.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ReviewSchedulerTest {
    @Test void equalTimestampsSortByEventIdRatherThanUploadOrder(){
        var fail=new LearningDtos.ReviewEvent("a","d","w","w:core","2026-01-01T00:00:00Z","RECALL",1,false);
        var easy=new LearningDtos.ReviewEvent("b","d","w","w:core","2026-01-01T00:00:00Z","RECALL",4,false);
        var scheduler=new ReviewScheduler();
        var left=scheduler.calculate(List.of(easy,fail));var right=scheduler.calculate(List.of(fail,easy));
        assertThat(left).isEqualTo(right);assertThat(left.getFirst().intervalDays()).isEqualTo(3);assertThat(left.getFirst().lapses()).isEqualTo(1);assertThat(left.getFirst().dueAt()).isEqualTo("2026-01-04T00:00:00.000Z");
    }
}
