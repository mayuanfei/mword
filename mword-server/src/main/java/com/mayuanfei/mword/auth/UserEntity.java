package com.mayuanfei.mword.auth;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/** 仅在持久层使用，绝不直接返回给客户端。 */
@TableName("mw_user")
public class UserEntity {
    @TableId public String id;
    public String username;
    public String passwordHash;
    public String role;
    public String profileJson;
    public Long quotaAvailable;
    public Long quotaReserved;
    public Long syncCursor;
    public Long createdAt;
    /** 账号状态：ACTIVE 正常，DISABLED 已禁用 */
    public String status;
    /** 最近一次登录时间（毫秒） */
    public Long lastLoginAt;
    /** 管理员备注 */
    public String remark;
}
