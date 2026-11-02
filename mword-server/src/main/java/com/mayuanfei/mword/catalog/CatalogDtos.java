package com.mayuanfei.mword.catalog;

import java.util.List;

public final class CatalogDtos {
    private CatalogDtos() {}
    public record MemoryAssets(String roots, String etymology, String mnemonics, String story, List<String> collocations) {}
    public record ExampleSource(String name, String url, String translationUrl, String attribution, String license, String licenseUrl, String changes, String status) {}
    public record Word(String id, String lemma, String meaning, String phonetic, String partOfSpeech,
                       String example, String exampleTranslation, String senseId,
                       String sourceUrl,String license,String definitionStatus,String definitionSource,
                       String definitionSourceUrl,String definitionLicense,MemoryAssets memoryAssets,ExampleSource exampleSource,String usageNote) {}
    public record Book(String id, String name, String description, String version,
                       String sourceUrl, String license, int wordCount,List<String> attribution,String licenseUrl) {}
    public record BookFile(String id, String name, String description, String version,
                           String sourceUrl, String license, List<Word> words,List<String> attribution,String licenseUrl) {}
    public record Article(String id, String title, String body, String source,
                          List<String> targetWordIds, String createdAt) {}
}
