package com.mayuanfei.mword.config;

import com.mayuanfei.mword.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String[] origins;
    public WebConfig(@Value("${mword.allowed-origins}") String origins){this.origins=Arrays.stream(origins.split(",")).map(String::trim).toArray(String[]::new);}
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedOrigins(origins).allowCredentials(true).allowedMethods("GET","POST","PUT","DELETE","OPTIONS").allowedHeaders("Authorization","Content-Type","X-Mword-Client").maxAge(3600);
    }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RequestGuard(new HashSet<>(List.of(origins))));
    }
    private static final class RequestGuard implements HandlerInterceptor {
        private final Set<String> allowedOrigins;
        private final Map<String,Window> attempts = new LinkedHashMap<>();
        private record Window(long starts,int count) {}
        RequestGuard(Set<String> origins){this.allowedOrigins=origins;}
        @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
            response.setHeader("X-Content-Type-Options","nosniff");
            response.setHeader("Cache-Control","no-store");
            String origin=request.getHeader("Origin");
            if(!Set.of("GET","HEAD","OPTIONS").contains(request.getMethod())) {
                // SameSite alone does not protect same-site sibling applications.
                if(origin != null && !allowedOrigins.contains(origin)) throw new ApiException(403,"ORIGIN_REJECTED","请求来源未授权");
                if("cross-site".equals(request.getHeader("Sec-Fetch-Site")) && origin == null) throw new ApiException(403,"ORIGIN_REJECTED","请求来源未授权");
                if(request.getHeader("Authorization") == null && request.getContentLengthLong()>0 && (request.getContentType()==null || !request.getContentType().startsWith("application/json")))
                    throw new ApiException(415,"JSON_REQUIRED","请使用JSON请求");
            }
            if(request.getRequestURI().endsWith("/auth/login") || request.getRequestURI().endsWith("/auth/register")) rateLimit(request.getRemoteAddr());
            return true;
        }
        private synchronized void rateLimit(String address) {
            long now=System.currentTimeMillis();
            attempts.entrySet().removeIf(entry->now-entry.getValue().starts()>600_000);
            Window window=attempts.getOrDefault(address,new Window(now,0));
            if(window.count()>=30) throw new ApiException(429,"RATE_LIMITED","尝试过于频繁，请10分钟后重试");
            if(attempts.size()>10_000 && !attempts.containsKey(address)) throw new ApiException(429,"RATE_LIMITED","服务繁忙，请稍后重试");
            attempts.put(address,new Window(window.starts(),window.count()+1));
        }
    }
}
