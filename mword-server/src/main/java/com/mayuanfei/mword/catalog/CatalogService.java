package com.mayuanfei.mword.catalog;

import com.mayuanfei.mword.common.ApiException;
import com.mayuanfei.mword.common.Json;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {
    private final Map<String,CatalogDtos.BookFile> books = new LinkedHashMap<>();
    private final Map<String,CatalogDtos.Word> words = new HashMap<>();
    private List<CatalogDtos.Article> samples;

    @PostConstruct public void load() throws Exception {
        var resources = new PathMatchingResourcePatternResolver().getResources("classpath*:books/*.json");
        Arrays.sort(resources, Comparator.comparing(resource -> Objects.requireNonNull(resource.getFilename())));
        for (var resource : resources) {
            CatalogDtos.BookFile book;
            try (var input = resource.getInputStream()) {
                book = Json.read(new String(input.readAllBytes(), StandardCharsets.UTF_8), CatalogDtos.BookFile.class);
            }
            if (book.id() == null || book.words() == null || book.words().isEmpty()) throw new IllegalStateException("词库缺少有效词条");
            var normalized = book.words().stream().map(word -> new CatalogDtos.Word(word.id(),word.lemma(),word.meaning(),word.phonetic(),word.partOfSpeech(),word.example(),word.exampleTranslation(),
                    word.senseId() == null ? word.id()+":core" : word.senseId(),word.sourceUrl()==null?book.sourceUrl():word.sourceUrl(),word.license()==null?book.license():word.license(),word.definitionStatus(),word.definitionSource(),word.definitionSourceUrl(),word.definitionLicense())).toList();
            books.put(book.id(), new CatalogDtos.BookFile(book.id(),book.name(),book.description(),book.version(),book.sourceUrl(),book.license(), normalized,book.attribution(),book.licenseUrl()));
            for (var word : normalized) {
                var previous = words.putIfAbsent(word.id(),word);
                if (previous != null && !previous.lemma().equals(word.lemma())) throw new IllegalStateException("跨词书稳定单词ID冲突");
            }
        }
        if (books.isEmpty()) throw new IllegalStateException("缺少预设词库，请先运行根目录的词库准备步骤");
        samples = List.of(
            sample("sample-curiosity", "A Small Habit, A Lasting Change",
                "Every morning, Lin takes ten minutes to read something new. She does not try to remember every word at once. Instead, she chooses a small number of useful words and connects each one with a clear example.\n\nAt first, progress feels slow. A difficult word may seem familiar today and disappear from memory tomorrow. Lin returns to it, explains it in her own words, and uses it in a different sentence. This simple habit helps her understand more of the articles she enjoys.\n\nLearning requires attention and patience. A short practice that you repeat is often more valuable than a long practice you never return to. Lin keeps a record of what she learns, and the record helps her notice how far she has come.", List.of("habit","progress","attention","valuable")),
            sample("sample-travel", "Travel With Your Eyes Open",
                "When you visit a new city, a famous building is only one part of the story. Walk through a quiet street, notice the small shops, and ask a local person about a favorite place. A simple conversation can reveal something that no guidebook explains.\n\nMia likes to take photographs when she travels. Before she raises her camera, she observes the light and the people around her. She hopes to capture a moment, rather than collect a perfect image of every building.\n\nAt the end of the day, she writes a few sentences about what surprised her. The words help her retain the experience. Months later, the notes bring back the sound of the market and the warmth of an unexpected conversation.", List.of("observe","experience","retain","conversation"))
        );
    }
    private CatalogDtos.Article sample(String id,String title,String body,List<String> lemmas) {
        var ids = words.values().stream().filter(word -> lemmas.contains(word.lemma().toLowerCase(Locale.ROOT))).map(CatalogDtos.Word::id).sorted().toList();
        return new CatalogDtos.Article(id,title,body,"SAMPLE",ids,"2026-10-09T00:00:00.000Z");
    }
    public List<CatalogDtos.Book> books() { return books.values().stream().map(book -> new CatalogDtos.Book(book.id(),book.name(),book.description(),book.version(),book.sourceUrl(),book.license(),book.words().size(),book.attribution(),book.licenseUrl())).toList(); }
    public CatalogDtos.BookFile book(String id) { var book = books.get(id); if(book == null) throw ApiException.notFound(); return book; }
    public List<CatalogDtos.Word> words(String bookId) { return book(bookId).words(); }
    public CatalogDtos.Word word(String id) { var word = words.get(id); if(word == null) throw ApiException.notFound(); return word; }
    public void validateSense(String wordId,String senseId) { if(!word(wordId).senseId().equals(senseId)) throw ApiException.badRequest("单词义项不匹配"); }
    public List<CatalogDtos.Article> samples() { return samples; }
}
