package com.lojistik.tesellum;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulamaya özel (npm paketi olmayan) eklentiler super.onCreate'ten ÖNCE kaydedilir
        registerPlugin(DocReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
