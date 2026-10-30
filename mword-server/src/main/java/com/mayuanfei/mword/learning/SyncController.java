package com.mayuanfei.mword.learning;

import com.mayuanfei.mword.auth.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
public class SyncController {
    private final AuthService auth;private final SyncService sync;
    public SyncController(AuthService auth,SyncService sync){this.auth=auth;this.sync=sync;}
    @PostMapping("/sync") public LearningDtos.SyncResponse sync(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody LearningDtos.SyncRequest input){return sync.sync(auth.requireUser(token).id(),input);}
}
