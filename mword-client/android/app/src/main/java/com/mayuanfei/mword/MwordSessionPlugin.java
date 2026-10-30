package com.mayuanfei.mword;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

/** The session token is encrypted by a non-exportable Android Keystore key. */
@CapacitorPlugin(name = "MwordSession")
public class MwordSessionPlugin extends Plugin {
    private static final String ALIAS = "mword-session-v1";
    private SharedPreferences preferences() { return getContext().getSharedPreferences("mword-session", Context.MODE_PRIVATE); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS) && create) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            return generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public void get(PluginCall call) {
        try {
            String saved = preferences().getString("token", null);
            JSObject result = new JSObject();
            if (saved != null) {
                String[] parts = saved.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                result.put("token", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception exception) { call.reject("无法读取设备会话，请重新登录"); }
    }
    @PluginMethod public void set(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.length() > 100) { call.reject("无效会话"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true));
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!preferences().edit().putString("token", encrypted).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception exception) { call.reject("设备会话保存失败"); }
    }
    @PluginMethod public void clear(PluginCall call) {
        if (preferences().edit().remove("token").commit()) call.resolve(); else call.reject("设备会话清除失败");
    }
}
