package com.mayuanfei.mword;

import com.mayuanfei.mword.ai.*;
import com.mayuanfei.mword.auth.AuthDtos;
import com.mayuanfei.mword.catalog.CatalogService;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiGatewayDeadlineTest {
    @Test void headersWithoutBodyCannotBlockBeyondTotalDeadline() throws Exception {
        var headersSent=new CountDownLatch(1);var release=new CountDownLatch(1);
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        try(var pool=Executors.newSingleThreadExecutor()) {
            server.setExecutor(pool);
            server.createContext("/chat/completions",exchange->{
                exchange.getRequestBody().readAllBytes();exchange.sendResponseHeaders(200,4096);headersSent.countDown();
                try{release.await(8,TimeUnit.SECONDS);}catch(InterruptedException ex){Thread.currentThread().interrupt();}finally{exchange.close();}
            });
            server.start();
            // 只在单元测试中直接构造loopback连接；生产ProviderService仍强制HTTPS/443精确白名单。
            var gateway=new AiGateway(mock(CatalogService.class),1);
            var provider=new ProviderService.Connection("test","test","http://127.0.0.1:"+server.getAddress().getPort(),"test","fake");
            var request=new AiDtos.CreateTask("id",AiDtos.Scene.ARTICLE,null,null,"test","beginner",List.of(),false);
            long started=System.nanoTime();
            assertThatThrownBy(()->gateway.generate(provider,request,AuthDtos.defaultProfile())).isInstanceOf(TimeoutException.class);
            assertThat(headersSent.getCount()).isZero();assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started)).isLessThan(3500);
        }finally{release.countDown();server.stop(0);}
    }
}
