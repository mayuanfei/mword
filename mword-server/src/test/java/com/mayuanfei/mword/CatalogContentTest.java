package com.mayuanfei.mword;

import com.mayuanfei.mword.catalog.CatalogService;
import com.mayuanfei.mword.common.Json;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CatalogContentTest {
    @Test void examplesKeepTheirAttributionThroughCatalogLoadingAndSerialization() throws Exception {
        var catalog = new CatalogService();
        catalog.load();
        for (var book : catalog.books()) {
            assertTrue(catalog.words(book.id()).stream().filter(word -> word.example() != null).count() > 2000);
        }
        var word = catalog.words("cet4").stream().filter(value -> value.example() != null).findFirst().orElseThrow();
        assertNotNull(word.exampleTranslation());
        assertEquals("CC-BY-2.0-FR", word.exampleSource().license());
        assertEquals("corpus-draft", word.exampleSource().status());
        assertTrue(word.exampleSource().attribution().contains("Attribution:"));
        assertTrue(Json.write(word).contains("translationUrl"));
        assertEquals("蚂蚁", catalog.word("lemma:ant").meaning());
        assertEquals("英亩（面积单位）", catalog.word("lemma:acre").meaning());
        assertEquals("增加；添加", catalog.word("lemma:add").meaning());
        assertNotNull(catalog.word("lemma:negro").usageNote());
    }
}
