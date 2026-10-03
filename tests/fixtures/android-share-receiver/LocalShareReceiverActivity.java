package com.math3d.acceptance.sharereceiver;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

/** Separate recipient UID: reads only the granted ACTION_SEND stream, never the sender's files. */
public final class LocalShareReceiverActivity extends Activity {
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        float density = getResources().getDisplayMetrics().density;
        layout.setPadding((int)(24 * density), (int)(64 * density), (int)(24 * density), (int)(24 * density));
        TextView title = new TextView(this);
        title.setText("Math3D Local Receiver");
        title.setTextSize(24);
        layout.addView(title);
        status = new TextView(this);
        status.setTextSize(18);
        status.setPadding(0, 32, 0, 0);
        layout.addView(status);
        setContentView(layout);
        receive(getIntent());
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receive(intent);
    }

    private void writePrivate(String name, byte[] bytes) throws Exception {
        // Fixed recipient-private filenames; no sender-provided path is used for storage.
        try (FileOutputStream output = new FileOutputStream(new File(getFilesDir(), name))) {
            output.write(bytes);
            output.flush();
            output.getFD().sync();
        }
    }

    private void receive(Intent intent) {
        if (!Intent.ACTION_SEND.equals(intent.getAction())) {
            status.setText("Ready. Select this app in Math3D's Android share chooser.");
            return;
        }
        JSONObject report = new JSONObject();
        try {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null || !"content".equals(uri.getScheme())) throw new Exception("Expected a granted content URI.");
            if (!"application/json".equals(intent.getType())) throw new Exception("Expected application/json.");
            byte[] bytes;
            try (InputStream input = getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new Exception("Recipient cannot open the shared stream.");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 16 * 1024 * 1024) throw new Exception("Shared JSON exceeds the fixture's 16 MiB limit.");
                    output.write(buffer, 0, count);
                }
                bytes = output.toByteArray();
            }
            JSONObject project = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (!"math3d.project".equals(project.getString("format"))) throw new Exception("Expected a named Math3D project.");
            String title = project.getJSONObject("metadata").getString("title");
            String name = null;
            try (Cursor cursor = getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
            }
            StringBuilder hash = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format("%02x", value & 255));
            writePrivate("received-project.json", bytes);
            report.put("format", "math3d.local-share-receipt.v1");
            report.put("ok", true);
            report.put("receivedAtEpochMillis", System.currentTimeMillis());
            report.put("receiverPackage", getPackageName());
            report.put("receiverUid", android.os.Process.myUid());
            report.put("action", intent.getAction());
            report.put("mimeType", intent.getType());
            report.put("contentUriAuthority", uri.getAuthority());
            report.put("readPermissionFlag", (intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
            report.put("contentResolverStreamRead", true);
            report.put("displayName", name == null ? JSONObject.NULL : name);
            report.put("byteLength", bytes.length);
            report.put("sha256", hash.toString());
            report.put("projectId", project.getJSONObject("identity").getString("id"));
            report.put("projectTitle", title);
            report.put("projectRevision", project.getJSONObject("identity").getInt("revision"));
            report.put("documentCount", project.getJSONObject("workspace").getJSONArray("entries").length());
            report.put("relationCount", project.getJSONObject("workspace").getJSONArray("relations").length());
            writePrivate("receipt.json", report.toString(2).getBytes(StandardCharsets.UTF_8));
            status.setText("RECEIVED: " + title + "\n\n" + bytes.length + " bytes\n\nSHA-256: " + hash +
                "\n\nSaved in this recipient app's private storage.");
        } catch (Exception error) {
            status.setText("RECEIVE FAILED: " + error.getMessage());
            try {
                report.put("format", "math3d.local-share-receipt.v1");
                report.put("ok", false);
                report.put("error", error.toString());
                writePrivate("receipt.json", report.toString(2).getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) { /* The visible failure remains available. */ }
        }
    }
}
