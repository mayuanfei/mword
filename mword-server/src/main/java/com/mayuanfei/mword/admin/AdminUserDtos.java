package com.mayuanfei.mword.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 后台用户管理的请求与响应结构
 */
public final class AdminUserDtos {
    private AdminUserDtos() {
    }

    public record CreateUser(
            @NotBlank @Pattern(regexp = "[a-zA-Z0-9_]{3,40}") String username,
            @NotBlank @Size(min = 6, max = 72) String password,
            @NotBlank @Pattern(regexp = "USER|ADMIN") String role,
            @Size(max = 200) String remark
    ) {
    }

    public record RoleChange(
            @NotBlank @Pattern(regexp = "USER|ADMIN") String role
    ) {
    }

    public record StatusChange(
            @NotBlank @Pattern(regexp = "ACTIVE|DISABLED") String status
    ) {
    }

    public record PasswordReset(
            @NotBlank @Size(min = 6, max = 72) String password
    ) {
    }

    public record RemarkChange(
            @Size(max = 200) String remark
    ) {
    }

    public record LedgerEntry(
            String id,
            String referenceId,
            String kind,
            long amount,
            String reason,
            String createdAt
    ) {
    }
}
