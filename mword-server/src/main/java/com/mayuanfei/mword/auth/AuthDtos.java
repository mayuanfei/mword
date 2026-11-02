package com.mayuanfei.mword.auth;

import jakarta.validation.constraints.*;
import java.util.List;

public final class AuthDtos {
    private AuthDtos() {}
    public record Credentials(@NotBlank @Pattern(regexp="[a-zA-Z0-9_]{3,40}") String username,
                              @NotBlank @Size(min=6,max=72) String password) {}
    public record Profile(@NotBlank String bookId, @NotNull @Size(max=200) String goal,
                          @NotNull @Size(max=15) List<@NotBlank @Size(max=100) String> interests,
                          @Min(5) @Max(120) int dailyMinutes,
                          @NotBlank @Size(max=50) String level,
                          boolean onboardingCompleted) {}
    public record User(String id, String username, String role, Profile profile) {}
    public record AuthResponse(String token, User user, String expiresAt) {}
    public static Profile defaultProfile() {
        return new Profile("cet4", "", List.of(), 20, "基础起步", false);
    }
}
