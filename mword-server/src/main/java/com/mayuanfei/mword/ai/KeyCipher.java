package com.mayuanfei.mword.ai;

import com.mayuanfei.mword.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class KeyCipher {
    private final byte[] secret;
    private final SecureRandom random=new SecureRandom();
    public KeyCipher(@Value("${mword.encryption-secret}") String encoded) {
        if(encoded.isBlank()){secret=null;return;}
        try {secret=Base64.getDecoder().decode(encoded);if(secret.length!=32) throw new IllegalArgumentException();}
        catch(IllegalArgumentException e){throw new IllegalStateException("MW_KEY_ENCRYPTION_SECRET必须是Base64编码的32字节密钥");}
    }
    public String encrypt(String providerId,String plaintext) {
        requireConfigured();
        try {
            byte[] nonce=new byte[12];random.nextBytes(nonce);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(secret,"AES"),new GCMParameterSpec(128,nonce));
            cipher.updateAAD(providerId.getBytes(StandardCharsets.UTF_8));
            return "v1:"+Base64.getEncoder().encodeToString(nonce)+":"+Base64.getEncoder().encodeToString(cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)));
        }catch(Exception e){throw new IllegalStateException("Key encryption failed");}
    }
    public String decrypt(String providerId,String encoded) {
        requireConfigured();
        try {
            var parts=encoded.split(":");
            if(parts.length!=3||!parts[0].equals("v1")) throw new IllegalArgumentException();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(secret,"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[1])));
            cipher.updateAAD(providerId.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(Base64.getDecoder().decode(parts[2])),StandardCharsets.UTF_8);
        }catch(Exception e){throw new IllegalStateException("Key decryption failed");}
    }
    private void requireConfigured(){if(secret==null) throw new ApiException(503,"AI_ENCRYPTION_NOT_CONFIGURED","请管理员先配置服务器密钥加密参数");}
}
