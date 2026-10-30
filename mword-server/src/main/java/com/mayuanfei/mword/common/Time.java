package com.mayuanfei.mword.common;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;

public final class Time {
    private static final DateTimeFormatter FORMAT = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private Time() {}
    public static String iso(long millis) { return FORMAT.format(Instant.ofEpochMilli(millis)); }
    public static String now() { return iso(System.currentTimeMillis()); }
    public static long parse(String value) {
        try { return Instant.parse(value).toEpochMilli(); }
        catch (Exception e) { throw ApiException.badRequest("时间必须为带时区的 ISO 8601 格式"); }
    }
}
