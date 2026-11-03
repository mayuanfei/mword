package com.mayuanfei.mword.ai;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;

public final class AiDtos {
    private AiDtos() {}
    public enum Scene { EXPLAIN,MEMORY,CONTEXT,ARTICLE }
    public record CreateTask(@NotBlank @Size(max=100) String requestId,@NotNull Scene scene,
                             @Size(max=100) String wordId,@Size(max=150) String senseId,
                             @Size(max=10000) String context,@Size(max=100) String difficulty,
                             @Size(max=12) List<String> targetWordIds,Boolean regenerate) {
        public CreateTask {
            // Jackson 3 rejects missing primitive booleans. This API option is optional.
            regenerate = Boolean.TRUE.equals(regenerate);
        }
    }
    public record Task(String id,String requestId,String scene,String status,long cost,String result,String error,
                        String createdAt,String updatedAt,String articleId,String wordId,String senseId) {}
    public record Usage(String id,String scene,long cost,String status,String createdAt) {}
    public record Quota(long available,long reserved,Map<String,Integer> sceneCosts,List<Usage> usage) {}
    public record Provider(String id,String name,String baseUrl,String model,boolean enabled,boolean hasKey,
                           List<Scene> scenes,int priority,String updatedAt) {}
    public record ProviderInput(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=500) String baseUrl,
                                @NotBlank @Size(max=100) String model,@Size(max=4096) String apiKey,
                                boolean enabled,List<Scene> scenes,@Min(-1000) @Max(1000) int priority) {}
    public record QuotaAdjustment(@NotBlank @Size(max=100) String requestId,@Min(-1000000) @Max(1000000) long amount,
                                  @NotBlank @Size(max=200) String reason) {}
    public record PageResult<T>(List<T> items, long total, int page, int pageSize, int totalPages) {}
}
