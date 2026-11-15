package com.kilas.offlineshorts;

import android.app.Dialog;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
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
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;

@CapacitorPlugin(name = "KilasMedia")
public class KilasMediaPlugin extends Plugin {

    private LocalMediaServer mediaServer;
    private Dialog activePlayerDialog;

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
    public void openNativePlayer(PluginCall call) {
        String url = call.getString("url", "");
        String title = call.getString("title", "Kilas Video");
        boolean initialMuted = Boolean.TRUE.equals(call.getBoolean("muted", false));

        if (url == null || url.isEmpty()) {
            call.reject("URL video kosong.");
            return;
        }

        Uri resolvedUri = Uri.parse(url);
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

            // Top overlay bar with Title, Mute toggle, and Close button
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
