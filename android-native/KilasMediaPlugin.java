package com.kilas.offlineshorts;

import android.app.Activity;
import android.app.Dialog;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.VideoView;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "KilasMedia")
public class KilasMediaPlugin extends Plugin {

    private static final Set<String> VIDEO_EXTENSIONS = new HashSet<>(
        Arrays.asList("mp4", "webm", "mov", "m4v", "ogg", "ogv", "mkv")
    );

    private LocalMediaServer mediaServer;
    private Dialog activePlayerDialog;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        ensureServerStarted();
    }

    @Override
    protected void handleOnDestroy() {
        if (activePlayerDialog != null && activePlayerDialog.isShowing()) {
            activePlayerDialog.dismiss();
            activePlayerDialog = null;
        }
        if (mediaServer != null) {
            mediaServer.shutdown();
            mediaServer = null;
        }
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private synchronized LocalMediaServer ensureServerStarted() {
        if (mediaServer == null) {
            try {
                mediaServer = new LocalMediaServer(getContext());
            } catch (IOException e) {
                return null;
            }
        }
        return mediaServer;
    }

    @PluginMethod
    public void getServerInfo(PluginCall call) {
        LocalMediaServer server = ensureServerStarted();
        if (server == null) {
            call.reject("Gagal memulai server media lokal Android.");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("baseUrl", server.getBaseUrl());
        ret.put("port", server.getPort());
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteMedia(PluginCall call) {
        String id = call.getString("id", "");
        LocalMediaServer server = ensureServerStarted();
        if (server != null && id != null && !id.isEmpty()) {
            server.deleteMediaFiles(id);
        }
        call.resolve();
    }

    @PluginMethod
    public void pickVideos(PluginCall call) {
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", true));
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handlePickVideosResult");
    }

    @ActivityCallback
    private void handlePickVideosResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            ret.put("videos", new JSArray());
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                Uri itemUri = clipData.getItemAt(i).getUri();
                if (itemUri != null) uris.add(itemUri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        LocalMediaServer server = ensureServerStarted();
        if (server == null) {
            call.reject("Server media lokal tidak tersedia.");
            return;
        }

        ioExecutor.execute(() -> {
            JSArray videosArray = new JSArray();
            for (Uri uri : uris) {
                try {
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        );
                    } catch (Throwable ignored) {}
                    JSObject item = server.ingestContentUri(getContext(), uri, null, null);
                    videosArray.put(item);
                } catch (Throwable ignored) {}
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", false);
            ret.put("videos", videosArray);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void pickFolderVideos(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handlePickFolderResult");
    }

    @ActivityCallback
    private void handlePickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            ret.put("folderName", "");
            ret.put("videos", new JSArray());
            call.resolve(ret);
            return;
        }

        Uri treeUri = result.getData().getData();
        LocalMediaServer server = ensureServerStarted();
        if (server == null) {
            call.reject("Server media lokal tidak tersedia.");
            return;
        }

        ioExecutor.execute(() -> {
            try {
                try {
                    getContext().getContentResolver().takePersistableUriPermission(
                        treeUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                } catch (Throwable ignored) {}

                String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
                String folderName = resolveDocumentName(treeUri, rootDocId);
                List<PickedDoc> foundDocs = new ArrayList<>();
                collectTreeVideos(treeUri, rootDocId, 0, foundDocs);

                JSArray videosArray = new JSArray();
                for (PickedDoc doc : foundDocs) {
                    try {
                        JSObject item = server.ingestContentUri(getContext(), doc.uri, doc.name, doc.mime);
                        videosArray.put(item);
                    } catch (Throwable ignored) {}
                }

                JSObject ret = new JSObject();
                ret.put("cancelled", false);
                ret.put("folderName", folderName);
                ret.put("videos", videosArray);
                call.resolve(ret);
            } catch (Throwable ex) {
                call.reject("Gagal memindai folder Android: " + ex.getMessage());
            }
        });
    }

    private static class PickedDoc {
        final Uri uri;
        final String name;
        final String mime;

        PickedDoc(Uri uri, String name, String mime) {
            this.uri = uri;
            this.name = name;
            this.mime = mime;
        }
    }

    private String resolveDocumentName(Uri treeUri, String docId) {
        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
        try (Cursor cursor = getContext().getContentResolver().query(
            docUri,
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                String val = cursor.getString(0);
                if (val != null && !val.trim().isEmpty()) {
                    return val.trim();
                }
            }
        } catch (Throwable ignored) {}
        return "Folder Pribadi";
    }

    private void collectTreeVideos(Uri treeUri, String parentDocId, int depth, List<PickedDoc> out) {
        if (depth > 4 || out.size() >= 150) return;
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        };

        try (Cursor cursor = getContext().getContentResolver().query(childrenUri, projection, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext() && out.size() < 150) {
                String docId = cursor.getString(0);
                String name = cursor.getString(1);
                String mime = cursor.getString(2);
                if (docId == null) continue;

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    collectTreeVideos(treeUri, docId, depth + 1, out);
                } else if (isVideoCandidate(name, mime)) {
                    Uri childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                    out.add(new PickedDoc(childUri, name, mime));
                }
            }
        } catch (Throwable ignored) {}
    }

    private boolean isVideoCandidate(String name, String mime) {
        if (mime != null && mime.toLowerCase(Locale.US).startsWith("video/")) {
            return true;
        }
        if (name == null) return false;
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return false;
        String ext = name.substring(dot + 1).toLowerCase(Locale.US);
        return VIDEO_EXTENSIONS.contains(ext);
    }

    @PluginMethod
    public void openNativePlayer(PluginCall call) {
        String url = call.getString("url", "");
        String title = call.getString("title", "Kilas Video");
        boolean initialMuted = Boolean.TRUE.equals(call.getBoolean("muted", false));

        if (url == null || url.isEmpty()) {
            call.reject("URL video kosong.");
            return;
        }

        Uri resolvedUri = null;
        LocalMediaServer server = ensureServerStarted();
        if (server != null && url.contains("/media/")) {
            int idx = url.indexOf("/media/");
            String id = url.substring(idx + "/media/".length());
            int q = id.indexOf('?');
            if (q >= 0) id = id.substring(0, q);
            File cachedFile = server.getMediaFile(id);
            if (cachedFile.exists() && cachedFile.length() > 0) {
                resolvedUri = Uri.fromFile(cachedFile);
            }
        }
        if (resolvedUri == null && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://"))) {
            resolvedUri = Uri.parse(url);
        }

        if (resolvedUri == null) {
            call.reject("Sumber video lokal belum tersimpan di aplikasi.");
            return;
        }

        final Uri playUri = resolvedUri;

        getActivity().runOnUiThread(() -> {
            if (activePlayerDialog != null && activePlayerDialog.isShowing()) {
                activePlayerDialog.dismiss();
            }

            Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
            activePlayerDialog = dialog;

            FrameLayout root = new FrameLayout(getContext());
            root.setBackgroundColor(Color.BLACK);

            VideoView videoView = new VideoView(getContext());
            FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            );
            videoView.setLayoutParams(videoParams);

            MediaController controller = new MediaController(getContext());
            controller.setAnchorView(videoView);
            videoView.setMediaController(controller);

            final MediaPlayer[] playerHolder = new MediaPlayer[1];
            final boolean[] mutedState = new boolean[] { initialMuted };
            final boolean[] settled = new boolean[] { false };

            videoView.setOnPreparedListener(mp -> {
                playerHolder[0] = mp;
                mp.setLooping(true);
                float vol = mutedState[0] ? 0f : 1f;
                mp.setVolume(vol, vol);
                videoView.start();
            });

            videoView.setOnErrorListener((mp, what, extra) -> {
                if (!settled[0]) {
                    settled[0] = true;
                    call.reject("Pemutar native Android gagal membuka berkas (" + what + "/" + extra + ").");
                }
                dialog.dismiss();
                return true;
            });

            root.addView(videoView);

            LinearLayout topBar = new LinearLayout(getContext());
            topBar.setOrientation(LinearLayout.HORIZONTAL);
            topBar.setGravity(Gravity.CENTER_VERTICAL);
            topBar.setBackgroundColor(Color.argb(175, 11, 11, 14));
            int padH = dp(16);
            int padV = dp(12);
            topBar.setPadding(padH, padV, padH, padV);

            TextView titleView = new TextView(getContext());
            titleView.setText(title);
            titleView.setTextColor(Color.WHITE);
            titleView.setTextSize(15f);
            titleView.setSingleLine(true);
            LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            titleView.setLayoutParams(titleParams);
            topBar.addView(titleView);

            Button muteBtn = new Button(getContext());
            muteBtn.setText(mutedState[0] ? "Suara: Mati" : "Suara: Aktif");
            muteBtn.setTextColor(Color.WHITE);
            muteBtn.setBackgroundColor(Color.argb(140, 39, 39, 42));
            muteBtn.setPadding(dp(12), dp(6), dp(12), dp(6));
            muteBtn.setOnClickListener(v -> {
                mutedState[0] = !mutedState[0];
                muteBtn.setText(mutedState[0] ? "Suara: Mati" : "Suara: Aktif");
                if (playerHolder[0] != null) {
                    float vol = mutedState[0] ? 0f : 1f;
                    playerHolder[0].setVolume(vol, vol);
                }
            });
            LinearLayout.LayoutParams muteParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            muteParams.setMarginEnd(dp(8));
            muteBtn.setLayoutParams(muteParams);
            topBar.addView(muteBtn);

            Button closeBtn = new Button(getContext());
            closeBtn.setText("Tutup");
            closeBtn.setTextColor(Color.WHITE);
            closeBtn.setBackgroundColor(Color.rgb(255, 45, 85));
            closeBtn.setPadding(dp(14), dp(6), dp(14), dp(6));
            closeBtn.setOnClickListener(v -> dialog.dismiss());
            topBar.addView(closeBtn);

            FrameLayout.LayoutParams topBarParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            );
            root.addView(topBar, topBarParams);

            dialog.setContentView(root);
            if (dialog.getWindow() != null) {
                dialog.getWindow().setLayout(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT
                );
            }
            dialog.setOnDismissListener(d -> {
                try {
                    videoView.stopPlayback();
                } catch (Throwable ignored) {}
                activePlayerDialog = null;
                if (!settled[0]) {
                    settled[0] = true;
                    call.resolve();
                }
            });

            videoView.setVideoURI(playUri);
            dialog.show();
        });
    }

    private int dp(int value) {
        float density = getContext().getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
