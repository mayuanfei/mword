package com.mayuanfei.mword.auth;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.mayuanfei.mword.catalog.CatalogService;
import com.mayuanfei.mword.common.ApiException;
import com.mayuanfei.mword.common.Json;
import com.mayuanfei.mword.common.Time;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class AuthService implements ApplicationRunner {
    private final UserMapper users;
    private final JdbcTemplate jdbc;
    private final CatalogService catalog;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final SecureRandom random = new SecureRandom();
    private final boolean registrationEnabled;
    private final long initialQuota;
    private final int sessionDays;
    private final String adminUsername;
    private final String adminPassword;
    private final String dummyHash;

    public AuthService(UserMapper users, JdbcTemplate jdbc, CatalogService catalog,
                       @Value("${mword.registration-enabled}") boolean registrationEnabled,
                       @Value("${mword.initial-quota}") long initialQuota,
                       @Value("${mword.session-days}") int sessionDays,
                       @Value("${mword.admin-username}") String adminUsername,
                       @Value("${mword.admin-password}") String adminPassword) {
        this.users = users; this.jdbc = jdbc; this.catalog = catalog;
        this.registrationEnabled = registrationEnabled; this.initialQuota = Math.max(0, initialQuota);
        this.sessionDays = Math.max(1, Math.min(90, sessionDays));
        this.adminUsername = adminUsername; this.adminPassword = adminPassword;
        dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminUsername.isBlank() && adminPassword.isBlank()) return;
        if (!adminUsername.matches("[a-zA-Z0-9_]{3,40}") || adminPassword.length() < 12 || adminPassword.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new IllegalStateException("管理员初始化需要有效用户名和12至72字节密码");
        UserEntity existing = findByUsername(adminUsername);
        if (existing == null) createUser(adminUsername, adminPassword, "ADMIN");
        else if (!"ADMIN".equals(existing.role))
            throw new IllegalStateException("管理员初始化用户名已被普通账号使用，请换一个用户名");
    }

    @Transactional
    public AuthDtos.AuthResponse register(AuthDtos.Credentials credentials) {
        if (!registrationEnabled) throw new ApiException(403, "REGISTRATION_DISABLED", "当前未开放注册");
        checkPasswordLength(credentials.password());
        if (findByUsername(credentials.username()) != null) throw new ApiException(409, "USERNAME_EXISTS", "用户名已存在");
        try { return issue(createUser(credentials.username(), credentials.password(), "USER")); }
        catch (DuplicateKeyException ex) { throw new ApiException(409, "USERNAME_EXISTS", "用户名已存在"); }
    }

    public AuthDtos.AuthResponse login(AuthDtos.Credentials credentials) {
        checkPasswordLength(credentials.password());
        UserEntity user = findByUsername(credentials.username());
        boolean matches = passwords.matches(credentials.password(), user == null ? dummyHash : user.passwordHash);
        if (!matches || user == null) throw new ApiException(401, "INVALID_CREDENTIALS", "用户名或密码错误");
        checkActive(user);
        jdbc.update("UPDATE mw_user SET last_login_at=? WHERE id=?", System.currentTimeMillis(), user.id);
        return issue(user);
    }

    @Transactional
    public AuthDtos.User createAccount(String username, String password, String role) {
        checkPasswordLength(password);
        if (findByUsername(username) != null) throw new ApiException(409, "USERNAME_EXISTS", "用户名已存在");
        try { return view(createUser(username, password, role)); }
        catch (DuplicateKeyException ex) { throw new ApiException(409, "USERNAME_EXISTS", "用户名已存在"); }
    }

    public String encodePassword(String password) {
        checkPasswordLength(password);
        return passwords.encode(password);
    }

    public AuthDtos.User requireUser(String authorization) {
        authorization = resolveAuthorization(authorization);
        if (authorization == null || !authorization.startsWith("Bearer ") || authorization.length() > 100)
            throw new ApiException(401, "UNAUTHORIZED", "请登录后继续");
        String tokenHash = hash(authorization.substring(7));
        List<String> ids = jdbc.query("SELECT user_id FROM mw_session WHERE token_hash=? AND expires_at>?",
                (rs, n) -> rs.getString(1), tokenHash, System.currentTimeMillis());
        if (ids.isEmpty()) throw new ApiException(401, "SESSION_EXPIRED", "登录已过期，请重新登录");
        UserEntity user = users.selectById(ids.getFirst());
        checkActive(user);
        return view(user);
    }

    public AuthDtos.User requireAdmin(String authorization) {
        AuthDtos.User user = requireUser(authorization);
        if (!"ADMIN".equals(user.role())) throw new ApiException(403, "ADMIN_REQUIRED", "需要管理员权限");
        return user;
    }

    public void logout(String authorization) {
        authorization = resolveAuthorization(authorization);
        requireUser(authorization);
        jdbc.update("DELETE FROM mw_session WHERE token_hash=?", hash(authorization.substring(7)));
    }

    public AuthDtos.User get(String userId) {
        UserEntity user = users.selectById(userId);
        if (user == null) throw ApiException.notFound();
        return view(user);
    }

    @Transactional
    public AuthDtos.Profile saveProfile(String userId, AuthDtos.Profile profile) {
        catalog.book(profile.bookId());
        lockUser(userId);
        jdbc.update("UPDATE mw_user SET profile_json=?,sync_cursor=sync_cursor+1 WHERE id=?", Json.write(profile), userId);
        return profile;
    }

    /** 所有账号级写操作串行化，保护增量游标、事件去重和额度账本。 */
    public Map<String, Object> lockUser(String userId) {
        List<Map<String,Object>> rows = jdbc.queryForList("SELECT * FROM mw_user WHERE id=? FOR UPDATE", userId);
        if (rows.isEmpty()) throw ApiException.notFound();
        return rows.getFirst();
    }

    public static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    public static String resolveAuthorization(String authorization) {
        if(authorization != null && !authorization.isBlank()) return authorization;
        if(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            Cookie[] cookies = attributes.getRequest().getCookies();
            if(cookies != null) for(Cookie cookie:cookies) if("mw_session".equals(cookie.getName())) return "Bearer "+cookie.getValue();
        }
        return null;
    }

    //////////////////////////////////////公私有方法分割线//////////////////////////////////

    private void checkActive(UserEntity user) {
        if ("DISABLED".equals(user.status)) throw new ApiException(403, "ACCOUNT_DISABLED", "账号已被禁用，请联系管理员");
    }

    private void checkPasswordLength(String value) {
        if (value.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.badRequest("密码最多72个UTF-8字节");
    }

    private UserEntity createUser(String username, String password, String role) {
        UserEntity user = new UserEntity();
        user.id = UUID.randomUUID().toString(); user.username = username.toLowerCase(Locale.ROOT);
        user.passwordHash = passwords.encode(password); user.role = role;
        user.profileJson = Json.write(AuthDtos.defaultProfile()); user.quotaAvailable = initialQuota;
        user.quotaReserved = 0L; user.syncCursor = 0L; user.createdAt = System.currentTimeMillis();
        user.status = "ACTIVE";
        users.insert(user);
        jdbc.update("INSERT INTO mw_quota_ledger(id,user_id,reference_id,kind,amount,reason,created_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), user.id, "initial", "GRANT", initialQuota, "注册初始学习额度", user.createdAt);
        return user;
    }

    private UserEntity findByUsername(String username) {
        return users.selectOne(new QueryWrapper<UserEntity>().eq("username", username.toLowerCase(Locale.ROOT)));
    }

    private AuthDtos.AuthResponse issue(UserEntity user) {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long now = System.currentTimeMillis(), expiresAt = now + sessionDays * 86_400_000L;
        jdbc.update("INSERT INTO mw_session(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)", hash(token), user.id, expiresAt, now);
        return new AuthDtos.AuthResponse(token, view(user), Time.iso(expiresAt));
    }

    private AuthDtos.User view(UserEntity entity) {
        return new AuthDtos.User(entity.id, entity.username, entity.role, Json.read(entity.profileJson, AuthDtos.Profile.class));
    }
}
