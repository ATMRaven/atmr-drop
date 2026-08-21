package com.atmr.drop;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private SendIntentPlugin sendIntentPlugin;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(SendIntentPlugin.class);
        super.onCreate(savedInstanceState);

        sendIntentPlugin = (SendIntentPlugin) getBridge().getPlugin("SendIntent").getInstance();
        if (sendIntentPlugin != null) {
            sendIntentPlugin.handleSendIntent(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (sendIntentPlugin != null) {
            sendIntentPlugin.handleSendIntent(intent);
        }
    }
}
