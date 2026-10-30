package com.mayuanfei.mword.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.mayuanfei.mword.catalog.CatalogService;
import com.mayuanfei.mword.common.Json;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class AiContentValidator {
    private final CatalogService catalog;
    public AiContentValidator(CatalogService catalog){this.catalog=catalog;}
    public String validate(AiDtos.CreateTask task,String content) {
        if(content.length()>40000)throw new IllegalArgumentException("AI result too long");
        String cleaned=content.trim();if(cleaned.startsWith("```")) cleaned=cleaned.replaceFirst("^```(?:json)?\\s*","").replaceFirst("\\s*```$","");
        var node=Json.tree(cleaned);if(!node.isObject())throw new IllegalArgumentException("JSON object required");
        switch(task.scene()) {
            case EXPLAIN,MEMORY -> {
                for(String field:List.of("meaning","explanation","memoryTip","example","exampleTranslation","sourceNote")) text(node,field,6000);
                if(!node.path("collocations").isArray()||node.path("collocations").size()>12)throw new IllegalArgumentException("Invalid collocations");
                for(var item:node.path("collocations"))if(!item.isTextual()||item.asText().isBlank())throw new IllegalArgumentException("Invalid collocation");
                requireWord(node.path("example").asText(),task.wordId());
            }
            case CONTEXT -> {
                text(node,"sentence",1500);text(node,"explanation",4000);
                var options=node.path("options");
                if(!options.isArray()||options.size()!=4||!node.path("answer").isIntegralNumber()||node.path("answer").asInt()<0||node.path("answer").asInt()>3)throw new IllegalArgumentException("Invalid context answer");
                var distinct=new HashSet<String>();for(var item:options){if(!item.isTextual()||item.asText().isBlank()||item.asText().length()>1000)throw new IllegalArgumentException("Invalid option");distinct.add(item.asText());}
                if(distinct.size()!=4)throw new IllegalArgumentException("Duplicate options");
                requireWord(node.path("sentence").asText(),task.wordId());
            }
            case ARTICLE -> {
                text(node,"title",200);text(node,"body",30000);
                if(!node.path("targetWordIds").isArray())throw new IllegalArgumentException("Missing targets");
                Set<String> returned=new HashSet<>();for(var id:node.path("targetWordIds"))returned.add(id.asText());
                if(!returned.equals(new HashSet<>(task.targetWordIds())))throw new IllegalArgumentException("Target IDs do not match");
                for(String id:task.targetWordIds())requireWord(node.path("body").asText(),id);
            }
        }
        // Structural and lexical checks are deterministic; semantic correctness still needs user review.
        return Json.write(node);
    }
    private void text(JsonNode node,String field,int max){if(!node.path(field).isTextual()||node.path(field).asText().isBlank()||node.path(field).asText().length()>max)throw new IllegalArgumentException("Invalid AI field");}
    private void requireWord(String text,String id){String lemma=catalog.word(id).lemma();if(!Pattern.compile("(?i)(?<![a-z])"+Pattern.quote(lemma)+"(?![a-z])").matcher(text).find())throw new IllegalArgumentException("Target word missing");}
}
