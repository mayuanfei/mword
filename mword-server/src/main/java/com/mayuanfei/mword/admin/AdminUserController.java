package com.mayuanfei.mword.admin;

import com.mayuanfei.mword.auth.AuthDtos;
import com.mayuanfei.mword.auth.AuthService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminUserController {
    private final AuthService auth;
    private final AdminUserService adminUsers;

    public AdminUserController(AuthService auth, AdminUserService adminUsers) {
        this.auth = auth;
        this.adminUsers = adminUsers;
    }

    @PostMapping("/admin/users")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.User create(
            @RequestHeader(value = "Authorization", required = false) String token,
            @Valid @RequestBody AdminUserDtos.CreateUser input
    ) {
        auth.requireAdmin(token);
        return adminUsers.createUser(input);
    }

    @PutMapping("/admin/users/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateStatus(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id,
            @Valid @RequestBody AdminUserDtos.StatusChange input
    ) {
        AuthDtos.User operator = auth.requireAdmin(token);
        adminUsers.updateStatus(operator.id(), id, input.status());
    }

    @PutMapping("/admin/users/{id}/role")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateRole(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id,
            @Valid @RequestBody AdminUserDtos.RoleChange input
    ) {
        AuthDtos.User operator = auth.requireAdmin(token);
        adminUsers.updateRole(operator.id(), id, input.role());
    }

    @PutMapping("/admin/users/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id,
            @Valid @RequestBody AdminUserDtos.PasswordReset input
    ) {
        auth.requireAdmin(token);
        adminUsers.resetPassword(id, input.password());
    }

    @PutMapping("/admin/users/{id}/remark")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateRemark(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id,
            @Valid @RequestBody AdminUserDtos.RemarkChange input
    ) {
        auth.requireAdmin(token);
        adminUsers.updateRemark(id, input.remark());
    }

    @DeleteMapping("/admin/users/{id}/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeSessions(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id
    ) {
        auth.requireAdmin(token);
        adminUsers.revokeSessions(id);
    }

    @GetMapping("/admin/users/{id}/ledger")
    public List<AdminUserDtos.LedgerEntry> ledger(
            @RequestHeader(value = "Authorization", required = false) String token,
            @PathVariable String id
    ) {
        auth.requireAdmin(token);
        return adminUsers.listLedger(id);
    }
}
