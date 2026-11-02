package com.mayuanfei.mword.admin;

import com.mayuanfei.mword.auth.AuthDtos;
import com.mayuanfei.mword.auth.AuthService;
import com.mayuanfei.mword.common.ApiException;
import com.mayuanfei.mword.common.Time;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminUserService {
    private final AuthService auth;
    private final JdbcTemplate jdbc;

    public AdminUserService(AuthService auth, JdbcTemplate jdbc) {
        this.auth = auth;
        this.jdbc = jdbc;
    }

    @Transactional
    public AuthDtos.User createUser(AdminUserDtos.CreateUser input) {
        AuthDtos.User created = auth.createAccount(input.username(), input.password(), input.role());
        if (input.remark() != null && !input.remark().isBlank()) {
            jdbc.update("UPDATE mw_user SET remark=? WHERE id=?", input.remark().trim(), created.id());
        }
        return created;
    }

    @Transactional
    public void updateStatus(String operatorId, String targetId, String status) {
        if (operatorId.equals(targetId) && "DISABLED".equals(status)) {
            throw ApiException.badRequest("不能禁用当前登录的管理员账号");
        }
        Map<String, Object> target = auth.lockUser(targetId);
        if ("ADMIN".equals(target.get("role")) && "DISABLED".equals(status)) {
            ensureOtherActiveAdmin(targetId);
        }
        jdbc.update("UPDATE mw_user SET status=? WHERE id=?", status, targetId);
        if ("DISABLED".equals(status)) {
            jdbc.update("DELETE FROM mw_session WHERE user_id=?", targetId);
        }
    }

    @Transactional
    public void updateRole(String operatorId, String targetId, String role) {
        if (operatorId.equals(targetId) && !"ADMIN".equals(role)) {
            throw ApiException.badRequest("不能取消当前登录账号的管理员权限");
        }
        Map<String, Object> target = auth.lockUser(targetId);
        if ("ADMIN".equals(target.get("role")) && !"ADMIN".equals(role)) {
            ensureOtherActiveAdmin(targetId);
        }
        jdbc.update("UPDATE mw_user SET role=? WHERE id=?", role, targetId);
    }

    @Transactional
    public void resetPassword(String targetId, String rawPassword) {
        auth.lockUser(targetId);
        String encoded = auth.encodePassword(rawPassword);
        jdbc.update("UPDATE mw_user SET password_hash=? WHERE id=?", encoded, targetId);
        jdbc.update("DELETE FROM mw_session WHERE user_id=?", targetId);
    }

    @Transactional
    public void updateRemark(String targetId, String remark) {
        auth.lockUser(targetId);
        String cleaned = (remark == null || remark.isBlank()) ? null : remark.trim();
        jdbc.update("UPDATE mw_user SET remark=? WHERE id=?", cleaned, targetId);
    }

    @Transactional
    public void revokeSessions(String targetId) {
        auth.lockUser(targetId);
        jdbc.update("DELETE FROM mw_session WHERE user_id=?", targetId);
    }

    public List<AdminUserDtos.LedgerEntry> listLedger(String targetId) {
        auth.get(targetId);
        return jdbc.query(
                "SELECT id,reference_id,kind,amount,reason,created_at FROM mw_quota_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
                (rs, n) -> new AdminUserDtos.LedgerEntry(
                        rs.getString("id"),
                        rs.getString("reference_id"),
                        rs.getString("kind"),
                        rs.getLong("amount"),
                        rs.getString("reason"),
                        Time.iso(rs.getLong("created_at"))
                ),
                targetId
        );
    }

    //////////////////////////////////////公私有方法分割线//////////////////////////////////

    private void ensureOtherActiveAdmin(String excludedUserId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM mw_user WHERE role='ADMIN' AND COALESCE(status,'ACTIVE')='ACTIVE' AND id<>?",
                Long.class,
                excludedUserId
        );
        if (count == null || count < 1) {
            throw ApiException.badRequest("系统至少需要保留一名正常状态的管理员");
        }
    }
}
