package com.atmr.drop;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("Download URL is required");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream is = null;
            FileOutputStream fos = null;
            try {
                Context context = getContext();
                URL url = new URL(downloadUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "atmr-drop-android-updater");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    call.reject("Server returned HTTP " + responseCode);
                    return;
                }

                int fileLength = conn.getContentLength();

                File cacheDir = context.getExternalCacheDir();
                if (cacheDir == null) {
                    cacheDir = context.getCacheDir();
                }
                File apkFile = new File(cacheDir, "atmr-drop-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                is = conn.getInputStream();
                fos = new FileOutputStream(apkFile);

                byte[] buffer = new byte[8192];
                long total = 0;
                int count;
                long lastProgressTime = 0;

                while ((count = is.read(buffer)) != -1) {
                    total += count;
                    fos.write(buffer, 0, count);

                    long now = System.currentTimeMillis();
                    if (fileLength > 0 && (now - lastProgressTime > 100 || total == fileLength)) {
                        lastProgressTime = now;
                        int percent = (int) ((total * 100) / fileLength);
                        JSObject progressData = new JSObject();
                        progressData.put("percent", percent);
                        progressData.put("loaded", total);
                        progressData.put("total", fileLength);
                        notifyListeners("downloadProgress", progressData);
                    }
                }

                fos.flush();
                fos.close();
                is.close();
                conn.disconnect();

                // Trigger package installation via FileProvider
                Uri apkUri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    apkUri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        apkFile
                    );
                } else {
                    apkUri = Uri.fromFile(apkFile);
                }

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", apkFile.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Download and install failed: " + e.getMessage(), e);
            } finally {
                try {
                    if (fos != null) fos.close();
                    if (is != null) is.close();
                    if (conn != null) conn.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String base64Data = call.getString("base64");

        try {
            Context context = getContext();
            File cacheDir = context.getExternalCacheDir();
            if (cacheDir == null) {
                cacheDir = context.getCacheDir();
            }
            File apkFile = new File(cacheDir, "atmr-drop-update.apk");

            if (base64Data != null && !base64Data.isEmpty()) {
                byte[] apkBytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (apkFile.exists()) {
                    apkFile.delete();
                }
                FileOutputStream fos = new FileOutputStream(apkFile);
                fos.write(apkBytes);
                fos.flush();
                fos.close();
            } else {
                call.reject("No APK base64 data provided");
                return;
            }

            if (!apkFile.exists()) {
                call.reject("APK file not found");
                return;
            }

            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Install failed: " + e.getMessage(), e);
        }
    }
}
