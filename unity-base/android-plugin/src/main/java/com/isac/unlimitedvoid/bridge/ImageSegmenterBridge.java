package com.isac.unlimitedvoid.bridge;

import java.util.concurrent.atomic.AtomicReference;

public final class ImageSegmenterBridge {
    private final AtomicReference<byte[]> latestMask = new AtomicReference<>();
    private volatile boolean initialized;

    private ImageSegmenterBridge() {
    }

    public static ImageSegmenterBridge create() {
        return new ImageSegmenterBridge();
    }

    public void initialize() {
        initialized = true;
    }

    public boolean hasLatestMask() {
        return initialized && latestMask.get() != null;
    }

    public byte[] consumeLatestMask() {
        return latestMask.getAndSet(null);
    }

    public void updateLatestMask(byte[] values) {
        latestMask.set(values);
    }

    public void clearLatestMask() {
        latestMask.set(null);
    }

    public void dispose() {
        clearLatestMask();
        initialized = false;
    }
}
