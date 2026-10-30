package com.mayuanfei.mword.common;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrors {
    private static final Logger LOG = LoggerFactory.getLogger(ApiErrors.class);
    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> api(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(Map.of("code", ex.code(), "message", ex.getMessage()));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ResponseEntity<?> invalid(Exception ex) {
        return ResponseEntity.badRequest().body(Map.of("code", "INVALID_REQUEST", "message", "请求字段缺失或格式不正确"));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception ex) {
        // Exception messages may include database values, provider URLs or credentials.
        LOG.error("Request failed: {}", ex.getClass().getSimpleName());
        return ResponseEntity.internalServerError().body(Map.of("code", "SERVER_ERROR", "message", "服务暂时不可用，请稍后重试"));
    }
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<?> method(HttpRequestMethodNotSupportedException ex){return ResponseEntity.status(405).body(Map.of("code","METHOD_NOT_ALLOWED","message","此接口不支持该请求方法"));}
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<?> missing(NoResourceFoundException ex){return ResponseEntity.status(404).body(Map.of("code","NOT_FOUND","message","接口不存在"));}
}
