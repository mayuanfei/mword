package com.mayuanfei.mword.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import java.io.IOException;

public final class Json {
    private static final ObjectMapper MAPPER = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);
    private Json() {}
    public static String write(Object value) {
        try { return MAPPER.writeValueAsString(value); }
        catch (IOException e) { throw new IllegalStateException("JSON encoding failed", e); }
    }
    public static <T> T read(String value, Class<T> type) {
        try { return MAPPER.readValue(value, type); }
        catch (IOException e) { throw new IllegalStateException("JSON decoding failed", e); }
    }
    public static JsonNode tree(String value) {
        try { return MAPPER.readTree(value); }
        catch (IOException e) { throw new IllegalStateException("JSON decoding failed", e); }
    }
}
