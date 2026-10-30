package com.mayuanfei.mword;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MwordSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
