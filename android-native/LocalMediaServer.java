package com.kilas.offlineshorts;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocalMediaServer {

    private final File cacheDir;
    private final ServerSocket serverSocket;
    private final int port;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private volatile boolean running = true;

    public LocalMediaServer(Context context) throws IOException {
        this.cacheDir = new File(context.getCacheDir(), "kilas_media");
        if (!this.cacheDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            this.cacheDir.mkdirs();
        }
        this.serverSocket = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        this.port = this.serverSocket.getLocalPort();

        Thread acceptThread = new Thread(this::acceptLoop, "KilasLocalMediaServer");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    public int getPort() {
        return port;
    }

    public String getBaseUrl() {
        return "http://127.0.0.1:" + port;
    }

    public File getMediaFile(String id) {
        return new File(cacheDir, sanitizeId(id) + ".bin");
    }

    private File getMimeFile(String id) {
        return new File(cacheDir, sanitizeId(id) + ".mime");
    }

    private File getThumbFile(String id) {
        return new File(cacheDir, sanitizeId(id) + ".thumb.jpg");
    }

    public static String sanitizeId(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "video_default";
        }
        String clean = raw.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (clean.length() > 96) {
            clean = clean.substring(0, 64) + "_" + Integer.toHexString(raw.hashCode());
        }
        return clean;
    }

    public void shutdown() {
        running = false;
        try {
            serverSocket.close();
        } catch (IOException ignored) {}
        executor.shutdownNow();
    }

    private void acceptLoop() {
        while (running && !serverSocket.isClosed()) {
            try {
                Socket client = serverSocket.accept();
                executor.execute(() -> handleClient(client));
            } catch (IOException e) {
                if (!running || serverSocket.isClosed()) {
                    break;
                }
            }
        }
    }

    private void handleClient(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(30000);
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();

            String rawHeader = readHttpHeaders(in);
            if (rawHeader == null || rawHeader.isEmpty()) {
                return;
            }

            String[] lines = rawHeader.split("\r\n");
            if (lines.length == 0) {
                return;
            }

            String[] requestParts = lines[0].split(" ");
            if (requestParts.length < 2) {
                sendSimpleResponse(out, 400, "Bad Request", "text/plain", "Bad Request".getBytes(StandardCharsets.UTF_8));
                return;
            }

            String method = requestParts[0].toUpperCase(Locale.US);
            String target = requestParts[1];

            Map<String, String> headers = new HashMap<>();
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0) {
                    String name = lines[i].substring(0, colon).trim().toLowerCase(Locale.US);
                    String value = lines[i].substring(colon + 1).trim();
                    headers.put(name, value);
                }
            }

            if ("OPTIONS".equals(method)) {
                sendOptionsResponse(out);
                return;
            }

            Uri uri = Uri.parse("http://127.0.0.1" + target);
            String path = uri.getPath() != null ? uri.getPath() : "/";

            if ("GET".equals(method) && "/ping".equals(path)) {
                String json = "{\"ok\":true,\"port\":" + port + "}";
                sendSimpleResponse(out, 200, "OK", "application/json", json.getBytes(StandardCharsets.UTF_8));
                return;
            }

            if (("POST".equals(method) || "PUT".equals(method)) && "/upload".equals(path)) {
                handleUpload(uri, headers, in, out);
                return;
            }

            if (("GET".equals(method) || "HEAD".equals(method)) && path.startsWith("/media/")) {
                String rawId = path.substring("/media/".length());
                handleMediaServe("HEAD".equals(method), rawId, headers, out);
                return;
            }

            if ("GET".equals(method) && path.startsWith("/thumb/")) {
                String rawId = path.substring("/thumb/".length());
                if (rawId.endsWith(".jpg")) {
                    rawId = rawId.substring(0, rawId.length() - 4);
                }
                handleThumbServe(rawId, out);
                return;
            }

            sendSimpleResponse(out, 404, "Not Found", "text/plain", "Not Found".getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // Normal when HTML5 <video> cancels a range request mid-stream during scrubbing
        }
    }

    private String readHttpHeaders(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int matchState = 0;
        int b;
        while ((b = in.read()) != -1) {
            buffer.write(b);
            if (buffer.size() > 65536) {
                throw new IOException("Headers too large");
            }
            if (matchState == 0 && b == '\r') matchState = 1;
            else if (matchState == 1 && b == '\n') matchState = 2;
            else if (matchState == 2 && b == '\r') matchState = 3;
            else if (matchState == 3 && b == '\n') break;
            else matchState = (b == '\r') ? 1 : 0;
        }
        if (buffer.size() == 0) return null;
        return buffer.toString(StandardCharsets.UTF_8.name());
    }

    private void handleUpload(Uri uri, Map<String, String> headers, InputStream in, OutputStream out) throws IOException {
        String idParam = uri.getQueryParameter("id");
        String mimeParam = uri.getQueryParameter("mime");
        if (mimeParam == null || mimeParam.isEmpty()) {
            mimeParam = "video/mp4";
        }
        String safeId = sanitizeId(idParam);
        File mediaFile = getMediaFile(safeId);
        File tempFile = new File(cacheDir, safeId + ".tmp");
        File mimeFile = getMimeFile(safeId);
        File thumbFile = getThumbFile(safeId);

        String expect = headers.get("expect");
        if (expect != null && expect.toLowerCase(Locale.US).contains("100-continue")) {
            out.write("HTTP/1.1 100 Continue\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            out.flush();
        }

        long contentLength = -1;
        String clHeader = headers.get("content-length");
        if (clHeader != null) {
            try {
                contentLength = Long.parseLong(clHeader.trim());
            } catch (NumberFormatException ignored) {}
        }

        String transferEncoding = headers.get("transfer-encoding");
        boolean isChunked = transferEncoding != null && transferEncoding.toLowerCase(Locale.US).contains("chunked");

        try (FileOutputStream fos = new FileOutputStream(tempFile)) {
            byte[] buf = new byte[65536];
            if (isChunked) {
                copyChunkedBody(in, fos, buf);
            } else if (contentLength >= 0) {
                long remaining = contentLength;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buf.length, remaining);
                    int read = in.read(buf, 0, toRead);
                    if (read == -1) break;
                    fos.write(buf, 0, read);
                    remaining -= read;
                }
            }
            fos.flush();
        }

        if (mediaFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            mediaFile.delete();
        }
        if (!tempFile.renameTo(mediaFile)) {
            throw new IOException("Failed to commit media file");
        }
        if (thumbFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            thumbFile.delete();
        }

        try (FileOutputStream mfos = new FileOutputStream(mimeFile)) {
            mfos.write(mimeParam.getBytes(StandardCharsets.UTF_8));
        }

        double durationSec = probeAndGenerateThumbnail(mediaFile, thumbFile);
        String url = getBaseUrl() + "/media/" + safeId;
        String thumbUrl = thumbFile.exists() ? (getBaseUrl() + "/thumb/" + safeId + ".jpg") : "";
        String json = String.format(
            Locale.US,
            "{\"ok\":true,\"id\":\"%s\",\"url\":\"%s\",\"thumbUrl\":\"%s\",\"duration\":%.2f,\"size\":%d}",
            safeId,
            url,
            thumbUrl,
            durationSec,
            mediaFile.length()
        );
        sendSimpleResponse(out, 200, "OK", "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private void copyChunkedBody(InputStream in, OutputStream out, byte[] buf) throws IOException {
        while (true) {
            String sizeLine = readLineAscii(in);
            if (sizeLine == null) break;
            int semi = sizeLine.indexOf(';');
            if (semi >= 0) sizeLine = sizeLine.substring(0, semi);
            int chunkSize = Integer.parseInt(sizeLine.trim(), 16);
            if (chunkSize == 0) {
                readLineAscii(in);
                break;
            }
            int remaining = chunkSize;
            while (remaining > 0) {
                int read = in.read(buf, 0, Math.min(buf.length, remaining));
                if (read == -1) throw new IOException("Unexpected EOF in chunked body");
                out.write(buf, 0, read);
                remaining -= read;
            }
            readLineAscii(in);
        }
    }

    private String readLineAscii(InputStream in) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\r') {
                int next = in.read();
                if (next != '\n' && next != -1) {
                    baos.write(next);
                }
                break;
            }
            if (b == '\n') break;
            baos.write(b);
        }
        return baos.toString(StandardCharsets.US_ASCII.name());
    }

    private double probeAndGenerateThumbnail(File mediaFile, File thumbFile) {
        double durationSec = 0;
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(mediaFile.getAbsolutePath());
            String durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (durStr != null) {
                durationSec = Math.max(0, Long.parseLong(durStr) / 1000.0);
            }
            Bitmap bmp = retriever.getFrameAtTime(500_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if (bmp == null) {
                bmp = retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            }
            if (bmp == null) {
                bmp = retriever.getFrameAtTime();
            }
            if (bmp != null) {
                Bitmap scaled = scaleBitmap(bmp, 540);
                try (FileOutputStream fos = new FileOutputStream(thumbFile)) {
                    scaled.compress(Bitmap.CompressFormat.JPEG, 82, fos);
                }
                if (scaled != bmp) {
                    scaled.recycle();
                }
                bmp.recycle();
            }
        } catch (Throwable ignored) {
            // Non-fatal if metadata or frame extraction is unavailable for a specific stream
        } finally {
            try {
                retriever.release();
            } catch (Throwable ignored) {}
        }
        return durationSec;
    }

    private Bitmap scaleBitmap(Bitmap source, int maxDimension) {
        int w = source.getWidth();
        int h = source.getHeight();
        if (w <= maxDimension && h <= maxDimension) {
            return source;
        }
        float ratio = Math.min((float) maxDimension / w, (float) maxDimension / h);
        int targetW = Math.max(1, Math.round(w * ratio));
        int targetH = Math.max(1, Math.round(h * ratio));
        return Bitmap.createScaledBitmap(source, targetW, targetH, true);
    }

    private void handleMediaServe(boolean headOnly, String rawId, Map<String, String> headers, OutputStream out) throws IOException {
        String safeId = sanitizeId(rawId);
        File mediaFile = getMediaFile(safeId);
        if (!mediaFile.exists() || !mediaFile.isFile()) {
            sendSimpleResponse(out, 404, "Not Found", "text/plain", "Media not found".getBytes(StandardCharsets.UTF_8));
            return;
        }

        String mime = readMime(safeId);
        long totalLength = mediaFile.length();
        String rangeHeader = headers.get("range");

        long start = 0;
        long end = totalLength - 1;
        boolean partial = false;

        if (rangeHeader != null && rangeHeader.toLowerCase(Locale.US).startsWith("bytes=")) {
            partial = true;
            String rangeValue = rangeHeader.substring("bytes=".length()).trim();
            int comma = rangeValue.indexOf(',');
            if (comma >= 0) {
                rangeValue = rangeValue.substring(0, comma).trim();
            }
            String[] parts = rangeValue.split("-", 2);
            try {
                if (parts[0].isEmpty()) {
                    long suffix = Long.parseLong(parts[1]);
                    start = Math.max(0, totalLength - suffix);
                } else {
                    start = Long.parseLong(parts[0]);
                    if (parts.length > 1 && !parts[1].isEmpty()) {
                        end = Long.parseLong(parts[1]);
                    }
                }
            } catch (NumberFormatException e) {
                sendRangeNotSatisfiable(out, totalLength);
                return;
            }

            if (start < 0 || start >= totalLength || end < start) {
                sendRangeNotSatisfiable(out, totalLength);
                return;
            }
            if (end >= totalLength) {
                end = totalLength - 1;
            }
        }

        long contentLength = (end - start) + 1;
        StringBuilder resp = new StringBuilder();
        if (partial) {
            resp.append("HTTP/1.1 206 Partial Content\r\n");
            resp.append("Content-Range: bytes ").append(start).append("-").append(end).append("/").append(totalLength).append("\r\n");
        } else {
            resp.append("HTTP/1.1 200 OK\r\n");
        }
        resp.append("Content-Type: ").append(mime).append("\r\n");
        resp.append("Content-Length: ").append(contentLength).append("\r\n");
        resp.append("Accept-Ranges: bytes\r\n");
        resp.append("Cache-Control: no-store\r\n");
        appendCorsHeaders(resp);
        resp.append("Connection: close\r\n\r\n");

        out.write(resp.toString().getBytes(StandardCharsets.US_ASCII));

        if (!headOnly && contentLength > 0) {
            try (RandomAccessFile raf = new RandomAccessFile(mediaFile, "r")) {
                raf.seek(start);
                byte[] buf = new byte[65536];
                long remaining = contentLength;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buf.length, remaining);
                    int read = raf.read(buf, 0, toRead);
                    if (read == -1) break;
                    out.write(buf, 0, read);
                    remaining -= read;
                }
            }
        }
        out.flush();
    }

    private void handleThumbServe(String rawId, OutputStream out) throws IOException {
        String safeId = sanitizeId(rawId);
        File thumbFile = getThumbFile(safeId);
        if (!thumbFile.exists()) {
            File mediaFile = getMediaFile(safeId);
            if (mediaFile.exists()) {
                probeAndGenerateThumbnail(mediaFile, thumbFile);
            }
        }
        if (!thumbFile.exists()) {
            sendSimpleResponse(out, 404, "Not Found", "text/plain", "Thumbnail not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        byte[] bytes = new byte[(int) thumbFile.length()];
        try (FileInputStream fis = new FileInputStream(thumbFile)) {
            int offset = 0;
            while (offset < bytes.length) {
                int read = fis.read(bytes, offset, bytes.length - offset);
                if (read == -1) break;
                offset += read;
            }
        }
        sendSimpleResponse(out, 200, "OK", "image/jpeg", bytes);
    }

    private String readMime(String safeId) {
        File mimeFile = getMimeFile(safeId);
        if (!mimeFile.exists()) return "video/mp4";
        try (FileInputStream fis = new FileInputStream(mimeFile)) {
            byte[] buf = new byte[(int) Math.min(128, mimeFile.length())];
            int read = fis.read(buf);
            if (read > 0) {
                return new String(buf, 0, read, StandardCharsets.UTF_8).trim();
            }
        } catch (IOException ignored) {}
        return "video/mp4";
    }

    private void sendRangeNotSatisfiable(OutputStream out, long totalLength) throws IOException {
        StringBuilder resp = new StringBuilder();
        resp.append("HTTP/1.1 416 Range Not Satisfiable\r\n");
        resp.append("Content-Range: bytes */").append(totalLength).append("\r\n");
        resp.append("Content-Length: 0\r\n");
        appendCorsHeaders(resp);
        resp.append("Connection: close\r\n\r\n");
        out.write(resp.toString().getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    private void sendOptionsResponse(OutputStream out) throws IOException {
        StringBuilder resp = new StringBuilder();
        resp.append("HTTP/1.1 204 No Content\r\n");
        appendCorsHeaders(resp);
        resp.append("Connection: close\r\n\r\n");
        out.write(resp.toString().getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    private void sendSimpleResponse(OutputStream out, int code, String reason, String contentType, byte[] body) throws IOException {
        StringBuilder resp = new StringBuilder();
        resp.append("HTTP/1.1 ").append(code).append(" ").append(reason).append("\r\n");
        resp.append("Content-Type: ").append(contentType).append("; charset=utf-8\r\n");
        resp.append("Content-Length: ").append(body.length).append("\r\n");
        appendCorsHeaders(resp);
        resp.append("Connection: close\r\n\r\n");
        out.write(resp.toString().getBytes(StandardCharsets.US_ASCII));
        if (body.length > 0) {
            out.write(body);
        }
        out.flush();
    }

    private void appendCorsHeaders(StringBuilder resp) {
        resp.append("Access-Control-Allow-Origin: *\r\n");
        resp.append("Access-Control-Allow-Methods: GET, POST, PUT, HEAD, OPTIONS\r\n");
        resp.append("Access-Control-Allow-Headers: Content-Type, Range\r\n");
        resp.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n");
    }
}
