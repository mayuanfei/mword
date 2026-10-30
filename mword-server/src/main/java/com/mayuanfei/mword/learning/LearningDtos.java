package com.mayuanfei.mword.learning;

import com.mayuanfei.mword.auth.AuthDtos;
import com.mayuanfei.mword.catalog.CatalogDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public final class LearningDtos {
    private LearningDtos() {}
    public record ReviewEvent(@NotBlank @Size(max=100) String eventId,@NotBlank @Size(max=100) String deviceId,
                              @NotBlank @Size(max=100) String wordId,@NotBlank @Size(max=150) String senseId,
                              @NotBlank String occurredAt,@NotBlank @Pattern(regexp="RECALL|CONTEXT|EXPOSURE") String kind,
                              @Min(1) @Max(4) int rating,boolean usedHint) {}
    public record ReadingEvent(@NotBlank @Size(max=100) String eventId,@NotBlank @Size(max=100) String deviceId,
                               @NotBlank @Size(max=100) String articleId,@DecimalMin("0.0") @DecimalMax("1.0") double position,boolean completed,@NotBlank String occurredAt) {}
    public record SyncRequest(@Min(0) long cursor,@NotBlank @Size(max=100) String deviceId,
                              @NotNull @Size(max=500) List<@Valid ReviewEvent> events,
                              @Size(max=500) List<@Valid ReadingEvent> readingEvents) {}
    public record ReviewState(String wordId,String senseId,int repetitions,int lapses,int intervalDays,
                              String dueAt,String lastReviewedAt,String status) {}
    public record SyncResponse(long cursor,List<String> acceptedEventIds,List<String> acceptedReadingEventIds,List<ReviewEvent> events,List<ReadingEvent> readingEvents,
                               List<ReviewState> states,AuthDtos.Profile profile,List<CatalogDtos.Article> articles,
                               String serverTime,String schedulerVersion) {}
}
