package com.mayuanfei.mword.common;

public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
    public int status() { return status; }
    public String code() { return code; }
    public static ApiException badRequest(String message) { return new ApiException(400, "INVALID_REQUEST", message); }
    public static ApiException notFound() { return new ApiException(404, "NOT_FOUND", "内容不存在或没有访问权限"); }
}
