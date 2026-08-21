package com.atmr.drop;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

@CapacitorPlugin(name = "SendIntent")
public class SendIntentPlugin extends Plugin {

    private static JSObject lastSharedData = null;

    @PluginMethod
    public void getSharedData(PluginCall call) {
        if (lastSharedData != null) {
            call.resolve(lastSharedData);
            lastSharedData = null; // Clear once consumed
        } else {
            JSObject empty = new JSObject();
            empty.put("hasData", false);
            call.resolve(empty);
        }
    }

    @PluginMethod
    public void clearSharedData(PluginCall call) {
        lastSharedData = null;
        JSObject ret = new JSObject();
        ret.put("cleared", true);
        call.resolve(ret);
    }

    public void handleSendIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            JSObject data = handleSingleSend(intent, type);
            if (data != null) {
                lastSharedData = data;
                notifyListeners("sendIntentReceived", data);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action) && type != null) {
            JSObject data = handleMultipleSend(intent);
            if (data != null) {
                lastSharedData = data;
                notifyListeners("sendIntentReceived", data);
            }
        }
    }

    private JSObject handleSingleSend(Intent intent, String mimeType) {
        JSObject result = new JSObject();
        result.put("hasData", true);

        // Check if shared text or URL
        if (intent.hasExtra(Intent.EXTRA_TEXT)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            result.put("type", "text");
            result.put("text", text);
            return result;
        }

        // Check if shared single file or stream
        if (intent.hasExtra(Intent.EXTRA_STREAM)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                JSObject fileObj = processUri(uri, mimeType);
                if (fileObj != null) {
                    JSArray files = new JSArray();
                    files.put(fileObj);
                    result.put("type", "files");
                    result.put("files", files);
                    return result;
                }
            }
        }

        return null;
    }

    private JSObject handleMultipleSend(Intent intent) {
        JSObject result = new JSObject();
        result.put("hasData", true);
        result.put("type", "files");

        ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (uris != null && !uris.isEmpty()) {
            JSArray files = new JSArray();
            for (Uri uri : uris) {
                JSObject fileObj = processUri(uri, null);
                if (fileObj != null) {
                    files.put(fileObj);
                }
            }
            result.put("files", files);
            return result;
        }

        return null;
    }

    private JSObject processUri(Uri uri, String fallbackMime) {
        Context context = getContext();
        ContentResolver resolver = context.getContentResolver();
        String name = "shared_file";
        long size = 0;
        String mimeType = resolver.getType(uri);
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = fallbackMime != null ? fallbackMime : "application/octet-stream";
        }

        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIdx != -1) name = cursor.getString(nameIdx);
                if (sizeIdx != -1) size = cursor.getLong(sizeIdx);
            }
        } catch (Exception ignored) {}

        try {
            InputStream is = resolver.openInputStream(uri);
            if (is != null) {
                // If small (< 10MB), read as base64 data URL for instant staging
                // If large, copy to cache and return local file uri
                if (size > 0 && size <= 10 * 1024 * 1024) {
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    int nRead;
                    byte[] data = new byte[16384];
                    while ((nRead = is.read(data, 0, data.length)) != -1) {
                        buffer.write(data, 0, nRead);
                    }
                    buffer.flush();
                    byte[] bytes = buffer.toByteArray();
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                    JSObject fileObj = new JSObject();
                    fileObj.put("name", name);
                    fileObj.put("size", bytes.length);
                    fileObj.put("type", mimeType);
                    fileObj.put("dataUrl", "data:" + mimeType + ";base64," + base64);
                    is.close();
                    return fileObj;
                } else {
                    File cacheDir = context.getExternalCacheDir();
                    if (cacheDir == null) cacheDir = context.getCacheDir();
                    File tempFile = new File(cacheDir, "shared_" + System.currentTimeMillis() + "_" + name);
                    FileOutputStream fos = new FileOutputStream(tempFile);
                    byte[] buffer = new byte[32768];
                    int len;
                    long totalBytes = 0;
                    while ((len = is.read(buffer)) != -1) {
                        fos.write(buffer, 0, len);
                        totalBytes += len;
                    }
                    fos.flush();
                    fos.close();
                    is.close();

                    JSObject fileObj = new JSObject();
                    fileObj.put("name", name);
                    fileObj.put("size", totalBytes);
                    fileObj.put("type", mimeType);
                    fileObj.put("filePath", tempFile.getAbsolutePath());
                    return fileObj;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }
}
