package com.mayuanfei.mword.catalog;

import com.mayuanfei.mword.auth.AuthService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class CatalogController {
    private final AuthService auth; private final CatalogService catalog; private final ArticleService articles;
    public CatalogController(AuthService auth,CatalogService catalog,ArticleService articles){this.auth=auth;this.catalog=catalog;this.articles=articles;}
    @GetMapping("/books") public List<CatalogDtos.Book> books(@RequestHeader(value="Authorization",required=false) String token) {auth.requireUser(token);return catalog.books();}
    @GetMapping("/books/{id}/words") public List<CatalogDtos.Word> words(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id){auth.requireUser(token);return catalog.words(id);}
    @GetMapping("/articles") public List<CatalogDtos.Article> articles(@RequestHeader(value="Authorization",required=false) String token){return articles.list(auth.requireUser(token).id());}
    @GetMapping("/articles/{id}") public CatalogDtos.Article article(@RequestHeader(value="Authorization",required=false) String token,@PathVariable String id){return articles.get(auth.requireUser(token).id(),id);}
    @PostMapping("/articles") @ResponseStatus(HttpStatus.CREATED)
    public CatalogDtos.Article create(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody ArticleService.CreateArticle input){return articles.createUser(auth.requireUser(token).id(),input);}
}
