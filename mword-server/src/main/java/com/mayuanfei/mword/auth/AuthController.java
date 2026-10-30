package com.mayuanfei.mword.auth;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthController {
    private final AuthService auth;
    private final boolean secureCookie;
    public AuthController(AuthService auth,@Value("${mword.secure-cookie:false}") boolean secureCookie) { this.auth = auth; this.secureCookie=secureCookie; }
    @PostMapping("/auth/register") @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.AuthResponse register(@Valid @RequestBody AuthDtos.Credentials input,HttpServletResponse response) {
        var result=auth.register(input); cookie(response,result.token(),Math.max(0,(com.mayuanfei.mword.common.Time.parse(result.expiresAt())-System.currentTimeMillis())/1000));return result;
    }
    @PostMapping("/auth/login")
    public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.Credentials input,HttpServletResponse response) {
        var result=auth.login(input);cookie(response,result.token(),Math.max(0,(com.mayuanfei.mword.common.Time.parse(result.expiresAt())-System.currentTimeMillis())/1000));return result;
    }
    @PostMapping("/auth/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value="Authorization",required=false) String token,HttpServletResponse response) { auth.logout(token);cookie(response,"",0); }
    @GetMapping("/me")
    public AuthDtos.User me(@RequestHeader(value="Authorization",required=false) String token) { return auth.requireUser(token); }
    @PutMapping("/me/profile")
    public AuthDtos.Profile profile(@RequestHeader(value="Authorization",required=false) String token, @Valid @RequestBody AuthDtos.Profile profile) {
        return auth.saveProfile(auth.requireUser(token).id(), profile);
    }
    private void cookie(HttpServletResponse response,String token,long seconds) {
        response.addHeader("Set-Cookie",ResponseCookie.from("mw_session",token).httpOnly(true).secure(secureCookie).sameSite("Strict").path("/mword-api").maxAge(seconds).build().toString());
    }
}
