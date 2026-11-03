package com.mayuanfei.mword.ai;

import com.mayuanfei.mword.auth.AuthService;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class AiController {
    private final AuthService auth;private final AiService tasks;private final ProviderService providers;
    public AiController(AuthService auth,AiService tasks,ProviderService providers){this.auth=auth;this.tasks=tasks;this.providers=providers;}
    @PostMapping("/ai/tasks") @ResponseStatus(HttpStatus.ACCEPTED)
    public AiDtos.Task create(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody AiDtos.CreateTask input){return tasks.create(auth.requireUser(token).id(),input);}
    @GetMapping("/ai/tasks") public List<AiDtos.Task> list(@RequestHeader(value="Authorization",required=false) String token){return tasks.list(auth.requireUser(token).id());}
    @GetMapping("/ai/tasks/{id}") public AiDtos.Task task(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id){return tasks.get(auth.requireUser(token).id(),id);}
    @DeleteMapping("/ai/tasks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id){tasks.cancel(auth.requireUser(token).id(),id);}
    @GetMapping("/ai/quota") public AiDtos.Quota quota(@RequestHeader(value="Authorization",required=false) String token){return tasks.quota(auth.requireUser(token).id());}
    @GetMapping("/admin/providers") public List<AiDtos.Provider> providers(@RequestHeader(value="Authorization",required=false) String token){auth.requireAdmin(token);return providers.list();}
    @PostMapping("/admin/providers") @ResponseStatus(HttpStatus.CREATED)
    public AiDtos.Provider add(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody AiDtos.ProviderInput input){auth.requireAdmin(token);return providers.save(null,input);}
    @PutMapping("/admin/providers/{id}") public AiDtos.Provider update(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id,@Valid @RequestBody AiDtos.ProviderInput input){auth.requireAdmin(token);return providers.save(id,input);}
    @DeleteMapping("/admin/providers/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id){auth.requireAdmin(token);providers.delete(id);}
    @GetMapping("/admin/users") public List<Map<String,Object>> users(@RequestHeader(value="Authorization",required=false) String token){auth.requireAdmin(token);return tasks.adminUsers();}
    @PostMapping("/admin/users/{id}/quota") public Map<String,Long> adjust(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id,@Valid @RequestBody AiDtos.QuotaAdjustment input){auth.requireAdmin(token);return tasks.adjustQuota(id,input);}
    @GetMapping("/admin/usage")
    public Object usage(
        @RequestHeader(value="Authorization",required=false) String token,
        @RequestParam(value="page", required=false) Integer page,
        @RequestParam(value="pageSize", required=false) Integer pageSize,
        @RequestParam(value="search", required=false) String search
    ) {
        auth.requireAdmin(token);
        if (page == null && pageSize == null) {
            return tasks.adminUsage();
        }
        return tasks.adminUsagePage(page, pageSize, search);
    }

    @GetMapping("/admin/tasks")
    public Object allTasks(
        @RequestHeader(value="Authorization",required=false) String token,
        @RequestParam(value="page", required=false) Integer page,
        @RequestParam(value="pageSize", required=false) Integer pageSize,
        @RequestParam(value="status", required=false) String status
    ) {
        auth.requireAdmin(token);
        if (page == null && pageSize == null) {
            return tasks.adminTasks();
        }
        return tasks.adminTasksPage(page, pageSize, status);
    }

    @GetMapping("/admin/ai-stats")
    public Map<String,Object> stats(@RequestHeader(value="Authorization",required=false) String token) {
        auth.requireAdmin(token);
        return tasks.adminStats();
    }
}
